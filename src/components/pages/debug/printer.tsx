import { Alert, Box, Button, Card, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { DebugCard } from "./card";
import { hex, useRefreshable } from "./shared";
import { Refresh } from "@mui/icons-material";
import { TooltipIconButton } from "../../elements/buttons";
import { canvasToRcptImage, toImageData } from "../../../printing/raster";
import { defaultTestCardHeight, drawTestCard } from "../../../printing/testCard";
import { printerManager, type PrinterDevice, type PrinterSettings } from "../../../apis/printer";
import { toMessage } from "../../../utils/bytes";
import { useCallback, useRef, useState, type FC } from "react";
import { usePrinterConnection, usePrinterDevices, usePrinterSettings, usePrinterState } from "../../../hooks/usePrinter";

const TRANSPORT_LABELS: Record<"usb" | "btspp" | "ble", string> = { usb: "USB", btspp: "BT SPP", ble: "BLE" };
const STATUS_LABELS = {
  disconnected: "연결 안 됨",
  connecting: "연결 중",
  ready: "연결됨",
  printing: "출력 중",
  disconnecting: "연결 해제 중",
  faulted: "연결 끊김",
} as const;

const LabelSpecFields: FC<{ deviceKey: string; settings: PrinterSettings }> = ({ deviceKey, settings }) => {
  const label = settings.label ?? { widthMm: 0, heightMm: 0 };
  const update = (patch: Partial<typeof label>) =>
    printerManager.updateSettings(deviceKey, { label: { ...label, ...patch } });

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="body2" sx={{ minWidth: 64 }}>라벨</Typography>
      {([
        ["가로", "widthMm"],
        ["세로", "heightMm"],
        ["갭", "gapMm"],
      ] as const).map(([labelText, field]) => (
        <TextField
          key={field}
          size="small"
          type="number"
          label={`${labelText} (mm)`}
          sx={{ width: 110 }}
          value={label[field] ?? ""}
          onChange={(e) => update({ [field]: Number(e.target.value) })}
        />
      ))}
    </Stack>
  );
};

const PrinterRow: FC<{ device: PrinterDevice }> = ({ device }) => {
  const profile = device.profile;
  const connection = usePrinterConnection(device.key);
  const state = usePrinterState(device.key);
  const settings = usePrinterSettings(device.key);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const run = (what: string, action: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    setNotice(null);
    action()
      .catch((err: unknown) => setError(toMessage(err)))
      .finally(() => setBusy(null));
  };

  const testPrint = () => run("인쇄", async () => {
    if (!profile) return;
    const { width, height } = printerManager.imageSize(device.key);
    const rows = height ?? defaultTestCardHeight(profile.dotsPerMm);

    const card = drawTestCard({ widthDots: width, heightDots: rows, dotsPerMm: profile.dotsPerMm, title: profile.name });
    const image = await canvasToRcptImage(card);
    try {
      // 미리보기에는 인코더로 넘어가는 비트를 그대로 그린다.
      const preview = previewRef.current;
      if (preview) {
        preview.width = image.width;
        preview.height = image.height;
        preview.getContext("2d")?.putImageData(toImageData(image), 0, 0);
      }

      await printerManager.print(device.key, image, {
        onPhase: (phase) => setBusy(phase === "sending" ? "전송" : "인쇄"),
      });
      setNotice(
        printerManager.canConfirmCompletion(device.key)
          ? "인쇄가 끝났습니다"
          : "프린터로 보냈습니다 (이 기종은 인쇄 완료를 확인할 수 없습니다)",
      );
    } finally {
      image.free();
    }
  });

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="subtitle1">{device.name}</Typography>
          <Chip size="small" label={TRANSPORT_LABELS[device.transport]} />
          {profile
            ? <Chip size="small" color="primary" label={profile.name} />
            : <Chip size="small" color="default" label="지원하지 않는 기기" />}
          <Chip
            size="small"
            color={state.status === "faulted" ? "error" : state.status === "ready" ? "success" : "default"}
            label={STATUS_LABELS[state.status]}
          />
          <Box sx={{ flexGrow: 1 }} />
          {profile && (connection
            ? <Button size="small" disabled={state.status === "printing" || state.status === "disconnecting"} onClick={() => run("해제", () => printerManager.disconnect(device.key))}>연결 해제</Button>
            : <Button size="small" variant="outlined" disabled={state.status === "connecting" || state.status === "disconnecting"} onClick={() => run("연결", async () => { await printerManager.connect(device.key); })}>연결</Button>
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {[device.address, device.vendorId !== undefined && `${hex(device.vendorId)}:${hex(device.productId)}`, device.serialNumber && `SN:${device.serialNumber}`]
            .filter(Boolean)
            .join(" · ")}
        </Typography>

        {busy && <Typography variant="caption">{busy} 중…</Typography>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {state.status === "faulted" && state.error && (
          <Alert severity="error">장치 연결이 끊겼습니다: {state.error.message}</Alert>
        )}
        {!printerManager.hasPersistentSettingsIdentity(device.key) && (
          <Alert severity="warning">
            이 브라우저는 이 USB 장치의 영구 식별자를 제공하지 않습니다. 보정 설정은 앱을 다시 시작하면 유지되지 않을 수 있습니다.
          </Alert>
        )}

        {connection && (
          <>
            {connection.link && (
              <Typography variant="caption" color="text.secondary">{connection.link}</Typography>
            )}
            {connection.probe && (
              <>
                <Typography variant="body2">{connection.probe.summary}</Typography>
                {connection.probe.problems.map((problem) => (
                  <Alert key={problem} severity="warning">{problem}</Alert>
                ))}
                <Box component="pre" sx={{ m: 0, fontSize: 12 }}>
                  {Object.entries(connection.probe.fields).map(([key, value]) => `${key}: ${value}`).join("\n")}
                </Box>
              </>
            )}

            {profile && profile.headDots === undefined && <LabelSpecFields deviceKey={device.key} settings={settings} />}

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button size="small" variant="contained" disabled={busy !== null} onClick={testPrint}>테스트 인쇄</Button>
              {profile?.probe && (
                <Button size="small" disabled={busy !== null} onClick={() => run("상태 조회", async () => { await printerManager.reprobe(device.key); })}>
                  상태 다시 읽기
                </Button>
              )}
              {printerManager.listActions(device.key).map((action) => (
                <Button
                  key={action.id}
                  size="small"
                  color={action.disruptive ? "warning" : "inherit"}
                  disabled={busy !== null}
                  title={action.description}
                  onClick={() => {
                    if (action.disruptive && !confirm(`${action.description}\n\n계속할까요?`)) return;
                    run(action.label, async () => setNotice(await printerManager.runAction(device.key, action.id)));
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </Stack>
            {notice && <Alert severity="info" onClose={() => setNotice(null)}>{notice}</Alert>}

            <Box component="canvas" ref={previewRef} sx={{ maxWidth: "100%", border: "1px solid", borderColor: "divider" }} />
          </>
        )}
      </Stack>
    </Card>
  );
};

const EMPTY_PRINTERS: PrinterDevice[] = [];

export const PrinterDebugCard: FC = () => {
  const devices = usePrinterDevices();
  const loadPrinters = useCallback(() => printerManager.refresh(), []);
  const { error, loading, refresh } = useRefreshable<PrinterDevice[]>(loadPrinters, EMPTY_PRINTERS);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [adding, setAdding] = useState<"검색" | "연결" | null>(null);

  /**
   * WebUSB 는 브라우저 선택 창이, SPP 는 주변 검색과 페어링이 여기서 일어난다.
   *
   * 끝나면 **바로 연결한다.** 사용자가 기기 하나를 고른 것이므로 "이 프린터를 쓰겠다"
   * 는 뜻이고, 버튼을 한 번 더 누를 이유가 없다. (목록을 훑는 새로고침은 그렇지 않아
   * 자동으로 붙이지 않는다.)
   */
  const addDevice = async () => {
    setRequestError(null);
    setAdding("검색");
    try {
      const added = await printerManager.requestDevice();
      if (!added) {
        setRequestError("새로 붙일 프린터를 찾지 못했습니다");
        return;
      }
      refresh();
      setAdding("연결");
      await printerManager.connect(added.key);
    } catch (err) {
      // 기기는 목록에 남으므로 연결만 다시 눌러 볼 수 있다.
      setRequestError(toMessage(err));
    } finally {
      setAdding(null);
    }
  };

  return (
    <DebugCard
      title="Printers"
      action={loading
        ? <CircularProgress size={20} />
        : <TooltipIconButton tooltip="프린터 다시 검색" icon={Refresh} onClick={refresh} />}
    >
      <Stack spacing={2}>
        {error && <Alert severity="warning">프린터 검색 실패: {error}</Alert>}
        {requestError && <Alert severity="error" onClose={() => setRequestError(null)}>{requestError}</Alert>}
        {printerManager.canRequestDevice() && (
          <Button variant="outlined" disabled={adding !== null} onClick={() => void addDevice()}>
            {adding ? `${adding} 중…` : "프린터 추가"}
          </Button>
        )}
        {loading && (
          <Typography variant="body2" color="text.secondary">
            프린터 검색 중… (BLE 는 스캔에 8초가 걸립니다)
          </Typography>
        )}
        {!loading && devices.length === 0 && (
          <Typography variant="body2" color="text.secondary">(감지된 프린터 없음)</Typography>
        )}
        {devices.map((device) => <PrinterRow key={device.key} device={device} />)}
      </Stack>
    </DebugCard>
  );
};
