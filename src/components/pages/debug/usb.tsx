import { Refresh } from "@mui/icons-material";
import { Alert, Button, Chip, FormControlLabel, List, ListItem, ListItemText, Stack, Switch, TextField } from "@mui/material";
import { useCallback, useMemo, useState, type FC } from "react";
import { USB_CLASS_PRINTER, createUsbAdapter, hasUsbClass, matchesUsbSearch, type UsbDeviceInfo } from "../../../adapters";
import { useAppContext } from "../../../contexts";
import { toMessage } from "../../../utils/bytes";
import { TooltipIconButton } from "../../elements/buttons";
import { DebugCard } from "./card";
import { hex, useRefreshable } from "./shared";
import { isUsbSupported } from "../../../utils/platform";

const EMPTY_USB_DEVICES: UsbDeviceInfo[] = [];

const isPrinter = (device: UsbDeviceInfo): boolean => hasUsbClass(device, USB_CLASS_PRINTER);

const describeClasses = (device: UsbDeviceInfo): string => {
  const classes = device.interfaceClasses.length > 0 ? device.interfaceClasses : [device.classCode];
  return classes.map((c) => `0x${c.toString(16).padStart(2, "0")}`).join(", ");
};

export const UsbDebugCard: FC = () => {
  const { isTauri } = useAppContext();
  const adapter = useMemo(() => createUsbAdapter(), []);
  const loadDevices = useCallback(() => adapter.listDevices(), [adapter]);
  const { value: devices, error, refresh } = useRefreshable<UsbDeviceInfo[]>(loadDevices, EMPTY_USB_DEVICES);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [printersOnly, setPrintersOnly] = useState(false);
  const [search, setSearch] = useState("");
  const supported = isUsbSupported();

  const shown = useMemo(
    () => devices.filter((d) => (!printersOnly || isPrinter(d)) && matchesUsbSearch(d, search)),
    [devices, printersOnly, search],
  );

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
        {!supported && <Alert severity="warning">이 플랫폼에서는 USB 장치를 지원하지 않습니다.</Alert>}
        {error && <Alert severity="warning">장치 목록 조회 실패: {error}</Alert>}
        {requestError && <Alert severity="error" onClose={() => setRequestError(null)}>{requestError}</Alert>}
        {!isTauri && (
          <Button variant="outlined" disabled={!supported} onClick={() => void request()}>장치 권한 요청</Button>
        )}

        <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="검색"
            placeholder="제조사 · 제품명 · VID:PID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FormControlLabel
            control={<Switch checked={printersOnly} onChange={(e) => setPrintersOnly(e.target.checked)} />}
            label="프린터만"
          />
          {shown.length !== devices.length && (
            <Chip size="small" label={`${shown.length} / ${devices.length}`} />
          )}
        </Stack>

        <List dense>
          {shown.length === 0 && (
            <ListItem>
              <ListItemText primary={devices.length === 0 ? "(감지된 장치 없음)" : "(조건에 맞는 장치 없음)"} />
            </ListItem>
          )}
          {shown.map((d) => (
            <ListItem key={`${d.bus}-${d.address}-${d.vendorId}-${d.productId}`}>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <span>{[d.manufacturer, d.product].filter(Boolean).join(" ") || `${hex(d.vendorId)}:${hex(d.productId)}`}</span>
                    {isPrinter(d) && <Chip size="small" color="primary" label="프린터" />}
                  </Stack>
                }
                secondary={`${hex(d.vendorId)}:${hex(d.productId)} · class ${describeClasses(d)}${d.serialNumber ? ` · SN:${d.serialNumber}` : ""}`}
              />
            </ListItem>
          ))}
        </List>
      </Stack>
    </DebugCard>
  );
};
