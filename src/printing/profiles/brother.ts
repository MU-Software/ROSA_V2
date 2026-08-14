import * as RCPT from "@mu-software/receipet/constants";
import { describeBrotherErrors, parseBrotherStatus } from "../receipet";
import {
  PRINT_PADDING_SETTING_FIELD,
  RIGHT_MARGIN_DOTS_SETTING,
  printerSetting,
  repeat,
  validatePrintCopies,
  validateRightMarginDots,
} from "./common";
import type { BrotherMedia, PrinterProfile } from "./types";

const BROTHER_HEAD_DOTS = 720;
const BROTHER_DOTS_PER_MM = 300 / 25.4;

export type BrotherLabelGeometry = {
  printableWidthDots: number;
  printableLengthDots: number;
  rightMarginDots: number;
  estimated: boolean;
};

/** 실측으로 확인된 미디어만 담는다 — 옮겨 적은 숫자는 확인된 숫자와 구별되지 않는다. */
const BROTHER_LABELS: Record<string, Omit<BrotherLabelGeometry, "estimated">> = {
  "38x90": { printableWidthDots: 413, printableLengthDots: 991, rightMarginDots: 12 },
};

/** 다이컷 라벨은 가로로 약 3 mm, 급지 방향으로 약 6 mm 를 잃는다. */
const DIE_CUT_LOSS_ACROSS_DOTS = 36;
const DIE_CUT_LOSS_ALONG_DOTS = 70;
const BROTHER_DEFAULT_RIGHT_MARGIN_DOTS = 12;

export function brotherGeometry(media: BrotherMedia): BrotherLabelGeometry {
  const known = BROTHER_LABELS[`${media.widthMm}x${media.lengthMm}`];
  if (known) return { ...known, estimated: false };

  const mediaWidthDots = Math.round(media.widthMm * BROTHER_DOTS_PER_MM);
  const mediaLengthDots = Math.round(media.lengthMm * BROTHER_DOTS_PER_MM);
  return {
    printableWidthDots: mediaWidthDots - DIE_CUT_LOSS_ACROSS_DOTS,
    printableLengthDots: media.lengthMm === 0 ? 0 : mediaLengthDots - DIE_CUT_LOSS_ALONG_DOTS,
    rightMarginDots: BROTHER_DEFAULT_RIGHT_MARGIN_DOTS,
    estimated: true,
  };
}

const BROTHER_MEDIA_LABELS: Record<number, string> = {
  [RCPT.BROTHER_MEDIA_NONE]: "없음",
  [RCPT.BROTHER_MEDIA_CONTINUOUS]: "연속 테이프",
  [RCPT.BROTHER_MEDIA_DIE_CUT]: "다이컷",
};

/** receipet 헤더가 아직 생성 상수로 내보내지 않는 인쇄 중 phase 값. */
const BROTHER_PHASE_PRINTING = 0x01;

const brotherFinished = async (reply: Uint8Array): Promise<boolean> => {
  const status = await parseBrotherStatus(reply);
  const problems = describeBrotherErrors(status.errors);
  if (problems.length > 0) throw new Error(`Brother 가 인쇄를 멈췄습니다: ${problems.join(", ")}`);
  return status.phaseType !== BROTHER_PHASE_PRINTING;
};

const BROTHER_QL_PROFILE: Omit<PrinterProfile, "id" | "name" | "links"> = {
  mediaSizeSource: "device",
  settings: [
    PRINT_PADDING_SETTING_FIELD,
    {
      id: RIGHT_MARGIN_DOTS_SETTING,
      label: "오른쪽 여백",
      unit: "dots",
      defaultValue: BROTHER_DEFAULT_RIGHT_MARGIN_DOTS,
      min: 0,
      max: BROTHER_HEAD_DOTS - 1,
      step: 1,
      integer: true,
    },
  ],
  dotsPerMm: BROTHER_DOTS_PER_MM,
  canvasSize({ probe }) {
    if (!probe?.printable) throw new Error("Brother 미디어의 인쇄 영역을 확인할 수 없습니다");
    return {
      width: probe.printable.widthDots,
      height: probe.printable.lengthDots || undefined,
    };
  },
  completionProbe: {
    request: RCPT.BROTHER_STATUS_REQUEST,
    length: RCPT.BROTHER_STATUS_LEN,
    intervalMs: 250,
    responseTimeoutMs: 5000,
    createJudge: () => brotherFinished,
  },

  async probe(io) {
    await io.write(RCPT.BROTHER_STATUS_REQUEST);
    const status = await parseBrotherStatus(await io.read(RCPT.BROTHER_STATUS_LEN));
    const media: BrotherMedia = {
      type: status.mediaType,
      widthMm: status.mediaWidthMm,
      lengthMm: status.mediaLengthMm,
    };
    const geometry = brotherGeometry(media);
    const problems = describeBrotherErrors(status.errors);
    if (status.mediaType === RCPT.BROTHER_MEDIA_NONE) problems.push("미디어가 없습니다");
    if (geometry.estimated && status.mediaType !== RCPT.BROTHER_MEDIA_NONE) {
      problems.push(`${media.widthMm}x${media.lengthMm} mm 는 확인된 미디어가 아니라 인쇄 영역이 추정치입니다`);
    }

    return {
      summary: `${BROTHER_MEDIA_LABELS[status.mediaType] ?? "알 수 없음"} ${media.widthMm}${media.lengthMm ? `x${media.lengthMm}` : ""} mm`,
      fields: {
        "모델 코드": `0x${status.model.toString(16)}`,
        미디어: BROTHER_MEDIA_LABELS[status.mediaType] ?? `0x${status.mediaType.toString(16)}`,
        "인쇄 영역": `${geometry.printableWidthDots} x ${geometry.printableLengthDots} dots${geometry.estimated ? " (추정)" : ""}`,
        "오른쪽 여백": `${geometry.rightMarginDots} dots`,
      },
      problems,
      printable: { widthDots: geometry.printableWidthDots, lengthDots: geometry.printableLengthDots },
      media,
    };
  },

  buildJob({ image, copies, probe, settings }) {
    validatePrintCopies(copies);
    const media = probe?.media;
    if (!media) throw new Error("Brother 는 인쇄 전에 상태 조회로 미디어를 확인해야 합니다");

    const rightMargin = printerSetting(settings, RIGHT_MARGIN_DOTS_SETTING);
    validateRightMarginDots(rightMargin);
    const offset = BROTHER_HEAD_DOTS - image.width - rightMargin;
    if (offset < 0) {
      throw new Error(`이미지가 헤드보다 넓습니다: ${image.width} + 여백 ${rightMargin} > ${BROTHER_HEAD_DOTS} dots`);
    }
    return repeat(
      image.encodeBrother({ mediaType: media.type, widthMm: media.widthMm, lengthMm: media.lengthMm, offset }),
      copies,
    );
  },
};

export const BROTHER_QL_720NW: PrinterProfile = {
  ...BROTHER_QL_PROFILE,
  id: "brother-ql-720nw",
  name: "Brother QL-720NW",
  links: { usb: { matches: [{ vendorId: 0x04f9, productId: 0x2044 }], chunkBytes: 16384 } },
};

export const BROTHER_QL_820NWB: PrinterProfile = {
  ...BROTHER_QL_PROFILE,
  id: "brother-ql-820nwb",
  name: "Brother QL-820NWB",
  links: { usb: { matches: [{ vendorId: 0x04f9, productId: 0x209d }], chunkBytes: 16384 } },
};
