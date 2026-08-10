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
  OrderProductScancode,
} from "../domain";
import type {
  ModifyOrderProductRequest,
  OrderProductLookup,
  RefundOrderRequest,
  RegistrationDeskGateway,
} from "../gateways";

export const REGISTRATION_DESK_QUERY_KEYS = {
  BASE: ["query", "registration-desk"] as const,
  ORDERS: ["query", "registration-desk", "orders"] as const,
  ORDER_PRODUCTS: ["query", "registration-desk", "order-product-relations"] as const,
  STATISTICS: ["query", "registration-desk", "statistics"] as const,
  CONFIGURATION: ["query", "registration-desk", "configuration"] as const,
};

const MUTATION_KEYS = {
  MODIFY_ORDER_PRODUCT: ["mutation", "registration-desk", "modify-order-product"] as const,
  REFUND_ORDER: ["mutation", "registration-desk", "refund-order"] as const,
};

const ORDER_DATA_INVALIDATES = [
  REGISTRATION_DESK_QUERY_KEYS.ORDERS,
  REGISTRATION_DESK_QUERY_KEYS.ORDER_PRODUCTS,
  REGISTRATION_DESK_QUERY_KEYS.STATISTICS,
];

const orderSearchQueryOptions = (
  gateway: RegistrationDeskGateway,
  query: string,
) => queryOptions({
  queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDERS, "search", query],
  queryFn: () => gateway.searchOrders({ query }),
});

const orderProductQueryOptions = (
  gateway: RegistrationDeskGateway,
  id: EntityId,
) => queryOptions({
  queryKey: [...REGISTRATION_DESK_QUERY_KEYS.ORDER_PRODUCTS, id],
  queryFn: () => gateway.getOrderProductRelation(id),
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
  queryFn: () => gateway.getOrderByProductScancode(scancode),
});

export const useOrderSearchQuery = (
  gateway: RegistrationDeskGateway,
  query: string,
) => useSuspenseQuery(orderSearchQueryOptions(gateway, query));

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
      getOrderProduct: (id: EntityId): OrderProductLookup | undefined => {
        const client = requireGateway();
        return queryClient.getQueryData(orderProductQueryOptions(client, id).queryKey);
      },
      setOrderProduct: (lookup: OrderProductLookup) => {
        const client = requireGateway();
        queryClient.setQueryData(
          orderProductQueryOptions(client, lookup.order_product_relation.id).queryKey,
          lookup,
        );
      },
      refetchOrderSearch: (query: string) => queryClient.invalidateQueries({
        queryKey: orderSearchQueryOptions(requireGateway(), query).queryKey,
      }),
    };
  }, [gateway, queryClient]);
};
