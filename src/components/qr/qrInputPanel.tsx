import { Add, DeleteOutlined, Refresh } from "@mui/icons-material";
import {
  Alert,
  Box,
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
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState, type FC } from "react";
import { listCameras, type CameraInfo } from "../../adapters";
import { serialManager, type RestoreFailure, type SerialDevice } from "../../apis/serial";
import { useQrScanner } from "../../hooks/useQrScanner";
import { useQrTrigger, type QrTriggerEvent } from "../../hooks/useQrTrigger";
import { useSerialDevices, useSerialPort } from "../../hooks/useSerialPort";
import { toMessage } from "../../utils/bytes";
import { getQrInputMode, isSerialSupported } from "../../utils/platform";
import { SerialDeviceSetupDialog } from "./serialDeviceSetupDialog";

export type QrInputPanelProps = {
  onDetected?: (event: QrTriggerEvent) => void;
  cooldownMs?: number;
};

const CAMERA_STATUS_LABELS = {
  starting: "카메라 시작 중…",
  switching: "카메라 변경 중…",
  stopping: "카메라 중단 중…",
} as const;

const DeleteConfirmationDialog: FC<{
  open: boolean;
  name: string;
  description: string;
  deleting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, name, description, deleting = false, error, onCancel, onConfirm }) => (
  <Dialog open={open} onClose={deleting ? undefined : onCancel} maxWidth="xs" fullWidth>
    <DialogTitle>QR 리더 삭제</DialogTitle>
    <DialogContent>
      <DialogContentText>
        <strong>{name}</strong> QR 리더를 삭제할까요? {description}
      </DialogContentText>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions>
      <Button disabled={deleting} onClick={onCancel}>취소</Button>
      <Button color="error" disabled={deleting} onClick={onConfirm}>
        {deleting ? "삭제 중…" : "삭제"}
      </Button>
    </DialogActions>
  </Dialog>
);

const SerialDeviceRow: FC<{ device: SerialDevice; onSetup: () => void }> = ({ device, onSetup }) => {
  const { connected, error } = useSerialPort(device.key);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const configured = !!device.label && !!device.baudRate && !!device.framing;
  const status = error || actionError ? "오류" : connected ? "연결됨" : configured ? "연결 안 됨" : "설정 필요";
  const color = error || actionError ? "error" : connected ? "success" : configured ? "default" : "warning";

  const connect = async () => {
    setActionError(null);
    try {
      await serialManager.open(device.key);
    } catch (reason) {
      setActionError(toMessage(reason));
    }
  };

  const remove = async () => {
    setActionError(null);
    setDeleting(true);
    try {
      await serialManager.removeDevice(device.key);
    } catch (reason) {
      setDeleting(false);
      setActionError(toMessage(reason));
    }
  };

  return (
    <>
      <ListItem
        secondaryAction={
          <Stack direction="row" spacing={1}>
            {configured && !connected && (
              <Button size="small" disabled={deleting} onClick={() => void connect()}>연결</Button>
            )}
            <Button size="small" disabled={deleting} onClick={onSetup}>{configured ? "재설정" : "설정"}</Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlined />}
              disabled={deleting}
              title="연결을 해제하고 앱에서 삭제"
              onClick={() => {
                setActionError(null);
                setConfirmDeleteOpen(true);
              }}
            >
              {deleting ? "삭제 중…" : "삭제"}
            </Button>
          </Stack>
        }
      >
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <span>{device.label || device.key}</span>
              <Chip size="small" color={color} label={status} />
            </Stack>
          }
          secondary={
            error?.message || actionError || [device.key, device.baudRate && `${device.baudRate} baud`].filter(Boolean).join(" · ")
          }
        />
      </ListItem>
      <DeleteConfirmationDialog
        open={confirmDeleteOpen}
        name={device.label || device.key}
        description="연결을 먼저 해제하며 저장된 라벨과 통신 설정도 함께 삭제됩니다."
        deleting={deleting}
        error={actionError}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
};

const SerialQrInput: FC = () => {
  const devices = useSerialDevices();
  const missingLabels = serialManager.listUnassignedLabels();
  const supported = isSerialSupported();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetKey, setTargetKey] = useState<string | undefined>();
  const [missingLabelToRemove, setMissingLabelToRemove] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshFailures, setRefreshFailures] = useState<RestoreFailure[]>([]);

  const openSetup = (key?: string) => {
    setTargetKey(key);
    setDialogOpen(true);
  };

  const removeMissingLabel = () => {
    if (!missingLabelToRemove) return;
    serialManager.removeLabel(missingLabelToRemove);
    setMissingLabelToRemove(null);
  };

  const refreshDevices = async () => {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshFailures([]);
    try {
      const { failed } = await serialManager.restore();
      setRefreshFailures(failed);
    } catch (reason) {
      setRefreshError(toMessage(reason));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle1">Serial QR 리더</Typography>
        <Chip
          size="small"
          color={devices.some((device) => serialManager.isOpen(device.key)) ? "success" : "default"}
          label={`연결 ${devices.filter((device) => serialManager.isOpen(device.key)).length}개`}
        />
      </Stack>

      {!supported && (
        <Alert severity="warning">Web Serial을 지원하는 Chromium 계열 브라우저가 필요합니다.</Alert>
      )}
      {refreshError && <Alert severity="error">Serial 장치 새로고침 실패: {refreshError}</Alert>}
      {refreshFailures.length > 0 && (
        <Alert severity="warning">
          <Stack spacing={0.5}>
            {refreshFailures.map((failure) => (
              <span key={failure.label}><strong>{failure.label}</strong>: {failure.reason}</span>
            ))}
          </Stack>
        </Alert>
      )}

      <List dense disablePadding>
        {devices.length === 0 && missingLabels.length === 0 && (
          <ListItem>
            <ListItemText
              primary="등록된 QR 리더가 없습니다."
              secondary="아래 장치 추가 버튼으로 Serial QR 리더를 설정하세요."
            />
          </ListItem>
        )}
        {devices.map((device) => (
          <SerialDeviceRow key={device.key} device={device} onSetup={() => openSetup(device.key)} />
        ))}
        {missingLabels.map((label) => (
          <ListItem
            key={`missing-${label}`}
            secondaryAction={
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlined />}
                onClick={() => setMissingLabelToRemove(label)}
              >
                삭제
              </Button>
            }
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <span>{label}</span>
                  <Chip size="small" label="장치 없음" />
                </Stack>
              }
              secondary="저장된 QR 리더를 현재 Serial 포트에서 찾지 못했습니다."
            />
          </ListItem>
        ))}
      </List>

      <Stack direction="row" spacing={1}>
        <Button
          startIcon={<Refresh />}
          variant="outlined"
          disabled={!supported || refreshing}
          onClick={() => void refreshDevices()}
        >
          {refreshing ? "새로고침 중…" : "새로고침"}
        </Button>
        <Button
          startIcon={<Add />}
          variant="outlined"
          disabled={!supported || refreshing}
          sx={{ flexGrow: 1 }}
          onClick={() => openSetup()}
        >
          장치 추가
        </Button>
      </Stack>

      <SerialDeviceSetupDialog
        open={dialogOpen}
        targetKey={targetKey}
        onClose={() => setDialogOpen(false)}
      />
      <DeleteConfirmationDialog
        open={missingLabelToRemove !== null}
        name={missingLabelToRemove ?? ""}
        description="현재 장치를 찾을 수 없으며 저장된 라벨과 복원 설정을 삭제합니다."
        onCancel={() => setMissingLabelToRemove(null)}
        onConfirm={removeMissingLabel}
      />
    </Stack>
  );
};

const CameraQrInput: FC<{ scanner: ReturnType<typeof useQrScanner> }> = ({ scanner }) => {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [cameraListError, setCameraListError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = previewRef.current;
    const video = scanner.session?.preview;
    if (!host || !video) return;
    host.appendChild(video);
    return () => host.replaceChildren();
  }, [scanner.session]);

  useEffect(() => {
    if (!scanner.session) return;
    void listCameras().then(
      (found) => {
        setCameras(found);
        setCameraListError(null);
      },
      (reason: unknown) => setCameraListError(toMessage(reason)),
    );
  }, [scanner.session]);

  const selectedDeviceId = deviceId || scanner.session?.deviceId || cameras[0]?.id || "";

  if (!scanner.session) {
    return (
      <Stack spacing={2} sx={{ alignItems: "center" }}>
        {scanner.error && <Alert severity="error" sx={{ width: "100%" }}>{scanner.error.message}</Alert>}
        <Button
          variant="contained"
          disabled={scanner.status === "starting" || scanner.status === "stopping"}
          onClick={() => scanner.start()}
        >
          {scanner.status === "starting" ? "카메라 시작 중…" : "카메라 시작"}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {scanner.error && <Alert severity="error">{scanner.error.message}</Alert>}
      {cameraListError && <Alert severity="warning">카메라 목록 조회 실패: {cameraListError}</Alert>}

      {cameras.length > 1 && (
        <TextField
          select
          size="small"
          label="카메라 변경"
          value={selectedDeviceId}
          disabled={scanner.status === "switching" || scanner.status === "stopping"}
          onChange={(event) => {
            const next = event.target.value;
            setDeviceId(next);
            scanner.switchCamera({ deviceId: next });
          }}
        >
          {cameras.map((camera) => (
            <MenuItem key={camera.id} value={camera.id}>{camera.label}</MenuItem>
          ))}
        </TextField>
      )}

      {(scanner.status === "switching" || scanner.status === "stopping") && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CircularProgress size={18} />
          <Typography variant="caption">{CAMERA_STATUS_LABELS[scanner.status]}</Typography>
        </Stack>
      )}

      <Box sx={{ position: "relative", width: "100%", maxWidth: 640, mx: "auto", bgcolor: "black", aspectRatio: "4 / 3" }}>
        <Box
          ref={previewRef}
          sx={{ width: "100%", height: "100%", "& video": { display: "block", width: "100%", height: "100%", objectFit: "contain" } }}
        />
      </Box>

      <Button
        variant="outlined"
        disabled={scanner.status === "switching" || scanner.status === "stopping"}
        onClick={() => {
          setDeviceId("");
          setCameras([]);
          scanner.stop();
        }}
      >
        카메라 중단
      </Button>
    </Stack>
  );
};

export const QrInputPanel: FC<QrInputPanelProps> = ({ onDetected, cooldownMs }) => {
  const mode = getQrInputMode();
  const scanner = useQrScanner();
  useQrTrigger({ cameraResult: scanner.result, cooldownMs, onDetected });

  return mode === "camera" ? <CameraQrInput scanner={scanner} /> : <SerialQrInput />;
};
