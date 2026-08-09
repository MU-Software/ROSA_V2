import {
  CameraAltOutlined,
  ExpandMore,
  PrintOutlined,
  QrCodeScanner,
  Refresh,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  type ChipProps,
} from "@mui/material";
import { useState, type FC, type ReactNode } from "react";
import { printerManager, type PrinterConnectionStatus } from "../../../apis/printer";
import { serialManager, type SerialDevice } from "../../../apis/serial";
import type { RegistrationDeskStatistics } from "../../../gateways";
import { useRegisteredPrinterDevices } from "../../../hooks/usePrinter";
import type { QrScannerStatus } from "../../../hooks/useQrScanner";
import { useSerialDevices } from "../../../hooks/useSerialPort";

type SidebarPanelProps = {
  defaultExpanded: boolean;
};

type DeviceStatus = {
  label: string;
  color: ChipProps["color"];
  ready: boolean;
};

const panelSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  "&:before": { display: "none" },
};

const formatRequestedAt = (requestedAt: number): string =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(requestedAt);

export const RegistrationStatisticsPanel: FC<SidebarPanelProps & {
  statistics: RegistrationDeskStatistics | null;
  error: string | null;
  requestedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}> = ({ defaultExpanded, statistics, error, requestedAt, refreshing, onRefresh }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const registrationRate = statistics && statistics.registration_target_count > 0
    ? (statistics.registered_count / statistics.registration_target_count) * 100
    : 0;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, nextExpanded) => setExpanded(nextExpanded)}
      disableGutters
      elevation={0}
      sx={panelSx}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ width: "100%", alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            현재 등록 현황
          </Typography>
          {statistics ? (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`${statistics.registered_count.toLocaleString()} / ${statistics.registration_target_count.toLocaleString()}명`}
            />
          ) : error ? (
            <Chip size="small" color="warning" label="확인 필요" />
          ) : (
            <Chip size="small" variant="outlined" label="불러오는 중" />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Divider sx={{ mb: 2 }} />
        {error ? (
          <Alert severity="warning">{error}</Alert>
        ) : statistics ? (
          <Stack spacing={2}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {statistics.registered_count.toLocaleString()}
                </Typography>
                <Typography color="text.secondary">
                  / {statistics.registration_target_count.toLocaleString()}명
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">등록 완료</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={registrationRate}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 0.5,
                textAlign: "center",
              }}
            >
              <StatisticValue label="등록 대상">
                {statistics.registration_target_count.toLocaleString()}
              </StatisticValue>
              <StatisticValue label="등록 완료" color="success.main">
                {statistics.registered_count.toLocaleString()}
              </StatisticValue>
              <StatisticValue label="등록 대기" color="warning.main">
                {statistics.waiting_count.toLocaleString()}
              </StatisticValue>
            </Box>
          </Stack>
        ) : (
          <Box sx={{ display: "grid", placeItems: "center", minHeight: 120 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ mt: 1.5, alignItems: "center", justifyContent: "flex-end" }}
        >
          <Typography variant="caption" color="text.secondary">
            {requestedAt ? `${formatRequestedAt(requestedAt)} 조회` : "조회 전"}
          </Typography>
          <Tooltip title="등록 현황 새로고침">
            <span>
              <IconButton
                size="small"
                aria-label="등록 현황 새로고침"
                disabled={refreshing}
                onClick={onRefresh}
              >
                {refreshing ? <CircularProgress size={16} /> : <Refresh fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

const StatisticValue: FC<{
  children: ReactNode;
  label: string;
  color?: string;
}> = ({ children, label, color }) => (
  <Box>
    <Typography variant="subtitle1" color={color}>{children}</Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Box>
);

const getSerialStatus = (device: SerialDevice): DeviceStatus => {
  if (!serialManager.isOpen(device.key)) {
    return { label: "연결 안 됨", color: "default", ready: false };
  }
  if (!device.framing) {
    return { label: "설정 필요", color: "warning", ready: false };
  }
  return { label: "준비됨", color: "success", ready: true };
};

const PRINTER_STATUS: Record<PrinterConnectionStatus, DeviceStatus> = {
  disconnected: { label: "연결 안 됨", color: "default", ready: false },
  connecting: { label: "연결 중", color: "info", ready: false },
  ready: { label: "준비됨", color: "success", ready: true },
  printing: { label: "출력 중", color: "info", ready: true },
  disconnecting: { label: "연결 해제 중", color: "default", ready: false },
  faulted: { label: "오류", color: "error", ready: false },
};

const getCameraStatus = (status: QrScannerStatus, error: Error | null): DeviceStatus => {
  if (error || status === "error") return { label: "오류", color: "error", ready: false };
  if (status === "starting") return { label: "시작 중", color: "info", ready: false };
  if (status === "switching") return { label: "전환 중", color: "info", ready: false };
  if (status === "stopping") return { label: "중단 중", color: "default", ready: false };
  if (status === "scanning") return { label: "준비됨", color: "success", ready: true };
  return { label: "시작 필요", color: "warning", ready: false };
};

export const DeviceStatusPanel: FC<SidebarPanelProps & {
  camera?: { status: QrScannerStatus; error: Error | null };
}> = ({ defaultExpanded, camera }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const serialDevices = useSerialDevices();
  const printerDevices = useRegisteredPrinterDevices();
  const qrDevices = camera ? [{ key: "camera", label: "카메라" }] : serialDevices;
  const qrStatuses = camera ? [getCameraStatus(camera.status, camera.error)] : serialDevices.map(getSerialStatus);
  const printerStatuses = printerDevices.map((device) => PRINTER_STATUS[printerManager.getState(device.key).status]);
  const readyCount = [...qrStatuses, ...printerStatuses].filter((status) => status.ready).length;
  const deviceCount = qrDevices.length + printerDevices.length;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, nextExpanded) => setExpanded(nextExpanded)}
      disableGutters
      elevation={0}
      sx={panelSx}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ width: "100%", alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            현재 장치 현황
          </Typography>
          <Chip
            size="small"
            color={deviceCount > 0 && readyCount === deviceCount ? "success" : "default"}
            variant="outlined"
            label={deviceCount > 0 ? `${readyCount} / ${deviceCount} 준비` : "등록 장치 없음"}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Divider sx={{ mb: 1 }} />
        <Stack divider={<Divider flexItem />}>
          {qrDevices.length === 0 ? (
            <EmptyDeviceRow icon={<QrCodeScanner color="action" />} label="등록된 QR 리더 없음" />
          ) : qrDevices.map((device, index) => (
            <DeviceRow
              key={device.key}
              icon={camera ? <CameraAltOutlined color="action" /> : <QrCodeScanner color="action" />}
              name={device.label ?? `QR 리더 ${index + 1}`}
              status={qrStatuses[index]}
            />
          ))}
          {printerDevices.length === 0 ? (
            <EmptyDeviceRow icon={<PrintOutlined color="action" />} label="등록된 프린터 없음" />
          ) : printerDevices.map((device, index) => (
            <DeviceRow
              key={device.key}
              icon={<PrintOutlined color="action" />}
              name={device.name}
              status={printerStatuses[index]}
            />
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

const DeviceRow: FC<{
  icon: ReactNode;
  name: string;
  status: DeviceStatus;
}> = ({ icon, name, status }) => (
  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", py: 1.25 }}>
    {icon}
    <Typography variant="body2" noWrap sx={{ flex: 1 }} title={name}>
      {name}
    </Typography>
    <Chip size="small" color={status.color} label={status.label} />
  </Stack>
);

const EmptyDeviceRow: FC<{ icon: ReactNode; label: string }> = ({ icon, label }) => (
  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", py: 1.25 }}>
    {icon}
    <Typography variant="body2" color="text.secondary">{label}</Typography>
  </Stack>
);
