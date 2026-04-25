import { invoke } from "@tauri-apps/api/core";
import { isTauri } from ".";

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
  write(path: string, data: Uint8Array): Promise<number>;
  read(path: string, size: number): Promise<Uint8Array>;
}

class TauriSerialAdapter implements SerialAdapter {
  async listPorts(): Promise<PortInfo[]> {
    const ports = await invoke<
      {
        path: string;
        port_type: string;
        manufacturer?: string;
        product?: string;
        serial_number?: string;
        vid?: number;
        pid?: number;
      }[]
    >("serial_list_ports");
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

  async write(path: string, data: Uint8Array): Promise<number> {
    return invoke<number>("serial_write", { path, data: Array.from(data) });
  }

  async read(path: string, size: number): Promise<Uint8Array> {
    const arr = await invoke<number[]>("serial_read", { path, size });
    return new Uint8Array(arr);
  }
}

class WebSerialAdapter implements SerialAdapter {
  private ports = new Map<string, SerialPort>();
  private readers = new Map<string, ReadableStreamDefaultReader<Uint8Array>>();
  private writers = new Map<string, WritableStreamDefaultWriter<Uint8Array>>();

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
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    this.ports.set(path, port);
    if (port.readable) {
      this.readers.set(path, port.readable.getReader());
    }
    if (port.writable) {
      this.writers.set(path, port.writable.getWriter());
    }
  }

  async close(path: string): Promise<void> {
    const reader = this.readers.get(path);
    if (reader) {
      await reader.cancel();
      reader.releaseLock();
      this.readers.delete(path);
    }
    const writer = this.writers.get(path);
    if (writer) {
      await writer.close();
      this.writers.delete(path);
    }
    const port = this.ports.get(path);
    if (port) {
      await port.close();
      this.ports.delete(path);
    }
  }

  async write(path: string, data: Uint8Array): Promise<number> {
    const writer = this.writers.get(path);
    if (!writer) throw new Error("Port not open");
    await writer.write(data);
    return data.length;
  }

  async read(path: string, size: number): Promise<Uint8Array> {
    const reader = this.readers.get(path);
    if (!reader) throw new Error("Port not open");
    const { value } = await reader.read();
    if (!value) return new Uint8Array(0);
    return value.slice(0, size);
  }
}

export function createSerialAdapter(): SerialAdapter {
  return isTauri() ? new TauriSerialAdapter() : new WebSerialAdapter();
}
