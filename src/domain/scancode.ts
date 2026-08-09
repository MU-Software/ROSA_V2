export const ORDER_PRODUCT_SCANCODE_PREFIX = "opr";

export type OrderProductScancode = {
  scancode_token: string;
  short_id: string;
  salt: string;
};

export class InvalidOrderProductScancodeError extends Error {
  readonly name = "InvalidOrderProductScancodeError";
}

const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

export const parseOrderProductScancode = (input: string): OrderProductScancode => {
  const scancode_token = input.trim();
  if (!scancode_token) throw new InvalidOrderProductScancodeError("주문상품 QR 코드가 비어 있습니다.");

  const parts = scancode_token.split(":");
  if (parts.length !== 3) throw new InvalidOrderProductScancodeError("주문상품 QR 코드 형식이 올바르지 않습니다.");

  const [prefix, short_id, salt] = parts;
  if (prefix !== ORDER_PRODUCT_SCANCODE_PREFIX) throw new InvalidOrderProductScancodeError("주문상품 QR 코드가 아닙니다.");
  if (!short_id || !salt || !TOKEN_PART_PATTERN.test(short_id) || !TOKEN_PART_PATTERN.test(salt)) {
    throw new InvalidOrderProductScancodeError("주문상품 QR 코드 형식이 올바르지 않습니다.");
  }

  return { scancode_token, short_id, salt };
};
