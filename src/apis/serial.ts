import { createSerialAdapter, isTauri, type PortInfo, type SerialAdapter } from "../adapters";
import { createSerialBridge, type SerialBridge } from "./serialBridge";
import { probeBaudRate, type BaudProbeResult } from "./serialScan";

const DEVICE_STORAGE_KEY = "rosa.serial.devices";
const LABEL_STORAGE_KEY = "rosa.serial.labels";

export type DeviceIdentity = {
  path?: string;
  vid?: number;
  pid?: number;
  serialNumber?: string;
};

/** 스캐너가 값 앞뒤에 덧붙이는 문자. 라벨 할당 때 실측해 저장한다. */
export type Framing = {
  prefix: string;
  suffix: string;
};

export type SerialDevice = DeviceIdentity & {
  /** 어댑터가 포트를 찾는 키. Tauri 는 경로, 웹은 세션 한정 식별자. */
  key: string;
  label?: string;
  baudRate?: number;
  framing?: Framing;
};

export type DataListener = (data: Uint8Array) => void;
export type ErrorListener = (error: Error) => void;
export type ChangeListener = () => void;

type ConnectionState = {
  key: string;
  baudRate: number;
  bridge: SerialBridge;
  dataListeners: Set<DataListener>;
  errorListeners: Set<ErrorListener>;
};

type StoredDevice = DeviceIdentity & {
  label?: string;
  baudRate?: number;
  framing?: Framing;
};

/** 데스크톱에서 path 는 재연결마다 바뀔 수 있어, 시리얼번호 → vid/pid → path 순으로 찾는다. */
export function resolveStoredPort(identity: DeviceIdentity, available: PortInfo[]): PortInfo | undefined {
  if (identity.serialNumber) {
    const bySerial = available.find((p) => p.serialNumber === identity.serialNumber);
    if (bySerial) return bySerial;
  }
  if (identity.vid !== undefined && identity.pid !== undefined) {
    const byIds = available.filter((p) => p.vid === identity.vid && p.pid === identity.pid);
    // 동일 모델이 여러 대면 구분할 수 없으므로 경로 판단에 맡긴다.
    if (byIds.length === 1) return byIds[0];
  }
  return available.find((p) => p.path === identity.path);
}

export class SerialPortManager {
  private readonly adapter: SerialAdapter;
  private devices = new Map<string, SerialDevice>();
  private knownLabels = new Set<string>();
  private connections = new Map<string, ConnectionState>();
  private changeListeners = new Set<ChangeListener>();

  constructor(adapter: SerialAdapter = createSerialAdapter()) {
    this.adapter = adapter;
    this.loadFromStorage();
  }

  // ---------- 저장 ----------

  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(LABEL_STORAGE_KEY) ?? "[]");
      if (Array.isArray(raw)) raw.forEach((entry) => this.addLabelFromStorage(entry));
    } catch (err) {
      console.error("Failed to load serial labels:", err);
    }
    // 웹은 포트를 다시 식별할 수 없어 기기를 저장하지 않는다.
    if (!isTauri()) return;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? "[]");
      if (!Array.isArray(raw)) return;
      for (const entry of raw) {
        const device = entry as StoredDevice | null;
        if (!device || typeof device.path !== "string") continue;
        this.devices.set(device.path, { ...device, key: device.path });
      }
    } catch (err) {
      console.error("Failed to load serial devices:", err);
    }
  }

  /** 이전 스키마는 `{ label, baudRate }` 객체 배열이었다. 이름만 살려 받는다. */
  private addLabelFromStorage(entry: unknown): void {
    if (typeof entry === "string") {
      this.knownLabels.add(entry);
      return;
    }
    const legacy = (entry as { label?: unknown } | null)?.label;
    if (typeof legacy === "string") this.knownLabels.add(legacy);
  }

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify([...this.knownLabels]));
    if (!isTauri()) return;
    const stored: StoredDevice[] = [...this.devices.values()].map(
      ({ path, vid, pid, serialNumber, label, baudRate, framing }) =>
        ({ path, vid, pid, serialNumber, label, baudRate, framing }),
    );
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(stored));
  }

  // ---------- 기기 ----------

  listDevices(): SerialDevice[] {
    return [...this.devices.values()];
  }

  getDevice(key: string): SerialDevice | undefined {
    return this.devices.get(key);
  }

  findByLabel(label: string): SerialDevice | undefined {
    return this.listDevices().find((d) => d.label === label);
  }

  /** 등록 후보. Tauri 는 시스템 전체 포트, 웹은 권한이 부여된 포트. */
  listAvailablePorts(): Promise<PortInfo[]> {
    return this.adapter.listPorts();
  }

  registerDevice(port: PortInfo): SerialDevice {
    const existing = this.devices.get(port.path);
    const device: SerialDevice = {
      ...existing,
      key: port.path,
      path: port.path,
      vid: port.vid,
      pid: port.pid,
      serialNumber: port.serialNumber,
    };
    this.devices.set(device.key, device);
    this.persist();
    this.notifyChange();
    return device;
  }

  /** 웹 전용. 브라우저 선택 창을 띄워 포트 하나를 추가한다. */
  async requestDevice(): Promise<SerialDevice | null> {
    const port = await this.adapter.requestPort();
    return port ? this.registerDevice(port) : null;
  }

  async removeDevice(key: string): Promise<void> {
    await this.close(key);
    this.devices.delete(key);
    this.persist();
    this.notifyChange();
  }

  // ---------- 라벨 ----------

  listKnownLabels(): string[] {
    return [...this.knownLabels];
  }

  listUnassignedLabels(): string[] {
    const assigned = new Set(this.listDevices().map((d) => d.label));
    return this.listKnownLabels().filter((l) => !assigned.has(l));
  }

  removeLabel(label: string): void {
    this.knownLabels.delete(label);
    for (const device of this.devices.values()) {
      if (device.label === label) device.label = undefined;
    }
    this.persist();
    this.notifyChange();
  }

  /**
   * 후보 속도를 순회하며 UUID4 스캔을 기다린다. 성공하면 속도·접두어·종결문자까지 확정된다.
   * 탐색 중에는 포트를 직접 열고 닫으므로 연결 상태가 아니어야 한다.
   */
  async assignLabel(
    key: string,
    label: string,
    opts: { signal: AbortSignal; onAttempt: (baudRate: number) => void },
  ): Promise<BaudProbeResult | null> {
    const device = this.requireDevice(key);
    const trimmed = label.trim();
    if (!trimmed) throw new Error("라벨 이름이 비어 있습니다");

    const holder = this.listDevices().find((d) => d.label === trimmed && d.key !== key);
    if (holder) throw new Error(`"${trimmed}" 은 이미 다른 기기에 할당되어 있습니다`);

    await this.close(key);
    const result = await probeBaudRate(this.adapter, key, opts.signal, opts.onAttempt);
    if (!result) return null;

    device.label = trimmed;
    device.baudRate = result.baudRate;
    device.framing = { prefix: result.match.prefix, suffix: result.match.suffix };
    this.knownLabels.add(trimmed);
    this.persist();
    this.notifyChange();

    await this.open(key);
    return result;
  }

  // ---------- 연결 ----------

  isOpen(key: string): boolean {
    return this.connections.has(key);
  }

  listConnections(): string[] {
    return [...this.connections.keys()];
  }

  async open(key: string): Promise<void> {
    if (this.connections.has(key)) return;
    const device = this.requireDevice(key);
    const baudRate = device.baudRate;
    if (!baudRate) throw new Error(`기기 "${key}" 의 통신 속도가 아직 정해지지 않았습니다`);

    await this.adapter.open(key, baudRate);

    const state: ConnectionState = {
      key,
      baudRate,
      dataListeners: new Set(),
      errorListeners: new Set(),
      bridge: createSerialBridge(this.adapter.getReadable(key), this.adapter.getWritable(key), {
        onData: (data) => this.connections.get(key)?.dataListeners.forEach((fn) => fn(data)),
        onError: (error) => this.connections.get(key)?.errorListeners.forEach((fn) => fn(error)),
      }),
    };
    this.connections.set(key, state);
    this.notifyChange();
  }

  async close(key: string): Promise<void> {
    const state = this.connections.get(key);
    if (!state) return;

    // 잠금을 먼저 풀어야 어댑터가 포트를 닫을 수 있다.
    await state.bridge.dispose();
    try {
      await this.adapter.close(key);
    } catch (err) {
      state.errorListeners.forEach((fn) => fn(err instanceof Error ? err : new Error(String(err))));
    }

    state.dataListeners.clear();
    state.errorListeners.clear();
    this.connections.delete(key);
    this.notifyChange();
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.listConnections().map((key) => this.close(key)));
  }

  /**
   * 웹: 권한이 남아 있는 포트를 기기로 다시 등록한다. 라벨은 재할당이 필요하다.
   * Tauri: 저장된 식별자로 경로를 찾아 라벨이 있는 기기를 바로 연결한다.
   */
  async restore(): Promise<SerialDevice[]> {
    const available = await this.adapter.listPorts();

    if (!isTauri()) {
      available.forEach((port) => this.registerDevice(port));
      return this.listDevices();
    }

    const opened: SerialDevice[] = [];
    for (const device of this.listDevices()) {
      if (!device.label || !device.baudRate || this.isOpen(device.key)) continue;
      const port = resolveStoredPort(device, available);
      if (!port) {
        console.warn(`No matching port found for device "${device.key}"`);
        continue;
      }
      try {
        if (port.path !== device.key) this.rekey(device, port);
        await this.open(device.key);
        opened.push(device);
      } catch (err) {
        console.error(`Failed to restore "${device.label}":`, err);
      }
    }
    this.persist();
    return opened;
  }

  /** 경로가 바뀐 기기를 새 경로로 옮긴다. */
  private rekey(device: SerialDevice, port: PortInfo): void {
    this.devices.delete(device.key);
    device.key = port.path;
    device.path = port.path;
    device.vid = port.vid ?? device.vid;
    device.pid = port.pid ?? device.pid;
    device.serialNumber = port.serialNumber ?? device.serialNumber;
    this.devices.set(device.key, device);
  }

  // ---------- I/O ----------

  write(key: string, data: Uint8Array): void {
    this.requireConnection(key).bridge.write(data);
  }

  onData(key: string, listener: DataListener): () => void {
    const state = this.requireConnection(key);
    state.dataListeners.add(listener);
    return () => { state.dataListeners.delete(listener); };
  }

  onError(key: string, listener: ErrorListener): () => void {
    const state = this.requireConnection(key);
    state.errorListeners.add(listener);
    return () => { state.errorListeners.delete(listener); };
  }

  onChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  private requireDevice(key: string): SerialDevice {
    const device = this.devices.get(key);
    if (!device) throw new Error(`기기 "${key}" 가 등록되어 있지 않습니다`);
    return device;
  }

  private requireConnection(key: string): ConnectionState {
    const state = this.connections.get(key);
    if (!state) throw new Error(`기기 "${key}" 가 연결되어 있지 않습니다`);
    return state;
  }

  private notifyChange(): void {
    this.changeListeners.forEach((fn) => fn());
  }
}

export const serialManager = new SerialPortManager();

if (import.meta.hot) {
  import.meta.hot.accept(() => { import.meta.hot!.invalidate(); });
  import.meta.hot.dispose(() => { void serialManager.closeAll(); });
}
