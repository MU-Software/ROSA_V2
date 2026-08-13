import { ArrowBack, Redo, RestartAlt, SaveOutlined, Undo } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import { useEffect, useMemo, useState, type FC } from "react";
import { Link } from "react-router";
import { TemplateEditorCanvas } from "../components/printing/templateEditorCanvas";
import { TemplateElementInspector } from "../components/printing/templateElementInspector";
import { useTopBar } from "../contexts";
import type { RegistrationDeskGateway } from "../gateways";
import { useRegistrationConfigurationQuery } from "../hooks/useRegistrationDesk";
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
  loadBadgeTemplateSettings,
  findBuiltInBadgeTemplate,
  saveBadgeTemplateSettings,
  setActiveBadgeTemplateConfiguration,
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

const NO_TAG_VALUE = "__no_tag__";

export const TemplatesPage: FC<{ gateway: RegistrationDeskGateway }> = ({ gateway }) => {
  const { data: configuration } = useRegistrationConfigurationQuery(gateway);
  const [settings, setSettings] = useState(() => loadBadgeTemplateSettings(configuration.id));
  const [sourceTemplateId, setSourceTemplateId] = useState(DEFAULT_BADGE_TEMPLATE.template_id);
  const {
    document,
    canUndo,
    canRedo,
    commit: commitDocument,
    replace: replaceDocument,
    undo,
    redo,
  } = useTemplateDocumentHistory(cloneDocument(
    settings.documents[DEFAULT_BADGE_TEMPLATE.template_id] ?? DEFAULT_BADGE_TEMPLATE.document,
  ));
  const [layoutType, setLayoutType] = useState<TemplateLayoutType>("wide");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const layout = document.layouts[layoutType];
  const media = getOrientedTemplateMedia(document, layoutType);
  const sourceTemplate = findBuiltInBadgeTemplate(sourceTemplateId);
  const selectedElement = layout.elements.find(({ id }) => id === selectedElementId) ?? null;
  const appliedTagCodes = configuration.available_tags
    .filter(({ code }) => settings.tag_template_ids[code] === sourceTemplateId)
    .map(({ code }) => code);
  const appliedTargets = settings.default_template_id === sourceTemplateId
    ? [NO_TAG_VALUE, ...appliedTagCodes]
    : appliedTagCodes;

  useEffect(() => {
    setActiveBadgeTemplateConfiguration(configuration.id);
  }, [configuration.id]);
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
    replaceDocument(cloneDocument(settings.documents[templateId] ?? template.document));
    setSelectedElementId(null);
  };

  const saveSettings = () => {
    const nextSettings = saveBadgeTemplateSettings(configuration.id, {
      ...settings,
      documents: {
        ...settings.documents,
        [sourceTemplateId]: document,
      },
    });
    setSettings(nextSettings);
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

  const changeAppliedTags = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    const selectedTargets = new Set(typeof value === "string" ? value.split(",") : value);
    const selectedTagCodes = new Set(
      [...selectedTargets].filter((target) => target !== NO_TAG_VALUE),
    );
    const availableTagCodes = new Set(configuration.available_tags.map(({ code }) => code));
    setSettings((current) => {
      const tagTemplateIds = Object.fromEntries(
        Object.entries(current.tag_template_ids).filter(([code, templateId]) =>
          templateId !== sourceTemplateId ||
          !availableTagCodes.has(code) ||
          selectedTagCodes.has(code)),
      );
      selectedTagCodes.forEach((code) => {
        tagTemplateIds[code] = sourceTemplateId;
      });
      return {
        ...current,
        default_template_id: selectedTargets.has(NO_TAG_VALUE)
          ? sourceTemplateId
          : current.default_template_id,
        tag_template_ids: tagTemplateIds,
      };
    });
  };

  return (
    <Box sx={{ minHeight: "calc(100dvh - 64px)", bgcolor: "grey.50" }}>
      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Alert severity="info">
            편집한 템플릿과 태그 연결은 이 브라우저의 현재 등록 데스크 설정에 저장되며,
            서버에는 전송되지 않습니다.
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
                variant="contained"
                startIcon={<SaveOutlined />}
                onClick={saveSettings}
                sx={{ ml: { md: "auto" } }}
              >
                저장
              </Button>
              <Button
                startIcon={<RestartAlt />}
                onClick={resetDocument}
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

            <Stack sx={{ width: { xs: "100%", lg: 320 }, flexShrink: 0 }} spacing={2}>
              <Paper variant="outlined">
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

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack spacing={0.5}>
                    <Typography variant="h6">적용될 태그</Typography>
                    <Typography variant="body2" color="text.secondary">
                      선택한 태그가 있는 주문상품에 이 템플릿을 사용하며, priority가 낮은 태그를 우선합니다.
                    </Typography>
                  </Stack>
                  {configuration.available_tags.length === 0 ? (
                    <Alert severity="warning">사용할 수 있는 태그가 없습니다.</Alert>
                  ) : (
                    <FormControl size="small" fullWidth>
                      <InputLabel id="badge-template-tags-label">태그</InputLabel>
                      <Select
                        multiple
                        labelId="badge-template-tags-label"
                        value={appliedTargets}
                        input={<OutlinedInput label="태그" />}
                        onChange={changeAppliedTags}
                        renderValue={(selected) => (
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                            {selected.map((code) => (
                              <Chip
                                key={code}
                                size="small"
                                label={code === NO_TAG_VALUE
                                  ? "태그 없음"
                                  : configuration.available_tags.find(
                                    (tag) => tag.code === code,
                                  )?.name ?? code}
                              />
                            ))}
                          </Box>
                        )}
                      >
                        <MenuItem
                          value={NO_TAG_VALUE}
                          disabled={settings.default_template_id === sourceTemplateId}
                        >
                          <Checkbox checked={settings.default_template_id === sourceTemplateId} />
                          <ListItemText
                            primary="태그 없음"
                            secondary={settings.default_template_id === sourceTemplateId
                              ? "다른 템플릿에서 선택하면 기본값이 변경됩니다."
                              : "태그가 없거나 연결된 템플릿이 없을 때 적용"}
                          />
                        </MenuItem>
                        {configuration.available_tags.map((tag) => (
                          <MenuItem key={tag.id} value={tag.code}>
                            <Checkbox checked={appliedTagCodes.includes(tag.code)} />
                            <ListItemText
                              primary={tag.name}
                              secondary={`${tag.code} · priority ${tag.priority}`}
                            />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
};
