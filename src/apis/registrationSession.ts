import { z } from "zod";
import { REGISTRATION_STATES } from "../domain";
import { orderProductRelationSchema } from "../schemas/order";

export const REGISTRATION_SESSION_STORAGE_KEY = "rosa.registration-session";

export const registrationSessionSchema = z.object({
  registration_state: z.enum(REGISTRATION_STATES),
  order_product_relation: orderProductRelationSchema.nullable(),
  farewell_until: z.number().nullable(),
});

export type RegistrationSession = z.infer<typeof registrationSessionSchema>;

export const DEFAULT_REGISTRATION_SESSION: RegistrationSession = {
  registration_state: "closed",
  order_product_relation: null,
  farewell_until: null,
};

export const parseRegistrationSession = (value: unknown): RegistrationSession =>
  registrationSessionSchema.parse(value);

export const loadRegistrationSession = (): RegistrationSession => {
  if (typeof localStorage === "undefined") return DEFAULT_REGISTRATION_SESSION;

  try {
    const stored = localStorage.getItem(REGISTRATION_SESSION_STORAGE_KEY);
    return stored
      ? parseRegistrationSession(JSON.parse(stored) as unknown)
      : DEFAULT_REGISTRATION_SESSION;
  } catch {
    return DEFAULT_REGISTRATION_SESSION;
  }
};

export const saveRegistrationSession = (session: RegistrationSession): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    REGISTRATION_SESSION_STORAGE_KEY,
    JSON.stringify(registrationSessionSchema.parse(session)),
  );
};
