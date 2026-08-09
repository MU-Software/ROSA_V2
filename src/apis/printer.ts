import type { DeviceSession, DeviceTransport, DiscoveredDevice } from "../adapters/device";
import { hasTransportCode, toTransportError, type TransportError } from "../adapters/errors";
import { createPrinterTransports } from "../adapters/printer";
import {
  knownPrinterFilter,
  findProfile,
  maxImageWidth,
  type CompletionProbe,
  type LabelSpec,
  type PrinterAction,
  type PrinterProfile,
  type ProbeResult,
} from "../printing/profiles";
import { RcptImage } from "../printing/receipet";
import { toMessage } from "../utils/bytes";

const SETTINGS_STORAGE_KEY = "rosa.printer.settings";
const SETTINGS_STORAGE_VERSION = 3;

/** 프린터가 스스로 알려주지 못해 사용자가 정해야 하는 값들. 물리 장치 단위로 저장한다. */
export type PrinterSettings = {
  label?: LabelSpec;
  /** 눈금자로 보정한 값. */
  rightMarginDots?: number;
};

type StoredPrinterSettings = {
  version: typeof SETTINGS_STORAGE_VERSION;
  devices: Record<string, PrinterSettings>;
  /** 버전 1의 프로파일 단위 설정. 장치별 설정이 생길 때까지 기본값으로만 쓴다. */
  legacyProfiles: Record<string, PrinterSettings>;
};

type LegacyStoredPrinterSettings = Omit<StoredPrinterSettings, "version"> & { version: 2 };

export type PrinterDevice = DiscoveredDevice & {
  profile?: PrinterProfile;
  transportRef: DeviceTransport;
};

export type PrinterConnection = {
  key: string;
  profile: PrinterProfile;
  probe?: ProbeResult;
  /** 전송이 연결 후에 알려주는 설명 문구. */
  link?: string;
};

export type PrinterConnectionStatus =
  | "disconnected"
  | "connecting"
  | "ready"
  | "printing"
  | "disconnecting"
  | "faulted";

export type PrinterState = {
  status: PrinterConnectionStatus;
  error?: TransportError;
};

/** `sending` 은 바이트를 넘기는 중, `printing` 은 프린터가 소화하는 중. */
export type PrintPhase = "sending" | "printing";

export type PrintOptions = {
  copies?: number;
  onPhase?: (phase: PrintPhase) => void;
};

type ActiveConnection = PrinterConnection & {
  session: DeviceSession;
  /** 잡을 직렬화한다. 겹쳐 보내면 프린터가 두 잡의 바이트를 하나로 읽는다. */
  queue: Promise<void>;
  unsubscribeDisconnect: () => void;
};

/** 매번 새 객체를 돌려주면 구독자가 값이 바뀐 줄 알고 다시 그린다. */
const EMPTY_SETTINGS: PrinterSettings = Object.freeze({});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const optionalFiniteNumber = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === "number" && Number.isFinite(value));

const parsePrinterSettings = (value: unknown): PrinterSettings | undefined => {
  if (!isRecord(value)) return undefined;
  if (!optionalFiniteNumber(value.rightMarginDots)) return undefined;

  let label: LabelSpec | undefined;
  if (value.label !== undefined) {
    if (!isRecord(value.label)) return undefined;
    const { widthMm, heightMm, gapMm } = value.label;
    if (!optionalFiniteNumber(widthMm) || !optionalFiniteNumber(heightMm) || !optionalFiniteNumber(gapMm)) return undefined;
    if (widthMm === undefined || heightMm === undefined) return undefined;
    label = { widthMm, heightMm, ...(gapMm === undefined ? {} : { gapMm }) };
  }

  return {
    ...(label ? { label } : {}),
    ...(value.rightMarginDots === undefined ? {} : { rightMarginDots: value.rightMarginDots }),
  };
};

const parseSettingsMap = (value: unknown): Record<string, PrinterSettings> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, settings]) => {
      const parsed = parsePrinterSettings(settings);
      return parsed ? [[key, parsed]] : [];
    }),
  );
};

/**
 * PT-390 실측은 잡 크기와 거의 무관하게 4.7~5.5 초였다. 고정 비용이 지배하므로 고정
 * 15 초를 깔고 한계 20 KB/s 를 더한다 — 실측의 3 배 여유를 두면서도 멈춘 프린터를
 * 20 초 안에 알린다.
 */
const completionTimeoutMs = (jobBytes: number): number => 15_000 + (jobBytes / 20_480) * 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PrinterManager {
  private readonly transports: DeviceTransport[];
  private devices = new Map<string, PrinterDevice>();
  private connections = new Map<string, ActiveConnection>();
  private connecting = new Map<string, Promise<PrinterConnection>>();
  private states = new Map<string, PrinterState>();
  private settings: Record<string, PrinterSettings> = {};
  private legacyProfileSettings: Record<string, PrinterSettings> = {};
  private changeListeners = new Set<() => void>();

  constructor(transports: DeviceTransport[] = createPrinterTransports()) {
    this.transports = transports;
    this.loadSettings();
  }

  // ---------- 설정 ----------

  private loadSettings(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");
      if (!isRecord(raw)) return;
      const stored = raw as Partial<StoredPrinterSettings | LegacyStoredPrinterSettings>;
      if (stored.version === SETTINGS_STORAGE_VERSION || stored.version === 2) {
        this.settings = parseSettingsMap(stored.devices);
        this.legacyProfileSettings = parseSettingsMap(stored.legacyProfiles);
        // v2와 v3의 값 모양은 같지만, 다음 저장부터 새 식별자 정책의 v3로 기록한다.
        if (stored.version === 2) this.persistSettings();
      } else if ("version" in stored) {
        console.warn(`지원하지 않는 프린터 설정 버전입니다: ${String(stored.version)}`);
      } else {
        // 이전 형식은 `{ [profileId]: settings }` 였다. 첫 장치별 수정 전까지 기본값으로 유지한다.
        this.legacyProfileSettings = parseSettingsMap(raw);
      }
    } catch (err) {
      console.error("Failed to load printer settings:", err);
    }
  }

  private settingsId(device: PrinterDevice): string {
    const prefix = `${device.transport}:${device.vendorId ?? "-"}:${device.productId ?? "-"}`;
    if (device.serialNumber) return `${prefix}:serial:${device.serialNumber}`;
    if (device.address) return `${prefix}:address:${device.address}`;
    if (device.physicalId) return `${prefix}:physical:${device.physicalId}`;
    // WebUSB는 물리 포트 경로를 공개하지 않는다. 이 경우에만 세션 키로 제한한다.
    return `${prefix}:key:${device.key}`;
  }

  hasPersistentSettingsIdentity(key: string): boolean {
    const device = this.devices.get(key);
    return !!(device?.serialNumber || device?.address || device?.physicalId);
  }

  getSettings(key: string): PrinterSettings {
    const device = this.devices.get(key);
    if (!device) return EMPTY_SETTINGS;
    return this.settings[this.settingsId(device)] ??
      (device.profile ? this.legacyProfileSettings[device.profile.id] : undefined) ??
      EMPTY_SETTINGS;
  }

  updateSettings(key: string, patch: PrinterSettings): void {
    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    const id = this.settingsId(device);
    this.settings[id] = { ...this.getSettings(key), ...patch };
    this.persistSettings();
    this.notifyChange();
  }

  private persistSettings(): void {
    if (typeof localStorage === "undefined") return;
    const stored: StoredPrinterSettings = {
      version: SETTINGS_STORAGE_VERSION,
      devices: this.settings,
      legacyProfiles: this.legacyProfileSettings,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
  }

  // ---------- 기기 ----------

  canRequestDevice(): boolean {
    return this.transports.some((transport) => transport.request);
  }

  listDevices(): PrinterDevice[] {
    return [...this.devices.values()];
  }

  async refresh(): Promise<PrinterDevice[]> {
    const found = new Map<string, PrinterDevice>();
    const filter = knownPrinterFilter();

    // BLE 스캔 혼자 8 초를 쓰므로 직렬로 훑으면 안 된다.
    const listings = await Promise.all(
      this.transports.map(async (transport) => {
        try {
          return { transport, listed: await transport.list(filter) };
        } catch (err) {
          // 한 전송이 막혀도 나머지는 보여야 한다.
          console.warn(`Failed to list ${transport.kind} printers:`, toMessage(err));
          return { transport, listed: [] as DiscoveredDevice[] };
        }
      }),
    );

    for (const { transport, listed } of listings) {
      for (const info of listed) {
        found.set(info.key, { ...info, profile: findProfile(info), transportRef: transport });
      }
    }

    // 일시적인 검색 실패 때문에 살아 있는 연결이 UI에서 사라지지 않게 유지한다.
    for (const key of this.connections.keys()) {
      const connected = this.devices.get(key);
      if (connected && !found.has(key)) found.set(key, connected);
    }

    this.devices = found;
    this.notifyChange();
    return this.listDevices();
  }

  /** WebUSB 처럼 사용자가 골라야 하는 전송에서 기기 하나를 추가한다. */
  async requestDevice(): Promise<PrinterDevice | null> {
    for (const transport of this.transports) {
      if (!transport.request) continue;
      const info = await transport.request(knownPrinterFilter());
      if (!info) continue;
      const device: PrinterDevice = { ...info, profile: findProfile(info), transportRef: transport };
      this.devices.set(device.key, device);
      this.notifyChange();
      return device;
    }
    return null;
  }

  // ---------- 연결 ----------

  isConnected(key: string): boolean {
    return this.connections.has(key);
  }

  getState(key: string): PrinterState {
    return this.states.get(key) ?? { status: "disconnected" };
  }

  getConnection(key: string): PrinterConnection | undefined {
    return this.connections.get(key);
  }

  async connect(key: string): Promise<PrinterConnection> {
    const existing = this.connections.get(key);
    if (existing) return existing;
    const pending = this.connecting.get(key);
    if (pending) return pending;

    this.setState(key, { status: "connecting" });
    const opening = this.openConnection(key);
    this.connecting.set(key, opening);
    try {
      return await opening;
    } catch (error) {
      this.setState(key, { status: "faulted", error: toTransportError(error) });
      throw error;
    } finally {
      if (this.connecting.get(key) === opening) this.connecting.delete(key);
    }
  }

  private async openConnection(key: string): Promise<PrinterConnection> {
    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    if (!device.profile) throw new Error(`"${device.name}" 은 지원하는 프린터가 아닙니다`);

    const profile = device.profile;
    const transport = device.transportRef;
    const link = profile.links[transport.kind];
    if (!link) throw new Error(`${profile.name} 은 ${transport.kind} 로 연결할 수 없습니다`);

    const session = await transport.open(key, link);
    const connection: ActiveConnection = {
      key,
      profile,
      session,
      link: session.describe,
      queue: Promise.resolve(),
      unsubscribeDisconnect: () => undefined,
    };
    connection.unsubscribeDisconnect = session.onDisconnect((error) => {
      if (this.connections.get(key) !== connection) return;
      this.connections.delete(key);
      connection.unsubscribeDisconnect();
      this.setState(key, { status: "faulted", error });
    });
    this.connections.set(key, connection);
    this.setState(key, { status: "ready" });

    // 상태 조회가 실패해도 연결 자체는 살려둔다 — 인쇄가 가능한 기종이 있다.
    if (profile.probe) {
      try {
        connection.probe = await profile.probe(session);
      } catch (err) {
        connection.probe = {
          summary: "상태를 읽지 못했습니다",
          fields: {},
          problems: [toMessage(err)],
        };
      }
      this.notifyChange();
    }
    return connection;
  }

  async disconnect(key: string): Promise<void> {
    const opening = this.connecting.get(key);
    if (opening) {
      this.setState(key, { status: "disconnecting" });
      try { await opening; } catch { /* 열리지 않았으면 닫을 세션도 없다. */ }
    }

    const connection = this.connections.get(key);
    if (!connection) {
      this.setState(key, { status: "disconnected" });
      return;
    }
    this.setState(key, { status: "disconnecting" });

    // 출력 바이트가 전송 중인 세션을 닫지 않는다. queue 는 항상 catch 된 약속이다.
    await connection.queue;
    this.connections.delete(key);
    connection.unsubscribeDisconnect();
    try {
      await connection.session.close();
    } catch (err) {
      console.warn(`Failed to close printer "${key}":`, toMessage(err));
    } finally {
      this.setState(key, { status: "disconnected" });
    }
  }

  async disconnectAll(): Promise<void> {
    const keys = new Set([...this.connections.keys(), ...this.connecting.keys()]);
    await Promise.all([...keys].map((key) => this.disconnect(key)));
  }

  listActions(key: string): PrinterAction[] {
    return this.connections.get(key)?.profile.actions ?? [];
  }

  /** disruptive 동작 뒤에 연결을 정리한다 — 살려두면 죽은 소켓이 "연결됨" 으로 남는다. */
  async runAction(key: string, actionId: string): Promise<string> {
    const connection = this.requireConnection(key);
    const action = connection.profile.actions?.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`"${actionId}" 동작이 없습니다`);

    const message = await action.run(connection.session);
    if (action.disruptive) await this.disconnect(key);
    return message;
  }

  async reprobe(key: string): Promise<ProbeResult | undefined> {
    const connection = this.requireConnection(key);
    if (!connection.profile.probe) return undefined;
    connection.probe = await connection.profile.probe(connection.session);
    this.notifyChange();
    return connection.probe;
  }

  // ---------- 인쇄 ----------

  /**
   * 프린터가 인쇄 가능 영역을 알려주면 그 값이 이긴다 — 미디어 크기로 그리면 인쇄가
   * 라벨을 넘친다. 높이를 아무 데서도 알 수 없으면 `undefined` 로 두고 호출자가 정한다.
   */
  imageSize(key: string): { width: number; height?: number } {
    const connection = this.requireConnection(key);
    const settings = this.getSettings(key);
    const printable = connection.probe?.printable;

    return {
      width: printable?.widthDots ?? maxImageWidth(connection.profile, settings.label),
      height:
        printable?.lengthDots ||
        (settings.label ? Math.floor(settings.label.heightMm * connection.profile.dotsPerMm) : undefined),
    };
  }

  async createImage(key: string, height?: number): Promise<RcptImage> {
    const size = this.imageSize(key);
    const resolved = height ?? size.height;
    if (!resolved) throw new Error(`프린터 "${key}" 는 인쇄 높이를 지정해야 합니다`);
    return RcptImage.create(size.width, resolved);
  }

  /** 거짓이면 UI 는 "보냈다" 까지만 말할 수 있다. */
  canConfirmCompletion(key: string): boolean {
    return this.connections.get(key)?.profile.completionProbe !== undefined;
  }

  async print(key: string, image: RcptImage, options: PrintOptions = {}): Promise<void> {
    const connection = this.requireConnection(key);
    const settings = this.getSettings(key);

    const job = connection.profile.buildJob({
      image,
      copies: options.copies ?? 1,
      probe: connection.probe,
      label: settings.label,
      rightMarginDots: settings.rightMarginDots,
    });

    // 앞선 잡이 끝난 뒤에 보낸다. queue 는 항상 catch 된 것이라 거절되지 않는다.
    const run = connection.queue.then(() => this.send(connection, job, options));
    connection.queue = run.catch(() => undefined);
    return run;
  }

  private async send(connection: ActiveConnection, job: Uint8Array, options: PrintOptions): Promise<void> {
    if (this.connections.get(connection.key) !== connection) {
      throw new Error(`프린터 "${connection.key}" 연결이 출력 전에 끊겼습니다`);
    }
    this.setState(connection.key, { status: "printing" });
    try {
      options.onPhase?.("sending");
      await connection.session.write(job);

      const probe = connection.profile.completionProbe;
      if (!probe) return;

      options.onPhase?.("printing");
      await this.waitUntilIdle(connection, probe, completionTimeoutMs(job.length));
    } finally {
      if (this.connections.get(connection.key) === connection && this.getState(connection.key).status === "printing") {
        this.setState(connection.key, { status: "ready" });
      }
    }
  }

  private async waitUntilIdle(
    connection: ActiveConnection,
    probe: CompletionProbe,
    timeoutMs: number,
  ): Promise<void> {
    const judge = probe.createJudge?.();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const asked = Date.now();
      try {
        await connection.session.write(probe.request);
        const reply = await connection.session.read(probe.length, probe.intervalMs);
        if (!judge || (await judge(reply))) return;
      } catch (err) {
        // 무응답 = 아직 인쇄 중. 그 밖의 실패는 다시 물어도 소용없다.
        if (!hasTransportCode(err, "timeout")) throw err;
      }
      // 읽기가 즉시 실패해도 간격은 지켜야 한다 — 안 그러면 바쁜 대기가 된다.
      const rest = probe.intervalMs - (Date.now() - asked);
      if (rest > 0) await delay(rest);
    }
    throw new Error(`${connection.profile.name} 이 ${Math.round(timeoutMs / 1000)}초 안에 인쇄를 끝내지 못했습니다`);
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private requireConnection(key: string): ActiveConnection {
    const connection = this.connections.get(key);
    if (!connection) throw new Error(`프린터 "${key}" 가 연결되어 있지 않습니다`);
    return connection;
  }

  private setState(key: string, state: PrinterState): void {
    this.states.set(key, state);
    this.notifyChange();
  }

  private notifyChange(): void {
    this.changeListeners.forEach((listener) => listener());
  }
}

export const printerManager = new PrinterManager();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot!.invalidate();
  });
  import.meta.hot.dispose(() => {
    void printerManager.disconnectAll();
  });
}
