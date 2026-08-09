import { z } from "zod";
import {
  OPTION_PLACEHOLDER_MODES,
  ORDER_PRODUCT_STATUSES,
  type OrderProductRelation,
} from "../domain";

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
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
  contribution_message: z.string().nullable(),
});

export const orderProductRelationSchema = z.object({
  id: z.string(),
  product: productSchema,
  is_ticket: z.boolean(),
  options: z.array(orderProductOptionRelationSchema),
  status: z.enum(ORDER_PRODUCT_STATUSES),
  price: z.number(),
  donation_price: z.number(),
  not_refundable_reason: z.string().nullable(),
  ticket_info: ticketInfoSchema.nullable(),
}) satisfies z.ZodType<OrderProductRelation>;
