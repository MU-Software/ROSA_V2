import { z } from "zod";

export const TEMPLATE_BINDINGS = [
  "ticket.name",
  "ticket.organization",
  "badge.role_label",
  "order_product.scancode",
] as const;

export const TEMPLATE_LAYOUT_TYPES = ["wide", "compact"] as const;
export const TEMPLATE_ORIENTATIONS = ["landscape", "portrait"] as const;

export type TemplateBinding = typeof TEMPLATE_BINDINGS[number];
export type TemplateLayoutType = typeof TEMPLATE_LAYOUT_TYPES[number];
export type TemplateOrientation = typeof TEMPLATE_ORIENTATIONS[number];

const templateFrameSchema = z.object({
  x_mm: z.number().finite().nonnegative(),
  y_mm: z.number().finite().nonnegative(),
  width_mm: z.number().finite().positive(),
  height_mm: z.number().finite().positive(),
  rotation_deg: z.number().finite().min(-180).max(180).default(0),
});

const templateSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("literal"), value: z.string() }),
  z.object({
    type: z.literal("binding"),
    binding: z.enum(TEMPLATE_BINDINGS),
    fallback: z.string().default(""),
  }),
]);

const templateTextElementSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("text"),
  frame: templateFrameSchema,
  source: templateSourceSchema,
  style: z.object({
    font_size_mm: z.number().finite().positive(),
    min_font_size_mm: z.number().finite().positive(),
    font_weight: z.number().int().min(100).max(900),
    line_height: z.number().finite().positive().default(1.1),
    text_align: z.enum(["left", "center", "right"]).default("left"),
    vertical_align: z.enum(["top", "center", "bottom"]).default("center"),
    color: z.string().min(1).default("#000000"),
    background_color: z.string().min(1).default("transparent"),
    border_color: z.string().min(1).default("transparent"),
    border_width_mm: z.number().finite().nonnegative().default(0),
    border_radius_mm: z.number().finite().nonnegative().default(0),
    padding_mm: z.number().finite().nonnegative().default(0),
  }).refine(
    ({ font_size_mm, min_font_size_mm }) => min_font_size_mm <= font_size_mm,
    { message: "최소 글자 크기는 기본 글자 크기보다 클 수 없습니다." },
  ),
});

const templateQrElementSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("qr"),
  frame: templateFrameSchema,
  binding: z.literal("order_product.scancode"),
});

const templateElementSchema = z.discriminatedUnion("kind", [
  templateTextElementSchema,
  templateQrElementSchema,
]);

const templateLayoutSchema = z.object({
  media: z.object({
    long_edge_mm: z.number().finite().positive(),
    short_edge_mm: z.number().finite().positive(),
  }).refine(
    ({ long_edge_mm, short_edge_mm }) => long_edge_mm >= short_edge_mm,
    { message: "긴 변은 짧은 변보다 작을 수 없습니다." },
  ),
  elements: z.array(templateElementSchema),
});

export const printTemplateDocumentSchema = z.object({
  schema_version: z.literal(1),
  template_id: z.string().min(1),
  name: z.string().min(1),
  orientation: z.enum(TEMPLATE_ORIENTATIONS),
  layouts: z.object({
    wide: templateLayoutSchema,
    compact: templateLayoutSchema,
  }),
}).superRefine((document, context) => {
  const wideElements = new Map(document.layouts.wide.elements.map((element) => [
    element.id,
    element.kind,
  ]));

  for (const layoutType of TEMPLATE_LAYOUT_TYPES) {
    const layout = document.layouts[layoutType];
    const width = document.orientation === "landscape"
      ? layout.media.long_edge_mm
      : layout.media.short_edge_mm;
    const height = document.orientation === "landscape"
      ? layout.media.short_edge_mm
      : layout.media.long_edge_mm;
    const ids = new Set<string>();

    for (const [index, element] of layout.elements.entries()) {
      if (ids.has(element.id)) {
        context.addIssue({
          code: "custom",
          message: "템플릿 요소 ID가 중복되었습니다.",
          path: ["layouts", layoutType, "elements", index, "id"],
        });
      }
      ids.add(element.id);

      if (
        element.frame.x_mm + element.frame.width_mm > width ||
        element.frame.y_mm + element.frame.height_mm > height
      ) {
        context.addIssue({
          code: "custom",
          message: "템플릿 요소가 용지 영역을 벗어났습니다.",
          path: ["layouts", layoutType, "elements", index, "frame"],
        });
      }

      if (layoutType === "compact" && wideElements.get(element.id) !== element.kind) {
        context.addIssue({
          code: "custom",
          message: "wide와 compact 레이아웃은 같은 요소 ID와 종류를 사용해야 합니다.",
          path: ["layouts", layoutType, "elements", index],
        });
      }
    }

    if (ids.size !== wideElements.size) {
      context.addIssue({
        code: "custom",
        message: "wide와 compact 레이아웃은 같은 요소를 포함해야 합니다.",
        path: ["layouts", layoutType, "elements"],
      });
    }
  }
});

export type PrintTemplateDocument = z.infer<typeof printTemplateDocumentSchema>;
export type PrintTemplateLayout = PrintTemplateDocument["layouts"][TemplateLayoutType];
export type PrintTemplateElement = PrintTemplateLayout["elements"][number];

export type TemplateBindingValues = Partial<Record<TemplateBinding, string>>;

export const getOrientedTemplateMedia = (
  document: Pick<PrintTemplateDocument, "orientation" | "layouts">,
  layoutType: TemplateLayoutType,
): { width_mm: number; height_mm: number } => {
  const media = document.layouts[layoutType].media;
  return document.orientation === "landscape"
    ? { width_mm: media.long_edge_mm, height_mm: media.short_edge_mm }
    : { width_mm: media.short_edge_mm, height_mm: media.long_edge_mm };
};

export const selectTemplateLayoutType = (
  widthMm: number,
  heightMm: number,
): TemplateLayoutType => {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    throw new RangeError("용지 크기는 0보다 큰 유한한 숫자여야 합니다.");
  }
  return Math.max(widthMm, heightMm) / Math.min(widthMm, heightMm) >= 1.75
    ? "wide"
    : "compact";
};
