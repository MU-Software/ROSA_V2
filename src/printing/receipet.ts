import createReceipet, { type BufPtr, type ImagePtr, type ReceipetModule } from "@mu-software/receipet";
import * as RCPT from "@mu-software/receipet/constants";

export type BrotherStatus = {
  model: number;
  errors: number;
  mediaWidthMm: number;
  mediaLengthMm: number;
  mediaType: number;
  statusType: number;
  phaseType: number;
  phaseNumber: number;
  notification: number;
};

const BROTHER_ERROR_LABELS: [number, string][] = [
  [RCPT.BROTHER_ERR_NO_MEDIA, "용지 없음"],
  [RCPT.BROTHER_ERR_END_OF_MEDIA, "용지 끝"],
  [RCPT.BROTHER_ERR_CUTTER_JAM, "커터 걸림"],
  [RCPT.BROTHER_ERR_IN_USE, "사용 중"],
  [RCPT.BROTHER_ERR_POWERED_OFF, "전원 꺼짐"],
  [RCPT.BROTHER_ERR_REPLACE_MEDIA, "용지 교체 필요"],
  [RCPT.BROTHER_ERR_BUFFER_FULL, "버퍼 가득 참"],
  [RCPT.BROTHER_ERR_COMMS, "통신 오류"],
  [RCPT.BROTHER_ERR_COVER_OPEN, "커버 열림"],
  [RCPT.BROTHER_ERR_CANNOT_FEED, "급지 불가"],
  [RCPT.BROTHER_ERR_SYSTEM, "시스템 오류"],
];

export const describeBrotherErrors = (errors: number): string[] =>
  BROTHER_ERROR_LABELS.filter(([bit]) => (errors & bit) !== 0).map(([, label]) => label);

let loading: Promise<ReceipetModule> | undefined;

export const loadReceipet = (): Promise<ReceipetModule> => (loading ??= createReceipet());

const RESULT_MESSAGES: Record<number, string> = {
  [RCPT.ERR_ARG]: "인자가 잘못되었습니다",
  [RCPT.ERR_NOMEM]: "메모리가 부족합니다",
  [RCPT.ERR_INTERNAL]: "receipet 내부 오류입니다",
};

function check(result: number, what: string): void {
  if (result === RCPT.OK) return;
  throw new Error(`${what}에 실패했습니다: ${RESULT_MESSAGES[result] ?? `알 수 없는 코드 ${result}`}`);
}

/**
 * 픽셀 쓰기는 `setPixel` 로만 한다 — 패킹된 버퍼에 직접 쓰면 클리핑과 행 끝 패딩 비트가
 * 0 이라는 불변식이 깨지고, 인코더들이 그 불변식에 의존한다.
 */
export class RcptImage {
  private ptr: ImagePtr;
  private readonly module: ReceipetModule;
  readonly width: number;
  readonly height: number;

  private constructor(module: ReceipetModule, ptr: ImagePtr, width: number, height: number) {
    this.module = module;
    this.ptr = ptr;
    this.width = width;
    this.height = height;
  }

  static async create(width: number, height: number): Promise<RcptImage> {
    const module = await loadReceipet();
    const slot = module._malloc(4);
    try {
      module.setValue(slot, 0, "*");
      check(module._rcpt_image_new(slot, width, height), `${width}x${height} 이미지 생성`);
      return new RcptImage(module, module.getValue(slot, "*"), width, height);
    } finally {
      module._free(slot);
    }
  }

  setPixel(x: number, y: number, on = true): void {
    this.module._rcpt_image_set_pixel(this.require(), x, y, on ? 1 : 0);
  }

  /** 범위 밖은 0 을 돌려준다. */
  getPixel(x: number, y: number): boolean {
    return this.module._rcpt_image_get_pixel(this.require(), x, y) !== 0;
  }

  clear(): void {
    this.module._rcpt_image_clear(this.require());
  }

  free(): void {
    if (!this.ptr) return;
    this.module._rcpt_image_free(this.ptr);
    this.ptr = 0;
  }

  /** 패킹된 버퍼의 사본. MSB first, 1 = 검정. */
  readBitmap(): { data: Uint8Array; stride: number } {
    const ptr = this.require();
    const stride = this.module.getValue(ptr + RCPT.IMAGE_STRIDE_OFFSET, "i32");
    const data = this.module.getValue(ptr + RCPT.IMAGE_DATA_OFFSET, "*");
    return { data: this.module.HEAPU8.slice(data, data + stride * this.height), stride };
  }

  encodeEscpos({ chunkRows = 0, flags = 0 } = {}): Uint8Array {
    return this.encode("ESC/POS 인코딩", (buf, img) => this.module._rcpt_enc_escpos(buf, img, chunkRows, flags));
  }

  encodeTspl({ x = 0, y = 0, mode = 0, chunkRows = 0, copies = 1, flags = 0 } = {}): Uint8Array {
    return this.encode("TSPL 인코딩", (buf, img) => this.module._rcpt_enc_tspl(buf, img, x, y, mode, chunkRows, copies, flags));
  }

  encodeBrother({
    mediaType,
    widthMm,
    lengthMm,
    offset,
    flags = 0,
  }: {
    mediaType: number;
    widthMm: number;
    lengthMm: number;
    offset: number;
    flags?: number;
  }): Uint8Array {
    return this.encode("Brother 인코딩", (buf, img) => this.module._rcpt_enc_brother(buf, img, mediaType, widthMm, lengthMm, offset, flags));
  }

  private encode(what: string, run: (buf: BufPtr, img: ImagePtr) => number): Uint8Array {
    const img = this.require();
    const buf = this.module._malloc(RCPT.BUF_SIZEOF);
    // run() 이 던지면 finally 가 초기화되지 않은 버퍼를 해제하게 된다.
    this.module.HEAPU8.fill(0, buf, buf + RCPT.BUF_SIZEOF);
    try {
      check(run(buf, img), what);
      const data = this.module.getValue(buf + RCPT.BUF_DATA_OFFSET, "*");
      const cap = this.module.getValue(buf + RCPT.BUF_CAP_OFFSET, "i32");
      const len = this.module.getValue(buf + RCPT.BUF_LEN_OFFSET, "i32");
      // 메모리가 자라면 HEAPU8 이 교체되므로 인코드 이후에 다시 읽는다.
      return this.module.HEAPU8.slice(data, data + Math.min(len, cap));
    } finally {
      this.module._rcpt_buf_free(buf);
      this.module._free(buf);
    }
  }

  private require(): ImagePtr {
    if (!this.ptr) throw new Error("이미 해제된 이미지입니다");
    return this.ptr;
  }
}

export async function parseBrotherStatus(reply: Uint8Array): Promise<BrotherStatus> {
  const module = await loadReceipet();
  const data = module._malloc(reply.length);
  const out = module._malloc(RCPT.BROTHER_STATUS_FIELDS * 4);
  try {
    module.HEAPU8.set(reply, data);
    check(module._rcpt_parse_brother_status_u32(out, data, reply.length), "Brother 상태 해석");
    // 구조체가 아니라 u32 배열로 받는다 — 레이아웃도 부호 확장도 알 필요가 없다.
    const at = out >>> 2;
    const [model, errors, mediaWidthMm, mediaLengthMm, mediaType, statusType, phaseType, phaseNumber, notification] =
      module.HEAPU32.subarray(at, at + RCPT.BROTHER_STATUS_FIELDS);
    return { model, errors, mediaWidthMm, mediaLengthMm, mediaType, statusType, phaseType, phaseNumber, notification };
  } finally {
    module._free(out);
    module._free(data);
  }
}
