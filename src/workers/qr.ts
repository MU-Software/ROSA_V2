import { prepareZXingModule, purgeZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import type { QrCode, QrWorkerInbound, QrWorkerOutbound } from "./qrProtocol";

// 기본값은 CDN 에서 받아오는데 Tauri 웹뷰에는 네트워크가 없을 수 있어, 번들된 파일을 쓰게 돌려놓는다.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
});

/**
 * tryHarder 는 프레임당 비용을 늘리지만, 휴대폰 화면을 손으로 들고 찍는 상황처럼
 * 반사광·흔들림이 있는 프레임에서 인식률 차이가 크다.
 */
const READER_OPTIONS: ReaderOptions = {
  formats: ["QRCode"],
  tryHarder: true,
  tryInvert: true,
  tryRotate: true,
  maxNumberOfSymbols: 4,
};

const post = (message: QrWorkerOutbound) => self.postMessage(message);

/** 버전·ECC 는 `extra` 안의 JSON 으로 온다. 디버그 표시용이라 못 읽으면 비워둔다. */
function readExtra(raw: string): { version: string; eccLevel: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    const extra = parsed as Record<string, unknown>;
    return {
      version: typeof extra.Version === "string" ? extra.Version : "",
      eccLevel: typeof extra.ECLevel === "string" ? extra.ECLevel : "",
    };
  } catch {
    return { version: "", eccLevel: "" };
  }
}

function toQrCode(result: ReadResult): QrCode {
  const { topLeft, topRight, bottomRight, bottomLeft } = result.position;
  return {
    text: result.text,
    corners: [topLeft, topRight, bottomRight, bottomLeft],
    ...readExtra(result.extra),
    mirrored: result.isMirrored,
    inverted: result.isInverted,
  };
}

async function scan(id: number, data: ArrayBuffer, width: number, height: number): Promise<void> {
  const pixels = new Uint8ClampedArray(data);
  if (pixels.length < width * height * 4) throw new Error("프레임 크기가 맞지 않습니다.");

  const results = await readBarcodes(new ImageData(pixels, width, height), READER_OPTIONS);
  post({ type: "result", payload: { id, codes: results.filter((r) => r.isValid).map(toQrCode) } });
}

self.onmessage = ({ data: message }: MessageEvent<QrWorkerInbound>) => {
  switch (message.type) {
    case "scan": {
      const { id, data, width, height } = message.payload;
      void scan(id, data, width, height).catch((err: unknown) => {
        post({ type: "error", payload: { id, message: err instanceof Error ? err.message : String(err) } });
      });
      break;
    }
    case "dispose":
      purgeZXingModule();
      break;
  }
};
