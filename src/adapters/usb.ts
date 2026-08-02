import { invoke } from "@tauri-apps/api/core";
import { isTauri } from ".";

export interface UsbDeviceInfo {
  bus: number;
  address: number;
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  classCode: number;
}

export interface UsbAdapter {
  listDevices(): Promise<UsbDeviceInfo[]>;
  /** 데스크톱은 OS 권한으로 이미 전체를 볼 수 있어 항상 null 을 돌려준다. */
  requestDevice(): Promise<UsbDeviceInfo | null>;
}

class TauriUsbAdapter implements UsbAdapter {
  async listDevices(): Promise<UsbDeviceInfo[]> {
    const devices = await invoke<
      {
        bus: number;
        address: number;
        vendor_id: number;
        product_id: number;
        manufacturer?: string;
        product?: string;
        serial_number?: string;
        class_code: number;
      }[]
    >("usb_list_devices");
    return devices.map((d) => ({
      bus: d.bus,
      address: d.address,
      vendorId: d.vendor_id,
      productId: d.product_id,
      manufacturer: d.manufacturer ?? undefined,
      product: d.product ?? undefined,
      serialNumber: d.serial_number ?? undefined,
      classCode: d.class_code,
    }));
  }

  async requestDevice(): Promise<UsbDeviceInfo | null> {
    return null;
  }
}

class WebUsbAdapter implements UsbAdapter {
  async listDevices(): Promise<UsbDeviceInfo[]> {
    return (await navigator.usb.getDevices()).map(toDeviceInfo);
  }

  async requestDevice(): Promise<UsbDeviceInfo | null> {
    try {
      return toDeviceInfo(await navigator.usb.requestDevice({ filters: [] }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") return null;
      throw err;
    }
  }
}

const toDeviceInfo = (d: USBDevice): UsbDeviceInfo => ({
  // 웹에서는 버스/주소를 알 수 없다.
  bus: 0,
  address: 0,
  vendorId: d.vendorId,
  productId: d.productId,
  manufacturer: d.manufacturerName ?? undefined,
  product: d.productName ?? undefined,
  serialNumber: d.serialNumber ?? undefined,
  classCode: d.deviceClass,
});

export function createUsbAdapter(): UsbAdapter {
  return isTauri() ? new TauriUsbAdapter() : new WebUsbAdapter();
}
