import { createSerialAdapter, isTauri, WebSerialAdapter, type PortInfo, type SerialAdapter } from "../adapters";
import { createSerialBridge, type SerialBridge } from "./serialBridge";

const STORAGE_KEY = "rosa.serial.labels";

export type Connection = {
  label: string;
  path: string;
  baudRate: number;
};

export type StoredLabel = {
  label: string;
  baudRate: number;
  vid?: number;
  pid?: number;
  serialNumber?: string;
  path?: string;
};

export type OpenOptions = {
  baudRate: number;
  label?: string;
  path?: string;
};

export type DataListener = (data: Uint8Array) => void;
export type ErrorListener = (error: Error) => void;
export type ChangeListener = () => void;

type ConnectionState = Connection & {
  bridge: SerialBridge;
  dataListeners: Set<DataListener>;
  errorListeners: Set<ErrorListener>;
};

type LearningInit = {
  pendingLabels: string[];
  ports: SerialPort[];
  baudRate: number;
  onCommit: (mappings: ReadonlyMap<number, string>) => Promise<Connection[]>;
};

/** 데스크톱에서 path 는 재연결마다 바뀔 수 있어, 시리얼번호 → vid/pid → path 순으로 찾는다. */
export function resolveStoredPort(meta: StoredLabel, available: PortInfo[]): PortInfo | undefined {
  if (meta.serialNumber) {
    const bySerial = available.find((p) => p.serialNumber === meta.serialNumber);
    if (bySerial) return bySerial;
  }
  if (meta.vid !== undefined && meta.pid !== undefined) {
    const byIds = available.filter((p) => p.vid === meta.vid && p.pid === meta.pid);
    // 동일 모델이 여러 대면 구분할 수 없으므로 경로 판단에 맡긴다.
    if (byIds.length === 1) return byIds[0];
  }
  return available.find((p) => p.path === meta.path);
}

/** 브라우저는 포트 식별 수단을 주지 않아, 사용자가 라벨 순서대로 스캔하게 해 매핑을 받는다. */
export class LearningSession {
  readonly pendingLabels: string[];
  readonly portCount: number;
  readonly portInfos: { vid?: number; pid?: number }[];

  private readonly ports: SerialPort[];
  private readonly baudRate: number;
  private readonly onCommitCallback: LearningInit["onCommit"];

  private readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  private dataListeners = new Set<(portIndex: number, data: Uint8Array) => void>();
  private assignments = new Map<number, string>();
  private aborted = false;
  private started = false;

  constructor(init: LearningInit) {
    this.pendingLabels = [...init.pendingLabels];
    this.portCount = init.ports.length;
    this.ports = init.ports;
    this.baudRate = init.baudRate;
    this.onCommitCallback = init.onCommit;
    this.portInfos = init.ports.map((p) => {
      const info = p.getInfo();
      return { vid: info.usbVendorId, pid: info.usbProductId };
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const port of this.ports) {
      if (!port.readable) await port.open({ baudRate: this.baudRate });
      this.readers.push(port.readable!.getReader());
    }
    this.readers.forEach((reader, idx) => { void this.listenLoop(idx, reader); });
  }

  private async listenLoop(idx: number, reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      while (!this.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) this.dataListeners.forEach((fn) => fn(idx, value));
      }
    } catch {
      // commit()/cancel() 이 잠금을 풀며 발생하는 정상 종료.
    }
  }

  onData(cb: (portIndex: number, data: Uint8Array) => void): () => void {
    this.dataListeners.add(cb);
    return () => { this.dataListeners.delete(cb); };
  }

  assign(portIndex: number, label: string): void {
    if (!this.pendingLabels.includes(label)) throw new Error(`Unknown label: ${label}`);
    for (const [pi, l] of this.assignments) {
      if (l === label && pi !== portIndex) throw new Error(`Label "${label}" already assigned to port ${pi}`);
    }
    this.assignments.set(portIndex, label);
  }

  unassign(portIndex: number): void {
    this.assignments.delete(portIndex);
  }

  getAssignments(): ReadonlyMap<number, string> {
    return this.assignments;
  }

  isComplete(): boolean {
    return this.assignments.size === this.pendingLabels.length;
  }

  async commit(): Promise<Connection[]> {
    if (!this.isComplete()) {
      throw new Error(`Not all labels assigned (${this.assignments.size}/${this.pendingLabels.length})`);
    }
    this.aborted = true;

    for (let i = 0; i < this.readers.length; i++) {
      // cancel() 은 port.readable 을 닫아버려 이후 통신이 불가능해진다. 이어 쓸 포트는 잠금만 푼다.
      if (this.assignments.has(i)) {
        try { this.readers[i].releaseLock(); } catch { /* 이미 해제됨 */ }
        continue;
      }
      try { await this.readers[i].cancel(); } catch { /* 이미 종료됨 */ }
      try { this.readers[i].releaseLock(); } catch { /* 이미 해제됨 */ }
      try { await this.ports[i].close(); } catch { /* 이미 닫힘 */ }
    }
    this.readers = [];

    return await this.onCommitCallback(this.assignments);
  }

  async cancel(): Promise<void> {
    this.aborted = true;
    for (let i = 0; i < this.readers.length; i++) {
      try { await this.readers[i].cancel(); } catch { /* 이미 종료됨 */ }
      try { this.readers[i].releaseLock(); } catch { /* 이미 해제됨 */ }
    }
    this.readers = [];
    for (const port of this.ports) {
      try { await port.close(); } catch { /* 이미 닫힘 */ }
    }
  }
}

export class SerialPortManager {
  private readonly adapter: SerialAdapter;
  private connections = new Map<string, ConnectionState>();
  private changeListeners = new Set<ChangeListener>();
  private storedLabelMap = new Map<string, StoredLabel>();
  private autoCounter = 0;

  constructor(adapter: SerialAdapter = createSerialAdapter()) {
    this.adapter = adapter;
    this.loadStoredLabels();
  }

  // ---------- 저장된 라벨 ----------

  private loadStoredLabels(): void {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    try {
      const arr = JSON.parse(raw) as StoredLabel[];
      arr.forEach((l) => this.storedLabelMap.set(l.label, l));
    } catch (err) {
      console.error("Failed to load stored serial labels:", err);
    }
  }

  private persistStoredLabels(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.storedLabelMap.values())));
  }

  defineLabel(label: string, meta: Omit<StoredLabel, "label">): void {
    this.storedLabelMap.set(label, { label, ...meta });
    this.persistStoredLabels();
    this.notifyChange();
  }

  removeLabel(label: string): void {
    if (this.connections.has(label)) {
      throw new Error(`Cannot remove label "${label}" while it is open`);
    }
    this.storedLabelMap.delete(label);
    this.persistStoredLabels();
    this.notifyChange();
  }

  getStoredLabels(): StoredLabel[] {
    return Array.from(this.storedLabelMap.values());
  }

  // ---------- 조회 ----------

  listPorts(): Promise<PortInfo[]> {
    return this.adapter.listPorts();
  }

  list(): Connection[] {
    return Array.from(this.connections.values(), ({ label, path, baudRate }) => ({ label, path, baudRate }));
  }

  isOpen(label: string): boolean {
    return this.connections.has(label);
  }

  suggestLabel(): string {
    let candidate: string;
    do {
      this.autoCounter += 1;
      candidate = `port-${this.autoCounter}`;
    } while (this.storedLabelMap.has(candidate) || this.connections.has(candidate));
    return candidate;
  }

  // ---------- 열기 / 닫기 ----------

  async open({ baudRate, label, path }: OpenOptions): Promise<Connection> {
    const finalLabel = label ?? this.suggestLabel();
    if (this.connections.has(finalLabel)) {
      throw new Error(`Port "${finalLabel}" is already open`);
    }
    if (isTauri() && !path) {
      throw new Error('`path` is required in Tauri environment (e.g., "/dev/ttyUSB0", "COM3"). Use listPorts() to discover available paths.');
    }
    const finalPath = path ?? finalLabel;
    await this.adapter.open(finalPath, baudRate);
    return this.registerConnection(finalLabel, finalPath, baudRate);
  }

  private registerConnection(label: string, path: string, baudRate: number): Connection {
    const readable = this.adapter.getReadable(path);
    const writable = this.adapter.getWritable(path);

    const state: ConnectionState = {
      label,
      path,
      baudRate,
      dataListeners: new Set(),
      errorListeners: new Set(),
      bridge: createSerialBridge(readable, writable, {
        onData: (data) => this.connections.get(label)?.dataListeners.forEach((fn) => fn(data)),
        onError: (error) => this.connections.get(label)?.errorListeners.forEach((fn) => fn(error)),
      }),
    };

    this.connections.set(label, state);
    this.notifyChange();
    return { label, path, baudRate };
  }

  async close(label: string): Promise<void> {
    const state = this.connections.get(label);
    if (!state) return;

    // 잠금을 먼저 풀어야 어댑터가 포트를 닫을 수 있다.
    await state.bridge.dispose();
    try {
      await this.adapter.close(state.path);
    } catch (err) {
      state.errorListeners.forEach((fn) => fn(err instanceof Error ? err : new Error(String(err))));
    }

    state.dataListeners.clear();
    state.errorListeners.clear();
    this.connections.delete(label);
    this.notifyChange();
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.list().map((c) => this.close(c.label)));
  }

  // ---------- 복원 ----------

  async restore(opts: { onLearn?: (session: LearningSession) => Promise<void> } = {}): Promise<Connection[]> {
    return isTauri() ? this.restoreTauri() : this.restoreWeb(opts);
  }

  private async restoreTauri(): Promise<Connection[]> {
    const pending = this.getStoredLabels().filter((l) => !this.isOpen(l.label));
    if (pending.length === 0) return [];

    const available = await this.adapter.listPorts();
    const opened: Connection[] = [];
    for (const meta of pending) {
      const port = resolveStoredPort(meta, available);
      if (!port) {
        console.warn(`No matching port found for label "${meta.label}"`);
        continue;
      }
      try {
        opened.push(await this.open({ label: meta.label, path: port.path, baudRate: meta.baudRate }));
        // 다음 복원을 위해 최신 경로/식별자를 갱신해 둔다.
        this.defineLabel(meta.label, {
          ...meta,
          path: port.path,
          vid: port.vid ?? meta.vid,
          pid: port.pid ?? meta.pid,
          serialNumber: port.serialNumber ?? meta.serialNumber,
        });
      } catch (err) {
        console.error(`Failed to restore "${meta.label}":`, err);
      }
    }
    return opened;
  }

  private async restoreWeb(opts: { onLearn?: (session: LearningSession) => Promise<void> }): Promise<Connection[]> {
    if (!(this.adapter instanceof WebSerialAdapter)) {
      throw new Error("restoreWeb requires WebSerialAdapter");
    }
    const adapter = this.adapter;

    const pending = this.getStoredLabels().filter((l) => !this.isOpen(l.label));
    if (pending.length === 0) return [];

    const baudRates = new Set(pending.map((l) => l.baudRate));
    if (baudRates.size > 1) {
      throw new Error("All pending labels must share the same baudRate for learning");
    }
    const baudRate = pending[0].baudRate;

    const ports = await adapter.acquirePorts();
    if (ports.length === 0) return [];
    if (ports.length < pending.length) {
      throw new Error(`Insufficient permitted ports: need ${pending.length}, got ${ports.length}. Request more via the browser dialog first.`);
    }
    if (!opts.onLearn) {
      throw new Error("onLearn callback is required to map ports to labels");
    }

    const session = new LearningSession({
      pendingLabels: pending.map((l) => l.label),
      ports,
      baudRate,
      onCommit: async (mappings) => {
        const opened: Connection[] = [];
        for (const [portIndex, label] of mappings) {
          const meta = this.storedLabelMap.get(label);
          if (!meta) continue;
          // 웹에서는 라벨이 어댑터의 포트 키 역할을 한다.
          adapter.attach(label, ports[portIndex]);
          opened.push(this.registerConnection(label, label, meta.baudRate));
        }
        return opened;
      },
    });

    await session.start();
    try {
      await opts.onLearn(session);
    } catch (err) {
      await session.cancel();
      throw err;
    }
    return await session.commit();
  }

  // ---------- I/O ----------

  write(label: string, data: Uint8Array): void {
    this.requireState(label).bridge.write(data);
  }

  onData(label: string, listener: DataListener): () => void {
    const state = this.requireState(label);
    state.dataListeners.add(listener);
    return () => { state.dataListeners.delete(listener); };
  }

  onError(label: string, listener: ErrorListener): () => void {
    const state = this.requireState(label);
    state.errorListeners.add(listener);
    return () => { state.errorListeners.delete(listener); };
  }

  onChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  private requireState(label: string): ConnectionState {
    const state = this.connections.get(label);
    if (!state) throw new Error(`Port "${label}" is not open`);
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
