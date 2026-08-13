import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, currentMonitor, type Monitor } from "@tauri-apps/api/window";
import { isLinux, isTauri } from "../utils/platform";

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

/** 이름은 비어 있는 출력이 있어 위치로 가른다. 배치가 겹치는 출력은 없다. */
const pickTargetMonitor = async (): Promise<Monitor | null> => {
  const monitors = await availableMonitors();
  if (monitors.length === 0) return null;
  const current = await currentMonitor();
  if (!current) return monitors[0];
  return monitors.find((monitor) =>
    monitor.position.x !== current.position.x || monitor.position.y !== current.position.y
  ) ?? monitors[0];
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

  // Wayland 는 클라이언트가 창 위치를 정하지 못하고, 맵될 때 이미 전체화면이면 컴포지터의
  // 배치 규칙도 거부된다. 리눅스에서는 배치와 전체화면을 모두 컴포지터에 맡긴다.
  const placeHere = !isLinux();
  const monitor = placeHere ? await pickTargetMonitor() : null;
  new WebviewWindow(EXTERNAL_DISPLAY_WINDOW_LABEL, {
    url: "index.html",
    title: "ROSA 외부 화면",
    decorations: false,
    fullscreen: placeHere,
    ...(monitor ? windowBoundsOf(monitor) : {}),
  });
};
