export type TestCardOptions = {
  widthDots: number;
  heightDots: number;
  dotsPerMm: number;
  title: string;
};

/** 이 아래로 내려가면 획이 많은 음절이 뭉갠다 — 300 dpi 든 203 dpi 든 마찬가지다. */
const MIN_HANGUL_PX = 12;

const TICK_INTERVAL_MM = 10;

/**
 * 테두리가 네 변 모두 나오면 인쇄 영역이 맞은 것이고, 눈금의 마지막 숫자가 실제 인쇄
 * 가능 폭이다 — 프린터가 주장하는 dpi 와 무관하게 읽을 수 있다.
 */
export function drawTestCard({ widthDots, heightDots, dotsPerMm, title }: TestCardOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = widthDots;
  canvas.height = heightDots;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스의 2D 컨텍스트를 얻지 못했습니다");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, widthDots, heightDots);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";

  // 잘리는 변이 있으면 인쇄 영역이 캔버스보다 작다는 뜻이다.
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, widthDots - 2, heightDots - 2);

  const mark = Math.round(dotsPerMm * 4);
  for (const [x, y, dx, dy] of [
    [0, 0, 1, 1],
    [widthDots, 0, -1, 1],
    [0, heightDots, 1, -1],
    [widthDots, heightDots, -1, -1],
  ]) {
    ctx.fillRect(Math.min(x, x + dx * mark), Math.min(y, y + dy * 6), mark, 6);
    ctx.fillRect(Math.min(x, x + dx * 6), Math.min(y, y + dy * mark), 6, mark);
  }

  const pad = Math.round(dotsPerMm * 3);
  let cursor = pad + Math.round(dotsPerMm * 5);

  ctx.font = `bold ${Math.max(MIN_HANGUL_PX, Math.round(dotsPerMm * 3))}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(title, pad, cursor);
  cursor += Math.round(dotsPerMm * 4);

  ctx.font = `${Math.max(MIN_HANGUL_PX, Math.round(dotsPerMm * 2.5))}px sans-serif`;
  ctx.fillText(`${widthDots} x ${heightDots} dots · ${dotsPerMm.toFixed(2)} dot/mm`, pad, cursor);
  cursor += Math.round(dotsPerMm * 4);

  // 한글이 12 px 아래에서 어떻게 무너지는지 같이 본다.
  ctx.fillText("한글 뷁쮕훯 ABC 0123", pad, cursor);
  cursor += Math.round(dotsPerMm * 5);

  // 가로 눈금자. 마지막으로 읽히는 숫자가 실제 인쇄 폭이다.
  const tickTop = cursor;
  const tickHeight = Math.round(dotsPerMm * 3);
  ctx.font = `${MIN_HANGUL_PX}px sans-serif`;
  for (let mm = 0; mm * dotsPerMm < widthDots; mm += TICK_INTERVAL_MM) {
    const x = Math.round(mm * dotsPerMm);
    ctx.fillRect(x, tickTop, 2, tickHeight);
    ctx.fillText(String(mm), x + 3, tickTop + 1);
  }
  cursor = tickTop + tickHeight + Math.round(dotsPerMm * 3);

  // 농도 확인용 검정 블록과, 도트가 하나씩 살아있는지 보는 체커보드
  const blockHeight = Math.round(dotsPerMm * 6);
  const blockWidth = Math.floor((widthDots - pad * 2) / 2) - pad;
  if (cursor + blockHeight < heightDots - pad) {
    ctx.fillRect(pad, cursor, blockWidth, blockHeight);
    for (let y = 0; y < blockHeight; y++) {
      for (let x = 0; x < blockWidth; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(pad * 2 + blockWidth + x, cursor + y, 1, 1);
      }
    }
    cursor += blockHeight + pad;
  }

  // 대각선은 좌우 정합과 기울어짐을 한눈에 보여준다.
  if (cursor < heightDots - pad) {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, cursor);
    ctx.lineTo(widthDots - pad, heightDots - pad);
    ctx.moveTo(widthDots - pad, cursor);
    ctx.lineTo(pad, heightDots - pad);
    ctx.stroke();
  }

  return canvas;
}

/** 라벨 길이를 모를 때 쓰는 기본 높이. */
export const defaultTestCardHeight = (dotsPerMm: number): number => Math.round(dotsPerMm * 60);
