import html2canvas from "html2canvas";

const isSvgImage = (image: HTMLImageElement): boolean =>
  image.currentSrc.startsWith("data:image/svg+xml") ||
  new URL(image.currentSrc, document.baseURI).pathname.endsWith(".svg");

const flattenSvgImage = async (image: HTMLImageElement): Promise<void> => {
  if (!isSvgImage(image)) return;

  const bounds = image.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width);
  canvas.height = Math.ceil(bounds.height);
  const context = canvas.getContext("2d");
  if (!context || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

  const scale = Math.min(
    canvas.width / image.naturalWidth,
    canvas.height / image.naturalHeight,
  );
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(
    image,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height,
  );
  image.src = canvas.toDataURL("image/png");
  await image.decode();
};

const flattenSvgImages = async (element: HTMLElement): Promise<void> => {
  await Promise.all([...element.querySelectorAll("img")].map(async (image) => {
    try {
      await flattenSvgImage(image);
    } catch {
      return;
    }
  }));
};

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
  await flattenSvgImages(element);
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
