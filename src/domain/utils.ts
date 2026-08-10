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

export const getAutomaticRegistrationUnavailableReason = (
  order: Pick<Order, "current_status">,
  product: Pick<OrderProductRelation, "is_ticket" | "status" | "ticket_info">,
): string | null => {
  if (!FULLY_REFUNDABLE_ORDER_STATUSES.some((status) => status === order.current_status)) {
    return "결제가 완료된 주문만 자동 접수할 수 있습니다.";
  }
  if (product.status !== "paid") {
    return product.status === "used"
      ? "이미 사용 처리된 주문상품입니다."
      : "사용 대기 상태의 주문상품만 자동 접수할 수 있습니다.";
  }
  if (product.is_ticket && !product.ticket_info) {
    return "명찰에 필요한 참가자 정보가 없습니다.";
  }
  return null;
};
