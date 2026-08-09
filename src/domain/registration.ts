export const REGISTRATION_STATES = [
  "closed",
  "idle",
  "registering",
  "awaiting_completion",
] as const;

export type RegistrationState = typeof REGISTRATION_STATES[number];

export class InvalidRegistrationTransitionError extends Error {
  readonly name = "InvalidRegistrationTransitionError";
}

const TRANSITIONS: Record<RegistrationState, readonly RegistrationState[]> = {
  closed: ["idle"],
  idle: ["closed", "registering"],
  registering: ["closed", "idle", "awaiting_completion"],
  awaiting_completion: ["closed", "idle", "registering"],
};

export const transitionRegistration = (
  current: RegistrationState,
  next: RegistrationState,
): RegistrationState => {
  if (!TRANSITIONS[current].includes(next)) {
    throw new InvalidRegistrationTransitionError(
      `허용되지 않는 등록 상태 전이입니다: ${current} → ${next}`,
    );
  }

  return next;
};
