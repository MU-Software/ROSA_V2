import { BROTHER_QL_820NWB } from "./brother";
import { GOOJPRT_PT390 } from "./goojprtPt390";
import { HPRT_SL43 } from "./hprtSl43";
import type { DeviceIdentity, DiscoveryFilter, LinkSpec, PrinterProfile } from "./types";

export * from "./types";
export { brotherGeometry, BROTHER_QL_820NWB, type BrotherLabelGeometry } from "./brother";
export { maxImageWidth } from "./common";
export { GOOJPRT_PT390 } from "./goojprtPt390";
export { HPRT_SL43 } from "./hprtSl43";

export const PRINTER_PROFILES: PrinterProfile[] = [BROTHER_QL_820NWB, HPRT_SL43, GOOJPRT_PT390];

const linkMatches = (link: LinkSpec | undefined, device: DeviceIdentity): boolean => {
  if (!link) return false;
  if ("matches" in link) {
    return link.matches.some((match) =>
      match.vendorId === device.vendorId && match.productId === device.productId
    );
  }
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
