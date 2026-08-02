export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export { createSerialAdapter, WebSerialAdapter, type PortInfo, type SerialAdapter } from "./serial";
export { createUsbAdapter, type UsbAdapter, type UsbDeviceInfo } from "./usb";
