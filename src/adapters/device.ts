import type { ByteStream, DiscoveryFilter, LinkSpec, TransportKind } from "../printing/profiles";

export type DiscoveredDevice = {
  /** 어댑터가 이 기기를 다시 찾는 키. */
  key: string;
  transport: TransportKind;
  name: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  /** 블루투스 주소. */
  address?: string;
};

export type DeviceSession = ByteStream & {
  close(): Promise<void>;
  /** 연결한 뒤에야 알 수 있는 링크 정보 (MTU 등). 진단용. */
  readonly describe?: string;
};

export interface DeviceTransport {
  readonly kind: TransportKind;
  list(filter?: DiscoveryFilter): Promise<DiscoveredDevice[]>;
  /** 사용자 선택 창이 필요한 전송만 구현한다. 없으면 목록이 곧 전부다. */
  request?(filter?: DiscoveryFilter): Promise<DiscoveredDevice | null>;
  open(key: string, link: LinkSpec): Promise<DeviceSession>;
}
