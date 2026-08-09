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

/** 종료 UI가 죽은 장치 하나 때문에 영원히 멈추지 않게 하되, 시작한 정리는 백그라운드에서 계속한다. */
export async function closeAllDevicesWithin(timeoutMs = 5000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const completed = await Promise.race([closeAllDevices().then(() => true as const), timeout]);
  clearTimeout(timer);
  if (!completed) console.warn(`Device cleanup did not finish within ${timeoutMs} ms`);
  return completed;
}

/**
 * 브라우저의 pagehide 와 Tauri 창 닫기를 모두 처리한다.
 * React effect 정리에서는 리스너만 제거해 StrictMode 재마운트가 장치를 끊지 않게 한다.
 */
export function installDeviceCleanup(): () => void {
  const handlePageHide = () => { void closeAllDevices(); };
  const handleBeforeUnload = () => { void closeAllDevices(); };
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handleBeforeUnload);

  let disposed = false;
  let destroying = false;
  let unlistenClose: (() => void) | undefined;

  if (isTauri()) {
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(async (event) => {
      if (destroying) return;
      event.preventDefault();
      destroying = true;
      try {
        await closeAllDevicesWithin();
      } finally {
        await appWindow.destroy();
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenClose = unlisten;
    }).catch((error: unknown) => {
      console.error("Failed to install native window cleanup:", error);
    });
  }

  return () => {
    disposed = true;
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    unlistenClose?.();
  };
}
