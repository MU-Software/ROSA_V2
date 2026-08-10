import { z } from "zod";
import { REGISTRATION_STATES } from "../domain";
import { orderProductRelationSchema } from "../schemas/order";

export const APP_STATE_STORAGE_KEY = "rosa.app-state";

export const persistedAppStateSchema = z.object({
  registration_state: z.enum(REGISTRATION_STATES),
  order_product_relation: orderProductRelationSchema.nullable(),
  farewell_until: z.number().nullable(),
  automatic_registration_enabled: z.boolean(),
  active_order_product_scancode: z.string().nullable(),
});

export type PersistedAppState = z.infer<typeof persistedAppStateSchema>;

export const DEFAULT_PERSISTED_APP_STATE: PersistedAppState = {
  registration_state: "closed",
  order_product_relation: null,
  farewell_until: null,
  automatic_registration_enabled: false,
  active_order_product_scancode: null,
};

export const parsePersistedAppState = (value: unknown): PersistedAppState =>
  persistedAppStateSchema.parse(value);

export const loadPersistedAppState = (): PersistedAppState => {
  if (typeof localStorage === "undefined") return DEFAULT_PERSISTED_APP_STATE;

  try {
    const stored = localStorage.getItem(APP_STATE_STORAGE_KEY);
    return stored
      ? parsePersistedAppState(JSON.parse(stored) as unknown)
      : DEFAULT_PERSISTED_APP_STATE;
  } catch {
    return DEFAULT_PERSISTED_APP_STATE;
  }
};

export const savePersistedAppState = (state: PersistedAppState): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    APP_STATE_STORAGE_KEY,
    JSON.stringify(persistedAppStateSchema.parse(state)),
  );
};
