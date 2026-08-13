export type EntityId = string;

export type IsoDateTime = string;

export const PAYMENT_HISTORY_STATUSES = [
  "pending",
  "completed",
  "partial_refunded",
  "refunded",
] as const;

export type PaymentHistoryStatus = typeof PAYMENT_HISTORY_STATUSES[number];

export const ORDER_PRODUCT_STATUSES = [
  "pending",
  "paid",
  "used",
  "refunded",
] as const;

export type OrderProductStatus = typeof ORDER_PRODUCT_STATUSES[number];

export const OPTION_PLACEHOLDER_MODES = [
  "hidden",
  "optional",
  "required",
] as const;

export type OptionPlaceholderMode = typeof OPTION_PLACEHOLDER_MODES[number];

export type PaymentHistory = {
  status: PaymentHistoryStatus;
  price: number;
  created_at: IsoDateTime;
};

export type ProductCategory = {
  id: EntityId;
  name: string;
};

export type Product = {
  id: EntityId;
  name: string;
  price: number;
  category: ProductCategory;
};

export type ProductOptionGroup = {
  id: EntityId;
  name: string;
  is_custom_response: boolean;
  custom_response_pattern: string | null;
  placeholder_mode: OptionPlaceholderMode;
};

export type ProductOption = {
  id: EntityId;
  name: string;
  additional_price: number;
};

export type OrderProductOptionRelation = {
  id: EntityId;
  product_option_group: ProductOptionGroup;
  product_option: ProductOption | null;
  custom_response: string | null;
};

export type TicketInfo = {
  name: string;
  phone: string;
  email: string;
  organization: string | null;
};

export type OrderProductRelationTag = {
  id: EntityId;
  code: string;
  name: string;
  priority: number;
};

export type OrderProductRelation = {
  id: EntityId;
  scancode_token: string;
  product: Product;
  is_ticket: boolean;
  options: OrderProductOptionRelation[];
  tags: OrderProductRelationTag[];
  status: OrderProductStatus;
  price: number;
  donation_price: number;
  not_refundable_reason: string | null;
  ticket_info: TicketInfo | null;
};

export type OrderUser = {
  id: number;
  username: string;
  email: string;
  unique_id: EntityId;
};

export type CustomerInfo = {
  name: string;
  phone: string;
  email: string;
  organization: string | null;
};

export type Order = {
  id: EntityId;
  name: string;
  first_paid_price: number;
  first_paid_at: IsoDateTime | null;
  current_paid_price: number;
  current_status: PaymentHistoryStatus;
  payment_histories: PaymentHistory[];
  products: OrderProductRelation[];
  user: OrderUser;
  customer_info: CustomerInfo | null;
  not_fully_refundable_reason: string | null;
  created_at: IsoDateTime;
};
