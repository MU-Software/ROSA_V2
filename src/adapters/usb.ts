import { invoke } from "@tauri-apps/api/core";
import { isAndroid, isIos, isTauri } from "../utils/platform";
import { DEFAULT_READ_TIMEOUT_MS, type DiscoveryFilter, type LinkSpec, type UsbLink } from "../printing/profiles";
import { createDisconnectSignal, type DeviceSession, type DeviceTransport, type DiscoveredDevice } from "./device";
import { TransportError, toTransportError } from "./errors";

/** Rust `usb_list_devices` 의 응답. snake_case 는 serde 가 내는 그대로다. */
export type RustUsbDevice = {
  key: string;
  bus: number;
  address: number;
  vendor_id: number;
  product_id: number;
  manufacturer?: string;
  product?: string;
  serial_number?: string;
  class_code: number;
  interface_classes: number[];
};

export const listRustDevices = async (): Promise<RustUsbDevice[]> => {
  try {
    return await invoke<RustUsbDevice[]>("usb_list_devices");
  } catch (error) {
    throw toTransportError(error, "unavailable");
  }
};

export const USB_CLASS_PRINTER = 0x07;

/**
 * 이 클래스를 내놓는가. 장치 레벨과 인터페이스 레벨을 모두 본다 — 복합 장치는
 * `classCode` 가 0 이고 실제 클래스가 인터페이스에 있다.
 */
export const hasUsbClass = (device: UsbDeviceInfo, classCode: number): boolean =>
  device.classCode === classCode || device.interfaceClasses.includes(classCode);

const usbLabel = (vendorId: number, productId: number): string =>
  `USB ${vendorId.toString(16)}:${productId.toString(16)}`;

// ---------- 장치 열거 (디버그 화면) ----------

export interface UsbDeviceInfo {
  bus: number;
  address: number;
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  classCode: number;
  /**
   * 이 장치가 내놓는 인터페이스 클래스들.
   *
   * `classCode` 하나로는 프린터를 가릴 수 없다 — 복합 장치는 장치 디스크립터의
   * 클래스가 0 이고 실제 클래스가 인터페이스에 있다. 읽지 못하면 빈 배열이다.
   */
  interfaceClasses: number[];
}

/** 제조사·제품명·VID:PID·시리얼에 대한 대소문자 무시 부분 일치. 빈 질의는 전부 통과한다. */
export function matchesUsbSearch(device: UsbDeviceInfo, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;

  return [device.manufacturer, device.product, usbLabel(device.vendorId, device.productId), device.serialNumber]
    .some((field) => field?.toLowerCase().includes(search));
}

export interface UsbAdapter {
  listDevices(): Promise<UsbDeviceInfo[]>;
  /** 데스크톱은 OS 권한으로 이미 전체를 볼 수 있어 항상 null 을 돌려준다. */
  requestDevice(): Promise<UsbDeviceInfo | null>;
}

class TauriUsbAdapter implements UsbAdapter {
  async listDevices(): Promise<UsbDeviceInfo[]> {
    return (await listRustDevices()).map((d) => ({
      bus: d.bus,
      address: d.address,
      vendorId: d.vendor_id,
      productId: d.product_id,
      manufacturer: d.manufacturer ?? undefined,
      product: d.product ?? undefined,
      serialNumber: d.serial_number ?? undefined,
      classCode: d.class_code,
      interfaceClasses: d.interface_classes,
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
  interfaceClasses: [
    ...new Set(
      (d.configurations ?? []).flatMap((c) => c.interfaces.flatMap((i) => i.alternates.map((a) => a.interfaceClass))),
    ),
  ],
});

export function createUsbAdapter(): UsbAdapter {
  return isTauri() ? new TauriUsbAdapter() : new WebUsbAdapter();
}

/** 이긴 쪽이 타이머를 꺼야 한다 — 안 그러면 read 마다 타이머가 하나씩 남는다. */
export async function raceTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const alarm = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}이(가) ${ms} ms 안에 끝나지 않았습니다`)), ms);
  });
  try {
    return await Promise.race([work, alarm]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- WebUSB ----------

type BulkEndpoints = {
  interfaceNumber: number;
  alternateSetting: number;
  inEndpoint: number;
  outEndpoint: number;
  interfaceClass: number;
};

/**
 * 벌크 IN/OUT 이 모두 있는 인터페이스를 찾는다.
 *
 * 프린터 클래스를 먼저 보되, 없으면 아무 인터페이스나 쓴다 — 클래스를 벤더 지정으로
 * 내놓는 기기가 있고, 모르는 기기에 붙어보려면 그쪽도 열 수 있어야 한다.
 */
function findBulkEndpoints(device: USBDevice): BulkEndpoints {
  if (!device.configuration) throw new Error("USB 장치가 설정되지 않았습니다");

  const candidates: BulkEndpoints[] = [];
  for (const iface of device.configuration.interfaces) {
    for (const alternate of iface.alternates) {
      let inEndpoint: number | undefined;
      let outEndpoint: number | undefined;
      for (const endpoint of alternate.endpoints) {
        if (endpoint.type !== "bulk") continue;
        if (endpoint.direction === "in") inEndpoint ??= endpoint.endpointNumber;
        else outEndpoint ??= endpoint.endpointNumber;
      }

      if (inEndpoint !== undefined && outEndpoint !== undefined) {
        candidates.push({
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alternate.alternateSetting,
          inEndpoint,
          outEndpoint,
          interfaceClass: alternate.interfaceClass,
        });
      }
    }
  }

  const chosen = candidates.find((c) => c.interfaceClass === USB_CLASS_PRINTER) ?? candidates[0];
  if (!chosen) throw new Error("벌크 IN/OUT 엔드포인트를 가진 인터페이스가 없습니다");
  return chosen;
}

class WebUsbTransport implements DeviceTransport {
  readonly kind = "usb" as const;
  private devices = new Map<string, USBDevice>();
  private counter = 0;

  // 브라우저가 주는 목록의 순서를 신뢰할 수 없어, 객체 동일성으로 키를 고정한다.
  private track(device: USBDevice): string {
    for (const [key, tracked] of this.devices) {
      if (tracked === device) return key;
    }
    const key = `web-usb-${this.counter++}`;
    this.devices.set(key, device);
    return key;
  }

  private describe(key: string, device: USBDevice): DiscoveredDevice {
    return {
      key,
      transport: this.kind,
      name: device.productName ?? usbLabel(device.vendorId, device.productId),
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber ?? undefined,
    };
  }

  async list(): Promise<DiscoveredDevice[]> {
    return (await navigator.usb.getDevices()).map((device) => this.describe(this.track(device), device));
  }

  async request(filter?: DiscoveryFilter): Promise<DiscoveredDevice | null> {
    try {
      const device = await navigator.usb.requestDevice({ filters: filter?.usbMatches ?? [] });
      return this.describe(this.track(device), device);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") return null;
      throw err;
    }
  }

  async open(key: string, link: LinkSpec): Promise<DeviceSession> {
    const { chunkBytes } = link as UsbLink;
    const device = this.devices.get(key);
    if (!device) throw new Error(`USB 장치 "${key}" 가 등록되어 있지 않습니다`);

    try {
      await device.open();
      if (!device.configuration) await device.selectConfiguration(1);
    } catch (error) {
      throw toTransportError(error, "unavailable");
    }

    const { interfaceNumber, alternateSetting, inEndpoint, outEndpoint } = findBulkEndpoints(device);
    await device.claimInterface(interfaceNumber);
    await device.selectAlternateInterface(interfaceNumber, alternateSetting);

    // WebUSB 는 전송을 취소할 수 없다. 시간이 다한 transferIn 은 살아남아 다음 read 의
    // 응답을 가로채므로, 한 번 어긋나면 다시 연결하기 전까지 읽기를 막는다.
    let readsDesynced = false;
    const disconnect = createDisconnectSignal();
    const handleDisconnect = (event: USBConnectionEvent) => {
      if (event.device === device) {
        disconnect.emit(new TransportError("disconnected", `USB 장치 "${key}" 연결이 끊겼습니다`));
      }
    };
    navigator.usb.addEventListener("disconnect", handleDisconnect);

    const sessionError = (error: unknown): TransportError => {
      const mapped = toTransportError(error, "io");
      const normalized = mapped.code === "unavailable"
        ? new TransportError("disconnected", mapped.message, { cause: mapped })
        : mapped;
      if (normalized.code === "disconnected") disconnect.emit(normalized);
      return normalized;
    };

    return {
      onDisconnect: disconnect.onDisconnect,
      write: async (data) => {
        try {
          const chunk = chunkBytes > 0 ? chunkBytes : data.length;
          for (let at = 0; at < data.length; at += chunk) {
            const result = await device.transferOut(outEndpoint, new Uint8Array(data.subarray(at, at + chunk)));
            if (result.status !== "ok") {
              throw new TransportError("io", `USB 쓰기가 "${result.status}" 로 끝났습니다 (${at} B 전송 후)`);
            }
          }
        } catch (error) {
          throw sessionError(error);
        }
      },

      read: async (length, timeoutMs = DEFAULT_READ_TIMEOUT_MS) => {
        if (readsDesynced) throw new TransportError("protocol-error", "이전 읽기가 시간을 초과해 응답이 어긋났습니다. 다시 연결하세요");

        const received = new Uint8Array(length);
        let total = 0;
        const deadline = Date.now() + timeoutMs;

        while (total < length) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new TransportError("timeout", `USB 읽기가 시간을 초과했습니다: ${total} / ${length} B`);

          let result: USBInTransferResult;
          try {
            result = await raceTimeout(device.transferIn(inEndpoint, length - total), remaining, "USB 읽기");
          } catch (err) {
            readsDesynced = true;
            throw sessionError(err);
          }

          if (result.status !== "ok") throw new TransportError("io", `USB 읽기가 "${result.status}" 로 끝났습니다`);
          if (!result.data?.byteLength) continue;
          received.set(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength), total);
          total += result.data.byteLength;
        }
        return received;
      },

      close: async () => {
        disconnect.expectClose();
        navigator.usb.removeEventListener("disconnect", handleDisconnect);
        try {
          await device.releaseInterface(interfaceNumber);
        } catch {
          /* 이미 놓였거나 장치가 사라졌다 */
        }
        if (device.opened) await device.close();
      },
    };
  }
}

// ---------- Tauri USB (rusb) ----------

class TauriUsbTransport implements DeviceTransport {
  readonly kind = "usb" as const;

  async list(): Promise<DiscoveredDevice[]> {
    return (await listRustDevices()).map((device) => ({
      key: device.key,
      transport: this.kind,
      name: device.product ?? usbLabel(device.vendor_id, device.product_id),
      vendorId: device.vendor_id,
      productId: device.product_id,
      serialNumber: device.serial_number ?? undefined,
    }));
  }

  async open(key: string, link: LinkSpec): Promise<DeviceSession> {
    const { chunkBytes } = link as UsbLink;
    const [bus, address] = key.split(":").map(Number);
    if (!Number.isInteger(bus) || !Number.isInteger(address)) throw new Error(`USB 키 형식이 올바르지 않습니다: "${key}"`);
    try {
      await invoke<string>("usb_open", { bus, address });
    } catch (error) {
      throw toTransportError(error, "unavailable");
    }

    const disconnect = createDisconnectSignal();
    const sessionError = (error: unknown): TransportError => {
      const mapped = toTransportError(error, "io");
      if (mapped.code === "disconnected") disconnect.emit(mapped);
      return mapped;
    };

    return {
      onDisconnect: disconnect.onDisconnect,
      write: async (data) => {
        try {
          await invoke<number>("usb_write", { key, data: Array.from(data), chunkBytes });
        } catch (error) {
          throw sessionError(error);
        }
      },
      read: async (length, timeoutMs = DEFAULT_READ_TIMEOUT_MS) => {
        try {
          return new Uint8Array(await invoke<number[]>("usb_read", { key, length, timeoutMs }));
        } catch (error) {
          throw sessionError(error);
        }
      },
      close: async () => {
        disconnect.expectClose();
        try {
          await invoke("usb_close", { key });
        } catch (error) {
          throw toTransportError(error, "disconnected");
        }
      },
    };
  }
}

/** 이 플랫폼에서 USB 로 프린터에 닿는 방법. 없으면 null. */
export const createUsbTransport = (): DeviceTransport | null => {
  // 모바일은 블루투스로만 붙는다. iOS 는 libusb 백엔드가 아예 없고, Android 는
  // USB 호스트 권한 흐름을 아직 만들지 않았다.
  if (isAndroid() || isIos()) return null;
  if (isTauri()) return new TauriUsbTransport();
  return typeof navigator !== "undefined" && "usb" in navigator ? new WebUsbTransport() : null;
};
