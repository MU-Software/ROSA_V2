import type {
  EntityId,
  Order,
  OrderProductScancode,
  OrderProductStatus,
  TicketInfo,
} from "../domain";

export type SearchOrdersParams = {
  query: string;
};

export type ModifyOrderProductOption = {
  id: EntityId;
  custom_response: string | null;
};

export type ModifyOrderProductRequest = {
  order_product_relation_id: EntityId;
  status?: OrderProductStatus;
  options?: ModifyOrderProductOption[];
  ticket_info?: TicketInfo;
};

export type RefundOrderRequest = {
  order_id: EntityId;
  otp: string;
};

export type RegistrationDeskConfiguration = {
  event_scope: {
    category_groups: string[];
  };
  automatic_check_in: {
    enabled: boolean;
    farewell_duration_ms: number;
  };
};

export type RegistrationDeskStatistics = {
  registration_target_count: number;
  registered_count: number;
  waiting_count: number;
};

export type OrderProductLookup = {
  order: Order;
  order_product_relation: Order["products"][number];
};

export interface RegistrationDeskGateway {
  searchOrders(params: SearchOrdersParams): Promise<Order[]>;
  getOrderProductRelation(order_product_relation_id: EntityId): Promise<OrderProductLookup>;
  getOrderByProductScancode(scancode: OrderProductScancode): Promise<OrderProductLookup>;
  listOrdersByUserId(user_id: number): Promise<Order[]>;
  modifyOrderProduct(request: ModifyOrderProductRequest): Promise<Order>;
  refundOrder(request: RefundOrderRequest): Promise<Order>;
  getConfiguration(): Promise<RegistrationDeskConfiguration>;
  getStatistics(): Promise<RegistrationDeskStatistics>;
}
