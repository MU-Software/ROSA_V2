import { BugReport, Delete, Refresh } from "@mui/icons-material";
import { Alert, Box, Button, Card, Container, IconButton, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type PropsWithChildren } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createUsbAdapter, type PortInfo, type UsbDeviceInfo } from "../adapters";
import { serialManager, type LearningSession, type StoredLabel } from "../apis/serial";
import { supportsTransferableStreams } from "../apis/serialBridge";
import { TooltipIconButton } from "../components/elements/buttons";
import { FormSelect, FormSwitch, FormTextField } from "../components/elements/forms";
import { useAppContext, useTopBar } from "../contexts";
import { SerialLearningDialog } from "../dialogs/serialLearning";
import { useSerialPort, useSerialPortList } from "../hooks/useSerialPort";

const toMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const EMPTY_PORTS: PortInfo[] = [];
const EMPTY_USB_DEVICES: UsbDeviceInfo[] = [];

const hex = (value?: number): string => (value === undefined ? "?" : `0x${value.toString(16).padStart(4, "0")}`);

const DebugCard: FC<PropsWithChildren<{ title: string; action?: React.ReactNode }>> = ({ title, action, children }) => (
  <Card sx={{ mt: 4, p: 2 }}>
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {action}
    </Stack>
    {children}
  </Card>
);

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

const describePort = (p: PortInfo): string =>
  [p.manufacturer, p.product, p.serialNumber && `SN:${p.serialNumber}`, `${hex(p.vid)}:${hex(p.pid)}`]
    .filter(Boolean)
    .join(" · ");

const describeStoredLabel = (l: StoredLabel): string =>
  [
    `baud ${l.baudRate}`,
    l.path && `path ${l.path}`,
    l.serialNumber && `SN:${l.serialNumber}`,
    l.vid !== undefined && `${hex(l.vid)}:${hex(l.pid)}`,
  ]
    .filter(Boolean)
    .join(" · ");

const SerialPortRow: FC<{ label: string }> = ({ label }) => {
  const { connected, data, error, write, close } = useSerialPort(label);
  const lastText = data ? new TextDecoder().decode(data).trim() : "";

  return (
    <ListItem
      secondaryAction={
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => write(new TextEncoder().encode("PING\r"))}>Send PING</Button>
          <Button size="small" color="error" onClick={() => void close()}>Close</Button>
        </Stack>
      }
    >
      <ListItemText
        primary={`${label} ${connected ? "✓" : "✗"}`}
        secondary={error ? `Error: ${error.message}` : (lastText || "(no data yet)")}
      />
    </ListItem>
  );
};

const SerialDebugCard: FC = () => {
  const { isTauri } = useAppContext();
  const [, forceTick] = useState(0);
  useEffect(() => serialManager.onChange(() => forceTick((t) => t + 1)), []);

  const stored = serialManager.getStoredLabels();
  const connections = useSerialPortList();
  const loadPorts = useCallback(() => serialManager.listPorts(), []);
  const { value: ports, error: portsError, refresh } = useRefreshable<PortInfo[]>(loadPorts, EMPTY_PORTS);

  const [formError, setFormError] = useState<string | null>(null);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const resolverRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const { control, handleSubmit, reset } = useForm({ defaultValues: { label: "", baudRate: 9600, path: "" } });

  const onDefine = ({ label, baudRate, path }: { label: string; baudRate: number; path: string }) => {
    const trimmed = label.trim();
    if (!trimmed) {
      setFormError("라벨을 입력하세요.");
      return;
    }
    // 웹은 학습 세션이 포트를 정하므로 비워 둔다.
    if (isTauri && !path) {
      setFormError("데스크톱 환경에서는 연결할 포트를 선택해야 합니다.");
      return;
    }
    const port = ports.find((p) => p.path === path);
    serialManager.defineLabel(trimmed, {
      baudRate: Number(baudRate),
      path: path || undefined,
      vid: port?.vid,
      pid: port?.pid,
      serialNumber: port?.serialNumber,
    });
    setFormError(null);
    reset();
  };

  const handleRestore = async () => {
    try {
      await serialManager.restore({
        onLearn: (s) => {
          setSession(s);
          setDialogKey("learning");
          return new Promise<void>((resolve, reject) => {
            resolverRef.current = { resolve, reject };
          });
        },
      });
      setFormError(null);
    } catch (err) {
      setFormError(`복원 실패: ${toMessage(err)}`);
    } finally {
      setDialogKey(null);
      setSession(null);
      resolverRef.current = null;
    }
  };

  return (
    <DebugCard
      title="Serial Ports"
      action={<TooltipIconButton tooltip="포트 다시 검색" icon={Refresh} onClick={refresh} />}
    >
      <Stack spacing={2}>
        <Typography variant="caption" color="text.secondary">
          {isTauri ? "Tauri" : "Web"} · 읽기 루프: {supportsTransferableStreams() ? "Worker" : "메인 스레드(폴백)"}
        </Typography>

        {portsError && <Alert severity="warning">포트 목록 조회 실패: {portsError}</Alert>}
        {formError && <Alert severity="error" onClose={() => setFormError(null)}>{formError}</Alert>}

        <Typography variant="subtitle2">감지된 포트 ({ports.length})</Typography>
        <List dense>
          {ports.length === 0 && (
            <ListItem>
              <ListItemText
                primary="(감지된 포트 없음)"
                secondary={isTauri ? undefined : "웹에서는 아래 Restore 로 권한을 먼저 부여해야 목록에 나타납니다."}
              />
            </ListItem>
          )}
          {ports.map((p) => <ListItem key={p.path}><ListItemText primary={p.path} secondary={describePort(p)} /></ListItem>)}
        </List>

        <Typography variant="subtitle2">라벨 정의</Typography>
        <Box component="form" onSubmit={handleSubmit(onDefine)}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <FormTextField name="label" control={control} inputProps={{ label: "Label", size: "small" }} />
            <FormTextField name="baudRate" control={control} inputProps={{ label: "Baud", size: "small", type: "number" }} />
            {isTauri && (
              <FormSelect
                name="path"
                control={control}
                options={ports.map((p) => ({ value: p.path, label: p.path }))}
                emptyLabel="(감지된 포트 없음)"
                inputProps={{ label: "Port", size: "small", sx: { minWidth: 200 } }}
              />
            )}
            <Button type="submit" variant="outlined">Define</Button>
          </Stack>
        </Box>

        <Typography variant="subtitle2">저장된 라벨</Typography>
        <List dense>
          {stored.length === 0 && <ListItem><ListItemText primary="(none defined)" /></ListItem>}
          {stored.map((l) => (
            <ListItem
              key={l.label}
              secondaryAction={
                <IconButton size="small" onClick={() => serialManager.removeLabel(l.label)} disabled={serialManager.isOpen(l.label)}>
                  <Delete />
                </IconButton>
              }
            >
              <ListItemText primary={l.label} secondary={describeStoredLabel(l)} />
            </ListItem>
          ))}
        </List>

        <Button variant="contained" onClick={() => void handleRestore()} disabled={stored.length === 0}>
          Restore (Connect Scanners)
        </Button>

        <Typography variant="subtitle2">열린 연결</Typography>
        <List dense>
          {connections.length === 0 && <ListItem><ListItemText primary="(none open)" /></ListItem>}
          {connections.map((c) => <SerialPortRow key={c.label} label={c.label} />)}
        </List>
      </Stack>

      <SerialLearningDialog
        session={session}
        dialogKey="learning"
        currentDialogKey={dialogKey}
        onConfirm={() => resolverRef.current?.resolve()}
        onCancel={() => resolverRef.current?.reject(new Error("User cancelled"))}
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
