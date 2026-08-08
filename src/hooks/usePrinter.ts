import { useEffect, useState } from "react";
import { printerManager, type PrinterConnection, type PrinterDevice, type PrinterSettings } from "../apis/printer";

export function usePrinterDevices(): PrinterDevice[] {
  const [devices, setDevices] = useState<PrinterDevice[]>(() => printerManager.listDevices());
  useEffect(() => printerManager.onChange(() => setDevices(printerManager.listDevices())), []);
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

export function usePrinterSettings(profileId: string | undefined): PrinterSettings {
  const [settings, setSettings] = useState<PrinterSettings>(() =>
    profileId ? printerManager.getSettings(profileId) : {},
  );
  useEffect(() => {
    const sync = () => setSettings(profileId ? printerManager.getSettings(profileId) : {});
    sync();
    return printerManager.onChange(sync);
  }, [profileId]);
  return settings;
}
