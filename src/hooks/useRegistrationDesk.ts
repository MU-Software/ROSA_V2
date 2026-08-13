import {
  queryOptions,
  useIsFetching,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  EntityId,
  Order,
  OrderProductScancode,
} from "../domain";
import type {
  ModifyOrderProductRequest,
  RefundOrderRequest,
  RefundOrderProductRequest,
  RegistrationDeskGateway,
  RegistrationDeskOrderProduct,
  SearchOrdersParams,
} from "../gateways";

export const REGISTRATION_DESK_QUERY_KEYS = {
  BASE: ["query", "registration-desk"] as const,
  ORDERS: ["query", "registration-desk", "orders"] as const,
  ORDER_PRODUCTS: ["query", "registration-desk", "order-product-relations"] as const,
  STATISTICS: ["query", "registration-desk", "statistics"] as const,
  CONFIGURATION: ["query", "registration-desk", "configuration"] as const,
};

export const ORDER_SEARCH_PAGE_SIZE = 50;
export const RELATED_ORDERS_PAGE_SIZE = 10;

const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

const MUTATION_KEYS = {
  MODIFY_ORDER_PRODUCT: ["mutation", "registration-desk", "modify-order-product"] as const,
  REFUND_ORDER: ["mutation", "registration-desk", "refund-order"] as const,
  REFUND_ORDER_PRODUCT: ["mutation", "registration-desk", "refund-order-product"] as const,
};

const ORDER_DATA_INVALIDATES = [
  REGISTRATION_DESK_QUERY_KEYS.ORDERS,
  REGISTRATION_DESK_QUERY_KEYS.ORDER_PRODUCTS,
  REGISTRATION_DESK_QUERY_KEYS.STATISTICS,
];

const orderSearchQueryOptions = (
  gateway: RegistrationDeskGateway,
  query: string,
  page: number,
) => {
  const params: SearchOrdersParams = UUID_PATTERN.test(query)
    ? { order_id: query, page, page_size: ORDER_SEARCH_PAGE_SIZE }
    : { keywords: query, page, page_size: ORDER_SEARCH_PAGE_SIZE };

  return queryOptions({
    queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "search", query, page],
    queryFn: () => gateway.searchOrders(params),
  });
};

const getLookupResult = (
  results: RegistrationDeskOrderProduct[],
): RegistrationDeskOrderProduct => {
  const lookup = results[0];
  if (!lookup) throw new Error("주문상품을 찾을 수 없습니다.");
  return lookup;
};

const getOrderResult = (results: Order[]): Order => {
  const order = results[0];
  if (!order) throw new Error("주문을 찾을 수 없습니다.");
  return order;
};

const orderQueryOptions = (
  gateway: RegistrationDeskGateway,
  id: EntityId,
) => queryOptions({
  queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "detail", id],
  queryFn: async () => getOrderResult((await gateway.searchOrders({
    order_id: id,
    page: 1,
    page_size: 1,
  })).results),
});

const relatedOrdersQueryOptions = (
  gateway: RegistrationDeskGateway,
  userUniqueId: EntityId,
  page: number,
) => queryOptions({
  queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "user", userUniqueId, page],
  queryFn: () => gateway.searchOrders({
    user_unique_id: userUniqueId,
    page,
    page_size: RELATED_ORDERS_PAGE_SIZE,
  }),
});

const orderProductQueryOptions = (
  gateway: RegistrationDeskGateway,
  id: EntityId,
) => queryOptions({
  queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDER_PRODUCTS, id],
  queryFn: async () => getLookupResult((await gateway.listOrderProducts({
    order_product_relation_id: id,
  })).results),
});

const orderProductScancodeQueryOptions = (
  gateway: RegistrationDeskGateway,
  scancode: OrderProductScancode,
) => queryOptions({
  queryKey: [
    ...REGISTRATION_DESK_QUERY_KEYS.ORDER_PRODUCTS,
    "scancode",
    scancode.scancode_token,
  ],
  queryFn: async () => getLookupResult((await gateway.listOrderProducts({
    scancode: scancode.scancode_token,
  })).results),
});

export const useOrderSearchQuery = (
  gateway: RegistrationDeskGateway,
  query: string,
  page: number,
) => useSuspenseQuery(orderSearchQueryOptions(gateway, query, page));

export const useOrderQuery = (
  gateway: RegistrationDeskGateway,
  id: EntityId,
) => useSuspenseQuery(orderQueryOptions(gateway, id));

export const useRelatedOrdersQuery = (
  gateway: RegistrationDeskGateway,
  userUniqueId: EntityId,
  page: number,
) => useSuspenseQuery(relatedOrdersQueryOptions(gateway, userUniqueId, page));

export const useOrderProductQuery = (
  gateway: RegistrationDeskGateway,
  id: EntityId,
) => useSuspenseQuery(orderProductQueryOptions(gateway, id));

export const useRegistrationStatisticsQuery = (
  gateway: RegistrationDeskGateway,
) => useSuspenseQuery({
  queryKey: REGISTRATION_DESK_QUERY_KEYS.STATISTICS,
  queryFn: () => gateway.getStatistics(),
});

export const useRegistrationConfigurationQuery = (
  gateway: RegistrationDeskGateway,
) => useSuspenseQuery({
  queryKey: REGISTRATION_DESK_QUERY_KEYS.CONFIGURATION,
  queryFn: () => gateway.getConfiguration(),
  staleTime: Infinity,
});

export const useModifyOrderProductMutation = (
  gateway: RegistrationDeskGateway | null,
) => useMutation({
  mutationKey: MUTATION_KEYS.MODIFY_ORDER_PRODUCT,
  mutationFn: (request: ModifyOrderProductRequest) => {
    if (!gateway) throw new Error("등록 데스크 gateway가 준비되지 않았습니다.");
    return gateway.modifyOrderProduct(request);
  },
  meta: { invalidates: ORDER_DATA_INVALIDATES },
});

export const useRefundOrderMutation = (
  gateway: RegistrationDeskGateway,
) => useMutation({
  mutationKey: MUTATION_KEYS.REFUND_ORDER,
  mutationFn: (request: RefundOrderRequest) => gateway.refundOrder(request),
  meta: { invalidates: ORDER_DATA_INVALIDATES },
});

export const useRefundOrderProductMutation = (
  gateway: RegistrationDeskGateway,
) => useMutation({
  mutationKey: MUTATION_KEYS.REFUND_ORDER_PRODUCT,
  mutationFn: (request: RefundOrderProductRequest) => gateway.refundOrderProduct(request),
  meta: { invalidates: ORDER_DATA_INVALIDATES },
});

export const useOrderSearchFetching = (query: string | null): boolean =>
  useIsFetching({
    queryKey: query
      ? [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "search", query]
      : [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "inactive-search"],
  }) > 0;

export const useRegistrationDeskQueryClient = (
  gateway: RegistrationDeskGateway | null,
) => {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const requireGateway = (): RegistrationDeskGateway => {
      if (!gateway) throw new Error("등록 데스크 gateway가 준비되지 않았습니다.");
      return gateway;
    };

    return {
      fetchOrderProduct: (id: EntityId) => {
        const client = requireGateway();
        return queryClient.fetchQuery(orderProductQueryOptions(client, id));
      },
      fetchOrderProductByScancode: (scancode: OrderProductScancode) => {
        const client = requireGateway();
        return queryClient.fetchQuery(orderProductScancodeQueryOptions(client, scancode));
      },
      getOrderProduct: (id: EntityId): RegistrationDeskOrderProduct | undefined => {
        const client = requireGateway();
        return queryClient.getQueryData(orderProductQueryOptions(client, id).queryKey);
      },
      setOrderProduct: (lookup: RegistrationDeskOrderProduct) => {
        const client = requireGateway();
        queryClient.setQueryData(
          orderProductQueryOptions(client, lookup.id).queryKey,
          lookup,
        );
      },
      refetchOrderSearch: (query: string) => queryClient.invalidateQueries({
        queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "search", query],
      }),
    };
  }, [gateway, queryClient]);
};
