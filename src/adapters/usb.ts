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
}

class WebUsbAdapter implements UsbAdapter {
  async listDevices(): Promise<UsbDeviceInfo[]> {
    const devices = await navigator.usb.getDevices();
    return devices.map((d) => ({
      bus: 0,
      address: 0,
      vendorId: d.vendorId,
      productId: d.productId,
      manufacturer: d.manufacturerName ?? undefined,
      product: d.productName ?? undefined,
      serialNumber: d.serialNumber ?? undefined,
      classCode: d.deviceClass,
    }));
  }
}

export function createUsbAdapter(): UsbAdapter {
  return isTauri() ? new TauriUsbAdapter() : new WebUsbAdapter();
}
