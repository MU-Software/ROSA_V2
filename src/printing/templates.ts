import type { OrderProductRelation } from "../domain";

export const BUILT_IN_BADGE_TEMPLATES = [
  {
    template_id: "registration.badge.speaker",
    tag_code: "speaker",
    name: "발표자 기본 템플릿",
    role_label: "발표자",
    priority: 300,
    variant: "solid",
  },
  {
    template_id: "registration.badge.volunteer",
    tag_code: "volunteer",
    name: "자원봉사자 기본 템플릿",
    role_label: "자원봉사자",
    priority: 200,
    variant: "outlined",
  },
  {
    template_id: "registration.badge.attendee",
    tag_code: "attendee",
    name: "참가자 기본 템플릿",
    role_label: "참가자",
    priority: 100,
    variant: "plain",
  },
] as const;

export type BuiltInBadgeTemplate = typeof BUILT_IN_BADGE_TEMPLATES[number];

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
