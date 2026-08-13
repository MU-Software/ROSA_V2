import html2canvas from "html2canvas";

const drawContained = (
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
): void => {
  const regularScale = Math.min(width / source.width, height / source.height);
  const rotatedScale = Math.min(width / source.height, height / source.width);
  const rotate = rotatedScale > regularScale;
  const scale = rotate ? rotatedScale : regularScale;
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;

  context.save();
  context.translate(width / 2, height / 2);
  if (rotate) context.rotate(Math.PI / 2);
  context.drawImage(source, -renderedWidth / 2, -renderedHeight / 2, renderedWidth, renderedHeight);
  context.restore();
};

export async function rasterizeTemplate(
  element: HTMLElement,
  width: number,
  height: number,
): Promise<ImageData> {
  const source = await html2canvas(element, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: 1,
    useCORS: true,
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("출력 이미지를 생성할 수 없습니다");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  drawContained(context, source, width, height);
  return context.getImageData(0, 0, width, height);
}
