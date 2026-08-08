import type { DeviceSession, DeviceTransport, DiscoveredDevice } from "../adapters/device";
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

/** 프린터가 스스로 알려주지 못해 사용자가 정해야 하는 값들. 프로파일 단위로 저장한다. */
export type PrinterSettings = {
  label?: LabelSpec;
  /** 눈금자로 보정한 값. */
  rightMarginDots?: number;
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
};

/** 매번 새 객체를 돌려주면 구독자가 값이 바뀐 줄 알고 다시 그린다. */
const EMPTY_SETTINGS: PrinterSettings = Object.freeze({});

/**
 * PT-390 실측은 잡 크기와 거의 무관하게 4.7~5.5 초였다. 고정 비용이 지배하므로 고정
 * 15 초를 깔고 한계 20 KB/s 를 더한다 — 실측의 3 배 여유를 두면서도 멈춘 프린터를
 * 20 초 안에 알린다.
 */
const completionTimeoutMs = (jobBytes: number): number => 15_000 + (jobBytes / 20_480) * 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 완료 질의의 무응답은 "아직 인쇄 중" 이고, 그 밖의 실패는 다시 물어도 소용없다. */
const isTimeout = (err: unknown): boolean => /시간을 초과|timed? ?out/i.test(toMessage(err));

export class PrinterManager {
  private readonly transports: DeviceTransport[];
  private devices = new Map<string, PrinterDevice>();
  private connections = new Map<string, ActiveConnection>();
  private settings: Record<string, PrinterSettings> = {};
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
      if (raw && typeof raw === "object") this.settings = raw as Record<string, PrinterSettings>;
    } catch (err) {
      console.error("Failed to load printer settings:", err);
    }
  }

  getSettings(profileId: string): PrinterSettings {
    return this.settings[profileId] ?? EMPTY_SETTINGS;
  }

  updateSettings(profileId: string, patch: PrinterSettings): void {
    this.settings[profileId] = { ...this.getSettings(profileId), ...patch };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    }
    this.notifyChange();
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

  getConnection(key: string): PrinterConnection | undefined {
    return this.connections.get(key);
  }

  async connect(key: string): Promise<PrinterConnection> {
    const existing = this.connections.get(key);
    if (existing) return existing;

    const device = this.devices.get(key);
    if (!device) throw new Error(`프린터 "${key}" 가 목록에 없습니다`);
    if (!device.profile) throw new Error(`"${device.name}" 은 지원하는 프린터가 아닙니다`);

    const profile = device.profile;
    const transport = device.transportRef;
    const link = profile.links[transport.kind];
    if (!link) throw new Error(`${profile.name} 은 ${transport.kind} 로 연결할 수 없습니다`);

    const session = await transport.open(key, link);
    const connection: ActiveConnection = { key, profile, session, link: session.describe, queue: Promise.resolve() };
    this.connections.set(key, connection);
    this.notifyChange();

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
    const connection = this.connections.get(key);
    if (!connection) return;
    this.connections.delete(key);
    this.notifyChange();
    try {
      await connection.session.close();
    } catch (err) {
      console.warn(`Failed to close printer "${key}":`, toMessage(err));
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((key) => this.disconnect(key)));
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
    const settings = this.getSettings(connection.profile.id);
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
    const settings = this.getSettings(connection.profile.id);

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
    options.onPhase?.("sending");
    await connection.session.write(job);

    const probe = connection.profile.completionProbe;
    if (!probe) return;

    options.onPhase?.("printing");
    await this.waitUntilIdle(connection, probe, completionTimeoutMs(job.length));
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
        if (!isTimeout(err)) throw err;
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
