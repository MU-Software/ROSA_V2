import { Refresh } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import {
  printerManager,
  type PrinterDevice,
} from "../../apis/printer";
import { usePrintMutation } from "../../hooks/usePrintMutation";
import {
  usePrinterDevices,
  usePrinterSettings,
  usePrinterState,
} from "../../hooks/usePrinter";
import { GOOJPRT_PT390 } from "../../printing/profiles";
import type { PrinterSettingField } from "../../printing/profiles";
import { canvasToRcptImage } from "../../printing/raster";
import { defaultTestCardHeight, drawTestCard } from "../../printing/testCard";
import { toMessage } from "../../utils/bytes";
import { isAndroid, isIos, isTauri } from "../../utils/platform";

const TRANSPORT_LABELS = { usb: "USB", btspp: "Bluetooth SPP", ble: "BLE" } as const;

const describeDevice = (device: PrinterDevice): string => [
  TRANSPORT_LABELS[device.transport],
  device.address,
  device.vendorId !== undefined && device.productId !== undefined
    ? `${device.vendorId.toString(16).padStart(4, "0")}:${device.productId.toString(16).padStart(4, "0")}`
    : undefined,
  device.serialNumber && `SN:${device.serialNumber}`,
].filter(Boolean).join(" · ");

const isSelectablePrinter = (device: PrinterDevice, mobile: boolean): boolean => {
  if (!device.profile) return false;
  return !mobile || device.profile.id === GOOJPRT_PT390.id;
};

const parseSettingValue = (field: PrinterSettingField, value: string | number): number => {
  const text = String(value).trim();
  if (!text) throw new Error(`${field.label} 값을 입력하세요.`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < field.min ||
    (field.max !== undefined && parsed > field.max) ||
    (field.integer && !Number.isInteger(parsed)) ||
    (field.options && !field.options.includes(parsed))) {
    throw new Error(`${field.label} 값이 허용 범위를 벗어났습니다.`);
  }
  return parsed;
};

type SettingsContentProps = {
  device: PrinterDevice;
  onClose: () => void;
};

const PrinterSettingsContent: FC<SettingsContentProps> = ({ device, onClose }) => {
  const state = usePrinterState(device.key);
  const stored = usePrinterSettings(device.key);
  const settingFields = device.profile?.settings ?? [];
  const [settingValues, setSettingValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(settingFields.map((field) => [field.id, String(stored[field.id])])));
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (printerManager.isConnected(device.key)) return;
    void printerManager.connect(device.key).catch((reason: unknown) => {
      if (active) setConnectionError(toMessage(reason));
    });
    return () => { active = false; };
  }, [device.key]);

  const mutation = usePrintMutation({
    onSuccess: ({ completionConfirmed }) => {
      setNotice(completionConfirmed
        ? "테스트 인쇄가 완료되었습니다."
        : "테스트 이미지를 프린터로 전송했습니다.");
    },
  });

  const saveSettings = () => {
    printerManager.updateSettings(device.key, Object.fromEntries(
      settingFields.map((field) => [
        field.id,
        parseSettingValue(field, settingValues[field.id] ?? ""),
      ]),
    ));
  };

  const complete = () => {
    try {
      saveSettings();
      setConnectionError(null);
      onClose();
    } catch (reason) {
      setConnectionError(toMessage(reason));
    }
  };

  const testPrint = async () => {
    setConnectionError(null);
    setNotice(null);
    try {
      saveSettings();
      if (!printerManager.isConnected(device.key)) await printerManager.connect(device.key);
      const profile = device.profile;
      if (!profile) throw new Error("지원하는 프린터가 아닙니다");
      const { width, height } = printerManager.imageSize(device.key);
      const card = drawTestCard({
        widthDots: width,
        heightDots: height ?? defaultTestCardHeight(profile.dotsPerMm),
        dotsPerMm: profile.dotsPerMm,
        title: profile.name,
      });
      const image = await canvasToRcptImage(card);
      try {
        await mutation.mutateAsync({ device, image });
      } finally {
        image.free();
      }
    } catch (reason) {
      setConnectionError(toMessage(reason));
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="subtitle1">{device.name}</Typography>
        <Chip size="small" label={TRANSPORT_LABELS[device.transport]} />
        <Chip size="small" color="primary" label={device.profile?.name ?? "지원하지 않는 기기"} />
      </Stack>
      <Typography variant="caption" color="text.secondary">{describeDevice(device)}</Typography>

      {(state.status === "connecting" || state.status === "printing") && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CircularProgress size={18} />
          <Typography variant="body2">{state.status === "connecting" ? "프린터 연결 중입니다" : "인쇄 중입니다"}</Typography>
        </Stack>
      )}
      {connectionError && <Alert severity="error">{connectionError}</Alert>}
      {mutation.error && mutation.error.message !== connectionError && <Alert severity="error">{mutation.error.message}</Alert>}
      {state.status === "faulted" && state.error && <Alert severity="error">{state.error.message}</Alert>}

      {device.profile?.mediaSizeSource === "device" && (
        <Alert severity="info">이 프린터는 장착된 라벨 크기를 직접 읽으므로 임의로 변경할 수 없습니다.</Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 1,
        }}
      >
        {settingFields.map((field) => (
          <TextField
            key={field.id}
            select={field.options !== undefined}
            size="small"
            type={field.options ? undefined : "number"}
            label={`${field.label} (${field.unit})`}
            value={settingValues[field.id] ?? ""}
            slotProps={{
              htmlInput: field.options ? undefined : {
                min: field.min,
                max: field.max,
                step: field.step,
              },
            }}
            onChange={(event) => setSettingValues((current) => ({
              ...current,
              [field.id]: String(event.target.value),
            }))}
          >
            {field.options?.map((value) => (
              <MenuItem key={value} value={value}>{value} {field.unit}</MenuItem>
            ))}
          </TextField>
        ))}
      </Box>

      <Button
        variant="contained"
        disabled={mutation.isPending || state.status === "connecting" || state.status === "printing"}
        onClick={() => void testPrint()}
      >
        {mutation.isPending ? "테스트 인쇄 중…" : "테스트 인쇄"}
      </Button>
      {notice && <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>}
      <Button onClick={complete}>설정 저장</Button>
    </Stack>
  );
};

type PrinterDeviceDialogProps = {
  open: boolean;
  deviceKey?: string;
  onClose: () => void;
};

const PrinterDeviceDialogContent: FC<Omit<PrinterDeviceDialogProps, "open">> = ({ deviceKey, onClose }) => {
  const devices = usePrinterDevices();
  const [step, setStep] = useState<"devices" | "settings">(deviceKey ? "settings" : "devices");
  const [selectedKey, setSelectedKey] = useState(deviceKey);
  const [loading, setLoading] = useState(!deviceKey);
  const [error, setError] = useState<string | null>(null);
  const mobile = isAndroid() || isIos();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await printerManager.refresh();
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (deviceKey) return;
    let active = true;
    void printerManager.refresh().catch((reason: unknown) => {
      if (active) setError(toMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [deviceKey]);

  const candidates = useMemo(
    () => devices
      .filter((device) => !printerManager.isRegistered(device.key))
      .sort((left, right) => {
        const supportOrder = Number(isSelectablePrinter(right, mobile)) - Number(isSelectablePrinter(left, mobile));
        return supportOrder || left.name.localeCompare(right.name);
      }),
    [devices, mobile],
  );
  const selected = selectedKey ? devices.find((device) => device.key === selectedKey) : undefined;

  const requestWebUsb = async () => {
    setLoading(true);
    setError(null);
    try {
      await printerManager.requestDevice();
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  const choose = (device: PrinterDevice) => {
    try {
      printerManager.registerDevice(device.key);
      setSelectedKey(device.key);
      setStep("settings");
      setError(null);
    } catch (reason) {
      setError(toMessage(reason));
    }
  };

  return (
    <Dialog open onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{deviceKey ? "프린터 설정" : "프린터 추가"}</DialogTitle>
      <DialogContent dividers>
        {step === "devices" ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">등록할 프린터를 선택하세요.</Typography>
            {mobile && <Alert severity="info">현재 PT-390 기기만 지원합니다.</Alert>}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {!mobile && !isTauri() && (
                <Button variant="contained" disabled={loading} onClick={() => void requestWebUsb()}>
                  새 USB 장치 권한 요청
                </Button>
              )}
              <Button startIcon={<Refresh />} disabled={loading} onClick={() => void refresh()}>새로고침</Button>
            </Stack>
            {loading && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <CircularProgress size={20} />
                <Typography variant="body2">{mobile ? "검색 중입니다" : "장치 목록을 불러오는 중입니다"}</Typography>
              </Stack>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <List dense>
              {!loading && candidates.length === 0 && (
                <ListItem><ListItemText primary="(등록 가능한 프린터 없음)" /></ListItem>
              )}
              {candidates.map((device) => {
                const supported = isSelectablePrinter(device, mobile);
                return (
                  <ListItem
                    key={device.key}
                    secondaryAction={
                      <Button size="small" disabled={!supported} onClick={() => choose(device)}>
                        {supported ? "선택" : "지원 안 함"}
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={device.name}
                      secondary={`${describeDevice(device)}${device.profile ? ` · ${device.profile.name}` : ""}`}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Stack>
        ) : selected ? (
          <PrinterSettingsContent device={selected} onClose={onClose} />
        ) : (
          <Alert severity="error">선택한 프린터를 현재 장치 목록에서 찾지 못했습니다.</Alert>
        )}
      </DialogContent>
      {step === "devices" && (
        <DialogActions><Button disabled={loading} onClick={onClose}>닫기</Button></DialogActions>
      )}
    </Dialog>
  );
};

export const PrinterDeviceDialog: FC<PrinterDeviceDialogProps> = ({ open, deviceKey, onClose }) =>
  open
    ? <PrinterDeviceDialogContent key={deviceKey ?? "new-printer"} deviceKey={deviceKey} onClose={onClose} />
    : null;
