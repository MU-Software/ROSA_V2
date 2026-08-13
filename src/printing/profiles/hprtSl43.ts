import { concatBytes as concat } from "../../utils/bytes";
import { ASB_LENGTH, ASB_REQUEST, HEALTH_LENGTH, HEALTH_REQUEST } from "../pt390";
import { ascii } from "./common";
import type { PrinterProfile } from "./types";

const BITMAP_CHUNK_ROWS = 64;

export const HPRT_SL43: PrinterProfile = {
  id: "hprt-sl43",
  name: "HPRT SL43",
  links: { usb: { matches: [{ vendorId: 0x2aaf, productId: 0x9006 }], chunkBytes: 4096 } },
  labelSizeSource: "manual",
  dotsPerMm: 8,
  actions: [
    {
      id: "probe-status-commands",
      label: "상태 응답 확인",
      description:
        "TSPL 상태 질의에 이 기기가 답하는지 하나씩 시험합니다. 라벨을 쓰지 않습니다. " +
        "응답하는 질의가 있으면 인쇄 완료 감지에 쓸 수 있습니다.",
      async run(io) {
        const attempts: [string, Uint8Array, number][] = [
          ["ESC !?", HEALTH_REQUEST, HEALTH_LENGTH],
          ["GS a 0", ASB_REQUEST, ASB_LENGTH],
          ["ESC v", ascii("\x1bv"), 1],
          ["~!@", ascii("~!@\r\n"), 1],
        ];
        const lines: string[] = [];
        for (const [name, request, length] of attempts) {
          try {
            await io.write(request);
            const reply = await io.read(length, 700);
            lines.push(`${name} → ${[...reply].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`);
          } catch {
            lines.push(`${name} → 무응답`);
          }
        }
        return lines.join(" · ");
      },
    },
  ],
  buildJob({ image, copies, label }) {
    if (!label) throw new Error("SL43 은 라벨 크기를 지정해야 합니다");
    const preamble = ascii(
      "INITIALPRINTER\r\n" +
        `SIZE ${label.widthMm} mm,${label.heightMm} mm\r\n` +
        `GAP ${label.gapMm ?? 0} mm,0 mm\r\n` +
        "OFFSET 0 mm\r\n" +
        "DIRECTION 0\r\n" +
        "DENSITY 7\r\n",
    );
    return concat([
      preamble,
      image.encodeTspl({ x: 0, y: 0, chunkRows: BITMAP_CHUNK_ROWS, copies }),
      ascii("END\r\n"),
    ]);
  },
};
