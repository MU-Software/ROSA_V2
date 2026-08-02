import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from ".";

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
  listPorts(): Promise<PortInfo[]>;
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
    const ports = await invoke<RustPortInfo[]>("serial_list_ports");
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

  async open(path: string, baudRate: number): Promise<void> {
    await invoke("serial_open", { path, baudRate });
  }

  async close(path: string): Promise<void> {
    await invoke("serial_close", { path });
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
          listen<{ path: string; message: string }>(ERROR_EVENT, ({ payload }) => {
            if (payload.path !== path) return;
            stopListening();
            controller.error(new Error(payload.message));
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
        await invoke<number>("serial_write", { path, data: Array.from(chunk) });
      },
    });
  }
}

export class WebSerialAdapter implements SerialAdapter {
  private ports = new Map<string, SerialPort>();

  async acquirePorts(): Promise<SerialPort[]> {
    const granted = await navigator.serial.getPorts();
    if (granted.length > 0) return granted;
    try {
      return [await navigator.serial.requestPort()];
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") return [];
      throw err;
    }
  }

  attach(path: string, port: SerialPort): void {
    this.ports.set(path, port);
  }

  async listPorts(): Promise<PortInfo[]> {
    const ports = await navigator.serial.getPorts();
    return ports.map((port, i) => {
      const info = port.getInfo();
      return {
        path: `web-serial-${i}`,
        portType: "usb",
        vid: info.usbVendorId,
        pid: info.usbProductId,
      };
    });
  }

  async open(path: string, baudRate: number): Promise<void> {
    const port = this.ports.get(path) ?? (await navigator.serial.requestPort());
    // readable 이 있으면 학습 세션이 이미 연 포트다.
    if (!port.readable) await port.open({ baudRate });
    this.ports.set(path, port);
  }

  async close(path: string): Promise<void> {
    const port = this.ports.get(path);
    if (!port) return;
    this.ports.delete(path);
    try {
      await port.close();
    } catch (err) {
      // 워커로 transfer 된 스트림의 잠금이 남아있을 수 있어 치명적으로 다루지 않는다.
      console.warn(`Failed to close web serial port "${path}":`, err);
    }
  }

  getReadable(path: string): ReadableStream<Uint8Array> {
    const port = this.requirePort(path);
    if (!port.readable) throw new Error(`Port "${path}" has no readable stream`);
    return port.readable;
  }

  getWritable(path: string): WritableStream<Uint8Array> {
    const port = this.requirePort(path);
    if (!port.writable) throw new Error(`Port "${path}" has no writable stream`);
    return port.writable;
  }

  private requirePort(path: string): SerialPort {
    const port = this.ports.get(path);
    if (!port) throw new Error(`Port "${path}" is not open`);
    return port;
  }
}

export function createSerialAdapter(): SerialAdapter {
  return isTauri() ? new TauriSerialAdapter() : new WebSerialAdapter();
}
