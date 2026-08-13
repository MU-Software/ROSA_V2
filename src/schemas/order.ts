import { z } from "zod";
import {
  OPTION_PLACEHOLDER_MODES,
  ORDER_PRODUCT_STATUSES,
  PAYMENT_HISTORY_STATUSES,
  type Order,
  type OrderProductRelation,
} from "../domain";

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  category: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

export const productOptionGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_custom_response: z.boolean(),
  custom_response_pattern: z.string().nullable(),
  placeholder_mode: z.enum(OPTION_PLACEHOLDER_MODES),
});

export const productOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  additional_price: z.number(),
});

export const orderProductOptionRelationSchema = z.object({
  id: z.string(),
  product_option_group: productOptionGroupSchema,
  product_option: productOptionSchema.nullable(),
  custom_response: z.string().nullable(),
});

export const ticketInfoSchema = z.object({
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  organization: z.string().nullable(),
});

export const orderProductRelationTagSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  priority: z.number().int(),
});

export const orderProductRelationSchema = z.object({
  id: z.string(),
  product: productSchema,
  is_ticket: z.boolean(),
  options: z.array(orderProductOptionRelationSchema),
  tags: z.array(orderProductRelationTagSchema),
  status: z.enum(ORDER_PRODUCT_STATUSES),
  price: z.number(),
  donation_price: z.number(),
  not_refundable_reason: z.string().nullable(),
  ticket_info: ticketInfoSchema.nullable(),
}) satisfies z.ZodType<OrderProductRelation>;

export const orderSchema = z.object({
  id: z.string(),
  name: z.string(),
  first_paid_price: z.number(),
  first_paid_at: z.string().nullable(),
  current_paid_price: z.number(),
  current_status: z.enum(PAYMENT_HISTORY_STATUSES),
  payment_histories: z.array(z.object({
    status: z.enum(PAYMENT_HISTORY_STATUSES),
    price: z.number(),
    created_at: z.string(),
  })),
  products: z.array(orderProductRelationSchema),
  user: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string(),
    unique_id: z.string(),
  }),
  customer_info: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string(),
    organization: z.string().nullable(),
  }).nullable(),
  not_fully_refundable_reason: z.string().nullable(),
  created_at: z.string(),
}) satisfies z.ZodType<Order>;
