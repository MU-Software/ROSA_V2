import { createSerialAdapter, type PortInfo, type SerialAdapter } from "../adapters";
import { TransportError } from "../adapters/errors";
import { isTauri } from "../utils/platform";
import { createSerialBridge, type SerialBridge } from "./serialBridge";
import { probeBaudRate, type BaudProbeResult } from "./serialScan";

const BINDING_STORAGE_KEY = "rosa.serial.devices";
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

/** 다음 실행에서 기기를 다시 찾기 위해 저장하는 라벨 단위 기록. */
type StoredBinding = DeviceIdentity & {
  label: string;
  baudRate: number;
  framing?: Framing;
};

export type RestoreFailure = {
  label: string;
  reason: string;
};

export type RestoreResult = {
  opened: SerialDevice[];
  /** 포트를 찾았는데 열지 못한 경우. 아예 없는 기기는 실패로 보지 않는다. */
  failed: RestoreFailure[];
};

/** 브라우저와 serialport 크레이트가 서로 다른 문구를 쓰므로 한 줄로 통일한다. */
export function describeOpenError(err: unknown): string {
  if (err instanceof TransportError) {
    if (err.code === "busy" || err.code === "already-open") return "다른 프로그램이 포트를 사용 중입니다";
    if (err.code === "permission-denied") return "시리얼 포트 접근 권한이 없습니다";
    if (err.code === "unavailable") return "포트를 사용할 수 없거나 기기가 응답하지 않습니다";
    return err.message;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message;
}

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

/** 데스크톱에서 path 는 재연결마다 바뀔 수 있어, 시리얼번호 → vid/pid → path 순으로 찾는다. */
export function resolveStoredPort(identity: DeviceIdentity, available: PortInfo[]): PortInfo | undefined {
  if (identity.serialNumber) {
    const bySerial = available.find((p) => p.serialNumber === identity.serialNumber);
    if (bySerial) return bySerial;
  }
  if (identity.vid !== undefined && identity.pid !== undefined) {
    const byIds = available.filter((p) => p.vid === identity.vid && p.pid === identity.pid);
    if (byIds.length === 1) return byIds[0];
  }
  return available.find((p) => p.path === identity.path);
}

/**
 * 웹은 vid/pid 밖에 알 수 없어 같은 모델을 구분하지 못한다.
 * 후보가 정확히 하나일 때만 연결하고, 애매하면 사용자에게 맡긴다.
 * 잘못 연결되면 조용히 엉뚱한 라벨로 데이터가 쌓이므로 추측하지 않는다.
 */
function resolveUniquePort(
  identity: DeviceIdentity,
  available: PortInfo[],
  taken: Set<string>,
): PortInfo | undefined {
  if (identity.vid === undefined || identity.pid === undefined) return undefined;
  const matches = available.filter(
    (p) => p.vid === identity.vid && p.pid === identity.pid && !taken.has(p.path),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export class SerialPortManager {
  private readonly adapter: SerialAdapter;
  private devices = new Map<string, SerialDevice>();
  private bindings: StoredBinding[] = [];
  private knownLabels = new Set<string>();
  private connections = new Map<string, ConnectionState>();
  private changeListeners = new Set<ChangeListener>();
  private restoring?: Promise<RestoreResult>;

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
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(BINDING_STORAGE_KEY) ?? "[]");
      if (!Array.isArray(raw)) return;
      this.bindings = raw.filter((entry): entry is StoredBinding => {
        const b = entry as StoredBinding | null;
        return typeof b?.label === "string" && typeof b.baudRate === "number";
      });
      this.bindings.forEach((b) => this.knownLabels.add(b.label));
    } catch (err) {
      console.error("Failed to load serial bindings:", err);
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

  private collectBindings(): StoredBinding[] {
    const live: StoredBinding[] = [];
    for (const d of this.devices.values()) {
      if (!d.label || !d.baudRate) continue;
      live.push({
        label: d.label,
        baudRate: d.baudRate,
        framing: d.framing,
        vid: d.vid,
        pid: d.pid,
        serialNumber: d.serialNumber,
        // 웹의 키는 세션 한정이라 저장해도 다음 실행에서 쓸모가 없다.
        path: isTauri() ? d.path : undefined,
      });
    }
    const liveLabels = new Set(live.map((b) => b.label));
    // 이번 세션에 연결되지 않은 기존 기록은 지우지 않는다.
    return [...live, ...this.bindings.filter((b) => !liveLabels.has(b.label))];
  }

  private persist(): void {
    this.bindings = this.collectBindings();
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify([...this.knownLabels]));
    localStorage.setItem(BINDING_STORAGE_KEY, JSON.stringify(this.bindings));
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
    const device: SerialDevice = {
      ...this.devices.get(port.path),
      key: port.path,
      path: port.path,
      vid: port.vid,
      pid: port.pid,
      serialNumber: port.serialNumber,
    };
    this.devices.set(device.key, device);
    this.notifyChange();
    return device;
  }

  /** 웹 전용. 브라우저 선택 창을 띄워 포트 하나를 추가한다. */
  async requestDevice(): Promise<SerialDevice | null> {
    const port = await this.adapter.requestPort();
    return port ? this.registerDevice(port) : null;
  }

  async removeDevice(key: string): Promise<void> {
    const device = this.devices.get(key);
    await this.close(key);
    this.devices.delete(key);
    if (device?.label) this.bindings = this.bindings.filter((b) => b.label !== device.label);
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
    this.bindings = this.bindings.filter((b) => b.label !== label);
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
    let result: BaudProbeResult | null;
    try {
      result = await probeBaudRate(this.adapter, key, opts.signal, opts.onAttempt);
    } catch (err) {
      throw new Error(describeOpenError(err), { cause: err });
    }
    if (!result) return null;

    device.label = trimmed;
    device.baudRate = result.baudRate;
    device.framing = { prefix: result.match.prefix, suffix: result.match.suffix };
    this.knownLabels.add(trimmed);
    this.bindings = this.bindings.filter((b) => b.label !== trimmed);
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

    try {
      await this.adapter.open(key, baudRate);
    } catch (err) {
      throw new Error(describeOpenError(err), { cause: err });
    }

    const state: ConnectionState = {
      key,
      baudRate,
      dataListeners: new Set(),
      errorListeners: new Set(),
      bridge: createSerialBridge(this.adapter.getReadable(key), this.adapter.getWritable(key), {
        onData: (data) => this.connections.get(key)?.dataListeners.forEach((fn) => fn(data)),
        onError: (error) => this.connections.get(key)?.errorListeners.forEach((fn) => fn(error)),
        onClose: () => void this.handleDisconnect(key),
      }),
    };
    this.connections.set(key, state);
    this.notifyChange();
  }

  /** 기기 쪽에서 끊긴 연결을 정리한다. 남겨두면 상태 표시가 계속 "연결됨"이 된다. */
  private async handleDisconnect(key: string): Promise<void> {
    const state = this.connections.get(key);
    if (!state) return;
    this.connections.delete(key);
    this.notifyChange();

    await state.bridge.dispose();
    try { await this.adapter.close(key); } catch { /* 이미 닫힘 */ }
    state.dataListeners.clear();
    state.errorListeners.clear();
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

  /** 앱 시작 시와 수동 재시도에서 함께 호출되므로 동시 실행을 합친다. */
  async restore(): Promise<RestoreResult> {
    this.restoring ??= this.runRestore().finally(() => { this.restoring = undefined; });
    return this.restoring;
  }

  private async runRestore(): Promise<RestoreResult> {
    const available = await this.adapter.listPorts();
    // 웹에서는 권한이 부여된 포트가 곧 등록된 기기다.
    if (!isTauri()) available.forEach((port) => this.registerDevice(port));

    const taken = new Set(this.listDevices().filter((d) => d.label).map((d) => d.key));
    const opened: SerialDevice[] = [];
    const failed: RestoreFailure[] = [];

    for (const binding of this.bindings) {
      if (this.findByLabel(binding.label)) continue;
      const port = isTauri()
        ? resolveStoredPort(binding, available)
        : resolveUniquePort(binding, available, taken);
      // 기기가 아예 없는 경우는 정상이므로 실패로 보고하지 않는다.
      if (!port) continue;

      const device = this.registerDevice(port);
      device.label = binding.label;
      device.baudRate = binding.baudRate;
      device.framing = binding.framing;
      taken.add(device.key);

      try {
        await this.open(device.key);
        opened.push(device);
      } catch (err) {
        failed.push({ label: binding.label, reason: describeOpenError(err) });
      }
    }

    this.persist();
    this.notifyChange();
    return { opened, failed };
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
