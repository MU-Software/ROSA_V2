import * as blec from "@mnlphlp/plugin-blec";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_READ_TIMEOUT_MS, type BleLink, type DiscoveryFilter, type LinkSpec, type SppLink } from "../printing/profiles";
import { fromBase64, toBase64 } from "../utils/bytes";
import { isAndroid, isIos } from "../utils/platform";
import type { DeviceSession, DeviceTransport, DiscoveredDevice } from "./device";

// ---------- Android Bluetooth SPP ----------

type SppDevice = { address: string; name: string; deviceClass: number; isImaging: boolean; isBonded?: boolean };

class SppTransport implements DeviceTransport {
  readonly kind = "btspp" as const;

  async ensurePermission(): Promise<boolean> {
    const state = await invoke<Record<string, string>>("plugin:bluetooth-spp|check_permissions");
    if (state.bluetooth === "granted") return true;
    const requested = await invoke<Record<string, string>>("plugin:bluetooth-spp|request_permissions");
    return requested.bluetooth === "granted";
  }

  async list(): Promise<DiscoveredDevice[]> {
    if (!(await this.ensurePermission())) throw new Error("블루투스 권한이 거부되었습니다");
    const { devices } = await invoke<{ devices: SppDevice[] }>("plugin:bluetooth-spp|list_devices");
    return devices.map((device) => ({
      key: device.address,
      transport: this.kind,
      name: device.name,
      address: device.address,
    }));
  }

  async open(key: string, link: LinkSpec): Promise<DeviceSession> {
    const { chunkBytes } = link as SppLink;
    if (!(await this.ensurePermission())) throw new Error("블루투스 권한이 거부되었습니다");
    // RFCOMM 은 classic 본딩 없이는 PAGE_TIMEOUT 으로 실패하고, 그 오류만 보고는 원인을 알 수 없다.
    await invoke("plugin:bluetooth-spp|open", { address: key, autoPair: true });

    return {
      write: async (data) => {
        await invoke("plugin:bluetooth-spp|write", { address: key, data: toBase64(data), chunkBytes });
      },
      read: async (length, timeoutMs = DEFAULT_READ_TIMEOUT_MS) => {
        const { data } = await invoke<{ data: string }>("plugin:bluetooth-spp|read", { address: key, length, timeoutMs });
        return fromBase64(data);
      },
      close: async () => {
        await invoke("plugin:bluetooth-spp|close", { address: key });
      },
    };
  }
}

// ---------- Bluetooth LE ----------

/** ATT 헤더. 한 번에 보낼 수 있는 페이로드는 MTU 에서 이만큼을 뺀 값이다. */
const BLE_ATT_OVERHEAD = 3;
/** 협상 전 기본값. 이 값이 그대로 보고되면 실제 MTU 를 모른다는 뜻이다. */
const BLE_DEFAULT_MTU = 23;
const BLE_SCAN_MS = 8000;

class BleTransport implements DeviceTransport {
  readonly kind = "ble" as const;
  private inbox: number[] = [];

  /**
   * 아는 프린터가 보이는 즉시 스캔을 끊는다 — 8 초를 다 기다릴 이유가 없다. 대가로 첫
   * 기기 직후에 나타난 두 번째 프린터는 놓칠 수 있고, 다시 검색하면 잡힌다.
   */
  async list(filter?: DiscoveryFilter): Promise<DiscoveredDevice[]> {
    if (!(await blec.checkPermissions(true))) throw new Error("블루투스 권한이 거부되었습니다");

    let found: DiscoveredDevice[] = [];
    let onFirstHit: (() => void) | undefined;
    const firstHit = new Promise<void>((resolve) => {
      onFirstHit = resolve;
    });

    // startScan 이 타임아웃까지 블록하는지 즉시 돌아오는지 문서가 분명하지 않아
    // await 하지 않는다 — 블록한다면 await 가 조기 종료를 막는다.
    const services = filter?.bleServices;
    const scanning = blec.startScan((devices) => {
      found = devices
        .filter((device) => !services || device.services.some((uuid) => services.includes(uuid.toLowerCase())))
        .map((device) => ({
          key: device.address,
          transport: this.kind,
          name: device.name || device.address,
          address: device.address,
        }));
      if (found.length > 0) onFirstHit?.();
    }, BLE_SCAN_MS);

    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, BLE_SCAN_MS);
    });

    // 스캔 실패는 알아야 하지만, 성공은 "시작됐다" 는 뜻일 뿐이라 경쟁에서
    // 이기면 안 된다 — 즉시 반환하는 구현이면 스캔이 켜지자마자 꺼진다.
    const scanFailure = scanning.then(() => new Promise<never>(() => undefined));

    try {
      await Promise.race([firstHit, timeout, scanFailure]);
    } finally {
      clearTimeout(deadline);
      try {
        await blec.stopScan();
      } catch {
        /* 이미 끝났다 */
      }
    }
    return found;
  }

  async open(key: string, link: LinkSpec): Promise<DeviceSession> {
    const ble = link as BleLink;

    await blec.connect(key, () => {
      this.inbox = [];
    });

    this.inbox = [];
    await blec.subscribe(ble.notifyCharacteristic, ble.service, (data) => {
      this.inbox.push(...data);
    });

    // iOS 는 연결할 때 알아서 협상하지만 blec 이 그 값을 못 읽고 기본값을 돌려준다.
    // 그대로 믿으면 20 B 씩 쓰게 되어 8 배 느려지므로 프로파일의 실측값으로 간다.
    let mtu = BLE_DEFAULT_MTU;
    try {
      mtu = await blec.getMtu();
    } catch {
      /* 못 읽으면 프로파일 값으로 간다 */
    }
    const negotiated = mtu > BLE_DEFAULT_MTU;
    const chunk = negotiated ? mtu - BLE_ATT_OVERHEAD : ble.chunkBytes;

    return {
      describe: `청크 ${chunk} B (${negotiated ? `MTU ${mtu}` : "MTU 미보고 — 프로파일 값"})`,

      write: async (data) => {
        for (let at = 0; at < data.length; at += chunk) {
          // withoutResponse 는 호스트 큐에만 쌓여 전송 완료 시점을 알 수 없다.
          await blec.send(ble.writeCharacteristic, [...data.subarray(at, at + chunk)], "withResponse", ble.service);
        }
      },

      read: async (length, timeoutMs = DEFAULT_READ_TIMEOUT_MS) => {
        const deadline = Date.now() + timeoutMs;
        while (this.inbox.length < length) {
          if (Date.now() >= deadline) {
            throw new Error(`BLE 읽기가 시간을 초과했습니다: ${this.inbox.length} / ${length} B`);
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return Uint8Array.from(this.inbox.splice(0, length));
      },

      close: async () => {
        try {
          await blec.unsubscribe(ble.notifyCharacteristic, ble.service);
        } catch {
          /* 이미 끊겼다 */
        }
        await blec.disconnect();
      },
    };
  }
}

/**
 * 이 플랫폼에서 블루투스로 프린터에 닿는 방법. 없으면 null.
 *
 * Android 는 Classic SPP 를 쓴다 — btleplug 의 Android BLE 백엔드가 MTU 협상에
 * 실패한다. iOS 는 Classic 이 MFi 로 막혀 있어 BLE 뿐이다. 데스크톱 블루투스는 아직 없다.
 */
export const createBluetoothTransport = (): DeviceTransport | null => {
  if (isAndroid()) return new SppTransport();
  if (isIos()) return new BleTransport();
  return null;
};
