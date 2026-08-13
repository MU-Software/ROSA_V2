import type { OrderProductRelation } from "../domain";
import pyconLogoUrl from "../assets/pycon_logo_monochrome.svg";
import {
  printTemplateDocumentSchema,
  type PrintTemplateDocument,
} from "./templateDocument";

export type BuiltInBadgeTemplate = {
  template_id: string;
  tag_code: string;
  name: string;
  role_label: string;
  priority: number;
  document: PrintTemplateDocument;
};

type BadgeTemplateVariant = "solid" | "outlined" | "plain";

const createBadgeTemplate = (
  template: Omit<BuiltInBadgeTemplate, "document"> & { variant: BadgeTemplateVariant },
): BuiltInBadgeTemplate => {
  const roleStyle = template.variant === "solid"
    ? {
      color: "#ffffff",
      background_color: "#000000",
      border_color: "#000000",
      border_width_mm: 0.3,
    }
    : template.variant === "outlined"
    ? {
      color: "#000000",
      background_color: "transparent",
      border_color: "#000000",
      border_width_mm: 0.5,
    }
    : {
      color: "#000000",
      background_color: "transparent",
      border_color: "#999999",
      border_width_mm: 0.25,
    };

  const document = printTemplateDocumentSchema.parse({
    schema_version: 1,
    template_id: template.template_id,
    name: template.name,
    orientation: "landscape",
    layouts: {
      wide: {
        media: { long_edge_mm: 90, short_edge_mm: 38 },
        elements: [
          {
            id: "event-logo",
            kind: "image",
            frame: { x_mm: 1, y_mm: 10, width_mm: 14, height_mm: 14 },
            source: { type: "literal", value: pyconLogoUrl },
          },
          {
            id: "name",
            kind: "text",
            frame: { x_mm: 20, y_mm: 3, width_mm: 46, height_mm: 12 },
            source: { type: "binding", binding: "ticket.name" },
            style: { font_size_mm: 9, min_font_size_mm: 3.5, font_weight: 900 },
          },
          {
            id: "organization",
            kind: "text",
            frame: { x_mm: 20, y_mm: 16, width_mm: 46, height_mm: 8 },
            source: {
              type: "binding",
              binding: "ticket.organization",
              fallback: "소속 없음",
            },
            style: {
              font_size_mm: 4.5,
              min_font_size_mm: 2,
              font_weight: 400,
              vertical_align: "top",
            },
          },
          {
            id: "role",
            kind: "text",
            frame: { x_mm: 20, y_mm: 28, width_mm: 28, height_mm: 7 },
            source: { type: "binding", binding: "badge.role_label" },
            style: {
              font_size_mm: 4,
              min_font_size_mm: 2.4,
              font_weight: 800,
              text_align: "center",
              border_radius_mm: 0.8,
              padding_mm: 0.8,
              ...roleStyle,
            },
          },
          {
            id: "scancode",
            kind: "qr",
            frame: { x_mm: 72, y_mm: 4, width_mm: 17, height_mm: 30 },
            binding: "order_product.scancode",
          },
        ],
      },
      compact: {
        media: { long_edge_mm: 40, short_edge_mm: 30 },
        elements: [
          {
            id: "event-logo",
            kind: "image",
            frame: { x_mm: 1, y_mm: 20.5, width_mm: 7.5, height_mm: 7.5 },
            source: { type: "literal", value: pyconLogoUrl },
          },
          {
            id: "name",
            kind: "text",
            frame: { x_mm: 2, y_mm: 2, width_mm: 25, height_mm: 8 },
            source: { type: "binding", binding: "ticket.name" },
            style: { font_size_mm: 6, min_font_size_mm: 2.5, font_weight: 900 },
          },
          {
            id: "organization",
            kind: "text",
            frame: { x_mm: 2, y_mm: 11, width_mm: 25, height_mm: 7 },
            source: {
              type: "binding",
              binding: "ticket.organization",
              fallback: "소속 없음",
            },
            style: {
              font_size_mm: 3.5,
              min_font_size_mm: 1.8,
              font_weight: 400,
              vertical_align: "top",
            },
          },
          {
            id: "role",
            kind: "text",
            frame: { x_mm: 10, y_mm: 21, width_mm: 17, height_mm: 7 },
            source: { type: "binding", binding: "badge.role_label" },
            style: {
              font_size_mm: 3.5,
              min_font_size_mm: 2,
              font_weight: 800,
              text_align: "center",
              border_radius_mm: 0.6,
              padding_mm: 0.6,
              ...roleStyle,
            },
          },
          {
            id: "scancode",
            kind: "qr",
            frame: { x_mm: 30, y_mm: 6, width_mm: 9, height_mm: 18 },
            binding: "order_product.scancode",
          },
        ],
      },
    },
  });

  return {
    template_id: template.template_id,
    tag_code: template.tag_code,
    name: template.name,
    role_label: template.role_label,
    priority: template.priority,
    document,
  };
};

export const BUILT_IN_BADGE_TEMPLATES: readonly BuiltInBadgeTemplate[] = [
  createBadgeTemplate({
    template_id: "registration.badge.speaker",
    tag_code: "speaker",
    name: "발표자 기본 템플릿",
    role_label: "발표자",
    priority: 300,
    variant: "solid",
  }),
  createBadgeTemplate({
    template_id: "registration.badge.volunteer",
    tag_code: "volunteer",
    name: "자원봉사자 기본 템플릿",
    role_label: "자원봉사자",
    priority: 200,
    variant: "outlined",
  }),
  createBadgeTemplate({
    template_id: "registration.badge.attendee",
    tag_code: "attendee",
    name: "참가자 기본 템플릿",
    role_label: "참가자",
    priority: 100,
    variant: "plain",
  }),
];

export const DEFAULT_BADGE_TEMPLATE = BUILT_IN_BADGE_TEMPLATES[2];

export const selectBadgeTemplate = (
  product: Pick<OrderProductRelation, "tags">,
): BuiltInBadgeTemplate => {
  const tagCodes = new Set(product.tags.map(({ code }) => code));
  return BUILT_IN_BADGE_TEMPLATES.reduce<BuiltInBadgeTemplate>(
    (selected, candidate) => tagCodes.has(candidate.tag_code) &&
      candidate.priority > selected.priority
      ? candidate
      : selected,
    DEFAULT_BADGE_TEMPLATE,
  );
};

export const findBuiltInBadgeTemplate = (
  templateId: string,
): BuiltInBadgeTemplate | undefined =>
  BUILT_IN_BADGE_TEMPLATES.find(({ template_id }) => template_id === templateId);

export const isBuiltInBadgeTemplateId = (templateId: string): boolean =>
  findBuiltInBadgeTemplate(templateId) !== undefined;
