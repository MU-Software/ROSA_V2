import { Alert, Button, Chip, IconButton, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import { DebugCard } from "./card";
import { hex, useRefreshable } from "./shared";
import { Delete, Refresh } from "@mui/icons-material";
import { DeviceAddDialog } from "../../../dialogs/deviceAdd";
import { LabelAssignDialog } from "../../../dialogs/labelAssign";
import { TooltipIconButton } from "../../elements/buttons";
import { serialManager, type SerialDevice } from "../../../apis/serial";
import { toMessage } from "../../../utils/bytes";
import { type PortInfo } from "../../../adapters";
import { useAppContext } from "../../../contexts";
import { useCallback, useMemo, useState, type FC } from "react";
import { useSerialDevices, useSerialPort } from "../../../hooks/useSerialPort";
import { usesWorkerBridge } from "../../../apis/serialBridge";

const EMPTY_PORTS: PortInfo[] = [];

const DeviceRow: FC<{ device: SerialDevice; onAssign: () => void; onRemove: () => void }> = ({ device, onAssign, onRemove }) => {
  const { connected, data, error, write } = useSerialPort(device.key);
  const lastText = data ? new TextDecoder().decode(data).trim() : "";

  const detail = [
    device.baudRate ? `baud ${device.baudRate}` : "속도 미확정",
    device.serialNumber && `SN:${device.serialNumber}`,
    device.vid !== undefined && `${hex(device.vid)}:${hex(device.pid)}`,
  ].filter(Boolean).join(" · ");

  return (
    <ListItem
      secondaryAction={
        <Stack direction="row" spacing={1}>
          {connected && (
            <Button size="small" onClick={() => write(new TextEncoder().encode("PING\r"))}>PING</Button>
          )}
          <Button size="small" onClick={onAssign}>{device.label ? "재할당" : "라벨 할당"}</Button>
          <IconButton size="small" onClick={onRemove}><Delete /></IconButton>
        </Stack>
      }
    >
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <span>{device.key}</span>
            {device.label
              ? <Chip size="small" color="primary" label={device.label} />
              : <Chip size="small" variant="outlined" label="미할당" />}
            <Chip size="small" color={connected ? "success" : "default"} label={connected ? "연결됨" : "연결 안 됨"} />
          </Stack>
        }
        secondary={error ? `Error: ${error.message}` : (lastText || detail)}
      />
    </ListItem>
  );
};

export const SerialDebugCard: FC = () => {
  const {
    isTauri,
    serialRestoreFailures: failures,
    setAppContext,
  } = useAppContext();
  const devices = useSerialDevices();

  const loadPorts = useCallback(() => serialManager.listAvailablePorts(), []);
  const { value: ports, error: portsError, refresh } = useRefreshable<PortInfo[]>(loadPorts, EMPTY_PORTS);

  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const [target, setTarget] = useState<SerialDevice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registeredKeys = useMemo(() => new Set(devices.map((d) => d.key)), [devices]);
  const unassignedLabels = serialManager.listUnassignedLabels();

  const addDevice = async () => {
    try {
      // 웹은 브라우저 선택 창이 곧 등록 절차이고, Tauri 는 시스템 포트 목록에서 고른다.
      if (isTauri) {
        refresh();
        setDialogKey("device");
        return;
      }
      await serialManager.requestDevice();
      refresh();
      setError(null);
    } catch (err) {
      setError(toMessage(err));
    }
  };

  // 포트 재검색과 연결 복원은 항상 함께 필요하므로 한 동작으로 묶는다.
  const rescan = async () => {
    try {
      const { failed } = await serialManager.restore();
      refresh();
      setAppContext((prev) => ({
        ...prev,
        serialRestoreFailures: failed,
        serialRestoreError: null,
      }));
      setError(null);
    } catch (err) {
      const message = toMessage(err);
      setAppContext((prev) => ({
        ...prev,
        serialRestoreFailures: [],
        serialRestoreError: message,
      }));
      setError(message);
    }
  };

  const removeDevice = async (device: SerialDevice) => {
    try {
      await serialManager.removeDevice(device.key);
    } catch (err) {
      setError(toMessage(err));
    }
  };

  return (
    <DebugCard
      title="Serial Devices"
      action={<TooltipIconButton tooltip="다시 검색하고 연결" icon={Refresh} onClick={() => void rescan()} />}
    >
      <Stack spacing={2}>
        <Typography variant="caption" color="text.secondary">
          {isTauri ? "Tauri" : "Web"} · 읽기 루프: {isTauri ? "Rust 스레드" : usesWorkerBridge() ? "Worker" : "메인 스레드(폴백)"}
        </Typography>

        {portsError && <Alert severity="warning">포트 목록 조회 실패: {portsError}</Alert>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {failures.length > 0 && (
          <Alert
            severity="warning"
            onClose={() => setAppContext((prev) => ({ ...prev, serialRestoreFailures: [] }))}
          >
            <Stack spacing={0.5}>
              {failures.map((f) => <span key={f.label}><strong>{f.label}</strong>: {f.reason}</span>)}
            </Stack>
          </Alert>
        )}

        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => void addDevice()}>기기 추가</Button>
        </Stack>

        <Typography variant="subtitle2">등록된 기기 ({devices.length})</Typography>
        <List dense>
          {devices.length === 0 && (
            <ListItem>
              <ListItemText
                primary="(등록된 기기 없음)"
                secondary={isTauri ? "기기 추가로 시스템 포트를 등록하세요." : "기기 추가로 브라우저 권한을 부여하세요."}
              />
            </ListItem>
          )}
          {devices.map((device) => (
            <DeviceRow
              key={device.key}
              device={device}
              onAssign={() => { setTarget(device); setDialogKey("label"); }}
              onRemove={() => void removeDevice(device)}
            />
          ))}
        </List>

        {unassignedLabels.length > 0 && (
          <>
            <Typography variant="subtitle2">미연결 라벨 ({unassignedLabels.length})</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              {unassignedLabels.map((l) => (
                <Chip key={l} label={l} size="small" variant="outlined" onDelete={() => serialManager.removeLabel(l)} />
              ))}
            </Stack>
          </>
        )}
      </Stack>

      <DeviceAddDialog
        dialogKey="device"
        currentDialogKey={dialogKey}
        ports={ports}
        registeredKeys={registeredKeys}
        onAdd={(port) => serialManager.registerDevice(port)}
        onClose={() => setDialogKey(null)}
      />

      <LabelAssignDialog
        dialogKey="label"
        currentDialogKey={dialogKey}
        device={target}
        unassignedLabels={unassignedLabels}
        onClose={() => { setDialogKey(null); setTarget(null); }}
      />
    </DebugCard>
  );
};
