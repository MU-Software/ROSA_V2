import { isTauri } from "../utils/platform";
import type { SerialWorkerInbound, SerialWorkerOutbound } from "../workers/serialProtocol";

/** 워커가 cleanup 응답을 주지 않을 때 강제로 진행하기까지의 대기 시간. */
const CLEANUP_TIMEOUT_MS = 1000;


export type SerialBridgeHandlers = {
  onData: (data: Uint8Array) => void;
  onError: (error: Error) => void;
  /** 기기 쪽에서 스트림이 끊겼다. dispose() 로 인한 종료에서는 부르지 않는다. */
  onClose: () => void;
};

export interface SerialBridge {
  write(data: Uint8Array): void;
  dispose(): Promise<void>;
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

let cachedSupport: boolean | undefined;

/** 미지원 웹뷰(구형 WebKitGTK, Safari 16.4 미만 등)에서는 메인 스레드로 폴백한다. */
export function supportsTransferableStreams(): boolean {
  if (cachedSupport !== undefined) return cachedSupport;
  try {
    const stream = new ReadableStream();
    const channel = new MessageChannel();
    channel.port1.postMessage(stream, [stream as unknown as Transferable]);
    channel.port1.close();
    channel.port2.close();
    cachedSupport = true;
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}

class WorkerSerialBridge implements SerialBridge {
  private readonly worker: Worker;
  private cleanupResolver?: () => void;

  constructor(
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<Uint8Array>,
    handlers: SerialBridgeHandlers,
  ) {
    this.worker = new Worker(new URL("../workers/serial.ts", import.meta.url), { type: "module" });

    this.worker.onmessage = ({ data: msg }: MessageEvent<SerialWorkerOutbound>) => {
      switch (msg.type) {
        case "incoming_data":
          handlers.onData(msg.payload.data);
          break;
        case "error":
          handlers.onError(
            new Error(msg.payload.cause ? `${msg.payload.message}: ${msg.payload.cause}` : msg.payload.message),
          );
          break;
        case "closed":
          handlers.onClose();
          break;
        case "cleanup_complete":
          this.cleanupResolver?.();
          break;
      }
    };
    this.worker.onerror = (e) => handlers.onError(new Error(e.message || "Worker error"));

    const init: SerialWorkerInbound = { type: "init", payload: { readable, writable } };
    this.worker.postMessage(init, [readable, writable]);
  }

  write(data: Uint8Array): void {
    const msg: SerialWorkerInbound = { type: "write", payload: { data } };
    this.worker.postMessage(msg);
  }

  async dispose(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CLEANUP_TIMEOUT_MS);
      this.cleanupResolver = () => {
        clearTimeout(timer);
        resolve();
      };
      const msg: SerialWorkerInbound = { type: "cleanup" };
      this.worker.postMessage(msg);
    });
    this.cleanupResolver = undefined;
    this.worker.terminate();
  }
}

class InlineSerialBridge implements SerialBridge {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly handlers: SerialBridgeHandlers;
  private disposed = false;

  constructor(
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<Uint8Array>,
    handlers: SerialBridgeHandlers,
  ) {
    this.handlers = handlers;
    this.reader = readable.getReader();
    this.writer = writable.getWriter();
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      while (!this.disposed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.handlers.onData(value);
      }
    } catch (err) {
      if (!this.disposed) this.handlers.onError(toError(err));
    }
    if (!this.disposed) this.handlers.onClose();
  }

  write(data: Uint8Array): void {
    this.writer.write(data).catch((err) => this.handlers.onError(toError(err)));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    try { await this.reader.cancel(); } catch { /* 이미 종료됨 */ }
    try { this.reader.releaseLock(); } catch { /* 이미 해제됨 */ }
    try { await this.writer.close(); } catch { /* 이미 종료됨 */ }
    try { this.writer.releaseLock(); } catch { /* 이미 해제됨 */ }
  }
}

/** Tauri 는 Rust 리더 스레드가 읽기를 전담하고 스트림 소스는 메인 realm 에 남으므로, 워커로 넘기면 메인 → 워커 → 메인 왕복만 늘어난다. */
export const usesWorkerBridge = (): boolean => !isTauri() && supportsTransferableStreams();

export function createSerialBridge(
  readable: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
  handlers: SerialBridgeHandlers,
): SerialBridge {
  return usesWorkerBridge()
    ? new WorkerSerialBridge(readable, writable, handlers)
    : new InlineSerialBridge(readable, writable, handlers);
}
