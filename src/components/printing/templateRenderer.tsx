import { QrCode2 } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useLayoutEffect, useRef, useState, type FC, type Ref } from "react";
import { createQrCodeDataUrl } from "../../printing/qrCode";
import type {
  PrintTemplateDocument,
  PrintTemplateElement,
  TemplateBinding,
  TemplateBindingValues,
  TemplateLayoutType,
} from "../../printing/templateDocument";
import { getOrientedTemplateMedia } from "../../printing/templateDocument";

const horizontalAlignment = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

const verticalAlignment = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
} as const;

const resolveText = (
  element: Extract<PrintTemplateElement, { kind: "text" }>,
  values: TemplateBindingValues,
): string => element.source.type === "literal"
  ? element.source.value
  : values[element.source.binding] || element.source.fallback;

const resolveImageSource = (
  element: Extract<PrintTemplateElement, { kind: "image" }>,
  values: TemplateBindingValues,
): string => element.source.type === "literal"
  ? element.source.value
  : values[element.source.binding] || element.source.fallback;

const TemplateText: FC<{
  element: Extract<PrintTemplateElement, { kind: "text" }>;
  mediaWidthMm: number;
  value: string;
  frameStyle: Record<string, unknown>;
}> = ({ element, mediaWidthMm, value, frameStyle }) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const style = element.style;
  const mmToCqi = (millimeters: number): string => `${millimeters / mediaWidthMm * 100}cqi`;

  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let minimum = style.min_font_size_mm;
    let maximum = style.font_size_mm;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const candidate = (minimum + maximum) / 2;
      target.style.fontSize = `${candidate / mediaWidthMm * 100}cqi`;
      if (target.scrollWidth <= target.clientWidth && target.scrollHeight <= target.clientHeight) {
        minimum = candidate;
      } else {
        maximum = candidate;
      }
    }
    target.style.fontSize = `${minimum / mediaWidthMm * 100}cqi`;
  }, [mediaWidthMm, style, value]);

  return (
    <Box
      ref={targetRef}
      data-template-element-id={element.id}
      sx={{
        ...frameStyle,
        display: "flex",
        alignItems: verticalAlignment[style.vertical_align],
        justifyContent: horizontalAlignment[style.text_align],
        p: mmToCqi(style.padding_mm),
        color: style.color,
        bgcolor: style.background_color,
        borderStyle: style.border_width_mm > 0 ? "solid" : "none",
        borderColor: style.border_color,
        borderWidth: mmToCqi(style.border_width_mm),
        borderRadius: mmToCqi(style.border_radius_mm),
        fontSize: mmToCqi(style.font_size_mm),
        fontWeight: style.font_weight,
        lineHeight: style.line_height,
        textAlign: style.text_align,
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {value}
    </Box>
  );
};

const TemplateQr: FC<{
  elementId: string;
  frameStyle: Record<string, unknown>;
  imageSource?: string;
  scancode?: string;
  showPlaceholder: boolean;
}> = ({ elementId, frameStyle, imageSource, scancode, showPlaceholder }) => {
  const [generation, setGeneration] = useState<{
    value: string;
    source?: string;
    failed?: boolean;
  }>();

  useEffect(() => {
    if (imageSource || !scancode) return;

    let active = true;
    void createQrCodeDataUrl(scancode).then((source) => {
      if (active) setGeneration({ value: scancode, source });
    }).catch(() => {
      if (active) setGeneration({ value: scancode, failed: true });
    });
    return () => {
      active = false;
    };
  }, [imageSource, scancode]);

  const currentGeneration = generation?.value === scancode ? generation : undefined;
  const source = imageSource ?? currentGeneration?.source;
  if (source) {
    return (
      <Box
        component="img"
        src={source}
        alt="주문상품 QR"
        data-template-element-id={elementId}
        sx={{ ...frameStyle, objectFit: "contain" }}
      />
    );
  }
  if (!showPlaceholder) return null;

  return (
    <Box
      data-template-element-id={elementId}
      sx={{
        ...frameStyle,
        display: "grid",
        placeItems: "center",
        border: 1,
        borderColor: "common.black",
      }}
    >
      <Stack spacing={0.25} sx={{ alignItems: "center" }}>
        <QrCode2 sx={{ fontSize: "7cqi" }} />
        <Typography sx={{ fontSize: "1.25cqi", lineHeight: 1 }}>
          {currentGeneration?.failed ? "QR 생성 실패" : scancode ? "QR 생성 중" : "QR 데이터 없음"}
        </Typography>
      </Stack>
    </Box>
  );
};

export const PrintTemplateRenderer: FC<{
  document: PrintTemplateDocument;
  layoutType: TemplateLayoutType;
  values: TemplateBindingValues;
  rootRef?: Ref<HTMLDivElement>;
  qrImageSources?: Partial<Record<TemplateBinding, string>>;
  showQrPlaceholder?: boolean;
}> = ({
  document,
  layoutType,
  values,
  rootRef,
  qrImageSources,
  showQrPlaceholder = true,
}) => {
  const layout = document.layouts[layoutType];
  const media = getOrientedTemplateMedia(document, layoutType);

  return (
    <Box
      ref={rootRef}
      data-template-id={document.template_id}
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: `${media.width_mm} / ${media.height_mm}`,
        containerType: "inline-size",
        bgcolor: "common.white",
        color: "common.black",
        overflow: "hidden",
      }}
    >
      {layout.elements.map((element) => {
        const frame = element.frame;
        const frameStyle = {
          position: "absolute",
          left: `${frame.x_mm / media.width_mm * 100}%`,
          top: `${frame.y_mm / media.height_mm * 100}%`,
          width: `${frame.width_mm / media.width_mm * 100}%`,
          height: `${frame.height_mm / media.height_mm * 100}%`,
          transform: `rotate(${frame.rotation_deg}deg)`,
          transformOrigin: "center",
          boxSizing: "border-box",
          overflow: "hidden",
        } as const;

        if (element.kind === "qr") {
          return (
            <TemplateQr
              key={element.id}
              elementId={element.id}
              frameStyle={frameStyle}
              imageSource={qrImageSources?.[element.binding]}
              scancode={values[element.binding]}
              showPlaceholder={showQrPlaceholder}
            />
          );
        }

        if (element.kind === "image") {
          const source = resolveImageSource(element, values);
          return (
            <Box
              key={element.id}
              component="img"
              src={source}
              alt=""
              data-template-element-id={element.id}
              sx={{ ...frameStyle, objectFit: "contain" }}
            />
          );
        }

        return (
          <TemplateText
            key={element.id}
            element={element}
            mediaWidthMm={media.width_mm}
            value={resolveText(element, values)}
            frameStyle={frameStyle}
          />
        );
      })}
    </Box>
  );
};
