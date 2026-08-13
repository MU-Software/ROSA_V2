import { ArrowBack, Redo, RestartAlt, Undo } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState, type FC } from "react";
import { Link } from "react-router";
import { TemplateEditorCanvas } from "../components/printing/templateEditorCanvas";
import { TemplateElementInspector } from "../components/printing/templateElementInspector";
import { useTopBar } from "../contexts";
import { useTemplateDocumentHistory } from "../hooks/useTemplateDocumentHistory";
import {
  changeTemplateOrientation,
  getOrientedTemplateMedia,
  updateTemplateElement,
  type PrintTemplateDocument,
  type TemplateLayoutType,
  type TemplateOrientation,
} from "../printing/templateDocument";
import {
  BUILT_IN_BADGE_TEMPLATES,
  DEFAULT_BADGE_TEMPLATE,
  findBuiltInBadgeTemplate,
} from "../printing/templates";

const elementLabels: Record<string, string> = {
  "event-logo": "파이콘 로고",
  name: "이름",
  organization: "소속",
  role: "역할",
  scancode: "QR 코드",
};

const cloneDocument = (document: PrintTemplateDocument): PrintTemplateDocument =>
  structuredClone(document);

export const TemplatesPage: FC = () => {
  const [sourceTemplateId, setSourceTemplateId] = useState(DEFAULT_BADGE_TEMPLATE.template_id);
  const {
    document,
    canUndo,
    canRedo,
    commit: commitDocument,
    replace: replaceDocument,
    undo,
    redo,
  } = useTemplateDocumentHistory(cloneDocument(DEFAULT_BADGE_TEMPLATE.document));
  const [layoutType, setLayoutType] = useState<TemplateLayoutType>("wide");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const layout = document.layouts[layoutType];
  const media = getOrientedTemplateMedia(document, layoutType);
  const sourceTemplate = findBuiltInBadgeTemplate(sourceTemplateId);
  const selectedElement = layout.elements.find(({ id }) => id === selectedElementId) ?? null;

  useTopBar(useMemo(() => ({
    title: "명찰 템플릿",
    rightActionButtons: (
      <Tooltip title="ROSA로 돌아가기">
        <IconButton color="inherit" component={Link} to="/" aria-label="ROSA로 돌아가기">
          <ArrowBack />
        </IconButton>
      </Tooltip>
    ),
  }), []));

  const changeSourceTemplate = (templateId: string) => {
    const template = findBuiltInBadgeTemplate(templateId);
    if (!template) return;
    setSourceTemplateId(templateId);
    replaceDocument(cloneDocument(template.document));
    setSelectedElementId(null);
  };

  const resetDocument = () => {
    const template = findBuiltInBadgeTemplate(sourceTemplateId);
    if (!template) return;
    commitDocument(cloneDocument(template.document));
    setSelectedElementId(null);
  };

  const changeOrientation = (orientation: TemplateOrientation | null) => {
    if (!orientation) return;
    commitDocument(changeTemplateOrientation(document, orientation));
    setSelectedElementId(null);
  };

  return (
    <Box sx={{ minHeight: "calc(100dvh - 64px)", bgcolor: "grey.50" }}>
      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Alert severity="info">
            현재 편집 내용은 이 화면에서만 유지됩니다. 저장과 태그별 템플릿 연결은 서버 연동
            단계에서 추가합니다.
          </Alert>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ alignItems: { xs: "stretch", md: "center" } }}
            >
              <TextField
                select
                size="small"
                label="기본 템플릿"
                value={sourceTemplateId}
                onChange={(event) => changeSourceTemplate(event.target.value)}
                sx={{ minWidth: 220 }}
              >
                {BUILT_IN_BADGE_TEMPLATES.map((template) => (
                  <MenuItem key={template.template_id} value={template.template_id}>
                    {template.name}
                  </MenuItem>
                ))}
              </TextField>

              <ToggleButtonGroup
                exclusive
                size="small"
                value={layoutType}
                onChange={(_event, next: TemplateLayoutType | null) => {
                  if (!next) return;
                  setLayoutType(next);
                  setSelectedElementId(null);
                }}
              >
                <ToggleButton value="wide">Wide</ToggleButton>
                <ToggleButton value="compact">Compact</ToggleButton>
              </ToggleButtonGroup>

              <ToggleButtonGroup
                exclusive
                size="small"
                value={document.orientation}
                onChange={(_event, next: TemplateOrientation | null) => changeOrientation(next)}
              >
                <ToggleButton value="landscape">가로</ToggleButton>
                <ToggleButton value="portrait">세로</ToggleButton>
              </ToggleButtonGroup>

              <Chip
                variant="outlined"
                label={`${media.width_mm} × ${media.height_mm} mm`}
              />

              <Button
                startIcon={<RestartAlt />}
                onClick={resetDocument}
                sx={{ ml: { md: "auto" } }}
              >
                초기화
              </Button>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="실행 취소">
                  <span>
                    <IconButton disabled={!canUndo} onClick={undo} aria-label="실행 취소">
                      <Undo />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="다시 실행">
                  <span>
                    <IconButton disabled={!canRedo} onClick={redo} aria-label="다시 실행">
                      <Redo />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </Paper>

          <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
            <Paper
              variant="outlined"
              sx={{ flex: 1, minWidth: 0, overflow: "hidden", bgcolor: "grey.100" }}
            >
              <TemplateEditorCanvas
                document={document}
                layoutType={layoutType}
                selectedElementId={selectedElementId}
                values={{
                  "ticket.name": "홍길동",
                  "ticket.organization": "파이썬 사용자 모임",
                  "badge.role_label": sourceTemplate?.role_label ?? "참가자",
                }}
                onDocumentChange={commitDocument}
                onSelectedElementChange={setSelectedElementId}
              />
            </Paper>

            <Paper variant="outlined" sx={{ width: { xs: "100%", lg: 320 }, flexShrink: 0 }}>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6">요소</Typography>
                <Typography variant="body2" color="text.secondary">
                  캔버스에서 요소를 선택해 이동하거나 크기를 조절할 수 있습니다.
                </Typography>
              </Box>
              <Divider />
              <List disablePadding>
                {layout.elements.map((element) => (
                  <ListItemButton
                    key={element.id}
                    selected={element.id === selectedElementId}
                    onClick={() => setSelectedElementId(element.id)}
                  >
                    <ListItemText
                      primary={elementLabels[element.id] ?? element.id}
                      secondary={element.kind === "text"
                        ? "텍스트"
                        : element.kind === "image" ? "이미지" : "QR 코드"}
                    />
                  </ListItemButton>
                ))}
              </List>
              {selectedElement && (
                <>
                  <Divider />
                  <TemplateElementInspector
                    element={selectedElement}
                    media={media}
                    onElementChange={(element) => commitDocument(
                      updateTemplateElement(document, layoutType, element),
                    )}
                  />
                </>
              )}
            </Paper>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
};
