import { useCallback, useEffect, useMemo, useState } from "react";
import { startCamera, type CameraSession, type CameraStartOptions } from "../adapters";
import type { QrCode, QrWorkerInbound, QrWorkerOutbound } from "../workers/qrProtocol";

/** 같은 코드가 매 프레임 다시 잡히므로, 최근 것만 중복 없이 남긴다. */
const HISTORY_LIMIT = 10;

export interface QrScanResult {
  codes: QrCode[];
  /** 코너 좌표의 기준이 되는 프레임 크기. */
  width: number;
  height: number;
  /** 프레임 획득부터 디코딩까지 걸린 시간. */
  elapsedMs: number;
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

type ScannerHandlers = {
  onResult: (result: QrScanResult) => void;
  onError: (error: Error) => void;
  /** 미리보기를 붙일 수 있게 세션을 알린다. 정지하면 null. */
  onSession: (session: CameraSession | null) => void;
};

/** 카메라와 디코딩 워커를 잇는 루프. 훅 바깥에서 쓸 일이 없어 여기 둔다. */
class QrScanner {
  private worker: Worker | null = null;
  private session: CameraSession | null = null;
  private running = false;
  private loop: Promise<void> = Promise.resolve();
  private frameId = 0;
  private pending: { id: number; settle: (codes: QrCode[] | Error) => void } | null = null;

  private readonly handlers: ScannerHandlers;

  constructor(handlers: ScannerHandlers) {
    this.handlers = handlers;
  }

  async start(options?: CameraStartOptions): Promise<void> {
    if (this.running) return;
    this.running = true;

    let session: CameraSession;
    try {
      session = await startCamera(options);
    } catch (err) {
      this.running = false;
      throw toError(err);
    }

    // 카메라를 여는 사이에 stop() 이 들어왔다면 세션만 정리하고 끝낸다.
    if (!this.running) {
      session.stop();
      return;
    }
    this.session = session;

    this.worker = new Worker(new URL("../workers/qr.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data: message }: MessageEvent<QrWorkerOutbound>) => {
      if (this.pending?.id !== message.payload.id) return;
      const { settle } = this.pending;
      this.pending = null;
      settle(message.type === "result" ? message.payload.codes : new Error(message.payload.message));
    };
    // 워커가 죽으면 응답이 영영 오지 않으므로 루프를 세운다.
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "QR 워커 오류");
      this.running = false;
      this.pending?.settle(error);
      this.pending = null;
      this.handlers.onError(error);
    };

    this.handlers.onSession(this.session);
    this.loop = this.run();
  }

  /** 워커가 죽어 루프가 이미 멈춘 뒤에도 카메라는 정리해야 하므로 조건 없이 훑는다. */
  async stop(): Promise<void> {
    this.running = false;

    // 워커 응답과 프레임 콜백 양쪽을 풀어줘야 run() 이 빠져나온다.
    this.pending?.settle(new Error("스캔이 중지되었습니다."));
    this.pending = null;
    this.session?.stop();

    await this.loop;

    this.session = null;
    this.handlers.onSession(null);

    this.worker?.postMessage({ type: "dispose" } satisfies QrWorkerInbound);
    this.worker?.terminate();
    this.worker = null;
  }

  private awaitCodes(id: number): Promise<QrCode[]> {
    return new Promise((resolve, reject) => {
      this.pending = { id, settle: (value) => (value instanceof Error ? reject(value) : resolve(value)) };
    });
  }

  /** 한 프레임의 결과를 받은 뒤에야 다음 프레임을 보내므로 큐가 쌓이지 않는다. */
  private async run(): Promise<void> {
    while (this.running && this.session && this.worker) {
      try {
        const frame = await this.session.grab();
        if (!frame || !this.running) continue;

        const startedAt = performance.now();
        const id = ++this.frameId;
        const codes = this.awaitCodes(id);
        // getImageData 는 매번 새 버퍼를 주므로 그대로 넘겨도 안전하다.
        const buffer = frame.data.buffer as ArrayBuffer;
        this.worker.postMessage(
          { type: "scan", payload: { id, data: buffer, width: frame.width, height: frame.height } } satisfies QrWorkerInbound,
          [buffer],
        );

        this.handlers.onResult({
          codes: await codes,
          width: frame.width,
          height: frame.height,
          elapsedMs: performance.now() - startedAt,
        });
      } catch (err) {
        if (!this.running) break;
        this.handlers.onError(toError(err));
        // 한 프레임의 실패로 루프를 끝내지는 않는다. 다음 프레임에서 회복될 수 있다.
      }
    }
  }
}

export type UseQrScannerResult = {
  scanning: boolean;
  session: CameraSession | null;
  result: QrScanResult | null;
  /** 이번 스캔에서 읽힌 서로 다른 텍스트. 최근 것이 앞. */
  history: string[];
  error: Error | null;
  start: (options?: CameraStartOptions) => void;
  stop: () => void;
};

export function useQrScanner(): UseQrScannerResult {
  const [scanning, setScanning] = useState(false);
  const [session, setSession] = useState<CameraSession | null>(null);
  const [result, setResult] = useState<QrScanResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const scanner = useMemo(
    () =>
      new QrScanner({
        onResult: (next) => {
          setResult(next);
          if (next.codes.length === 0) return;
          setHistory((prev) => {
            const fresh = next.codes.map((code) => code.text).filter((text) => !prev.includes(text));
            return fresh.length === 0 ? prev : [...fresh, ...prev].slice(0, HISTORY_LIMIT);
          });
        },
        onError: setError,
        onSession: setSession,
      }),
    [],
  );

  useEffect(() => () => void scanner.stop(), [scanner]);

  const start = useCallback(
    (options?: CameraStartOptions) => {
      setError(null);
      setHistory([]);
      setScanning(true);
      scanner.start(options).catch((err: unknown) => {
        setScanning(false);
        setError(toError(err));
      });
    },
    [scanner],
  );

  const stop = useCallback(() => {
    setScanning(false);
    setResult(null);
    void scanner.stop();
  }, [scanner]);

  return { scanning, session, result, history, error, start, stop };
}
