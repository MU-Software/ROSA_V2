import { BROTHER_QL_820NWB } from "./brother";
import { GOOJPRT_PT390 } from "./goojprtPt390";
import { HPRT_SL43 } from "./hprtSl43";
import type { PrinterProfile, TransportKind, UsbLink } from "./types";

const GENERIC_USB_LINK: UsbLink = { matches: [], chunkBytes: 4096 };

const ESC_POS_PROFILE: PrinterProfile = {
  id: "diagnostic-escpos",
  name: "ESC/POS",
  links: {
    usb: GENERIC_USB_LINK,
    btspp: GOOJPRT_PT390.links.btspp,
    ble: GOOJPRT_PT390.links.ble,
  },
  mediaSizeSource: GOOJPRT_PT390.mediaSizeSource,
  settings: GOOJPRT_PT390.settings,
  dotsPerMm: GOOJPRT_PT390.dotsPerMm,
  canvasSize: (request) => GOOJPRT_PT390.canvasSize(request),
  validateSettings: (settings) => GOOJPRT_PT390.validateSettings?.(settings),
  buildJob: (request) => GOOJPRT_PT390.buildJob(request),
};

const TSPL_PROFILE: PrinterProfile = {
  id: "diagnostic-tspl",
  name: "TSPL",
  links: { usb: GENERIC_USB_LINK },
  mediaSizeSource: HPRT_SL43.mediaSizeSource,
  settings: HPRT_SL43.settings,
  dotsPerMm: HPRT_SL43.dotsPerMm,
  canvasSize: (request) => HPRT_SL43.canvasSize(request),
  validateSettings: (settings) => HPRT_SL43.validateSettings?.(settings),
  buildJob: (request) => HPRT_SL43.buildJob(request),
};

const BROTHER_RASTER_PROFILE: PrinterProfile = {
  id: "diagnostic-brother-raster",
  name: "Brother 래스터",
  links: { usb: GENERIC_USB_LINK },
  mediaSizeSource: BROTHER_QL_820NWB.mediaSizeSource,
  settings: BROTHER_QL_820NWB.settings,
  dotsPerMm: BROTHER_QL_820NWB.dotsPerMm,
  canvasSize: (request) => BROTHER_QL_820NWB.canvasSize(request),
  validateSettings: (settings) => BROTHER_QL_820NWB.validateSettings?.(settings),
  completionProbe: BROTHER_QL_820NWB.completionProbe,
  probe: (io) => BROTHER_QL_820NWB.probe!(io),
  buildJob: (request) => BROTHER_QL_820NWB.buildJob(request),
};

export const DIAGNOSTIC_PRINTER_PROFILES = [
  ESC_POS_PROFILE,
  TSPL_PROFILE,
  BROTHER_RASTER_PROFILE,
] as const;

export const findDiagnosticPrinterProfile = (
  id: string,
  transport: TransportKind,
): PrinterProfile | undefined => DIAGNOSTIC_PRINTER_PROFILES.find(
  (profile) => profile.id === id && profile.links[transport] !== undefined,
);
