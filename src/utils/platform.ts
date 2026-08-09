/** 앱이 Tauri 웹뷰 안에서 도는가. 아니면 일반 브라우저다. */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isAndroid = (): boolean =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

export const isIos = (): boolean =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export const isLinux = (): boolean =>
  typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent) && !isAndroid();

export const isSerialSupported = (): boolean => {
  if (isAndroid() || isIos()) return false;
  if (isTauri()) return true;
  return typeof navigator !== "undefined" && "serial" in navigator;
};

export const isUsbSupported = (): boolean => {
  if (isAndroid() || isIos()) return false;
  if (isTauri()) return true;
  return typeof navigator !== "undefined" && "usb" in navigator;
};

export type QrInputMode = "camera" | "serial";

/** 제품 정책: 모바일은 카메라, 웹·데스크톱은 전용 Serial 리더로 QR을 받는다. */
export const getQrInputMode = (): QrInputMode => isAndroid() || isIos() ? "camera" : "serial";

export type PlatformCapability = { available: boolean; detail: string };

export type PlatformCapabilities = {
  platform: string;
  camera: PlatformCapability;
  serial: PlatformCapability;
  usb: PlatformCapability;
  bluetoothPrinter: PlatformCapability;
};

export function getPlatformCapabilities(): PlatformCapabilities {
  const mobile = isAndroid() || isIos();
  const platform = isAndroid()
    ? "Android (Tauri)"
    : isIos()
      ? "iOS (Tauri)"
      : isTauri()
        ? `Desktop Tauri${isLinux() ? " / Linux" : ""}`
        : "Web browser";
  const cameraAvailable = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !(isTauri() && isLinux());

  return {
    platform,
    camera: {
      available: cameraAvailable,
      detail: isTauri() && isLinux()
        ? "Linux Tauri(WebKitGTK)는 카메라 권한 흐름을 지원하지 않습니다. Chromium 웹 빌드를 사용하세요."
        : cameraAvailable ? "getUserMedia 사용 가능" : "보안 컨텍스트와 카메라 API가 필요합니다.",
    },
    serial: {
      available: isSerialSupported(),
      detail: mobile
        ? "모바일 빌드에서는 시리얼 스캐너를 지원하지 않습니다."
        : isTauri() ? "네이티브 시리얼 사용 가능" : "Web Serial을 지원하는 Chromium 계열 브라우저가 필요합니다.",
    },
    usb: {
      available: isUsbSupported(),
      detail: mobile
        ? "모바일 빌드에서는 USB 프린터를 지원하지 않습니다."
        : isTauri() ? "네이티브 libusb 사용 가능" : "WebUSB를 지원하는 Chromium 계열 브라우저가 필요합니다.",
    },
    bluetoothPrinter: {
      available: mobile,
      detail: isAndroid()
        ? "Bluetooth Classic SPP 사용 가능"
        : isIos() ? "Bluetooth LE 사용 가능" : "Bluetooth 프린터는 Android/iOS 앱에서 지원합니다.",
    },
  };
}
