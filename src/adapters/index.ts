export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export {
  isCameraSupported,
  listCameras,
  startCamera,
  type CameraInfo,
  type CameraSession,
  type CameraStartOptions,
} from "./camera";
export { createSerialAdapter, WebSerialAdapter, type PortInfo, type SerialAdapter } from "./serial";
export { createUsbAdapter, type UsbAdapter, type UsbDeviceInfo } from "./usb";
