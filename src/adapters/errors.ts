import { toMessage } from "../utils/bytes";

export type TransportErrorCode =
  | "timeout"
  | "disconnected"
  | "busy"
  | "permission-denied"
  | "unsupported"
  | "invalid-input"
  | "already-open"
  | "unavailable"
  | "protocol-error"
  | "io"
  | "internal"
  | "cancelled"
  | "unknown";

export class TransportError extends Error {
  readonly code: TransportErrorCode;

  constructor(code: TransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransportError";
    this.code = code;
  }
}

type ErrorPayload = { code: unknown; message: unknown };

const isErrorPayload = (value: unknown): value is ErrorPayload =>
  !!value && typeof value === "object" && "code" in value && "message" in value;

const isTransportCode = (value: unknown): value is TransportErrorCode =>
  typeof value === "string" && [
    "timeout", "disconnected", "busy", "permission-denied", "unsupported",
    "invalid-input", "already-open", "unavailable", "protocol-error", "io",
    "internal", "cancelled", "unknown",
  ].includes(value);

const domExceptionCode = (error: DOMException): TransportErrorCode => {
  switch (error.name) {
    case "AbortError": return "cancelled";
    case "NotAllowedError":
    case "SecurityError": return "permission-denied";
    case "NetworkError": return "unavailable";
    case "NotFoundError": return "disconnected";
    case "TimeoutError": return "timeout";
    default: return "unknown";
  }
};

export function toTransportError(
  error: unknown,
  fallbackCode: TransportErrorCode = "unknown",
  fallbackMessage?: string,
): TransportError {
  if (error instanceof TransportError) return error;
  if (isErrorPayload(error)) {
    return new TransportError(
      isTransportCode(error.code) ? error.code : fallbackCode,
      typeof error.message === "string" ? error.message : (fallbackMessage ?? toMessage(error)),
      { cause: error },
    );
  }
  if (error instanceof DOMException) {
    return new TransportError(domExceptionCode(error), fallbackMessage ?? error.message, { cause: error });
  }
  return new TransportError(fallbackCode, fallbackMessage ?? toMessage(error), { cause: error });
}

export const hasTransportCode = (error: unknown, ...codes: TransportErrorCode[]): boolean =>
  error instanceof TransportError && codes.includes(error.code);
