import { concatBytes as concat } from "../../utils/bytes";
import type { LabelSpec, PrinterProfile } from "./types";

export const MAX_PRINT_COPIES = 100;

export const validatePrintCopies = (copies: number): void => {
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_PRINT_COPIES) {
    throw new Error(`인쇄 매수는 1 이상 ${MAX_PRINT_COPIES} 이하의 정수여야 합니다: ${copies}`);
  }
};

export const validateLabelSpec = (label: LabelSpec): void => {
  if (!Number.isFinite(label.widthMm) || label.widthMm <= 0) {
    throw new Error(`라벨 가로는 0보다 큰 유한한 값이어야 합니다: ${label.widthMm}`);
  }
  if (!Number.isFinite(label.heightMm) || label.heightMm <= 0) {
    throw new Error(`라벨 세로는 0보다 큰 유한한 값이어야 합니다: ${label.heightMm}`);
  }
  if (label.gapMm !== undefined && (!Number.isFinite(label.gapMm) || label.gapMm < 0)) {
    throw new Error(`라벨 갭은 0 이상의 유한한 값이어야 합니다: ${label.gapMm}`);
  }
};

export const validateRightMarginDots = (rightMarginDots: number): void => {
  if (!Number.isInteger(rightMarginDots) || rightMarginDots < 0) {
    throw new Error(`오른쪽 여백은 0 이상의 정수여야 합니다: ${rightMarginDots}`);
  }
};

export const repeat = (job: Uint8Array, copies: number): Uint8Array =>
  copies <= 1 ? job : concat(Array.from({ length: copies }, () => job));

export const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

export function maxImageWidth(profile: PrinterProfile, label?: LabelSpec): number {
  if (profile.headDots) {
    return label ? Math.min(profile.headDots, Math.floor(label.widthMm * profile.dotsPerMm)) : profile.headDots;
  }
  if (!label) throw new Error(`${profile.name} 은 라벨 크기를 알아야 캔버스 폭을 정할 수 있습니다`);
  return Math.floor(label.widthMm * profile.dotsPerMm);
}
