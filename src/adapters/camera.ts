/** QR 인식에는 이 정도면 충분하고, 프레임당 변환·디코딩 비용이 크게 줄어든다. */
const DEFAULT_SCAN_WIDTH = 640;

export interface CameraInfo {
  id: string;
  label: string;
}

export interface CameraFrame {
  /** RGBA. 넘겨받은 쪽이 소유권을 가진다. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CameraStartOptions {
  deviceId?: string;
  /** 모바일에서만 의미가 있다. 기본은 후면 카메라. */
  facingMode?: "environment" | "user";
  scanWidth?: number;
}

export interface CameraSession {
  /** 미리보기용 엘리먼트. UI 가 DOM 에 붙여서 쓴다. */
  readonly preview: HTMLVideoElement;
  /** 다음 프레임 한 장. 세션이 끝났으면 null. */
  grab(): Promise<CameraFrame | null>;
  stop(): void;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

class MediaDevicesCameraSession implements CameraSession {
  private readonly canvas = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D;
  private stopped = false;
  private wakePendingFrame: (() => void) | null = null;

  readonly preview: HTMLVideoElement;
  private readonly stream: MediaStream;
  private readonly scanWidth: number;

  constructor(preview: HTMLVideoElement, stream: MediaStream, scanWidth: number) {
    this.preview = preview;
    this.stream = stream;
    this.scanWidth = scanWidth;

    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D 캔버스 컨텍스트를 만들 수 없습니다.");
    this.context = context;
  }

  /**
   * rVFC 가 있으면 디코딩된 프레임 단위로 깨어나 같은 프레임을 두 번 읽는 낭비가 없다.
   * 탭이 가려지면 rAF·rVFC 가 멈추므로, stop() 이 직접 깨울 수 있게 해제 함수를 남긴다.
   */
  private nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      const settle = () => {
        if (this.wakePendingFrame !== settle) return;
        this.wakePendingFrame = null;
        resolve();
      };
      this.wakePendingFrame = settle;

      const rvfc = (this.preview as FrameCallbackVideo).requestVideoFrameCallback;
      if (rvfc) rvfc.call(this.preview, settle);
      else requestAnimationFrame(settle);
    });
  }

  async grab(): Promise<CameraFrame | null> {
    if (this.stopped) return null;
    await this.nextFrame();
    if (this.stopped) return null;

    const { videoWidth, videoHeight } = this.preview;
    if (!videoWidth || !videoHeight) return null;

    const scale = Math.min(1, this.scanWidth / videoWidth);
    const width = Math.max(1, Math.round(videoWidth * scale));
    const height = Math.max(1, Math.round(videoHeight * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.context.drawImage(this.preview, 0, 0, width, height);
    const image = this.context.getImageData(0, 0, width, height);
    return { data: image.data, width, height };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.wakePendingFrame?.();
    this.stream.getTracks().forEach((track) => track.stop());
    this.preview.srcObject = null;
  }
}

/**
 * 시리얼·USB 와 달리 Tauri 분기가 없다. wry 가 WKWebView·Android WebView 의 카메라 권한
 * 요청을 대신 처리하고 프로덕션 origin(`tauri://localhost`, `http://tauri.localhost`)도
 * secure context 로 잡혀서, getUserMedia 하나로 웹·데스크톱·모바일이 모두 덮인다.
 *
 * 예외는 Linux 다. wry 가 WebKitGTK 의 permission-request 를 연결하지 않는 데다
 * enable-media-stream 설정도 켜지 않아 Tauri 로는 카메라를 못 연다. 라즈베리파이 같은
 * 리눅스 기기는 웹 빌드를 Chromium 키오스크로 띄우기로 했고, 그 경로에서는 이 구현이
 * 그대로 동작한다. 리눅스 Tauri 빌드에서는 카메라를 포기한다.
 */
export function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** 라벨은 권한이 있어야 채워지므로 startCamera() 이후에 부르는 편이 낫다. */
export async function listCameras(): Promise<CameraInfo[]> {
  if (!isCameraSupported()) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      id: device.deviceId,
      label: device.label || `카메라 ${index + 1}`,
    }));
}

export async function startCamera(options: CameraStartOptions = {}): Promise<CameraSession> {
  if (!isCameraSupported()) throw new Error("이 환경에서는 카메라를 쓸 수 없습니다.");

  // 미리보기는 넉넉한 해상도로 받고, 스캔은 축소한 프레임으로 한다.
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
  if (options.deviceId) video.deviceId = { exact: options.deviceId };
  else video.facingMode = { ideal: options.facingMode ?? "environment" };

  const stream = await navigator.mediaDevices.getUserMedia({ video });

  const element = document.createElement("video");
  element.playsInline = true;
  element.muted = true;
  element.autoplay = true;
  element.srcObject = stream;

  try {
    await new Promise<void>((resolve, reject) => {
      // srcObject 를 붙이자마자 메타데이터가 준비되는 경우가 있어 먼저 확인한다.
      if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return resolve();
      element.onloadedmetadata = () => resolve();
      element.onerror = () => reject(new Error("카메라 스트림을 재생할 수 없습니다."));
    });
    await element.play();
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    throw err;
  }

  return new MediaDevicesCameraSession(element, stream, options.scanWidth ?? DEFAULT_SCAN_WIDTH);
}
