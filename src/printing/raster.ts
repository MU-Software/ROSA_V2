import { RcptImage } from "./receipet";

/** 벤더 SDK 와 같은 이진화 결과를 내는 가중치. */
const [WEIGHT_R, WEIGHT_G, WEIGHT_B] = [30, 59, 11];
const THRESHOLD = 128;

/**
 * 흰 픽셀은 건드리지 않아 겹쳐 그릴 수 있다. 반투명 픽셀은 흰 배경에 합성한다 —
 * 캔버스의 빈 곳이 알파 0 이라 그대로 휘도를 재면 전부 검정이 된다.
 */
export function drawImageData(
  target: RcptImage,
  source: ImageData,
  { x = 0, y = 0 }: { x?: number; y?: number } = {},
): void {
  const { data, width, height } = source;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      const alpha = data[i + 3];
      if (alpha === 0) continue;

      const luma = ((data[i] * WEIGHT_R + data[i + 1] * WEIGHT_G + data[i + 2] * WEIGHT_B) / 100) | 0;
      const composited = alpha === 255 ? luma : 255 - (((255 - luma) * alpha) / 255 | 0);
      if (composited < THRESHOLD) target.setPixel(x + col, y + row, true);
    }
  }
}

export async function canvasToRcptImage(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<RcptImage> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("캔버스의 2D 컨텍스트를 얻지 못했습니다");

  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const image = await RcptImage.create(canvas.width, canvas.height);
  try {
    drawImageData(image, source);
  } catch (err) {
    image.free();
    throw err;
  }
  return image;
}

/** 인코더에 넘어가는 것과 같은 비트를 화면에 보여주기 위한 역변환. */
export function toImageData(image: RcptImage): ImageData {
  const { data, stride } = image.readBitmap();
  const out = new ImageData(image.width, image.height);

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const ink = (data[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
      const i = (y * image.width + x) * 4;
      const level = ink ? 0 : 255;
      out.data[i] = level;
      out.data[i + 1] = level;
      out.data[i + 2] = level;
      out.data[i + 3] = 255;
    }
  }
  return out;
}
