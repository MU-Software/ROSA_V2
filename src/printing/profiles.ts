import { concatBytes as concat } from "../utils/bytes";
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
} from "./pt390";
import * as RCPT from "@mu-software/receipet/constants";
import { describeBrotherErrors, parseBrotherStatus, type RcptImage } from "./receipet";

export type TransportKind = "usb" | "btspp" | "ble";

export type UsbLink = { matches: UsbMatch[]; chunkBytes: number };
export type SppLink = { namePattern: RegExp; chunkBytes: number };
export type BleLink = {
  namePattern: RegExp;
  service: string;
  writeCharacteristic: string;
  notifyCharacteristic: string;
  /** MTU 를 알아낼 수 없을 때 쓴다. 실측 최적값이며 협상 MTU 를 넘기면 오히려 느려진다. */
  chunkBytes: number;
  /**
   * `bytes` 만큼 보낼 때마다 `pauseMs` 쉰다. 없으면 쉬지 않는다.
   *
   * GATT 수신 버퍼는 유한한데 **넘치면 조용히 버린다.** 오류도 나지 않아, 래스터가
   * 중간부터 어긋나고 남은 꼬리가 글자로 인쇄된다.
   */
  pace?: { bytes: number; pauseMs: number };
};

export type LinkSpec = UsbLink | SppLink | BleLink;

export type PrinterLinks = {
  usb?: UsbLink;
  btspp?: SppLink;
  ble?: BleLink;
};

export type UsbMatch = { vendorId: number; productId: number };

export type ByteStream = {
  write(data: Uint8Array): Promise<void>;
  /** 응답에 프레이밍이 없어, 정확히 `length` 바이트가 쌓일 때까지 누적한다. */
  read(length: number, timeoutMs?: number): Promise<Uint8Array>;
};

/** `read` 가 시간을 받지 않았을 때 전송이 쓰는 값. */
export const DEFAULT_READ_TIMEOUT_MS = 5000;

export type BrotherMedia = {
  type: number;
  widthMm: number;
  lengthMm: number;
};

export type ProbeResult = {
  summary: string;
  fields: Record<string, string>;
  problems: string[];
  /** 프린터가 감지한 인쇄 가능 크기. 있으면 헤드 폭보다 우선해 캔버스 크기를 정한다. */
  printable?: { widthDots: number; lengthDots: number };
  media?: BrotherMedia;
};

/** 프린터가 스스로 알아낼 수 없어 호출자가 줘야 한다. */
export type LabelSpec = {
  widthMm: number;
  heightMm: number;
  gapMm?: number;
};

export type JobRequest = {
  image: RcptImage;
  copies: number;
  probe?: ProbeResult;
  label?: LabelSpec;
  /** 생략하면 미디어 표에서 가져온다. */
  rightMarginDots?: number;
};

export type PrinterAction = {
  id: string;
  label: string;
  description: string;
  /** 프린터가 재시작되거나 설정이 영구히 바뀐다 — UI 가 확인을 받는다. */
  disruptive?: boolean;
  /** 사용자에게 보여줄 결과 문구를 돌려준다. */
  run(io: ByteStream): Promise<string>;
};

export type CompletionProbe = {
  request: Uint8Array;
  length: number;
  /** 다시 물어보기까지의 간격이자 한 번의 응답을 기다리는 시간. */
  intervalMs: number;
  /**
   * 응답으로 완료를 판정하는 함수를 만든다. 없으면 **응답이 온 것 자체**를 완료로 본다.
   *
   * 세 기종이 셋 다 다르다. PT-390 은 인쇄 중 질의를 버리고 답하지 않아 응답 자체가
   * 완료 신호다. SL43 은 인쇄 중에도 답하되 상태 바이트에 인쇄 중 비트를 세운다.
   * Brother 는 인쇄 중에는 침묵하지만 잡 직후 "인쇄 시작" 알림을 한 번 보내므로,
   * 그 알림을 완료로 오인하지 않으려면 응답을 읽어야 한다.
   *
   * 잡마다 새로 불리므로 판정기가 상태를 들어도 되지만, **지금 온 응답만 보고 판정하는
   * 편이 안전하다** — "인쇄 중을 본 적 있는가" 로 판정하면 그 한 번을 놓쳤을 때 완료
   * 응답이 와도 타임아웃까지 기다리게 된다.
   */
  createJudge?(): (reply: Uint8Array) => Promise<boolean> | boolean;
};

export type PrinterProfile = {
  id: string;
  name: string;
  links: PrinterLinks;
  actions?: PrinterAction[];
  /** 없으면 보낸 것까지만 보고한다. */
  completionProbe?: CompletionProbe;
  /** 없으면 캔버스 폭이 라벨 크기로 정해진다. */
  headDots?: number;
  dotsPerMm: number;
  probe?(io: ByteStream): Promise<ProbeResult>;
  buildJob(request: JobRequest): Uint8Array;
};

const repeat = (job: Uint8Array, copies: number): Uint8Array =>
  copies <= 1 ? job : concat(Array.from({ length: copies }, () => job));

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

export function maxImageWidth(profile: PrinterProfile, label?: LabelSpec): number {
  if (profile.headDots) return profile.headDots;
  if (!label) throw new Error(`${profile.name} 은 라벨 크기를 알아야 캔버스 폭을 정할 수 있습니다`);
  return Math.floor(label.widthMm * profile.dotsPerMm);
}

// ---------- Brother QL ----------

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
    // 연속지는 길이를 프린터가 모르므로 호출자가 래스터 높이로 정한다.
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

/**
 * `phaseType` 의 인쇄 중 값. receipet 헤더가 주석으로만 적어 둔 값이라 매크로가 없어
 * 생성 상수에 들어오지 않는다.
 */
const BROTHER_PHASE_PRINTING = 0x01;

/**
 * 인쇄가 끝났는가. 실측(38 × 90 다이컷, 92,402 B):
 *
 * ```
 * 0.00s  잡 전송 완료
 * 0.00s  statusType 06 phaseType 01   ← 묻지 않아도 오는 "인쇄 시작" 알림
 * 0.50s ~ 1.26s  무응답               ← 인쇄 중에는 ESC i S 에 답하지 않는다
 * 1.39s  statusType 00 phaseType 00   ← 완료
 * ```
 *
 * 상태를 들지 않는 이유: "인쇄 중을 본 적 있는가" 로 판정하면 맨 앞의 알림을 놓쳤을 때
 * 완료 응답이 와도 영원히 기다린다. 지금 온 응답만 보면 그 함정이 없다.
 */
const brotherFinished = async (reply: Uint8Array): Promise<boolean> => {
  const status = await parseBrotherStatus(reply);

  // 용지 없음·커버 열림 등은 기다려도 안 끝난다. 타임아웃까지 끌지 않고 알린다.
  const problems = describeBrotherErrors(status.errors);
  if (problems.length > 0) throw new Error(`Brother 가 인쇄를 멈췄습니다: ${problems.join(", ")}`);

  return status.phaseType !== BROTHER_PHASE_PRINTING;
};

export const BROTHER_QL_820NWB: PrinterProfile = {
  id: "brother-ql-820nwb",
  name: "Brother QL-820NWB",
  links: { usb: { matches: [{ vendorId: 0x04f9, productId: 0x209d }], chunkBytes: 16384 } },
  headDots: BROTHER_HEAD_DOTS,
  dotsPerMm: BROTHER_DOTS_PER_MM,

  // 인쇄 중에는 무응답이지만, 잡 직후 "인쇄 시작" 알림이 한 번 오므로 응답을 읽어야 한다.
  completionProbe: {
    request: RCPT.BROTHER_STATUS_REQUEST,
    length: RCPT.BROTHER_STATUS_LEN,
    intervalMs: 250,
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

  buildJob({ image, copies, probe, rightMarginDots }) {
    const media = probe?.media;
    if (!media) throw new Error("Brother 는 인쇄 전에 상태 조회로 미디어를 확인해야 합니다");

    const rightMargin = rightMarginDots ?? brotherGeometry(media).rightMarginDots;
    const offset = BROTHER_HEAD_DOTS - image.width - rightMargin;
    if (offset < 0) {
      throw new Error(`이미지가 헤드보다 넓습니다: ${image.width} + 여백 ${rightMargin} > ${BROTHER_HEAD_DOTS} dots`);
    }

    // 인코더가 페이지 번호를 항상 0 으로 쓰므로 매수는 잡을 통째로 반복해 낸다.
    return repeat(
      image.encodeBrother({ mediaType: media.type, widthMm: media.widthMm, lengthMm: media.lengthMm, offset }),
      copies,
    );
  },
};

// ---------- HPRT SL43 (TSPL) ----------

/** TSPL 상태 바이트의 인쇄 중 비트. */
const TSPL_STATUS_PRINTING = 0x20;

export const HPRT_SL43: PrinterProfile = {
  id: "hprt-sl43",
  name: "HPRT SL43",
  links: { usb: { matches: [{ vendorId: 0x2aaf, productId: 0x9006 }], chunkBytes: 4096 } },
  // headDots 없음: 헤드 폭 미실측이고, TSPL 은 SIZE 가 인쇄 영역을 정한다.
  dotsPerMm: 8,

  /**
   * `ESC !?` 만 답한다 (`GS a 0`·`ESC v`·`~!@` 는 무응답). PT-390 과 같은 질의지만
   * **성질이 다르다 — 인쇄 중에도 답한다.** 실측(40 × 30 mm, 9,684 B):
   *
   * ```
   * 0.00s  잡 전송 완료
   * 0.09s  → 20   ← 인쇄 중
   * 0.25s  → 20
   * 0.52s  → 00   ← 완료
   * ```
   *
   * 그래서 "응답이 왔다" 로는 안 되고 비트를 읽어야 한다.
   */
  completionProbe: {
    request: HEALTH_REQUEST,
    length: HEALTH_LENGTH,
    intervalMs: 250,
    createJudge: () => (reply) => (reply[0] & TSPL_STATUS_PRINTING) === 0,
  },

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

    // 설치된 용지에 달린 값이라 인코더가 내보내지 않는다. 종결자는 인코더의 CRLF 에 맞춘다.
    const preamble = ascii(
      `SIZE ${label.widthMm} mm,${label.heightMm} mm\r\n` +
        `GAP ${label.gapMm ?? 0} mm,0 mm\r\n` +
        "DIRECTION 0\r\n",
    );
    return concat([preamble, image.encodeTspl({ x: 0, y: 0, copies })]);
  },
};

// ---------- GOOJPRT PT-390 (ESC/POS) ----------

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
      // 실측: 23,055 B 는 통과하고 34,575 B 는 32 KB 지점(래스터 454 행)부터 깨졌다.
      // 8 KB 마다 300 ms 쉬면 온전히 나온다. 34.5 KB 잡 기준 2.9 초 → 4.2 초.
      pace: { bytes: 8192, pauseMs: 300 },
    },
  },
  headDots: PT390_MAX_DOTS,
  dotsPerMm: 8,

  // `GS a 0` 도 같은 시점에 살아나지만 `ESC !?` 가 1 B 만 받으면 되어 가볍다.
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

    // 커터가 없어 인코더의 래퍼(피드 3줄 + 부분 절단)를 쓰지 않고 직접 감싼다.
    const page = concat([
      Uint8Array.of(0x1b, 0x40),
      Uint8Array.of(0x1b, 0x61, 0x01),
      image.encodeEscpos({ flags: RCPT.F_RAW }),
      Uint8Array.of(0x1d, 0x0c),
    ]);
    return repeat(page, copies);
  },
};

export const PRINTER_PROFILES: PrinterProfile[] = [BROTHER_QL_820NWB, HPRT_SL43, GOOJPRT_PT390];

export type DeviceIdentity = {
  transport: TransportKind;
  name: string;
  vendorId?: number;
  productId?: number;
};

const linkMatches = (link: LinkSpec | undefined, device: DeviceIdentity): boolean => {
  if (!link) return false;
  // 블루투스는 이름으로 가른다 — 같은 프린터라도 BLE 주소가 classic 과 다르다.
  if ("matches" in link) {
    return link.matches.some((m) => m.vendorId === device.vendorId && m.productId === device.productId);
  }
  return link.namePattern.test(device.name);
};

export const findProfile = (device: DeviceIdentity): PrinterProfile | undefined =>
  PRINTER_PROFILES.find((profile) => linkMatches(profile.links[device.transport], device));

/**
 * 검색을 좁히는 조건. **모든 항목이 선택적이고, 비면 거르지 않는다** — 전송은 자기
 * 항목만 보고 나머지는 무시한다. 새 전송이 늘어도 기존 전송이 영향을 받지 않는다.
 */
export type DiscoveryFilter = {
  usbMatches?: UsbMatch[];
  bleServices?: string[];
  /** SPP 는 주소가 아니라 광고 이름으로 가른다. */
  sppNamePatterns?: RegExp[];
};

/** 프로파일에 등록된 기종만 찾는 조건. 인자 없이 `list()` 를 부르면 전부 보인다. */
export const knownPrinterFilter = (): DiscoveryFilter => ({
  usbMatches: PRINTER_PROFILES.flatMap((profile) => profile.links.usb?.matches ?? []),
  bleServices: PRINTER_PROFILES.map((profile) => profile.links.ble?.service).filter((s): s is string => !!s),
  sppNamePatterns: PRINTER_PROFILES.map((p) => p.links.btspp?.namePattern).filter((r): r is RegExp => !!r),
});
