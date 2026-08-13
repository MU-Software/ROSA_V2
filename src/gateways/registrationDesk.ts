import type {
  EntityId,
  IsoDateTime,
  Order,
  OrderProductRelation,
  OrderProductRelationTag,
  OrderProductStatus,
  TicketInfo,
} from "../domain";

export type PaginationParams = {
  page?: number;
  page_size?: number;
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type OrderFilter =
  | { keywords: string }
  | { order_id: EntityId }
  | { order_product_relation_id: EntityId }
  | { user_unique_id: EntityId };

export type SearchOrdersParams = PaginationParams & OrderFilter;

export type ListOrderProductsParams = PaginationParams & (
  | { order_product_relation_id: EntityId; scancode?: never }
  | { scancode: string; order_product_relation_id?: never }
);

export type ModifyOrderProductOption = {
  id: EntityId;
  custom_response: string | null;
};

export type ModifyOrderProductRequest = {
  order_id: EntityId;
  order_product_relation_id: EntityId;
  status?: OrderProductStatus;
  options?: ModifyOrderProductOption[];
  ticket_info?: TicketInfo;
};

export type RefundOrderRequest = {
  order_id: EntityId;
  otp: string;
};

export type RefundOrderProductRequest = {
  order_product_relation_id: EntityId;
  otp: string;
};

export type RegistrationDeskConfiguration = {
  id: EntityId;
  name: string;
  start_date: string;
  end_date: string;
  event: {
    id: EntityId;
    name: string;
    event_start_at: IsoDateTime | null;
    event_end_at: IsoDateTime | null;
    logo_url: string | null;
  };
  available_tags: OrderProductRelationTag[];
};

export type RegistrationDeskStatistics = {
  registration_target_count: number;
  registered_count: number;
  waiting_count: number;
};

export type RegistrationDeskSession = {
  id: number;
  unique_id: string;
  username: string;
  nickname: string | null;
  email: string;
};

export type RegistrationDeskOrderProduct = OrderProductRelation & {
  short_id: string;
  order: Pick<Order, "id" | "name" | "current_status" | "first_paid_at">;
};

export interface RegistrationDeskGateway {
  searchOrders(params: SearchOrdersParams): Promise<PaginatedResponse<Order>>;
  listOrderProducts(
    params: ListOrderProductsParams,
  ): Promise<PaginatedResponse<RegistrationDeskOrderProduct>>;
  modifyOrderProduct(request: ModifyOrderProductRequest): Promise<Order>;
  refundOrder(request: RefundOrderRequest): Promise<void>;
  refundOrderProduct(request: RefundOrderProductRequest): Promise<void>;
  getConfiguration(): Promise<RegistrationDeskConfiguration>;
  getStatistics(): Promise<RegistrationDeskStatistics>;
}
