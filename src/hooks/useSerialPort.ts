import { useCallback, useEffect, useState } from "react";
import {
  serialManager,
  type Connection,
  type DataListener,
  type ErrorListener,
} from "../apis/serial";

export type UseSerialPortResult = {
  connected: boolean;
  data: Uint8Array | null;
  error: Error | null;
  write: (data: Uint8Array) => void;
  close: () => Promise<void>;
};

export function useSerialPort(label: string): UseSerialPortResult {
  const [connected, setConnected] = useState<boolean>(() => serialManager.isOpen(label));
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let unsubData: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    const subscribe = () => {
      unsubData?.();
      unsubError?.();
      unsubData = unsubError = undefined;
      if (serialManager.isOpen(label)) {
        const onData: DataListener = (d) => setData(d);
        const onError: ErrorListener = (e) => setError(e);
        unsubData = serialManager.onData(label, onData);
        unsubError = serialManager.onError(label, onError);
      }
    };

    const sync = () => {
      setConnected(serialManager.isOpen(label));
      subscribe();
    };

    sync();
    const unsubChange = serialManager.onChange(sync);
    return () => {
      unsubData?.();
      unsubError?.();
      unsubChange();
    };
  }, [label]);

  const write = useCallback((bytes: Uint8Array) => serialManager.write(label, bytes), [label]);
  const close = useCallback(() => serialManager.close(label), [label]);

  return { connected, data, error, write, close };
}

export function useSerialPortList(): Connection[] {
  const [ports, setPorts] = useState<Connection[]>(() => serialManager.list());
  useEffect(() => serialManager.onChange(() => setPorts(serialManager.list())), []);
  return ports;
}
