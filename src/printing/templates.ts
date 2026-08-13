import type { OrderProductRelation } from "../domain";
import { z } from "zod";
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
            frame: { x_mm: 2, y_mm: 20, width_mm: 16, height_mm: 16 },
            source: { type: "literal", value: pyconLogoUrl },
          },
          {
            id: "name",
            kind: "text",
            frame: { x_mm: 2, y_mm: 2, width_mm: 86, height_mm: 11 },
            source: { type: "binding", binding: "ticket.name" },
            style: {
              font_size_mm: 9,
              min_font_size_mm: 3.5,
              font_weight: 900,
              text_align: "center",
            },
          },
          {
            id: "organization",
            kind: "text",
            frame: { x_mm: 2, y_mm: 13, width_mm: 86, height_mm: 6 },
            source: {
              type: "binding",
              binding: "ticket.organization",
              fallback: "소속 없음",
            },
            style: {
              font_size_mm: 4.5,
              min_font_size_mm: 2,
              font_weight: 400,
              text_align: "center",
            },
          },
          ...(template.variant === "plain" ? [] : [{
            id: "role",
            kind: "text",
            frame: { x_mm: 21, y_mm: 26, width_mm: 48, height_mm: 8 },
            source: { type: "binding", binding: "badge.role_label" },
            style: {
              font_size_mm: 4.5,
              min_font_size_mm: 2.4,
              font_weight: 800,
              text_align: "center",
              border_radius_mm: 0.8,
              padding_mm: 0.8,
              ...roleStyle,
            },
          }]),
          {
            id: "scancode",
            kind: "qr",
            frame: { x_mm: 72, y_mm: 20, width_mm: 16, height_mm: 16 },
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
            frame: { x_mm: 1, y_mm: 17, width_mm: 12, height_mm: 12 },
            source: { type: "literal", value: pyconLogoUrl },
          },
          {
            id: "name",
            kind: "text",
            frame: { x_mm: 1, y_mm: 1, width_mm: 38, height_mm: 8 },
            source: { type: "binding", binding: "ticket.name" },
            style: {
              font_size_mm: 6.5,
              min_font_size_mm: 2.5,
              font_weight: 900,
              text_align: "center",
            },
          },
          {
            id: "organization",
            kind: "text",
            frame: { x_mm: 1, y_mm: 9, width_mm: 38, height_mm: 6 },
            source: {
              type: "binding",
              binding: "ticket.organization",
              fallback: "소속 없음",
            },
            style: {
              font_size_mm: 3.5,
              min_font_size_mm: 1.8,
              font_weight: 400,
              text_align: "center",
            },
          },
          ...(template.variant === "plain" ? [] : [{
            id: "role",
            kind: "text",
            frame: { x_mm: 14, y_mm: 21, width_mm: 12, height_mm: 7 },
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
          }]),
          {
            id: "scancode",
            kind: "qr",
            frame: { x_mm: 27, y_mm: 17, width_mm: 12, height_mm: 12 },
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

const ACTIVE_BADGE_TEMPLATE_CONFIGURATION_KEY = "rosa.active-badge-template-configuration";
const badgeTemplateSettingsSchema = z.object({
  schema_version: z.literal(1),
  default_template_id: z.string(),
  documents: z.record(z.string(), printTemplateDocumentSchema),
  tag_template_ids: z.record(z.string(), z.string()),
});

export type BadgeTemplateSettings = z.infer<typeof badgeTemplateSettingsSchema>;

const defaultTagTemplateIds = (): Record<string, string> => Object.fromEntries(
  BUILT_IN_BADGE_TEMPLATES.map(({ tag_code, template_id }) => [tag_code, template_id]),
);

export const createDefaultBadgeTemplateSettings = (): BadgeTemplateSettings => ({
  schema_version: 1,
  default_template_id: DEFAULT_BADGE_TEMPLATE.template_id,
  documents: {},
  tag_template_ids: defaultTagTemplateIds(),
});

const badgeTemplateSettingsKey = (configurationId: string): string =>
  `rosa.badge-template-settings:${configurationId}`;

export const setActiveBadgeTemplateConfiguration = (configurationId: string | null): void => {
  if (typeof localStorage === "undefined") return;
  if (configurationId) {
    localStorage.setItem(ACTIVE_BADGE_TEMPLATE_CONFIGURATION_KEY, configurationId);
  } else {
    localStorage.removeItem(ACTIVE_BADGE_TEMPLATE_CONFIGURATION_KEY);
  }
};

export const loadBadgeTemplateSettings = (
  configurationId?: string,
): BadgeTemplateSettings => {
  if (typeof localStorage === "undefined") return createDefaultBadgeTemplateSettings();
  const activeConfigurationId = configurationId ??
    localStorage.getItem(ACTIVE_BADGE_TEMPLATE_CONFIGURATION_KEY);
  if (!activeConfigurationId) return createDefaultBadgeTemplateSettings();

  try {
    const stored = localStorage.getItem(badgeTemplateSettingsKey(activeConfigurationId));
    if (!stored) return createDefaultBadgeTemplateSettings();
    return badgeTemplateSettingsSchema.parse(JSON.parse(stored) as unknown);
  } catch {
    return createDefaultBadgeTemplateSettings();
  }
};

export const saveBadgeTemplateSettings = (
  configurationId: string,
  settings: BadgeTemplateSettings,
): BadgeTemplateSettings => {
  const parsed = badgeTemplateSettingsSchema.parse(settings);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(badgeTemplateSettingsKey(configurationId), JSON.stringify(parsed));
  }
  return parsed;
};

export const findBadgeTemplate = (
  templateId: string,
  settings = loadBadgeTemplateSettings(),
): BuiltInBadgeTemplate | undefined => {
  const template = findBuiltInBadgeTemplate(templateId);
  if (!template) return undefined;
  const document = settings.documents[templateId];
  return document ? { ...template, document } : template;
};

export const selectBadgeTemplate = (
  product: Pick<OrderProductRelation, "tags">,
): BuiltInBadgeTemplate => {
  const settings = loadBadgeTemplateSettings();
  const defaultTemplate = findBadgeTemplate(settings.default_template_id, settings) ??
    DEFAULT_BADGE_TEMPLATE;
  const selected = product.tags.reduce<{
    template: BuiltInBadgeTemplate;
    priority: number;
    tag_code: string | null;
  }>((current, tag) => {
    const templateId = settings.tag_template_ids[tag.code];
    const candidate = templateId ? findBadgeTemplate(templateId, settings) : undefined;
    const precedesCurrent = tag.priority < current.priority ||
      tag.priority === current.priority &&
      (current.tag_code === null || tag.code.localeCompare(current.tag_code) < 0);
    return candidate && precedesCurrent
      ? { template: candidate, priority: tag.priority, tag_code: tag.code }
      : current;
  }, {
    template: defaultTemplate,
    priority: Number.POSITIVE_INFINITY,
    tag_code: null,
  });
  return selected.template;
};

export const findBuiltInBadgeTemplate = (
  templateId: string,
): BuiltInBadgeTemplate | undefined =>
  BUILT_IN_BADGE_TEMPLATES.find(({ template_id }) => template_id === templateId);

export const isBuiltInBadgeTemplateId = (templateId: string): boolean =>
  findBuiltInBadgeTemplate(templateId) !== undefined;
