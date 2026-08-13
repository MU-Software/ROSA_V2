import { z } from "zod";
import {
  orderProductRelationSchema,
  orderProductRelationTagSchema,
  orderSchema,
} from "./order";

const route = <TMethod extends "GET" | "PATCH" | "DELETE">(method: TMethod) => z.object({
  method: z.literal(method),
  path: z.string().min(1),
});

export const rosaDiscoverySchema = z.object({
  schema_version: z.string().min(1),
  service: z.literal("rosa"),
  api: z.object({
    base_url: z.string().min(1),
    openapi_url: z.string().min(1),
  }),
  authentication: z.object({
    type: z.literal("session"),
    session_url: z.string().min(1),
    login: z.object({
      type: z.literal("browser_redirect"),
      method: z.literal("POST"),
      provider_redirect_url: z.string().min(1),
      providers: z.array(z.string().min(1)).min(1),
      provider_parameter: z.string().min(1),
      callback_url_parameter: z.string().min(1),
      fixed_parameters: z.record(z.string(), z.string()),
      csrf_form_field: z.string().min(1),
    }),
    logout_url: z.string().min(1),
    logout_method: z.literal("DELETE"),
    csrf: z.object({
      cookie_name: z.string().min(1),
      header_name: z.string().min(1),
    }),
  }),
  routes: z.object({
    retrieve_configuration: route("GET"),
    retrieve_statistics: route("GET"),
    list_orders: route("GET"),
    modify_order: route("PATCH"),
    refund_order: route("DELETE"),
    list_order_products: route("GET"),
    refund_order_product: route("DELETE"),
  }),
});

export const paginatedOrderSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(orderSchema),
});

export const registrationDeskOrderProductSchema = orderProductRelationSchema.extend({
  short_id: z.string(),
  order: z.object({
    id: z.string(),
    name: z.string(),
    current_status: orderSchema.shape.current_status,
    first_paid_at: z.string().nullable(),
  }),
});

export const paginatedRegistrationDeskOrderProductSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(registrationDeskOrderProductSchema),
});

export const registrationDeskConfigurationSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  event: z.object({
    id: z.string(),
    name: z.string(),
    event_start_at: z.string().nullable(),
    event_end_at: z.string().nullable(),
    logo_url: z.string().nullable(),
  }),
  available_tags: z.array(orderProductRelationTagSchema),
});

export const registrationDeskStatisticsSchema = z.object({
  registration_target_count: z.number().int().nonnegative(),
  registered_count: z.number().int().nonnegative(),
  waiting_count: z.number().int().nonnegative(),
});

export const registrationDeskSessionSchema = z.object({
  id: z.number().int().positive(),
  unique_id: z.string(),
  username: z.string(),
  nickname: z.string().nullable(),
  email: z.string(),
});
