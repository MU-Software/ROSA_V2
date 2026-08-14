import { BROTHER_QL_720NW, BROTHER_QL_820NWB } from "./brother";
import { GOOJPRT_PT390 } from "./goojprtPt390";
import { HPRT_SL43 } from "./hprtSl43";
import type { DeviceIdentity, DiscoveryFilter, LinkSpec, PrinterProfile } from "./types";

export * from "./types";
export { brotherGeometry, BROTHER_QL_720NW, BROTHER_QL_820NWB, type BrotherLabelGeometry } from "./brother";
export {
  LABEL_GAP_MM_SETTING,
  LABEL_HEIGHT_MM_SETTING,
  LABEL_WIDTH_MM_SETTING,
  MAX_PRINT_COPIES,
  PRINT_PADDING_MM_SETTING,
  PRINT_PADDING_SETTING_FIELD,
  RIGHT_MARGIN_DOTS_SETTING,
  labelSpecFromSettings,
  manualLabelSettingFields,
  printerSetting,
  resolvePrinterSettings,
  validateLabelSpec,
  validateManualLabelSettings,
  validatePrintCopies,
  validateRightMarginDots,
} from "./common";
export { GOOJPRT_PT390 } from "./goojprtPt390";
export { HPRT_SL43 } from "./hprtSl43";
export { DIAGNOSTIC_PRINTER_PROFILES, findDiagnosticPrinterProfile } from "./diagnostic";

export const PRINTER_PROFILES: PrinterProfile[] = [
  BROTHER_QL_720NW,
  BROTHER_QL_820NWB,
  HPRT_SL43,
  GOOJPRT_PT390,
];

/** 16/32-bit 축약 UUID와 대소문자가 달라도 같은 Bluetooth UUID로 비교한다. */
const normalizeBluetoothUuid = (uuid: string): string => {
  const compact = uuid.trim().replace(/[{}-]/g, "").toLowerCase();
  if (/^[0-9a-f]{4}$/.test(compact)) return `0000${compact}00001000800000805f9b34fb`;
  if (/^[0-9a-f]{8}$/.test(compact)) return `${compact}00001000800000805f9b34fb`;
  return compact;
};

const linkMatches = (link: LinkSpec | undefined, device: DeviceIdentity): boolean => {
  if (!link) return false;
  if ("matches" in link) {
    return link.matches.some((match) =>
      match.vendorId === device.vendorId && match.productId === device.productId
    );
  }
  if ("service" in link && device.bleServices?.some(
    (service) => normalizeBluetoothUuid(service) === normalizeBluetoothUuid(link.service),
  )) return true;
  return link.namePattern.test(device.name);
};

export const findProfile = (device: DeviceIdentity): PrinterProfile | undefined =>
  PRINTER_PROFILES.find((profile) => linkMatches(profile.links[device.transport], device));

/** 프로파일에 등록된 기종만 찾는 조건. 인자 없이 전송의 `list()` 를 부르면 전부 보인다. */
export const knownPrinterFilter = (): DiscoveryFilter => ({
  usbMatches: PRINTER_PROFILES.flatMap((profile) => profile.links.usb?.matches ?? []),
  bleServices: PRINTER_PROFILES.map((profile) => profile.links.ble?.service).filter((value): value is string => !!value),
  sppNamePatterns: PRINTER_PROFILES.map((profile) => profile.links.btspp?.namePattern)
    .filter((value): value is RegExp => !!value),
});
