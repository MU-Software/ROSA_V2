import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, currentMonitor, type Monitor } from "@tauri-apps/api/window";
import { isTauri } from "../utils/platform";

export const EXTERNAL_DISPLAY_WINDOW_LABEL = "external-display";
export const EXTERNAL_DISPLAY_PATH = "/display";

/** 임베드된 자산에 `/display` 가 없어 Tauri 창은 `index.html` 로 열고 라벨로 구분한다. */
export const isExternalDisplayWindow = (): boolean => {
  if (window.location.pathname === EXTERNAL_DISPLAY_PATH) return true;
  if (!isTauri()) return false;
  try {
    return getCurrentWebviewWindow().label === EXTERNAL_DISPLAY_WINDOW_LABEL;
  } catch {
    return false;
  }
};

const pickTargetMonitor = async (): Promise<Monitor | null> => {
  const monitors = await availableMonitors();
  if (monitors.length === 0) return null;
  const current = await currentMonitor();
  return monitors.find((monitor) => monitor.name !== current?.name) ?? monitors[0];
};

/** 창 옵션은 논리 좌표, 모니터 값은 물리 픽셀이다. */
const windowBoundsOf = (monitor: Monitor) => ({
  x: Math.round(monitor.position.x / monitor.scaleFactor),
  y: Math.round(monitor.position.y / monitor.scaleFactor),
  width: Math.round(monitor.size.width / monitor.scaleFactor),
  height: Math.round(monitor.size.height / monitor.scaleFactor),
});

/** Tauri 웹뷰는 `target="_blank"` 로 새 창을 만들지 않아 직접 만든다. */
export const openExternalDisplay = async (): Promise<void> => {
  if (!isTauri()) {
    window.open(EXTERNAL_DISPLAY_PATH, "_blank", "noreferrer");
    return;
  }

  const existing = await WebviewWindow.getByLabel(EXTERNAL_DISPLAY_WINDOW_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const monitor = await pickTargetMonitor();
  new WebviewWindow(EXTERNAL_DISPLAY_WINDOW_LABEL, {
    url: "index.html",
    title: "ROSA 외부 화면",
    decorations: false,
    fullscreen: true,
    ...(monitor ? windowBoundsOf(monitor) : {}),
  });
};
