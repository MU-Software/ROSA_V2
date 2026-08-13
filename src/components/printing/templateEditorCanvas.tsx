import { Box } from "@mui/material";
import { useCallback, useRef, type FC, type PointerEvent } from "react";
import Moveable, { type OnDrag, type OnResize } from "react-moveable";
import {
  getOrientedTemplateMedia,
  updateTemplateElementFrame,
  type PrintTemplateDocument,
  type TemplateBindingValues,
  type TemplateLayoutType,
} from "../../printing/templateDocument";
import { PrintTemplateRenderer } from "./templateRenderer";

const roundMillimeters = (value: number): number => Math.round(value * 100) / 100;

export const TemplateEditorCanvas: FC<{
  document: PrintTemplateDocument;
  layoutType: TemplateLayoutType;
  selectedElementId: string | null;
  values: TemplateBindingValues;
  onDocumentChange: (document: PrintTemplateDocument) => void;
  onSelectedElementChange: (elementId: string | null) => void;
}> = ({
  document,
  layoutType,
  selectedElementId,
  values,
  onDocumentChange,
  onSelectedElementChange,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const media = getOrientedTemplateMedia(document, layoutType);
  const getSelectedTarget = useCallback((): HTMLElement => {
    const target = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>(
      "[data-template-element-id]",
    ) ?? []).find(({ dataset }) => dataset.templateElementId === selectedElementId);
    if (!target) throw new Error("선택한 템플릿 요소를 찾을 수 없습니다.");
    return target;
  }, [selectedElementId]);

  const commitTargetFrame = (element: HTMLElement | SVGElement) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedElementId || !(element instanceof HTMLElement)) return;

    const widthMm = Math.min(element.offsetWidth / canvas.clientWidth * media.width_mm, media.width_mm);
    const heightMm = Math.min(
      element.offsetHeight / canvas.clientHeight * media.height_mm,
      media.height_mm,
    );
    const xMm = Math.min(
      Math.max(element.offsetLeft / canvas.clientWidth * media.width_mm, 0),
      media.width_mm - widthMm,
    );
    const yMm = Math.min(
      Math.max(element.offsetTop / canvas.clientHeight * media.height_mm, 0),
      media.height_mm - heightMm,
    );
    const currentElement = document.layouts[layoutType].elements.find(
      ({ id }) => id === selectedElementId,
    );
    if (!currentElement) return;

    onDocumentChange(updateTemplateElementFrame(document, layoutType, selectedElementId, {
      ...currentElement.frame,
      x_mm: roundMillimeters(xMm),
      y_mm: roundMillimeters(yMm),
      width_mm: roundMillimeters(widthMm),
      height_mm: roundMillimeters(heightMm),
    }));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const pointerTarget = event.target as HTMLElement;
    if (pointerTarget.closest(".moveable-control-box")) return;
    const element = pointerTarget.closest<HTMLElement>(
      "[data-template-element-id]",
    );
    onSelectedElementChange(element?.dataset.templateElementId ?? null);
  };

  const handleDrag = ({ target: nextTarget, left, top }: OnDrag) => {
    if (!(nextTarget instanceof HTMLElement)) return;
    nextTarget.style.left = `${left}px`;
    nextTarget.style.top = `${top}px`;
  };

  const handleResize = ({ target: nextTarget, width, height, drag }: OnResize) => {
    if (!(nextTarget instanceof HTMLElement)) return;
    nextTarget.style.width = `${width}px`;
    nextTarget.style.height = `${height}px`;
    nextTarget.style.left = `${drag.left}px`;
    nextTarget.style.top = `${drag.top}px`;
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: document.orientation === "landscape" ? 900 : 480,
        p: 4,
        mx: "auto",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <Box
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        sx={{
          position: "relative",
          width: "100%",
          boxShadow: 4,
          "& [data-template-element-id]": { cursor: "pointer" },
        }}
      >
        <PrintTemplateRenderer document={document} layoutType={layoutType} values={values} />
        <Moveable
          target={selectedElementId ? getSelectedTarget : null}
          draggable
          resizable
          origin={false}
          throttleDrag={0}
          throttleResize={0}
          renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
          onDrag={handleDrag}
          onDragEnd={({ target: nextTarget }) => commitTargetFrame(nextTarget)}
          onResize={handleResize}
          onResizeEnd={({ target: nextTarget }) => commitTargetFrame(nextTarget)}
        />
      </Box>
    </Box>
  );
};
