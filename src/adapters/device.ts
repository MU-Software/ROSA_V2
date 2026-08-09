import type { ByteStream, DiscoveryFilter, LinkSpec, TransportKind } from "../printing/profiles";
import { TransportError, toTransportError } from "./errors";

export type DiscoveredDevice = {
  /** 어댑터가 이 기기를 다시 찾는 키. */
  key: string;
  transport: TransportKind;
  name: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  /** 재연결 뒤에도 유지되는 물리 포트/장치 식별자. 전송이 보장할 수 있을 때만 있다. */
  physicalId?: string;
  /** 블루투스 주소. */
  address?: string;
};

export type DeviceSession = ByteStream & {
  close(): Promise<void>;
  onDisconnect(listener: (error: TransportError) => void): () => void;
  /** 연결한 뒤에야 알 수 있는 링크 정보 (MTU 등). 진단용. */
  readonly describe?: string;
};

/** 세션 구현마다 같은 방식으로 예상치 못한 연결 해제를 한 번만 전달한다. */
export function createDisconnectSignal() {
  const listeners = new Set<(error: TransportError) => void>();
  let expectedClose = false;
  let disconnected: TransportError | undefined;

  return {
    onDisconnect: (listener: (error: TransportError) => void): (() => void) => {
      listeners.add(listener);
      if (disconnected) queueMicrotask(() => listener(disconnected!));
      return () => { listeners.delete(listener); };
    },
    emit(error: unknown): void {
      if (expectedClose || disconnected) return;
      disconnected = toTransportError(error, "disconnected");
      listeners.forEach((listener) => listener(disconnected!));
    },
    expectClose(): void {
      expectedClose = true;
    },
  };
}

export interface DeviceTransport {
  readonly kind: TransportKind;
  /** 생략하면 여러 장치를 동시에 열 수 있다. */
  readonly maxConnections?: number;
  list(filter?: DiscoveryFilter): Promise<DiscoveredDevice[]>;
  /** 사용자 선택 창이 필요한 전송만 구현한다. 없으면 목록이 곧 전부다. */
  request?(filter?: DiscoveryFilter): Promise<DiscoveredDevice | null>;
  open(key: string, link: LinkSpec): Promise<DeviceSession>;
}
