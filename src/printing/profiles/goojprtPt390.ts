import * as RCPT from "@mu-software/receipet/constants";
import { concatBytes as concat } from "../../utils/bytes";
import {
  ASB_LENGTH,
  ASB_REQUEST,
  CMD_MODE_ESCPOS,
  CMD_MODE_TSPL,
  HEALTH_LENGTH,
  HEALTH_REQUEST,
  JXIG_LENGTH,
  JXIG_REQUEST,
  JXIS_REQUEST,
  SELF_TEST_REQUEST,
  describeAsbProblems,
  parseAsb,
  parseJxig,
  withCmdMode,
} from "../pt390";
import { repeat } from "./common";
import type { PrinterProfile } from "./types";

const PT390_MAX_DOTS = 576;

export const GOOJPRT_PT390: PrinterProfile = {
  id: "goojprt-pt390",
  name: "GOOJPRT PT-390",
  links: {
    usb: { matches: [{ vendorId: 0x0483, productId: 0x5720 }], chunkBytes: 64 },
    btspp: { namePattern: /^JLP352-/i, chunkBytes: 4096 },
    ble: {
      namePattern: /^JLP352-/i,
      service: "000018f0-0000-1000-8000-00805f9b34fb",
      writeCharacteristic: "00002af1-0000-1000-8000-00805f9b34fb",
      notifyCharacteristic: "00002af0-0000-1000-8000-00805f9b34fb",
      chunkBytes: 182,
      pace: { bytes: 8192, pauseMs: 300 },
    },
  },
  headDots: PT390_MAX_DOTS,
  dotsPerMm: 8,
  completionProbe: { request: HEALTH_REQUEST, length: HEALTH_LENGTH, intervalMs: 400 },
  actions: [
    {
      id: "escpos-mode",
      label: "ESC/POS 모드로 전환",
      description:
        "TSPL 모드에서는 GS v 0 이 무시되어 아무것도 인쇄되지 않습니다. " +
        "전환하면 프린터가 재시작되고, 실기에서는 전원을 직접 껐다 켜야 다시 붙었습니다.",
      disruptive: true,
      async run(io) {
        await io.write(JXIG_REQUEST);
        const block = await io.read(JXIG_LENGTH);
        const info = parseJxig(block);
        if (!info.checksumValid) throw new Error("JXIG 체크섬이 맞지 않아 설정을 쓰지 않았습니다");
        if (info.cmdMode === CMD_MODE_ESCPOS) return "이미 ESC/POS 모드입니다";
        try {
          await io.write(concat([JXIS_REQUEST, withCmdMode(block, CMD_MODE_ESCPOS)]));
        } catch {
          // 프린터가 즉시 재시작하며 연결이 끊긴다. 실패가 아니라 정상 흐름이다.
        }
        return "ESC/POS 로 전환했습니다. 프린터 전원을 껐다 켠 뒤 다시 연결하세요";
      },
    },
    {
      id: "self-test",
      label: "셀프테스트 인쇄",
      description: "프린터가 자기 설정을 한 장 뽑습니다. 전송이 살아있는지 가장 빨리 보는 방법입니다.",
      async run(io) {
        await io.write(SELF_TEST_REQUEST);
        return "셀프테스트를 보냈습니다";
      },
    },
  ],
  async probe(io) {
    await io.write(JXIG_REQUEST);
    const info = parseJxig(await io.read(JXIG_LENGTH));
    const problems: string[] = [];
    if (!info.checksumValid) problems.push("JXIG 체크섬이 맞지 않습니다");
    if (info.cmdMode !== CMD_MODE_ESCPOS) {
      problems.push(
        info.cmdMode === CMD_MODE_TSPL
          ? "TSPL 모드입니다. ESC/POS 로 바꿔야 인쇄됩니다 (전환 시 프린터가 재시작됩니다)"
          : `cmdMode 가 0x${info.cmdMode.toString(16)} 입니다`,
      );
    }
    await io.write(ASB_REQUEST);
    problems.push(...describeAsbProblems(parseAsb(await io.read(ASB_LENGTH))));
    return {
      summary: `${info.deviceName || "PT-390"} · ${info.cmdMode === CMD_MODE_ESCPOS ? "ESC/POS" : "TSPL/CPCL"} · 배터리 ${info.powerLev}%`,
      fields: {
        제조사: info.factoryName,
        펌웨어: String(info.version),
        "인쇄 폭": `${info.maxDotLine} dots (${info.dotsPerMm} dot/mm)`,
        용지: info.paperTypeLabel,
        농도: `${info.depthLev} / 15`,
        속도: String(info.speedLev),
        "헤드 온도": `${info.ptTemp} ℃`,
      },
      problems,
    };
  },
  buildJob({ image, copies }) {
    if (image.width > PT390_MAX_DOTS) {
      throw new Error(`PT-390 의 인쇄 폭은 ${PT390_MAX_DOTS} dots 입니다: ${image.width} dots`);
    }
    const page = concat([
      Uint8Array.of(0x1b, 0x40),
      Uint8Array.of(0x1b, 0x61, 0x01),
      image.encodeEscpos({ flags: RCPT.F_RAW }),
      Uint8Array.of(0x1d, 0x0c),
    ]);
    return repeat(page, copies);
  },
};
