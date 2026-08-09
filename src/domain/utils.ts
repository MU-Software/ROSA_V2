import type {
  Order,
  OrderProductOptionRelation,
  OrderProductRelation,
  OrderProductStatus,
} from "./order";

export const FULLY_REFUNDABLE_ORDER_STATUSES = ["completed", "partial_refunded"] as const;

const ORDER_PRODUCT_STATUS_TRANSITIONS: Record<OrderProductStatus, readonly OrderProductStatus[]> = {
  pending: [],
  paid: ["used"],
  used: ["paid"],
  refunded: [],
};

export const canTransitionOrderProductStatus = (
  current: OrderProductStatus,
  next: OrderProductStatus,
): boolean => ORDER_PRODUCT_STATUS_TRANSITIONS[current].includes(next);

export const canFullyRefundOrder = (
  order: Pick<Order, "current_status" | "not_fully_refundable_reason">,
): boolean =>
  FULLY_REFUNDABLE_ORDER_STATUSES.some((status) => status === order.current_status) &&
  order.not_fully_refundable_reason === null;

export const getPaidOptionExchangeTargets = (
  order_product: Pick<OrderProductRelation, "options">,
): OrderProductOptionRelation[] =>
  order_product.options.filter(
    ({ product_option }) =>
      product_option !== null && product_option.additional_price > 0,
  );
