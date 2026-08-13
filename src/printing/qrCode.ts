import {
  prepareZXingModule,
  writeBarcode,
} from "zxing-wasm/writer";
import wasmUrl from "zxing-wasm/writer/zxing_writer.wasm?url";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => path.endsWith(".wasm")
      ? wasmUrl
      : prefix + path,
  },
});

const qrCodeCache = new Map<string, Promise<string>>();

export const createQrCodeDataUrl = (value: string): Promise<string> => {
  const cached = qrCodeCache.get(value);
  if (cached) return cached;

  const pending = writeBarcode(value, {
    format: "QRCode",
    ecLevel: "M",
    scale: 8,
    addQuietZones: true,
  }).then(({ svg }) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  qrCodeCache.set(value, pending);
  void pending.catch(() => qrCodeCache.delete(value));
  return pending;
};
