import { concatBytes as concat } from "../../utils/bytes";
import type {
  LabelSpec,
  PrinterProfile,
  PrinterProfileSettings,
  PrinterSettingField,
} from "./types";

export const MAX_PRINT_COPIES = 100;
export const PRINT_PADDING_MM_SETTING = "padding_mm";
export const LABEL_WIDTH_MM_SETTING = "label_width_mm";
export const LABEL_HEIGHT_MM_SETTING = "label_height_mm";
export const LABEL_GAP_MM_SETTING = "label_gap_mm";
export const RIGHT_MARGIN_DOTS_SETTING = "right_margin_dots";

export const PRINT_PADDING_SETTING_FIELD: PrinterSettingField = {
  id: PRINT_PADDING_MM_SETTING,
  label: "인쇄 패딩",
  unit: "mm",
  defaultValue: 1,
  min: 0.5,
  max: 2,
  step: 0.5,
  options: [0.5, 1, 1.5, 2],
};

export const manualLabelSettingFields = (
  maxWidthMm?: number,
): readonly PrinterSettingField[] => [
  {
    id: LABEL_WIDTH_MM_SETTING,
    label: "가로",
    unit: "mm",
    defaultValue: 50,
    min: 0.1,
    ...(maxWidthMm === undefined ? {} : { max: maxWidthMm }),
    step: 0.1,
  },
  {
    id: LABEL_HEIGHT_MM_SETTING,
    label: "세로",
    unit: "mm",
    defaultValue: 30,
    min: 0.1,
    step: 0.1,
  },
  PRINT_PADDING_SETTING_FIELD,
  {
    id: LABEL_GAP_MM_SETTING,
    label: "갭",
    unit: "mm",
    defaultValue: 2,
    min: 0,
    step: 0.1,
  },
];

export const printerSetting = (
  settings: PrinterProfileSettings,
  id: string,
): number => {
  const value = settings[id];
  if (value === undefined) throw new Error(`프린터 설정 "${id}" 값이 없습니다.`);
  return value;
};

export const labelSpecFromSettings = (settings: PrinterProfileSettings): LabelSpec => ({
  widthMm: printerSetting(settings, LABEL_WIDTH_MM_SETTING),
  heightMm: printerSetting(settings, LABEL_HEIGHT_MM_SETTING),
  gapMm: printerSetting(settings, LABEL_GAP_MM_SETTING),
});

export const resolvePrinterSettings = (
  profile: PrinterProfile,
  values: PrinterProfileSettings,
): PrinterProfileSettings => {
  const resolved = Object.fromEntries(profile.settings.map((field) => [
    field.id,
    values[field.id] ?? field.defaultValue,
  ]));

  profile.settings.forEach((field) => {
    const value = resolved[field.id];
    if (!Number.isFinite(value) || value < field.min ||
      (field.max !== undefined && value > field.max) ||
      (field.integer && !Number.isInteger(value)) ||
      (field.options && !field.options.includes(value))) {
      throw new Error(`${field.label} 설정값이 허용 범위를 벗어났습니다: ${value} ${field.unit}`);
    }
  });
  profile.validateSettings?.(resolved);
  return resolved;
};

export const validateManualLabelSettings = (settings: PrinterProfileSettings): void => {
  const label = labelSpecFromSettings(settings);
  validateLabelSpec(label);
  const paddingMm = printerSetting(settings, PRINT_PADDING_MM_SETTING);
  if (paddingMm * 2 >= label.widthMm || paddingMm * 2 >= label.heightMm) {
    throw new Error("인쇄 패딩은 라벨 가로와 세로의 절반보다 작아야 합니다.");
  }
};

export const validatePrintCopies = (copies: number): void => {
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_PRINT_COPIES) {
    throw new Error(`인쇄 매수는 1 이상 ${MAX_PRINT_COPIES} 이하의 정수여야 합니다: ${copies}`);
  }
};

export const validateLabelSpec = (label: LabelSpec): void => {
  if (!Number.isFinite(label.widthMm) || label.widthMm <= 0) {
    throw new Error(`라벨 가로는 0보다 큰 유한한 값이어야 합니다: ${label.widthMm}`);
  }
  if (!Number.isFinite(label.heightMm) || label.heightMm <= 0) {
    throw new Error(`라벨 세로는 0보다 큰 유한한 값이어야 합니다: ${label.heightMm}`);
  }
  if (label.gapMm !== undefined && (!Number.isFinite(label.gapMm) || label.gapMm < 0)) {
    throw new Error(`라벨 갭은 0 이상의 유한한 값이어야 합니다: ${label.gapMm}`);
  }
};

export const validateRightMarginDots = (rightMarginDots: number): void => {
  if (!Number.isInteger(rightMarginDots) || rightMarginDots < 0) {
    throw new Error(`오른쪽 여백은 0 이상의 정수여야 합니다: ${rightMarginDots}`);
  }
};

export const repeat = (job: Uint8Array, copies: number): Uint8Array =>
  copies <= 1 ? job : concat(Array.from({ length: copies }, () => job));

export const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
