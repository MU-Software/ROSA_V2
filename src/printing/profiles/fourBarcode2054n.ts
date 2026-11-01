import { concatBytes as concat } from "../../utils/bytes";
import {
  ascii,
  labelSpecFromSettings,
  manualLabelSettingFields,
  validateManualLabelSettings,
  validatePrintCopies,
} from "./common";
import type { PrinterProfile } from "./types";

/** 같은 계열 4B-3044TA 는 BITMAP 하나가 16 KB 를 넘으면 빈 라벨을 낸다. 64 행은 4인치 전폭에서도 6.5 KB 다. */
const BITMAP_CHUNK_ROWS = 64;

export const FOURBARCODE_2054N: PrinterProfile = {
  id: "4barcode-4b-2054n",
  name: "4BARCODE 4B-2054N",
  links: { usb: { matches: [{ vendorId: 0x2d84, productId: 0xb028 }], chunkBytes: 4096 } },
  mediaSizeSource: "settings",
  settings: manualLabelSettingFields(),
  dotsPerMm: 8,
  canvasSize({ settings }) {
    const label = labelSpecFromSettings(settings);
    return {
      width: Math.floor(label.widthMm * this.dotsPerMm),
      height: Math.floor(label.heightMm * this.dotsPerMm),
    };
  },
  validateSettings: validateManualLabelSettings,
  buildJob({ image, copies, settings }) {
    const label = labelSpecFromSettings(settings);
    validatePrintCopies(copies);
    // INITIALPRINTER·DENSITY 는 보내지 않는다 — 농도·속도는 프린터에 저장된 값을 따른다.
    const preamble = ascii(
      `SIZE ${label.widthMm} mm,${label.heightMm} mm\r\n` +
        `GAP ${label.gapMm ?? 0} mm,0 mm\r\n` +
        "DIRECTION 0\r\n",
    );
    return concat([
      preamble,
      image.encodeTspl({ x: 0, y: 0, chunkRows: BITMAP_CHUNK_ROWS, copies }),
    ]);
  },
};
