import type { SerialWorkerInbound, SerialWorkerOutbound } from "./serialProtocol";

class SerialWorkerBridge {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private aborted = false;

  async handle(msg: SerialWorkerInbound): Promise<void> {
    switch (msg.type) {
      case "init":
        this.init(msg.payload);
        break;
      case "write":
        await this.write(msg.payload.data);
        break;
      case "cleanup":
        await this.cleanup();
        break;
      default:
        this.postError(`Unknown message type: ${(msg as { type: string }).type}`);
    }
  }

  private init({ readable, writable }: Extract<SerialWorkerInbound, { type: "init" }>["payload"]): void {
    try {
      this.reader = readable.getReader();
      this.writer = writable.getWriter();
      this.aborted = false;
      this.post({ type: "init_complete" });
      void this.startReadLoop();
    } catch (err) {
      this.postError("Failed to initialize streams", err);
    }
  }

  private async write(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      this.postError("Writer is not initialized");
      return;
    }
    try {
      await this.writer.write(data);
      this.post({ type: "write_complete", payload: { length: data.byteLength } });
    } catch (err) {
      this.postError("Write failed", err);
    }
  }

  private async cleanup(): Promise<void> {
    this.aborted = true;
    try {
      if (this.reader) {
        try { await this.reader.cancel(); } catch (err) { this.postError("Reader cancel failed", err); }
        try { this.reader.releaseLock(); } catch { /* 이미 해제됨 */ }
      }
      if (this.writer) {
        try { await this.writer.close(); } catch (err) { this.postError("Writer close failed", err); }
        try { this.writer.releaseLock(); } catch { /* 이미 해제됨 */ }
      }
    } finally {
      this.reader = null;
      this.writer = null;
      this.post({ type: "cleanup_complete" });
    }
  }

  private async startReadLoop(): Promise<void> {
    if (!this.reader) {
      this.postError("Reader is not initialized");
      return;
    }
    try {
      while (!this.aborted) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.post({ type: "incoming_data", payload: { data: value } });
      }
    } catch (err) {
      if (!this.aborted) this.postError("Read loop error", err);
    }
  }

  private post(msg: SerialWorkerOutbound): void {
    postMessage(msg);
  }

  private postError(message: string, error?: unknown): void {
    this.post({
      type: "error",
      payload: {
        message,
        cause: error === undefined ? undefined : error instanceof Error ? error.message : String(error),
      },
    });
  }
}

const bridge = new SerialWorkerBridge();
onmessage = (e: MessageEvent<SerialWorkerInbound>) => { void bridge.handle(e.data); };

export { };
