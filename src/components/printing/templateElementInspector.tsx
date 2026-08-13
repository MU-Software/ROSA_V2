import {
  FormatAlignCenter,
  FormatAlignLeft,
  FormatAlignRight,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { FC, KeyboardEvent } from "react";
import type {
  PrintTemplateElement,
  TemplateBinding,
} from "../../printing/templateDocument";

const bindingLabels: Record<TemplateBinding, string> = {
  "ticket.name": "참가자 이름",
  "ticket.organization": "참가자 소속",
  "badge.role_label": "역할 이름",
  "order_product.scancode": "주문상품 QR",
  "event.logo": "행사 로고",
};

const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.target.blur();
};

const NumericField: FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}> = ({ label, value, min, max, step = 0.1, onCommit }) => (
  <TextField
    key={`${label}:${value}`}
    type="number"
    size="small"
    label={label}
    defaultValue={value}
    slotProps={{ htmlInput: { min, max, step } }}
    onKeyDown={commitOnEnter}
    onBlur={(event) => {
      const next = Number(event.currentTarget.value);
      if (Number.isFinite(next)) onCommit(next);
    }}
  />
);

const StringField: FC<{
  label: string;
  value: string;
  allowEmpty?: boolean;
  onCommit: (value: string) => void;
}> = ({ label, value, allowEmpty = false, onCommit }) => (
  <TextField
    key={`${label}:${value}`}
    size="small"
    label={label}
    defaultValue={value}
    onKeyDown={commitOnEnter}
    onBlur={(event) => {
      const next = event.currentTarget.value;
      if (allowEmpty || next.trim()) onCommit(next);
    }}
  />
);

type TextElement = Extract<PrintTemplateElement, { kind: "text" }>;

export const TemplateElementInspector: FC<{
  element: PrintTemplateElement;
  media: { width_mm: number; height_mm: number };
  onElementChange: (element: PrintTemplateElement) => void;
}> = ({ element, media, onElementChange }) => {
  const textSource = element.kind === "text" ? element.source : null;
  const updateFrame = (
    key: keyof PrintTemplateElement["frame"],
    value: number,
  ) => {
    const frame = { ...element.frame };
    if (key === "x_mm") frame.x_mm = Math.min(Math.max(value, 0), media.width_mm - frame.width_mm);
    if (key === "y_mm") {
      frame.y_mm = Math.min(Math.max(value, 0), media.height_mm - frame.height_mm);
    }
    if (key === "width_mm") {
      frame.width_mm = Math.min(Math.max(value, 0.1), media.width_mm - frame.x_mm);
    }
    if (key === "height_mm") {
      frame.height_mm = Math.min(Math.max(value, 0.1), media.height_mm - frame.y_mm);
    }
    if (key === "rotation_deg") frame.rotation_deg = Math.min(Math.max(value, -180), 180);
    onElementChange({ ...element, frame });
  };

  const updateTextElement = (next: Partial<TextElement>) => {
    if (element.kind !== "text") return;
    onElementChange({ ...element, ...next });
  };

  const updateTextStyle = (next: Partial<TextElement["style"]>) => {
    if (element.kind !== "text") return;
    updateTextElement({ style: { ...element.style, ...next } });
  };

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Box>
        <Typography variant="subtitle2">위치와 크기</Typography>
        <Typography variant="caption" color="text.secondary">단위: mm</Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <NumericField
          label="X"
          value={element.frame.x_mm}
          min={0}
          max={media.width_mm - element.frame.width_mm}
          onCommit={(value) => updateFrame("x_mm", value)}
        />
        <NumericField
          label="Y"
          value={element.frame.y_mm}
          min={0}
          max={media.height_mm - element.frame.height_mm}
          onCommit={(value) => updateFrame("y_mm", value)}
        />
        <NumericField
          label="너비"
          value={element.frame.width_mm}
          min={0.1}
          max={media.width_mm - element.frame.x_mm}
          onCommit={(value) => updateFrame("width_mm", value)}
        />
        <NumericField
          label="높이"
          value={element.frame.height_mm}
          min={0.1}
          max={media.height_mm - element.frame.y_mm}
          onCommit={(value) => updateFrame("height_mm", value)}
        />
      </Box>
      <NumericField
        label="회전 각도"
        value={element.frame.rotation_deg}
        min={-180}
        max={180}
        step={1}
        onCommit={(value) => updateFrame("rotation_deg", value)}
      />

      {element.kind === "text" && (
        <>
          <Divider />
          <Typography variant="subtitle2">텍스트</Typography>
          {textSource?.type === "literal" ? (
            <StringField
              label="내용"
              value={textSource.value}
              allowEmpty
              onCommit={(value) => updateTextElement({
                source: { type: "literal", value },
              })}
            />
          ) : textSource ? (
            <>
              <TextField
                size="small"
                label="데이터"
                value={bindingLabels[textSource.binding]}
                slotProps={{ input: { readOnly: true } }}
              />
              <StringField
                label="데이터가 없을 때"
                value={textSource.fallback}
                allowEmpty
                onCommit={(fallback) => updateTextElement({
                  source: { ...textSource, fallback },
                })}
              />
            </>
          ) : null}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            <NumericField
              label="글자 크기"
              value={element.style.font_size_mm}
              min={0.1}
              onCommit={(font_size_mm) => updateTextStyle({
                font_size_mm,
                min_font_size_mm: Math.min(element.style.min_font_size_mm, font_size_mm),
              })}
            />
            <NumericField
              label="최소 크기"
              value={element.style.min_font_size_mm}
              min={0.1}
              max={element.style.font_size_mm}
              onCommit={(min_font_size_mm) => updateTextStyle({
                min_font_size_mm: Math.min(min_font_size_mm, element.style.font_size_mm),
              })}
            />
          </Box>
          <TextField
            select
            size="small"
            label="글자 굵기"
            value={element.style.font_weight}
            onChange={(event) => updateTextStyle({ font_weight: Number(event.target.value) })}
          >
            <MenuItem value={400}>보통</MenuItem>
            <MenuItem value={500}>중간</MenuItem>
            <MenuItem value={700}>굵게</MenuItem>
            <MenuItem value={800}>매우 굵게</MenuItem>
            <MenuItem value={900}>가장 굵게</MenuItem>
          </TextField>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={element.style.text_align}
            onChange={(_event, text_align: TextElement["style"]["text_align"] | null) => {
              if (text_align) updateTextStyle({ text_align });
            }}
          >
            <ToggleButton value="left" aria-label="왼쪽 정렬"><FormatAlignLeft /></ToggleButton>
            <ToggleButton value="center" aria-label="가운데 정렬">
              <FormatAlignCenter />
            </ToggleButton>
            <ToggleButton value="right" aria-label="오른쪽 정렬">
              <FormatAlignRight />
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            select
            size="small"
            label="세로 정렬"
            value={element.style.vertical_align}
            onChange={(event) => updateTextStyle({
              vertical_align: event.target.value as TextElement["style"]["vertical_align"],
            })}
          >
            <MenuItem value="top">위</MenuItem>
            <MenuItem value="center">가운데</MenuItem>
            <MenuItem value="bottom">아래</MenuItem>
          </TextField>
          <StringField
            label="글자 색상"
            value={element.style.color}
            onCommit={(color) => updateTextStyle({ color })}
          />
          <StringField
            label="배경 색상"
            value={element.style.background_color}
            onCommit={(background_color) => updateTextStyle({ background_color })}
          />
          <StringField
            label="테두리 색상"
            value={element.style.border_color}
            onCommit={(border_color) => updateTextStyle({ border_color })}
          />
        </>
      )}
    </Stack>
  );
};
