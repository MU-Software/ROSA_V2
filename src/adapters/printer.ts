import { createBluetoothTransport } from "./bluetooth";
import type { DeviceTransport } from "./device";
import { createUsbTransport } from "./usb";

/**
 * 이 플랫폼에서 프린터에 닿을 수 있는 전송들.
 *
 * 어느 플랫폼에서 쓸 수 있는지는 각 전송 모듈이 안다 — 여기서는 모으기만 한다.
 */
export function createPrinterTransports(): DeviceTransport[] {
  return [createBluetoothTransport(), createUsbTransport()].filter((t): t is DeviceTransport => t !== null);
}
