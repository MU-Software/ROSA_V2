import { useEffect, useState } from "react";
import {
  printerManager,
  type PrinterConnection,
  type PrinterDevice,
  type PrinterSettings,
  type PrinterState,
} from "../apis/printer";

export function usePrinterDevices(): PrinterDevice[] {
  const [devices, setDevices] = useState<PrinterDevice[]>(() => printerManager.listDevices());
  useEffect(() => printerManager.onChange(() => setDevices(printerManager.listDevices())), []);
  return devices;
}

export function useRegisteredPrinterDevices(): PrinterDevice[] {
  const [devices, setDevices] = useState<PrinterDevice[]>(() => printerManager.listRegisteredDevices());
  useEffect(() => {
    const unsubscribe = printerManager.onChange(() => setDevices(printerManager.listRegisteredDevices()));
    void printerManager.refresh().catch((reason: unknown) => {
      console.error("Failed to refresh registered printers:", reason);
    });
    return unsubscribe;
  }, []);
  return devices;
}

export function usePrinterConnection(key: string): PrinterConnection | undefined {
  const [connection, setConnection] = useState(() => printerManager.getConnection(key));
  useEffect(() => {
    const sync = () => setConnection(printerManager.getConnection(key));
    sync();
    return printerManager.onChange(sync);
  }, [key]);
  return connection;
}

export function usePrinterState(key: string): PrinterState {
  const [state, setState] = useState(() => printerManager.getState(key));
  useEffect(() => {
    const sync = () => setState(printerManager.getState(key));
    sync();
    return printerManager.onChange(sync);
  }, [key]);
  return state;
}

export function usePrinterSettings(deviceKey: string | undefined): PrinterSettings {
  const [settings, setSettings] = useState<PrinterSettings>(() =>
    deviceKey ? printerManager.getSettings(deviceKey) : {},
  );
  useEffect(() => {
    const sync = () => setSettings(deviceKey ? printerManager.getSettings(deviceKey) : {});
    sync();
    return printerManager.onChange(sync);
  }, [deviceKey]);
  return settings;
}
