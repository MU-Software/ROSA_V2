import { Box } from "@mui/material";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ExchangeVoucher } from "../components/printing/exchangeVoucher";
import { PrintTemplateRenderer } from "../components/printing/templateRenderer";
import { getPaidOptionExchangeTargets } from "../domain";
import {
  DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID,
  type PrintQueueEntry,
  type RegistrationPrintData,
} from "./queue";
import { rasterizeTemplate } from "./templateRaster";
import { selectTemplateLayoutType, type TemplateBindingValues } from "./templateDocument";
import { findBadgeTemplate } from "./templates";

const RENDER_WIDTH = 900;

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  requestAnimationFrame(() => resolve());
});

const waitForImages = async (element: HTMLElement): Promise<void> => {
  await Promise.all([...element.querySelectorAll("img")].map(async (image) => {
    if (image.complete) return;
    await image.decode().catch(() => undefined);
  }));
};

const createRegistrationPrintJobDocument = ({
  entry,
  width,
  height,
}: {
  entry: PrintQueueEntry<RegistrationPrintData>;
  width: number;
  height: number;
}) => {
  const product = entry.job.data.order_product_relation;
  const badgeTemplate = findBadgeTemplate(entry.job.template_id);
  if (badgeTemplate) {
    const ticket = product.ticket_info;
    if (!ticket) throw new Error("명찰에 사용할 참가자 정보가 없습니다");
    const values: TemplateBindingValues = {
      "ticket.name": ticket.name,
      "ticket.organization": ticket.organization ?? undefined,
      "badge.role_label": badgeTemplate.role_label,
    };
    return (
      <PrintTemplateRenderer
        document={badgeTemplate.document}
        layoutType={selectTemplateLayoutType(width, height)}
        values={values}
        showQrPlaceholder={false}
      />
    );
  }

  if (entry.job.template_id === DEFAULT_EXCHANGE_VOUCHER_TEMPLATE_ID) {
    const targets = getPaidOptionExchangeTargets(product);
    if (targets.length === 0) throw new Error("교환권에 출력할 유료 옵션이 없습니다");
    const longEdge = Math.max(width, height);
    const shortEdge = Math.min(width, height);
    return (
      <ExchangeVoucher
        product={product}
        targets={targets}
        aspectRatio={`${longEdge} / ${shortEdge}`}
      />
    );
  }

  throw new Error(`지원하지 않는 출력 템플릿입니다: ${entry.job.template_id}`);
};

export async function renderRegistrationPrintJob(
  entry: PrintQueueEntry<RegistrationPrintData>,
  width: number,
  height: number,
): Promise<ImageData> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH}px`,
    pointerEvents: "none",
  });
  document.body.append(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(
        <Box sx={{ width: RENDER_WIDTH }}>
          {createRegistrationPrintJobDocument({ entry, width, height })}
        </Box>,
      );
    });
    await document.fonts.ready;
    await waitForImages(host);
    await nextFrame();
    await nextFrame();
    const element = host.firstElementChild?.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error("출력 템플릿을 준비하지 못했습니다");
    return await rasterizeTemplate(element, width, height);
  } finally {
    root.unmount();
    host.remove();
  }
}
