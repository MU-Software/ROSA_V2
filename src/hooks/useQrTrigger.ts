import { useCallback, useEffect, useRef, useState } from "react";
import { serialManager, type Framing, type SerialDevice } from "../apis/serial";
import { getQrInputMode } from "../utils/platform";
import type { QrScanResult } from "./useQrScanner";
import { useSerialDevices } from "./useSerialPort";

const DEFAULT_COOLDOWN_MS = 1500;
const FRAME_IDLE_MS = 120;

export type QrTriggerEvent = {
  value: string;
  source: "camera" | "serial";
  deviceKey?: string;
  detectedAt: number;
};

export type UseQrTriggerOptions = {
  /** 모바일 카메라 결과. 웹·데스크톱에서는 무시한다. */
  cameraResult?: QrScanResult | null;
  cooldownMs?: number;
  onDetected?: (event: QrTriggerEvent) => void;
};

const stripFraming = (frame: string, framing: Framing): string => {
  if (!framing.prefix) return frame;
  if (frame.startsWith(framing.prefix)) return frame.slice(framing.prefix.length);
  const prefixAt = frame.indexOf(framing.prefix);
  return prefixAt >= 0 ? frame.slice(prefixAt + framing.prefix.length) : frame;
};

/** 플랫폼에 맞는 QR 입력을 구독하고, 같은 값이 연속 프레임에서 반복되는 것을 억제한다. */
export function useQrTrigger({
  cameraResult,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  onDetected,
}: UseQrTriggerOptions = {}): QrTriggerEvent | null {
  const devices = useSerialDevices();
  const [lastEvent, setLastEvent] = useState<QrTriggerEvent | null>(null);
  const callbackRef = useRef(onDetected);
  const recentRef = useRef(new Map<string, number>());
  useEffect(() => { callbackRef.current = onDetected; }, [onDetected]);

  const trigger = useCallback((event: Omit<QrTriggerEvent, "detectedAt">) => {
    if (!event.value) return;
    const now = Date.now();
    const identity = `${event.source}:${event.deviceKey ?? "-"}:${event.value}`;
    const previous = recentRef.current.get(identity);
    if (previous !== undefined && now - previous < cooldownMs) return;
    recentRef.current.set(identity, now);

    // 장시간 실행해도 서로 다른 QR 값이 무한히 쌓이지 않게 오래된 항목을 걷는다.
    if (recentRef.current.size > 100) {
      for (const [key, at] of recentRef.current) {
        if (now - at >= cooldownMs) recentRef.current.delete(key);
      }
    }

    const detected: QrTriggerEvent = { ...event, detectedAt: now };
    setLastEvent(detected);
    callbackRef.current?.(detected);
  }, [cooldownMs]);

  useEffect(() => {
    if (getQrInputMode() !== "camera" || !cameraResult) return;
    cameraResult.codes.forEach((code) => trigger({ value: code.text, source: "camera" }));
  }, [cameraResult, trigger]);

  useEffect(() => {
    if (getQrInputMode() !== "serial") return;

    const cleanups: (() => void)[] = [];
    for (const device of devices) {
      if (!device.framing || !serialManager.isOpen(device.key)) continue;
      cleanups.push(subscribeSerialDevice(device, (value) => {
        trigger({ value, source: "serial", deviceKey: device.key });
      }));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [devices, trigger]);

  return lastEvent;
}

function subscribeSerialDevice(device: SerialDevice, onFrame: (value: string) => void): () => void {
  const framing = device.framing!;
  const decoder = new TextDecoder();
  let buffer = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = (raw: string) => {
    const value = stripFraming(raw, framing);
    if (value) onFrame(value);
  };

  const flush = () => {
    if (!buffer) return;
    emit(buffer);
    buffer = "";
  };

  const unsubscribe = serialManager.onData(device.key, (chunk) => {
    buffer += decoder.decode(chunk, { stream: true });
    clearTimeout(idleTimer);

    if (!framing.suffix) {
      idleTimer = setTimeout(flush, FRAME_IDLE_MS);
      return;
    }

    let suffixAt = buffer.indexOf(framing.suffix);
    while (suffixAt >= 0) {
      emit(buffer.slice(0, suffixAt));
      buffer = buffer.slice(suffixAt + framing.suffix.length);
      suffixAt = buffer.indexOf(framing.suffix);
    }
  });

  return () => {
    clearTimeout(idleTimer);
    unsubscribe();
  };
}
