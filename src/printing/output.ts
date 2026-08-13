export const REGISTRATION_PRINT_KINDS = ["badge", "exchange_voucher"] as const;

export type RegistrationPrintKind = typeof REGISTRATION_PRINT_KINDS[number];

export const REGISTRATION_PRINT_KIND_LABELS: Record<RegistrationPrintKind, string> = {
  badge: "명찰",
  exchange_voucher: "교환권",
};
