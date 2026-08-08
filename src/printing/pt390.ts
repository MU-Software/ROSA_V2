/** GOOJPRT PT-390 의 벤더 확장 프로토콜. ESC/POS 모드와 TSPL 모드 양쪽에서 동작한다. */

const vendorCommand = (name: string): Uint8Array =>
  Uint8Array.from([0x1b, 0x23, 0x23, ...[...name].map((c) => c.charCodeAt(0))]);

/** 프린터 정보 읽기. 응답 116 B. */
export const JXIG_REQUEST = vendorCommand("JXIG");
export const JXIG_LENGTH = 116;

/** 프린터 정보 쓰기. 인자로 수정한 116 B 블록이 이어진다. */
export const JXIS_REQUEST = vendorCommand("JXIS");

export const SELF_TEST_REQUEST = vendorCommand("SELF");

/** `GS a 0`. 표준 ESC/POS 와 달리 이 펌웨어는 1회성 상태 질의로 재정의했다. */
export const ASB_REQUEST = Uint8Array.of(0x1d, 0x61, 0x00);
export const ASB_LENGTH = 4;

/** `ESC ! ?`. 벤더 확장이 아닌 TSPL 표준 명령이지만 실기가 응답한다. 정상은 `0x00`. */
export const HEALTH_REQUEST = Uint8Array.of(0x1b, 0x21, 0x3f);
export const HEALTH_LENGTH = 1;

export const CMD_MODE_ESCPOS = 0x01;
export const CMD_MODE_TSPL = 0x02;

/** `dpiType` → dot/mm. 200 dpi 로 표기되는 기기의 실제 비율이 8 이다. */
const DOTS_PER_MM_BY_DPI_TYPE: Record<number, number> = { 0x00: 8, 0x01: 12, 0x02: 24 };

const PAPER_TYPE_LABELS: Record<number, string> = {
  0x00: "연속지",
  0x01: "라벨/갭지",
  0x02: "블랙마크",
  0x03: "타투지",
};

export type Jxig = {
  checksum: number;
  checksumValid: boolean;
  packLen: number;
  version: number;
  /** 인쇄 폭 (dots). 헤드 폭이며 라벨 폭이 아니다. */
  maxDotLine: number;
  dpiType: number;
  dotsPerMm: number;
  cmdMode: number;
  speedLev: number;
  depthLev: number;
  paperType: number;
  paperTypeLabel: string;
  powerLev: number;
  devType: number;
  zipEnable: boolean;
  nfcEnable: boolean;
  factoryName: string;
  deviceName: string;
  ptTemp: number;
  isRTC: boolean;
  sleepTime: number;
  colourType: number;
};

const decodeString = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes.filter((b) => b !== 0x00)).trim();

export function jxigChecksum(block: Uint8Array): number {
  let sum = 0;
  for (let i = 4; i < block.length; i++) sum = (sum + block[i]) >>> 0;
  return sum;
}

export function parseJxig(block: Uint8Array): Jxig {
  // 92 B 변형도 존재하나 (uid/remain2 없음), 실기는 116 B 를 돌려준다.
  if (block.length < 92) throw new Error(`JXIG 응답이 너무 짧습니다: ${block.length} B`);

  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const u8 = (offset: number) => block[offset];
  const u16 = (offset: number) => view.getUint16(offset, true);

  const checksum = view.getUint32(0, true);
  const dpiType = u8(10);

  return {
    checksum,
    checksumValid: checksum === jxigChecksum(block),
    packLen: u16(4),
    version: u16(6),
    maxDotLine: u16(8),
    dpiType,
    dotsPerMm: DOTS_PER_MM_BY_DPI_TYPE[dpiType] ?? 8,
    cmdMode: u8(11),
    speedLev: u8(14),
    depthLev: u8(15),
    paperType: u8(17),
    paperTypeLabel: PAPER_TYPE_LABELS[u8(17)] ?? `알 수 없음 (0x${u8(17).toString(16)})`,
    powerLev: u8(18),
    devType: u8(20),
    zipEnable: u8(22) === 0x01,
    nfcEnable: u8(23) === 0x01,
    factoryName: decodeString(block.subarray(32, 64)),
    deviceName: decodeString(block.subarray(64, 80)),
    ptTemp: u8(80),
    isRTC: u8(81) === 0x01,
    sleepTime: u16(86),
    colourType: u8(88),
  };
}

/**
 * 읽은 블록을 그대로 에코백하고 바꿀 바이트만 덮어쓴다 — 앱처럼 블록을 재구성하면
 * 읽기/쓰기 레이아웃이 비대칭이라 어긋난다.
 */
export function withCmdMode(block: Uint8Array, cmdMode: number): Uint8Array {
  const next = block.slice();
  next[11] = cmdMode;
  new DataView(next.buffer).setUint32(0, jxigChecksum(next), true);
  return next;
}

export type AsbStatus = {
  coverOpen: boolean;
  overheated: boolean;
  cutterError: boolean;
  outOfPaper: boolean;
  raw: Uint8Array;
};

/**
 * 비트 인덱싱은 LSB 기준이다. MSB 로 읽으면 정상 상태 실측값 `14 00 00 0F` 이 커버
 * 열림으로 나온다.
 */
export function parseAsb(reply: Uint8Array): AsbStatus {
  if (reply.length !== ASB_LENGTH) throw new Error(`ASB 응답 길이가 ${ASB_LENGTH} B 가 아닙니다: ${reply.length} B`);
  const bit = (byte: number, index: number) => (reply[byte] & (1 << index)) !== 0;

  return {
    coverOpen: bit(0, 5),
    overheated: bit(1, 6),
    cutterError: bit(1, 3),
    outOfPaper: bit(2, 3) && bit(2, 2),
    raw: reply,
  };
}

export const describeAsbProblems = (status: AsbStatus): string[] =>
  [
    status.coverOpen && "커버 열림",
    status.overheated && "헤드 과열",
    status.cutterError && "커터 오류",
    status.outOfPaper && "용지 없음",
  ].filter((v): v is string => typeof v === "string");
