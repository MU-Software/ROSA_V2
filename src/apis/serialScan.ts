import type { SerialAdapter } from "../adapters";
import { toMessage } from "../utils/bytes";

const UUID4_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const ORDER_PRODUCT_SCANCODE_PATTERN = /opr:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/;

/** 스캔 한 건이 끝났다고 판단하는 무음 구간. 데이터가 조각으로 도착할 수 있다. */
const FRAME_IDLE_MS = 120;

/** 흔한 순서. 앞쪽 두 개에서 대부분 걸린다. */
export const BAUD_CANDIDATES = [9600, 115200, 19200, 38400, 57600, 4800, 2400];

export type ScanMatch = {
  value: string;
  /** 스캐너가 값 앞뒤에 덧붙이는 문자. 실제 운용 시 잘라내는 데 쓴다. */
  prefix: string;
  suffix: string;
};

/**
 * 속도가 틀리면 바이트가 깨지므로 지원하는 QR 형식을 만족할 수 없다.
 * 따라서 이 판정의 통과 자체가 baud rate 가 맞다는 근거가 된다.
 */
export const matchQrScan = (data: Uint8Array): ScanMatch | null => {
  const text = new TextDecoder().decode(data);
  const orderProductScancode = ORDER_PRODUCT_SCANCODE_PATTERN.exec(text);
  const uuid = UUID4_PATTERN.exec(text);
  const found = orderProductScancode ?? uuid;
  if (!found) return null;
  return {
    value: found[0],
    prefix: text.slice(0, found.index),
    suffix: text.slice(found.index + found[0].length),
  };
};

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

/** 무음 구간이 생길 때까지 모아 한 건으로 넘긴다. 취소되면 null. */
export function readNextFrame(
  readable: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const reader = readable.getReader();
    const chunks: Uint8Array[] = [];
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = async (value: Uint8Array | null, err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      signal.removeEventListener("abort", onAbort);
      try { await reader.cancel(); } catch { /* 이미 종료됨 */ }
      try { reader.releaseLock(); } catch { /* 이미 해제됨 */ }
      if (err) reject(err instanceof Error ? err : new Error(toMessage(err)));
      else resolve(value);
    };

    const onAbort = () => { void finish(null); };
    signal.addEventListener("abort", onAbort, { once: true });

    const pump = async () => {
      try {
        while (!settled) {
          const { value, done } = await reader.read();
          if (done) {
            await finish(chunks.length ? concat(chunks) : null);
            return;
          }
          if (!value?.length) continue;
          chunks.push(value);
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => { void finish(concat(chunks)); }, FRAME_IDLE_MS);
        }
      } catch (err) {
        await finish(null, err);
      }
    };
    void pump();
  });
}

export type BaudProbeResult = {
  baudRate: number;
  match: ScanMatch;
};

/**
 * 후보 속도를 하나씩 열어 스캔을 기다리고, 지원하는 QR 값이 나오면 그 속도로 확정한다.
 * 각 후보마다 스캔 한 번이 필요하므로 무응답 타임아웃은 두지 않는다.
 */
export async function probeBaudRate(
  adapter: SerialAdapter,
  key: string,
  signal: AbortSignal,
  onAttempt: (baudRate: number) => void,
  candidates: number[] = BAUD_CANDIDATES,
): Promise<BaudProbeResult | null> {
  for (const baudRate of candidates) {
    if (signal.aborted) return null;
    onAttempt(baudRate);

    await adapter.open(key, baudRate);
    try {
      const frame = await readNextFrame(adapter.getReadable(key), signal);
      if (!frame) return null;
      const match = matchQrScan(frame);
      if (match) return { baudRate, match };
    } finally {
      await adapter.close(key);
    }
  }
  return null;
}
