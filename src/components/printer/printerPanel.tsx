import { Add, DeleteOutlined, SettingsOutlined } from "@mui/icons-material";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState, type FC } from "react";
import {
  printerManager,
  type PrinterDevice,
  type PrinterRestoreFailure,
  type PrinterRestoreSkipped,
} from "../../apis/printer";
import { usePrinterState, useRegisteredPrinterDevices } from "../../hooks/usePrinter";
import { toMessage } from "../../utils/bytes";
import { PrinterDeviceDialog } from "./printerDeviceDialog";

const TRANSPORT_LABELS = { usb: "USB", btspp: "BT SPP", ble: "BLE" } as const;
const STATUS_LABELS = {
  disconnected: "연결 안 됨",
  connecting: "연결 중",
  ready: "연결됨",
  printing: "인쇄 중",
  disconnecting: "연결 해제 중",
  faulted: "오류",
} as const;

const RegisteredPrinterRow: FC<{
  device: PrinterDevice;
  onSettings: () => void;
  onDelete: () => void;
}> = ({ device, onSettings, onDelete }) => {
  const state = usePrinterState(device.key);

  return (
    <ListItem
      secondaryAction={
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<SettingsOutlined />} onClick={onSettings}>설정</Button>
          <Button size="small" color="error" startIcon={<DeleteOutlined />} onClick={onDelete}>삭제</Button>
        </Stack>
      }
    >
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <span>{device.name}</span>
            <Chip size="small" label={TRANSPORT_LABELS[device.transport]} />
            <Chip size="small" color="primary" label={device.profile?.name ?? "지원하지 않는 기기"} />
            <Chip
              size="small"
              color={state.status === "ready" ? "success" : state.status === "faulted" ? "error" : "default"}
              label={STATUS_LABELS[state.status]}
            />
          </Stack>
        }
        secondary={state.error?.message || [device.address, device.serialNumber && `SN:${device.serialNumber}`].filter(Boolean).join(" · ")}
      />
    </ListItem>
  );
};

export const PrinterPanel: FC = () => {
  const devices = useRegisteredPrinterDevices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetKey, setTargetKey] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<PrinterDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreFailures, setRestoreFailures] = useState<PrinterRestoreFailure[]>([]);
  const [restoreSkipped, setRestoreSkipped] = useState<PrinterRestoreSkipped[]>([]);

  useEffect(() => {
    let active = true;
    const load = printerManager.restoreRegisteredConnections().then(({ failed, skipped }) => {
      if (!active) return;
      setRestoreFailures(failed);
      setRestoreSkipped(skipped);
    });
    void load.catch((reason: unknown) => {
      if (active) setError(toMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const openAdd = () => {
    setTargetKey(undefined);
    setDialogOpen(true);
  };

  const openSettings = (key: string) => {
    setTargetKey(key);
    setDialogOpen(true);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await printerManager.removeDevice(deleteTarget.key);
      setDeleteTarget(null);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Button startIcon={<Add />} variant="contained" onClick={openAdd}>기기 추가</Button>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {restoreFailures.length > 0 && (
        <Alert severity="warning" onClose={() => setRestoreFailures([])}>
          <Stack spacing={0.5}>
            {restoreFailures.map(({ device, reason }) => (
              <span key={device.key}><strong>{device.name}</strong>: {reason}</span>
            ))}
          </Stack>
        </Alert>
      )}
      {restoreSkipped.length > 0 && (
        <Alert severity="info" onClose={() => setRestoreSkipped([])}>
          <Stack spacing={0.5}>
            {restoreSkipped.map(({ device, reason }) => (
              <span key={device.key}><strong>{device.name}</strong>: {reason}</span>
            ))}
          </Stack>
        </Alert>
      )}
      {loading && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CircularProgress size={20} />
          <Typography variant="body2">등록된 프린터의 연결 상태를 확인하는 중입니다</Typography>
        </Stack>
      )}

      <Typography variant="subtitle2">기기 목록 ({devices.length})</Typography>
      <List dense disablePadding>
        {!loading && devices.length === 0 && (
          <ListItem><ListItemText primary="(등록된 프린터 없음)" /></ListItem>
        )}
        {devices.map((device) => (
          <RegisteredPrinterRow
            key={device.key}
            device={device}
            onSettings={() => openSettings(device.key)}
            onDelete={() => setDeleteTarget(device)}
          />
        ))}
      </List>

      <PrinterDeviceDialog
        open={dialogOpen}
        deviceKey={targetKey}
        onClose={() => setDialogOpen(false)}
      />

      <Dialog open={deleteTarget !== null} onClose={deleting ? undefined : () => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>프린터 삭제</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{deleteTarget?.name}</strong> 프린터를 삭제할까요? 연결을 해제하고 저장된 라벨 설정도 삭제합니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={deleting} onClick={() => setDeleteTarget(null)}>취소</Button>
          <Button color="error" disabled={deleting} onClick={() => void remove()}>
            {deleting ? "삭제 중…" : "삭제"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
