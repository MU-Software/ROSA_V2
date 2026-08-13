import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useState, type FC } from "react";
import { printerManager, type PrinterDevice } from "../../../apis/printer";
import { ExchangeVoucher } from "../../printing/exchangeVoucher";
import { PrintTemplateRenderer } from "../../printing/templateRenderer";
import { getPaidOptionExchangeTargets, type OrderProductRelation } from "../../../domain";
import { createRegistrationPrintQueue } from "../../../printing/queue";
import { renderRegistrationPrintJob } from "../../../printing/registrationJobRenderer";
import { selectBadgeTemplate } from "../../../printing/templates";
import type { TemplateBindingValues, TemplateLayoutType } from "../../../printing/templateDocument";
import { usePrintMutation } from "../../../hooks/usePrintMutation";
import { useRegisteredPrinterDevices } from "../../../hooks/usePrinter";

const printerLabel = (device: PrinterDevice): string =>
  `${device.name} · ${device.transport.toUpperCase()}`;

const BadgePreview: FC<{ product: OrderProductRelation }> = ({ product }) => {
  const [layoutType, setLayoutType] = useState<TemplateLayoutType>("wide");
  const [selectedPrinterKey, setSelectedPrinterKey] = useState("");
  const [printMessage, setPrintMessage] = useState<string>();
  const printers = useRegisteredPrinterDevices();
  const printMutation = usePrintMutation();
  const ticket = product.ticket_info;
  if (!ticket) return null;
  const template = selectBadgeTemplate(product);
  const values: TemplateBindingValues = {
    "ticket.name": ticket.name,
    "ticket.organization": ticket.organization ?? undefined,
    "badge.role_label": template.role_label,
  };
  const selectedPrinter = printers.find(({ key }) => key === selectedPrinterKey) ??
    printerManager.getPrintRoute("badge") ?? printers[0];

  const printBadge = async () => {
    if (!selectedPrinter) return;
    setPrintMessage(undefined);
    try {
      if (!printerManager.isConnected(selectedPrinter.key)) {
        await printerManager.connect(selectedPrinter.key);
      }
      const { width, height } = printerManager.imageSize(selectedPrinter.key);
      if (!height) throw new Error("프린터 라벨 높이가 설정되지 않았습니다");
      const entry = createRegistrationPrintQueue(product).snapshot()
        .find(({ job }) => job.template_id === template.template_id);
      if (!entry) throw new Error("명찰 출력 작업을 준비하지 못했습니다");
      const image = await renderRegistrationPrintJob(entry, width, height);
      const result = await printMutation.mutateAsync({ device: selectedPrinter, image });
      setPrintMessage(result.completionConfirmed ? "명찰 출력을 완료했습니다." : "명찰을 프린터로 전송했습니다.");
    } catch (reason) {
      setPrintMessage(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <Stack spacing={1}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>명찰</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
          <Chip size="small" label={template.name} />
          <Chip
            size="small"
            variant="outlined"
            label={template.document.orientation === "landscape" ? "가로" : "세로"}
          />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={layoutType}
            onChange={(_event, next: TemplateLayoutType | null) => {
              if (next) setLayoutType(next);
            }}
          >
            <ToggleButton value="wide">Wide</ToggleButton>
            <ToggleButton value="compact">Compact</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: layoutType === "wide" ? 720 : 480,
          mx: "auto",
          overflow: "hidden",
        }}
      >
        <PrintTemplateRenderer
          document={template.document}
          layoutType={layoutType}
          values={values}
        />
      </Paper>
      {printers.length === 0 ? (
        <Alert severity="warning">장치 진단에서 명찰 프린터를 먼저 등록해주세요.</Alert>
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            select
            size="small"
            label="명찰 프린터"
            value={selectedPrinter?.key ?? ""}
            onChange={(event) => setSelectedPrinterKey(event.target.value)}
            sx={{ flex: 1 }}
          >
            {printers.map((printer) => (
              <MenuItem key={printer.key} value={printer.key}>{printerLabel(printer)}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            disabled={!selectedPrinter || printMutation.isPending}
            onClick={() => void printBadge()}
          >
            {printMutation.isPending ? "출력 중…" : "명찰 출력"}
          </Button>
        </Stack>
      )}
      {printMessage && (
        <Alert severity={printMutation.error ? "error" : "success"}>{printMessage}</Alert>
      )}
    </Stack>
  );
};

export const PrintPreviewDialog: FC<{
  product: OrderProductRelation;
  onClose: () => void;
}> = ({ product, onClose }) => {
  const exchangeTargets = getPaidOptionExchangeTargets(product);
  const hasBadge = product.is_ticket && !!product.ticket_info;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>출력물 미리보기</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 0.5 }}>
          <Alert severity="info">
            역할 태그에 따라 기본 명찰 템플릿을 선택합니다. 명찰 QR 데이터 연결은 서버 연동 단계에서 적용됩니다.
          </Alert>
          {!hasBadge && exchangeTargets.length === 0 && (
            <Alert severity="warning">미리볼 출력물이 없습니다.</Alert>
          )}
          {hasBadge && <BadgePreview product={product} />}
          {hasBadge && exchangeTargets.length > 0 && <Divider />}
          {exchangeTargets.length > 0 && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                유료 옵션 교환권 1장 · {exchangeTargets.length}개 항목
              </Typography>
              <Box sx={{ width: "100%", maxWidth: 560, mx: "auto" }}>
                <ExchangeVoucher product={product} targets={exchangeTargets} />
              </Box>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
};
