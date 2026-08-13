import type { DeviceSession, DeviceTransport, DiscoveredDevice } from "../adapters/device";
import { hasTransportCode, toTransportError, type TransportError } from "../adapters/errors";
import { createPrinterTransports } from "../adapters/printer";
import {
  knownPrinterFilter,
  findProfile,
  findDiagnosticPrinterProfile,
  LABEL_GAP_MM_SETTING,
  LABEL_HEIGHT_MM_SETTING,
  LABEL_WIDTH_MM_SETTING,
  PRINT_PADDING_MM_SETTING,
  RIGHT_MARGIN_DOTS_SETTING,
  resolvePrinterSettings,
  validatePrintCopies,
  type CompletionProbe,
  type PrinterAction,
  type PrinterProfile,
  type PrinterProfileSettings,
  type ProbeResult,
} from "../printing/profiles";
import { RcptImage } from "../printing/receipet";
import {
  REGISTRATION_PRINT_KINDS,
  type RegistrationPrintKind,
} from "../printing/output";
import { toMessage } from "../utils/bytes";

const SETTINGS_STORAGE_KEY = "rosa.printer.settings";
const SETTINGS_STORAGE_VERSION = 5;
const REGISTRATION_STORAGE_KEY = "rosa.printer.registrations";
const REGISTRATION_STORAGE_VERSION = 1;

export type PrinterSettings = PrinterProfileSettings;

type StoredPrinterSettings = {
  version: typeof SETTINGS_STORAGE_VERSION;
  devices: Record<string, PrinterSettings>;
  /** 버전 1의 프로파일 단위 설정. 장치별 설정이 생길 때까지 기본값으로만 쓴다. */
  legacyProfiles: Record<string, PrinterSettings>;
  printRoutes?: Partial<Record<RegistrationPrintKind, string>>;
};

type LegacyPrinterSettings = {
  label?: { widthMm: number; heightMm: number; gapMm?: number };
  paddingMm?: number;
  rightMarginDots?: number;
};

type LegacyStoredPrinterSettings = {
  version: 2 | 3 | 4;
  devices?: Record<string, LegacyPrinterSettings>;
  legacyProfiles?: Record<string, LegacyPrinterSettings>;
  printRoutes?: Partial<Record<RegistrationPrintKind, string>>;
};

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

export type PrinterRestoreFailure = {
  device: PrinterDevice;
  reason: string;
};

export type PrinterRestoreSkipped = {
  device: PrinterDevice;
  reason: string;
};

export type PrinterRestoreResult = {
  connected: PrinterConnection[];
  failed: PrinterRestoreFailure[];
  skipped: PrinterRestoreSkipped[];
};

/** `sending` 은 바이트를 넘기는 중, `printing` 은 프린터가 소화하는 중. */
export type PrintPhase = "sending" | "printing";

export type PrintOptions = {
  copies?: number;
  onPhase?: (phase: PrintPhase) => void;
};

export type PrinterDiscoveryOptions = { includeUnknown?: boolean };

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

const parsePrinterSettings = (value: unknown): PrinterSettings | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([, setting]) => typeof setting !== "number" || !Number.isFinite(setting))) {
    return undefined;
  }
  return Object.fromEntries(entries) as PrinterSettings;
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

const parseLegacyPrinterSettings = (value: unknown): PrinterSettings | undefined => {
  if (!isRecord(value)) return undefined;
  const settings: Record<string, number> = {};
  if (typeof value.paddingMm === "number" && Number.isFinite(value.paddingMm)) {
    settings[PRINT_PADDING_MM_SETTING] = value.paddingMm;
  }
  if (typeof value.rightMarginDots === "number" && Number.isFinite(value.rightMarginDots)) {
    settings[RIGHT_MARGIN_DOTS_SETTING] = value.rightMarginDots;
  }
  if (isRecord(value.label)) {
    const { widthMm, heightMm, gapMm } = value.label;
    if (typeof widthMm === "number" && Number.isFinite(widthMm)) {
      settings[LABEL_WIDTH_MM_SETTING] = widthMm;
    }
    if (typeof heightMm === "number" && Number.isFinite(heightMm)) {
      settings[LABEL_HEIGHT_MM_SETTING] = heightMm;
    }
    if (typeof gapMm === "number" && Number.isFinite(gapMm)) {
      settings[LABEL_GAP_MM_SETTING] = gapMm;
    }
  }
  return settings;
};

const parseLegacySettingsMap = (value: unknown): Record<string, PrinterSettings> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, settings]) => {
      const parsed = parseLegacyPrinterSettings(settings);
      return parsed ? [[key, parsed]] : [];
    }),
  );
};

const parsePrintRoutes = (
  value: unknown,
): Partial<Record<RegistrationPrintKind, string>> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(REGISTRATION_PRINT_KINDS.flatMap((kind) =>
    typeof value[kind] === "string" ? [[kind, value[kind]]] : []));
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
  private printRoutes: Partial<Record<RegistrationPrintKind, string>> = {};
  private registrations = new Set<string>();
  private changeListeners = new Set<() => void>();
  private refreshings = new Map<boolean, Promise<PrinterDevice[]>>();

  constructor(transports: DeviceTransport[] = createPrinterTransports()) {
    this.transports = transports;
    this.loadSettings();
    this.loadRegistrations();
  }

  // ---------- 설정 ----------

  private loadSettings(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");
      if (!isRecord(raw)) return;
      const stored = raw as Partial<StoredPrinterSettings | LegacyStoredPrinterSettings>;
      if (stored.version === SETTINGS_STORAGE_VERSION) {
        this.settings = parseSettingsMap(stored.devices);
        this.legacyProfileSettings = parseSettingsMap(stored.legacyProfiles);
        this.printRoutes = parsePrintRoutes(stored.printRoutes);
      } else if (stored.version === 2 || stored.version === 3 || stored.version === 4) {
        this.settings = parseLegacySettingsMap(stored.devices);
        this.legacyProfileSettings = parseLegacySettingsMap(stored.legacyProfiles);
        this.printRoutes = parsePrintRoutes(stored.printRoutes);
        this.persistSettings();
      } else if ("version" in stored) {
        console.warn(`지원하지 않는 프린터 설정 버전입니다: ${String(stored.version)}`);
      } else {
        // 이전 형식은 `{ [profileId]: settings }` 였다. 첫 장치별 수정 전까지 기본값으로 유지한다.
        this.legacyProfileSettings = parseLegacySettingsMap(raw);
      }
    } catch (err) {
      console.error("Failed to load printer settings:", err);
    }
  }

  private deviceStorageId(device: PrinterDevice): string {
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
    const profile = this.connections.get(key)?.profile ?? device.profile;
    const stored = this.settings[this.deviceStorageId(device)] ??
      (profile ? this.legacyProfileSettings[profile.id] : undefined) ??
      EMPTY_SETTINGS;
    if (!profile) return stored;
    try {
      return resolvePrinterSettings(profile, stored);
    } catch (reason) {
      console.warn(`잘못된 ${profile.name} 설정을 기본값으로 대체합니다`, reason);
      return resolvePrinterSettings(profile, EMPTY_SETTINGS);
    }
  }

  updateSettings(key: string, patch: PrinterSettings): void {
    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    const profile = this.connections.get(key)?.profile ?? device.profile;
    if (!profile) throw new Error(`"${device.name}" 은 지원하는 프린터가 아닙니다`);
    const id = this.deviceStorageId(device);
    const settings = { ...this.getSettings(key), ...patch };
    this.settings[id] = resolvePrinterSettings(profile, settings);
    this.persistSettings();
    this.notifyChange();
  }

  private persistSettings(): void {
    if (typeof localStorage === "undefined") return;
    const stored: StoredPrinterSettings = {
      version: SETTINGS_STORAGE_VERSION,
      devices: this.settings,
      legacyProfiles: this.legacyProfileSettings,
      printRoutes: this.printRoutes,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
  }

  private loadRegistrations(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(REGISTRATION_STORAGE_KEY) ?? "{}");
      if (!isRecord(raw) || raw.version !== REGISTRATION_STORAGE_VERSION || !Array.isArray(raw.devices)) return;
      this.registrations = new Set(raw.devices.filter((value): value is string => typeof value === "string"));
    } catch (err) {
      console.error("Failed to load printer registrations:", err);
    }
  }

  private persistRegistrations(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify({
      version: REGISTRATION_STORAGE_VERSION,
      // WebUSB 세션 키는 다음 실행에서 다른 장치를 가리킬 수 있어 영구 저장하지 않는다.
      devices: [...this.registrations].filter((id) => !id.includes(":key:")),
    }));
  }

  // ---------- 기기 ----------

  canRequestDevice(): boolean {
    return this.transports.some((transport) => transport.request !== undefined);
  }

  listDevices(): PrinterDevice[] {
    return [...this.devices.values()];
  }

  listRegisteredDevices(): PrinterDevice[] {
    const order = new Map([...this.registrations].map((id, index) => [id, index]));
    return this.listDevices()
      .filter((device) => this.registrations.has(this.deviceStorageId(device)))
      .sort((left, right) =>
        (order.get(this.deviceStorageId(left)) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(this.deviceStorageId(right)) ?? Number.MAX_SAFE_INTEGER));
  }

  getPrintRoute(kind: RegistrationPrintKind): PrinterDevice | undefined {
    const route = this.printRoutes[kind];
    if (!route) return undefined;
    return this.listRegisteredDevices().find((device) => this.deviceStorageId(device) === route);
  }

  hasPrintRoute(kind: RegistrationPrintKind): boolean {
    return this.printRoutes[kind] !== undefined;
  }

  updatePrintRoute(kind: RegistrationPrintKind, key: string | null): void {
    if (key === null) {
      delete this.printRoutes[kind];
    } else {
      const device = this.devices.get(key);
      if (!device || !this.isRegistered(key)) {
        throw new Error(`등록된 프린터 "${key}" 를 찾지 못했습니다`);
      }
      this.printRoutes[kind] = this.deviceStorageId(device);
    }
    this.persistSettings();
    this.notifyChange();
  }

  isRegistered(key: string): boolean {
    const device = this.devices.get(key);
    return !!device && this.registrations.has(this.deviceStorageId(device));
  }

  registerDevice(key: string): PrinterDevice {
    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    if (!device.profile) throw new Error(`"${device.name}" 은 지원하는 프린터가 아닙니다`);
    this.registrations.add(this.deviceStorageId(device));
    this.persistRegistrations();
    this.notifyChange();
    return device;
  }

  async removeDevice(key: string): Promise<void> {
    const device = this.devices.get(key);
    if (!device) return;
    await this.disconnect(key);
    const id = this.deviceStorageId(device);
    this.registrations.delete(id);
    for (const kind of REGISTRATION_PRINT_KINDS) {
      if (this.printRoutes[kind] === id) delete this.printRoutes[kind];
    }
    delete this.settings[id];
    this.persistRegistrations();
    this.persistSettings();
    this.notifyChange();
  }

  async refresh(options: PrinterDiscoveryOptions = {}): Promise<PrinterDevice[]> {
    const includeUnknown = options.includeUnknown ?? false;
    const current = this.refreshings.get(includeUnknown);
    if (current) return current;
    const refreshing = this.runRefresh(includeUnknown).finally(() => {
      if (this.refreshings.get(includeUnknown) === refreshing) this.refreshings.delete(includeUnknown);
    });
    this.refreshings.set(includeUnknown, refreshing);
    return refreshing;
  }

  private async runRefresh(includeUnknown: boolean): Promise<PrinterDevice[]> {
    const found = new Map<string, PrinterDevice>();
    const filter = includeUnknown ? undefined : knownPrinterFilter();

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

  /** 등록되어 있고 현재 발견되는 프린터를 다시 열어 실제 연결 상태까지 복원한다. */
  async restoreRegisteredConnections(): Promise<PrinterRestoreResult> {
    await this.refresh();
    const registered = this.listRegisteredDevices();
    const connected: PrinterConnection[] = [];
    const failed: PrinterRestoreFailure[] = [];
    const skipped: PrinterRestoreSkipped[] = [];
    const groups = new Map<DeviceTransport, PrinterDevice[]>();
    registered.forEach((device) => {
      const group = groups.get(device.transportRef) ?? [];
      group.push(device);
      groups.set(device.transportRef, group);
    });

    await Promise.all([...groups].map(async ([transport, devices]) => {
      const maxConnections = transport.maxConnections;
      if (maxConnections === undefined) {
        const results = await Promise.allSettled(devices.map((device) => this.connect(device.key)));
        results.forEach((result, index) => {
          const device = devices[index];
          if (!device) return;
          if (result.status === "fulfilled") connected.push(result.value);
          else failed.push({ device, reason: toMessage(result.reason) });
        });
        return;
      }

      const alreadyConnected = devices.filter((device) => this.isConnected(device.key));
      alreadyConnected.forEach((device) => {
        const connection = this.getConnection(device.key);
        if (connection) connected.push(connection);
      });
      let remaining = Math.max(0, maxConnections - alreadyConnected.length);

      for (const device of devices) {
        if (this.isConnected(device.key)) continue;
        if (remaining === 0) {
          skipped.push({
            device,
            reason: `${transport.kind.toUpperCase()} 전송은 동시에 ${maxConnections}대까지만 연결할 수 있습니다`,
          });
          continue;
        }
        try {
          connected.push(await this.connect(device.key));
          remaining -= 1;
        } catch (reason) {
          failed.push({ device, reason: toMessage(reason) });
          // 연결에 실패했으므로 다음 등록 장치가 이 슬롯을 시도한다.
        }
      }
    }));

    return { connected, failed, skipped };
  }

  /** WebUSB 처럼 사용자가 골라야 하는 전송에서 기기 하나를 추가한다. */
  async requestDevice(options: PrinterDiscoveryOptions = {}): Promise<PrinterDevice | null> {
    for (const transport of this.transports) {
      if (!transport.request) continue;
      const info = await transport.request(options.includeUnknown ? undefined : knownPrinterFilter());
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
    const connection = this.connections.get(key);
    if (!connection) return undefined;
    return {
      key: connection.key,
      profile: connection.profile,
      probe: connection.probe,
      link: connection.link,
    };
  }

  async connect(key: string): Promise<PrinterConnection> {
    return this.connectWithProfile(key);
  }

  async connectForDiagnostics(key: string, profileId: string): Promise<PrinterConnection> {
    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    const profile = findDiagnosticPrinterProfile(profileId, device.transport);
    if (!profile) throw new Error(`"${profileId}" 진단 언어는 ${device.transport} 연결을 지원하지 않습니다`);

    const existing = this.connections.get(key);
    if (existing?.profile.id === profile.id) return existing;
    if (existing) await this.disconnect(key);
    return this.connectWithProfile(key, profile);
  }

  private async connectWithProfile(key: string, profileOverride?: PrinterProfile): Promise<PrinterConnection> {
    const existing = this.connections.get(key);
    if (existing) return existing;
    const pending = this.connecting.get(key);
    if (pending) return pending;

    this.setState(key, { status: "connecting" });
    const opening = this.openConnection(key, profileOverride);
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

  private async openConnection(key: string, profileOverride?: PrinterProfile): Promise<PrinterConnection> {
    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    const profile = profileOverride ?? device.profile;
    if (!profile) throw new Error(`"${device.name}" 은 지원하는 프린터가 아닙니다`);

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

  async transact(key: string, request: Uint8Array, responseLength = 0, timeoutMs = 1000): Promise<Uint8Array> {
    const connection = this.requireConnection(key);
    const run = connection.queue.then(async () => {
      if (this.connections.get(key) !== connection) throw new Error(`프린터 "${key}" 연결이 끊겼습니다`);
      if (request.length > 0) await connection.session.write(request);
      return responseLength > 0
        ? connection.session.read(responseLength, timeoutMs)
        : new Uint8Array();
    });
    connection.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  // ---------- 인쇄 ----------

  /**
   * 프린터가 인쇄 가능 영역을 알려주면 그 값이 이긴다 — 미디어 크기로 그리면 인쇄가
   * 라벨을 넘친다. 높이를 아무 데서도 알 수 없으면 `undefined` 로 두고 호출자가 정한다.
   */
  private physicalImageSize(key: string): { width: number; height?: number } {
    const connection = this.requireConnection(key);
    const settings = this.getSettings(key);
    return connection.profile.canvasSize({ probe: connection.probe, settings });
  }

  private paddingDots(key: string): number {
    const connection = this.requireConnection(key);
    const paddingMm = this.getSettings(key)[PRINT_PADDING_MM_SETTING];
    if (paddingMm === undefined) throw new Error(`프린터 "${key}" 의 인쇄 패딩 설정이 없습니다`);
    return Math.round(paddingMm * connection.profile.dotsPerMm);
  }

  imageSize(key: string): { width: number; height?: number } {
    const physical = this.physicalImageSize(key);
    const padding = this.paddingDots(key);
    const width = physical.width - padding * 2;
    const height = physical.height === undefined ? undefined : physical.height - padding * 2;
    if (width <= 0 || (height !== undefined && height <= 0)) {
      throw new Error(`프린터 "${key}" 의 라벨보다 인쇄 패딩이 큽니다`);
    }
    return { width, ...(height === undefined ? {} : { height }) };
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
    const copies = options.copies ?? 1;
    validatePrintCopies(copies);
    resolvePrinterSettings(connection.profile, settings);
    const physical = this.physicalImageSize(key);
    const padding = this.paddingDots(key);
    const contentWidth = physical.width - padding * 2;
    const contentHeight = physical.height === undefined ? image.height : physical.height - padding * 2;
    if (image.width > contentWidth || image.height > contentHeight) {
      throw new Error(
        `이미지가 패딩을 제외한 인쇄 영역보다 큽니다: ${image.width}x${image.height} > ${contentWidth}x${contentHeight} dots`,
      );
    }

    const padded = await RcptImage.create(physical.width, physical.height ?? image.height + padding * 2);
    const x = padding + Math.floor((contentWidth - image.width) / 2);
    const y = padding + Math.floor((contentHeight - image.height) / 2);
    const { data, stride } = image.readBitmap();
    for (let row = 0; row < image.height; row += 1) {
      for (let col = 0; col < image.width; col += 1) {
        const ink = (data[row * stride + (col >> 3)] >> (7 - (col & 7))) & 1;
        if (ink) padded.setPixel(x + col, y + row, true);
      }
    }

    let job: Uint8Array;
    try {
      job = connection.profile.buildJob({
        image: padded,
        copies,
        probe: connection.probe,
        settings,
      });
    } finally {
      padded.free();
    }

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
        const reply = await connection.session.read(
          probe.length,
          probe.responseTimeoutMs ?? probe.intervalMs,
        );
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
