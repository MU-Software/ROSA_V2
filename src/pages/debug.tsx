import { BugReport, Delete, Refresh } from "@mui/icons-material";
import { Alert, Button, Card, Chip, Container, IconButton, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type FC, type PropsWithChildren, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createUsbAdapter, type PortInfo, type UsbDeviceInfo } from "../adapters";
import { serialManager, type SerialDevice } from "../apis/serial";
import { usesWorkerBridge } from "../apis/serialBridge";
import { TooltipIconButton } from "../components/elements/buttons";
import { FormSwitch, FormTextField } from "../components/elements/forms";
import { useAppContext, useTopBar } from "../contexts";
import { DeviceAddDialog } from "../dialogs/deviceAdd";
import { LabelAssignDialog } from "../dialogs/labelAssign";
import { useSerialDevices, useSerialPort } from "../hooks/useSerialPort";

const toMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const EMPTY_PORTS: PortInfo[] = [];
const EMPTY_USB_DEVICES: UsbDeviceInfo[] = [];

const hex = (value?: number): string => (value === undefined ? "?" : `0x${value.toString(16).padStart(4, "0")}`);

const DebugCard: FC<PropsWithChildren<{ title: string; action?: ReactNode }>> = ({ title, action, children }) => (
  <Card sx={{ mt: 4, p: 2 }}>
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {action}
    </Stack>
    {children}
  </Card>
);

function useRefreshable<T>(load: () => Promise<T>, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (next) => { if (!cancelled) { setValue(next); setError(null); } },
      (err: unknown) => { if (!cancelled) setError(toMessage(err)); },
    );
    return () => { cancelled = true; };
  }, [load, nonce]);

  return { value, error, refresh };
}

const ContextViewer: FC<{ data: object }> = ({ data }) => (
  <DebugCard title="App Context">
    <pre>{JSON.stringify(data, (key, value) => (key === "rightActionButtons" ? "[ReactNode]" : value), 2)}</pre>
  </DebugCard>
);

const TopBarController: FC = () => {
  const { control } = useForm({ defaultValues: { visible: true, title: "Debug Page" } });
  const { title, visible } = useWatch({ control });

  useTopBar(useMemo(
    () => (visible
      ? {
          title: title || "Debug Page",
          rightActionButtons: <TooltipIconButton tooltip="Report bug" icon={BugReport} onClick={() => alert("Bug reported!")} />,
        }
      : null),
    [title, visible],
  ));

  return (
    <DebugCard title="TopBar Controls">
      <Stack spacing={2}>
        <FormSwitch name="visible" control={control} label="상단바 표시" />
        <FormTextField name="title" control={control} inputProps={{ label: "TopBar Title", fullWidth: true, size: "small", disabled: !visible }} />
      </Stack>
    </DebugCard>
  );
};

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

const SerialDebugCard: FC = () => {
  const { isTauri } = useAppContext();
  const devices = useSerialDevices();

  const loadPorts = useCallback(() => serialManager.listAvailablePorts(), []);
  const { value: ports, error: portsError, refresh } = useRefreshable<PortInfo[]>(loadPorts, EMPTY_PORTS);

  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const [target, setTarget] = useState<SerialDevice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registeredKeys = useMemo(() => new Set(devices.map((d) => d.key)), [devices]);

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

  const restore = async () => {
    try {
      await serialManager.restore();
      refresh();
      setError(null);
    } catch (err) {
      setError(toMessage(err));
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
      action={<TooltipIconButton tooltip="포트 다시 검색" icon={Refresh} onClick={refresh} />}
    >
      <Stack spacing={2}>
        <Typography variant="caption" color="text.secondary">
          {isTauri ? "Tauri" : "Web"} · 읽기 루프: {isTauri ? "Rust 스레드" : usesWorkerBridge() ? "Worker" : "메인 스레드(폴백)"}
        </Typography>

        {portsError && <Alert severity="warning">포트 목록 조회 실패: {portsError}</Alert>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => void addDevice()}>기기 추가</Button>
          <Button variant="outlined" onClick={() => void restore()}>연결 복원</Button>
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
        unassignedLabels={serialManager.listUnassignedLabels()}
        onClose={() => { setDialogKey(null); setTarget(null); }}
      />
    </DebugCard>
  );
};

const UsbDebugCard: FC = () => {
  const { isTauri } = useAppContext();
  const adapter = useMemo(() => createUsbAdapter(), []);
  const loadDevices = useCallback(() => adapter.listDevices(), [adapter]);
  const { value: devices, error, refresh } = useRefreshable<UsbDeviceInfo[]>(loadDevices, EMPTY_USB_DEVICES);
  const [requestError, setRequestError] = useState<string | null>(null);

  const request = async () => {
    try {
      await adapter.requestDevice();
      setRequestError(null);
      refresh();
    } catch (err) {
      setRequestError(toMessage(err));
    }
  };

  return (
    <DebugCard
      title="USB Devices"
      action={<TooltipIconButton tooltip="장치 다시 검색" icon={Refresh} onClick={refresh} />}
    >
      <Stack spacing={2}>
        {error && <Alert severity="warning">장치 목록 조회 실패: {error}</Alert>}
        {requestError && <Alert severity="error" onClose={() => setRequestError(null)}>{requestError}</Alert>}
        {!isTauri && (
          <Button variant="outlined" onClick={() => void request()}>장치 권한 요청</Button>
        )}
        <List dense>
          {devices.length === 0 && <ListItem><ListItemText primary="(감지된 장치 없음)" /></ListItem>}
          {devices.map((d) => (
            <ListItem key={`${d.bus}-${d.address}-${d.vendorId}-${d.productId}`}>
              <ListItemText
                primary={[d.manufacturer, d.product].filter(Boolean).join(" ") || `${hex(d.vendorId)}:${hex(d.productId)}`}
                secondary={`${hex(d.vendorId)}:${hex(d.productId)} · class ${d.classCode}${d.serialNumber ? ` · SN:${d.serialNumber}` : ""}`}
              />
            </ListItem>
          ))}
        </List>
      </Stack>
    </DebugCard>
  );
};

export const DebugPage: FC = () => {
  const { isTauri, topBarInfo } = useAppContext();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>Debug Page</Typography>

      <ContextViewer data={{ isTauri, topBarInfo }} />
      <TopBarController />
      <SerialDebugCard />
      <UsbDebugCard />
    </Container>
  );
};
