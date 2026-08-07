export interface QrPoint {
  x: number;
  y: number;
}

export interface QrCode {
  text: string;
  /** 좌상단부터 시계방향. 좌표계는 스캔에 쓴 프레임 기준이다. */
  corners: QrPoint[];
  /** QR 심볼 버전. 예 "3". 읽지 못하면 빈 문자열. */
  version: string;
  /** 오류 정정 수준. 예 "M". */
  eccLevel: string;
  /** ISO 18004:2015 의 미러 코드 */
  mirrored: boolean;
  /** 명암이 반전된 코드 */
  inverted: boolean;
}

export type QrWorkerInbound =
  | { type: "scan"; payload: { id: number; data: ArrayBuffer; width: number; height: number } }
  | { type: "dispose" };

export type QrWorkerOutbound =
  | { type: "result"; payload: { id: number; codes: QrCode[] } }
  | { type: "error"; payload: { id: number; message: string } };
