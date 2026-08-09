import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "../utils/platform";
import { TransportError, toTransportError } from "./errors";

/** `src-tauri/src/serial.rs` 의 상수와 반드시 동일해야 한다. */
const DATA_EVENT = "serial://data";
const ERROR_EVENT = "serial://error";
const CLOSED_EVENT = "serial://closed";

export interface PortInfo {
  path: string;
  portType: string;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  vid?: number;
  pid?: number;
}

export interface SerialAdapter {
  /** Tauri 는 시스템의 모든 포트를, 웹은 권한이 부여된 포트만 돌려준다. */
  listPorts(): Promise<PortInfo[]>;
  /** 웹에서 포트 권한을 하나 추가한다. 브라우저가 클릭 직후에만 허용하므로 호출당 한 개. */
  requestPort(): Promise<PortInfo | null>;
  open(path: string, baudRate: number): Promise<void>;
  close(path: string): Promise<void>;
  getReadable(path: string): ReadableStream<Uint8Array>;
  getWritable(path: string): WritableStream<Uint8Array>;
}

type RustPortInfo = {
  path: string;
  port_type: string;
  manufacturer?: string;
  product?: string;
  serial_number?: string;
  vid?: number;
  pid?: number;
};

class TauriSerialAdapter implements SerialAdapter {
  async listPorts(): Promise<PortInfo[]> {
    let ports: RustPortInfo[];
    try {
      ports = await invoke<RustPortInfo[]>("serial_list_ports");
    } catch (error) {
      throw toTransportError(error, "unavailable");
    }
    return ports.map((p) => ({
      path: p.path,
      portType: p.port_type,
      manufacturer: p.manufacturer ?? undefined,
      product: p.product ?? undefined,
      serialNumber: p.serial_number ?? undefined,
      vid: p.vid ?? undefined,
      pid: p.pid ?? undefined,
    }));
  }

  async requestPort(): Promise<PortInfo | null> {
    return null;
  }

  async open(path: string, baudRate: number): Promise<void> {
    try {
      await invoke("serial_open", { path, baudRate });
    } catch (error) {
      throw toTransportError(error, "unavailable");
    }
  }

  async close(path: string): Promise<void> {
    try {
      await invoke("serial_close", { path });
    } catch (error) {
      throw toTransportError(error, "disconnected");
    }
  }

  getReadable(path: string): ReadableStream<Uint8Array> {
    let unlisteners: UnlistenFn[] = [];
    const stopListening = () => {
      unlisteners.forEach((fn) => fn());
      unlisteners = [];
    };

    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        unlisteners = await Promise.all([
          listen<{ path: string; data: number[] }>(DATA_EVENT, ({ payload }) => {
            if (payload.path !== path) return;
            controller.enqueue(new Uint8Array(payload.data));
          }),
          listen<{ path: string; code: string; message: string }>(ERROR_EVENT, ({ payload }) => {
            if (payload.path !== path) return;
            stopListening();
            controller.error(toTransportError(payload, "disconnected"));
          }),
          listen<{ path: string }>(CLOSED_EVENT, ({ payload }) => {
            if (payload.path !== path) return;
            stopListening();
            try { controller.close(); } catch { /* 이미 닫힘 */ }
          }),
        ]);
      },
      cancel: stopListening,
    });
  }

  getWritable(path: string): WritableStream<Uint8Array> {
    return new WritableStream<Uint8Array>({
      write: async (chunk) => {
        try {
          await invoke<number>("serial_write", { path, data: Array.from(chunk) });
        } catch (error) {
          throw toTransportError(error, "io");
        }
      },
    });
  }
}

export class WebSerialAdapter implements SerialAdapter {
  private ports = new Map<string, SerialPort>();
  private keyCounter = 0;

  // 브라우저가 주는 포트 목록의 순서를 신뢰할 수 없어, 객체 동일성으로 키를 고정한다.
  private track(port: SerialPort): string {
    for (const [key, tracked] of this.ports) {
      if (tracked === port) return key;
    }
    const key = `web-serial-${this.keyCounter++}`;
    this.ports.set(key, port);
    return key;
  }

  private describe(key: string, port: SerialPort): PortInfo {
    const info = port.getInfo();
    return { path: key, portType: "usb", vid: info.usbVendorId, pid: info.usbProductId };
  }

  async listPorts(): Promise<PortInfo[]> {
    const granted = await navigator.serial.getPorts();
    return granted.map((port) => this.describe(this.track(port), port));
  }

  async requestPort(): Promise<PortInfo | null> {
    try {
      const port = await navigator.serial.requestPort();
      return this.describe(this.track(port), port);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") return null;
      throw toTransportError(err);
    }
  }

  async open(path: string, baudRate: number): Promise<void> {
    const port = this.requirePort(path);
    try {
      if (!port.readable) await port.open({ baudRate });
    } catch (error) {
      throw toTransportError(error, "unavailable");
    }
  }

  async close(path: string): Promise<void> {
    const port = this.ports.get(path);
    // 권한은 유지해야 하므로 맵에서 지우지 않는다. 이미 닫혔으면 할 일이 없다.
    if (!port?.readable && !port?.writable) return;
    try {
      await port.close();
    } catch (err) {
      // 워커로 transfer 된 스트림의 잠금이 남아있을 수 있어 치명적으로 다루지 않는다.
      console.warn(`Failed to close web serial port "${path}":`, err);
    }
  }

  getReadable(path: string): ReadableStream<Uint8Array> {
    const port = this.requirePort(path);
    if (!port.readable) throw new TransportError("disconnected", `Port "${path}" has no readable stream`);
    return port.readable;
  }

  getWritable(path: string): WritableStream<Uint8Array> {
    const port = this.requirePort(path);
    if (!port.writable) throw new TransportError("disconnected", `Port "${path}" has no writable stream`);
    return port.writable;
  }

  private requirePort(path: string): SerialPort {
    const port = this.ports.get(path);
    if (!port) throw new TransportError("disconnected", `Port "${path}" is not open`);
    return port;
  }
}

export function createSerialAdapter(): SerialAdapter {
  return isTauri() ? new TauriSerialAdapter() : new WebSerialAdapter();
}
