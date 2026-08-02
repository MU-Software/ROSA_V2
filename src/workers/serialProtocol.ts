export type SerialWorkerInbound =
  | {
      type: "init";
      payload: {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
      };
    }
  | { type: "write"; payload: { data: Uint8Array } }
  | { type: "cleanup" };

export type SerialWorkerOutbound =
  | { type: "init_complete" }
  | { type: "incoming_data"; payload: { data: Uint8Array } }
  | { type: "write_complete"; payload: { length: number } }
  | { type: "error"; payload: { message: string; cause?: string } }
  | { type: "cleanup_complete" };
