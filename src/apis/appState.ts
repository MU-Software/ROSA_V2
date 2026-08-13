import { z } from "zod";
import { REGISTRATION_STATES } from "../domain";
import { orderProductRelationSchema } from "../schemas/order";
import { printJobExecutionSchema } from "../schemas/printing";

export const APP_STATE_STORAGE_KEY = "rosa.app-state";

export const persistedAppStateSchema = z.object({
  registration_state: z.enum(REGISTRATION_STATES),
  order_product_relation: orderProductRelationSchema.nullable(),
  event_logo_url: z.string().nullable(),
  farewell_until: z.number().nullable(),
  automatic_registration_enabled: z.boolean(),
  active_order_product_scancode: z.string().nullable(),
  print_job_executions: z.array(printJobExecutionSchema),
});

export type PersistedAppState = z.infer<typeof persistedAppStateSchema>;

export const DEFAULT_PERSISTED_APP_STATE: PersistedAppState = {
  registration_state: "closed",
  order_product_relation: null,
  event_logo_url: null,
  farewell_until: null,
  automatic_registration_enabled: false,
  active_order_product_scancode: null,
  print_job_executions: [],
};

export const parsePersistedAppState = (value: unknown): PersistedAppState =>
  persistedAppStateSchema.parse(value);

export const loadPersistedAppState = (): PersistedAppState => {
  if (typeof localStorage === "undefined") return DEFAULT_PERSISTED_APP_STATE;

  try {
    const stored = localStorage.getItem(APP_STATE_STORAGE_KEY);
    const state = stored
      ? parsePersistedAppState(JSON.parse(stored) as unknown)
      : DEFAULT_PERSISTED_APP_STATE;
    return {
      ...state,
      print_job_executions: state.print_job_executions.map((execution) =>
        execution.status === "printing"
          ? { ...execution, status: "waiting", error: null, completion_confirmed: null }
          : execution),
    };
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
