import { concatBytes as concat } from "../../utils/bytes";
import type { LabelSpec, PrinterProfile } from "./types";

export const repeat = (job: Uint8Array, copies: number): Uint8Array =>
  copies <= 1 ? job : concat(Array.from({ length: copies }, () => job));

export const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

export function maxImageWidth(profile: PrinterProfile, label?: LabelSpec): number {
  if (profile.headDots) return profile.headDots;
  if (!label) throw new Error(`${profile.name} 은 라벨 크기를 알아야 캔버스 폭을 정할 수 있습니다`);
  return Math.floor(label.widthMm * profile.dotsPerMm);
}
