import type { RcptImage } from "../receipet";

export type TransportKind = "usb" | "btspp" | "ble";

export type UsbMatch = { vendorId: number; productId: number };
export type UsbLink = { matches: UsbMatch[]; chunkBytes: number };
export type SppLink = { namePattern: RegExp; chunkBytes: number };
export type BleLink = {
  namePattern: RegExp;
  service: string;
  writeCharacteristic: string;
  notifyCharacteristic: string;
  /** MTU 를 알아낼 수 없을 때 쓴다. 실측 최적값이며 협상 MTU 를 넘기면 오히려 느려진다. */
  chunkBytes: number;
  /** GATT 수신 버퍼가 넘치지 않게 주기적으로 전송을 쉰다. */
  pace?: { bytes: number; pauseMs: number };
};

export type LinkSpec = UsbLink | SppLink | BleLink;
export type PrinterLinks = { usb?: UsbLink; btspp?: SppLink; ble?: BleLink };

export type ByteStream = {
  write(data: Uint8Array): Promise<void>;
  /** 응답에 프레이밍이 없어, 정확히 `length` 바이트가 쌓일 때까지 누적한다. */
  read(length: number, timeoutMs?: number): Promise<Uint8Array>;
};

/** `read` 가 시간을 받지 않았을 때 전송이 쓰는 값. */
export const DEFAULT_READ_TIMEOUT_MS = 5000;

export type BrotherMedia = { type: number; widthMm: number; lengthMm: number };

export type ProbeResult = {
  summary: string;
  fields: Record<string, string>;
  problems: string[];
  /** 프린터가 감지한 인쇄 가능 크기. 있으면 헤드 폭보다 우선해 캔버스 크기를 정한다. */
  printable?: { widthDots: number; lengthDots: number };
  media?: BrotherMedia;
};

/** 프린터가 스스로 알아낼 수 없어 호출자가 줘야 한다. */
export type LabelSpec = { widthMm: number; heightMm: number; gapMm?: number };

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
  run(io: ByteStream): Promise<string>;
};

export type CompletionProbe = {
  request: Uint8Array;
  length: number;
  /** 다시 물어보기까지의 간격이자 한 번의 응답을 기다리는 시간. */
  intervalMs: number;
  /** 없으면 응답이 온 것 자체를 완료로 본다. 잡마다 새 판정기를 만든다. */
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

export type DeviceIdentity = {
  transport: TransportKind;
  name: string;
  vendorId?: number;
  productId?: number;
};

export type DiscoveryFilter = {
  usbMatches?: UsbMatch[];
  bleServices?: string[];
  /** SPP 는 주소가 아니라 광고 이름으로 가른다. */
  sppNamePatterns?: RegExp[];
};
