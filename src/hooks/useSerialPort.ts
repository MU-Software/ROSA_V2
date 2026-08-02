import { useCallback, useEffect, useState } from "react";
import { serialManager, type SerialDevice } from "../apis/serial";

export type UseSerialPortResult = {
  connected: boolean;
  data: Uint8Array | null;
  error: Error | null;
  write: (data: Uint8Array) => void;
  close: () => Promise<void>;
};

export function useSerialPort(key: string): UseSerialPortResult {
  const [connected, setConnected] = useState(() => serialManager.isOpen(key));
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let unsubData: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    const sync = () => {
      unsubData?.();
      unsubError?.();
      unsubData = unsubError = undefined;
      setConnected(serialManager.isOpen(key));
      if (!serialManager.isOpen(key)) return;
      unsubData = serialManager.onData(key, setData);
      unsubError = serialManager.onError(key, setError);
    };

    sync();
    const unsubChange = serialManager.onChange(sync);
    return () => {
      unsubData?.();
      unsubError?.();
      unsubChange();
    };
  }, [key]);

  const write = useCallback((bytes: Uint8Array) => serialManager.write(key, bytes), [key]);
  const close = useCallback(() => serialManager.close(key), [key]);

  return { connected, data, error, write, close };
}

export function useSerialDevices(): SerialDevice[] {
  const [devices, setDevices] = useState<SerialDevice[]>(() => serialManager.listDevices());
  useEffect(() => serialManager.onChange(() => setDevices(serialManager.listDevices())), []);
  return devices;
}
