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
  /** 상대가 스트림을 닫아 읽기 루프가 끝났다. cleanup 으로 인한 종료는 제외. */
  | { type: "closed" }
  | { type: "cleanup_complete" };
