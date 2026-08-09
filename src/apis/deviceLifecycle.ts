import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../utils/platform";
import { printerManager } from "./printer";
import { serialManager } from "./serial";

let cleanupInFlight: Promise<void> | undefined;

/** 두 장치군 중 하나가 실패해도 나머지 정리는 끝까지 시도한다. */
export function closeAllDevices(): Promise<void> {
  cleanupInFlight ??= Promise.allSettled([
    serialManager.closeAll(),
    printerManager.disconnectAll(),
  ]).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") console.error("Device cleanup failed:", result.reason);
    }
  }).finally(() => {
    cleanupInFlight = undefined;
  });
  return cleanupInFlight;
}

/**
 * 브라우저의 pagehide 와 Tauri 창 닫기를 모두 처리한다.
 * React effect 정리에서는 리스너만 제거해 StrictMode 재마운트가 장치를 끊지 않게 한다.
 */
export function installDeviceCleanup(): () => void {
  const handlePageHide = () => { void closeAllDevices(); };
  window.addEventListener("pagehide", handlePageHide);

  let disposed = false;
  let unlistenClose: (() => void) | undefined;

  if (isTauri()) {
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await closeAllDevices();
      await appWindow.destroy();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenClose = unlisten;
    });
  }

  return () => {
    disposed = true;
    window.removeEventListener("pagehide", handlePageHide);
    unlistenClose?.();
  };
}
