import { Alert, Box, Button, Card, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DebugCard } from "./card";
import { hex, useRefreshable } from "./shared";
import { Refresh } from "@mui/icons-material";
import { TooltipIconButton } from "../../elements/buttons";
import { canvasToRcptImage, toImageData } from "../../../printing/raster";
import { defaultTestCardHeight, drawTestCard } from "../../../printing/testCard";
import { printerManager, type PrinterDevice } from "../../../apis/printer";
import { toMessage } from "../../../utils/bytes";
import { useCallback, useRef, useState, type FC } from "react";
import { usePrinterConnection, usePrinterDevices, usePrinterState } from "../../../hooks/usePrinter";
import { PrinterDeviceDialog } from "../../printer/printerDeviceDialog";
import { DIAGNOSTIC_PRINTER_PROFILES } from "../../../printing/profiles";

const TRANSPORT_LABELS: Record<"usb" | "btspp" | "ble", string> = { usb: "USB", btspp: "BT SPP", ble: "BLE" };
const STATUS_LABELS = {
  disconnected: "연결 안 됨",
  connecting: "연결 중",
  ready: "연결됨",
  printing: "출력 중",
  disconnecting: "연결 해제 중",
  faulted: "연결 끊김",
} as const;

const TEST_RESULTS = ["정상 출력", "크기 이상", "잘림", "출력 안 됨"] as const;
type TestResult = typeof TEST_RESULTS[number];

const parseHexBytes = (value: string): Uint8Array => {
  const compact = value.replace(/0x/gi, "").replace(/[\s,:-]/g, "");
  if (!compact) return new Uint8Array();
  if (compact.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(compact)) {
    throw new Error("바이트는 1B 40 또는 1B40 형태의 16진수로 입력하세요");
  }
  return Uint8Array.from(compact.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
};

const bytesToHex = (value: Uint8Array): string =>
  [...value].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");

const PrinterRow: FC<{ device: PrinterDevice }> = ({ device }) => {
  const profile = device.profile;
  const connection = usePrinterConnection(device.key);
  const activeProfile = connection?.profile ?? profile;
  const state = usePrinterState(device.key);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const diagnosticProfiles = DIAGNOSTIC_PRINTER_PROFILES.filter(
    (candidate) => candidate.links[device.transport] !== undefined,
  );
  const [diagnosticProfileId, setDiagnosticProfileId] = useState(diagnosticProfiles[0]?.id ?? "");
  const [rawRequest, setRawRequest] = useState("1b 40");
  const [rawResponseLength, setRawResponseLength] = useState("0");
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
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
    if (!activeProfile) return;
    setTestResult(null);
    const { width, height } = printerManager.imageSize(device.key);
    const rows = height ?? defaultTestCardHeight(activeProfile.dotsPerMm);

    const card = drawTestCard({
      widthDots: width,
      heightDots: rows,
      dotsPerMm: activeProfile.dotsPerMm,
      title: activeProfile.name,
    });
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

  const transact = () => run("Raw 송수신", async () => {
    const responseLength = Number(rawResponseLength);
    if (!Number.isInteger(responseLength) || responseLength < 0 || responseLength > 4096) {
      throw new Error("응답 길이는 0 이상 4096 이하의 정수여야 합니다");
    }
    const request = parseHexBytes(rawRequest);
    if (request.length === 0 && responseLength === 0) throw new Error("요청 바이트 또는 응답 길이를 입력하세요");
    const response = await printerManager.transact(
      device.key,
      request,
      responseLength,
    );
    setRawResponse(responseLength > 0 ? bytesToHex(response) : "전송 완료");
  });

  const copyReport = () => run("결과 복사", async () => {
    if (!activeProfile || !testResult) return;
    await navigator.clipboard.writeText(JSON.stringify({
      device: {
        name: device.name,
        transport: device.transport,
        vendor_id: device.vendorId,
        product_id: device.productId,
        serial_number: device.serialNumber,
        address: device.address,
      },
      language: activeProfile.name,
      profile_id: activeProfile.id,
      link: activeProfile.links[device.transport],
      settings: printerManager.getSettings(device.key),
      result: testResult,
    }, null, 2));
    setNotice("진단 결과를 클립보드에 복사했습니다");
  });

  const tryAnotherLanguage = () => run("진단 종료", async () => {
    await printerManager.disconnect(device.key);
    setTestResult(null);
    setRawResponse(null);
    setNotice("다른 프린터 언어를 선택한 뒤 다시 연결하세요");
  });

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="subtitle1">{device.name}</Typography>
          <Chip size="small" label={TRANSPORT_LABELS[device.transport]} />
          {activeProfile
            ? <Chip size="small" color="primary" label={activeProfile.name} />
            : <Chip size="small" color="default" label="지원하지 않는 기기" />}
          <Chip
            size="small"
            color={state.status === "faulted" ? "error" : state.status === "ready" ? "success" : "default"}
            label={STATUS_LABELS[state.status]}
          />
          <Box sx={{ flexGrow: 1 }} />
          {activeProfile && (profile || connection) && (
            <Button size="small" onClick={() => setSettingsOpen(true)}>설정</Button>
          )}
          {(profile || diagnosticProfileId) && (connection
            ? <Button size="small" disabled={state.status === "printing" || state.status === "disconnecting"} onClick={() => run("해제", () => printerManager.disconnect(device.key))}>연결 해제</Button>
            : <Button
                size="small"
                variant="outlined"
                disabled={state.status === "connecting" || state.status === "disconnecting"}
                onClick={() => run("연결", async () => {
                  if (profile) await printerManager.connect(device.key);
                  else await printerManager.connectForDiagnostics(device.key, diagnosticProfileId);
                })}
              >연결</Button>
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

        {!profile && (
          <Alert severity="warning">
            미확인 기기입니다. 선택한 언어의 일반 명령을 전송하므로 용지를 넣고 프린터가 멈춰 있는지 확인하세요.
          </Alert>
        )}
        {!profile && (
          <TextField
            select
            size="small"
            label="프린터 언어"
            value={diagnosticProfileId}
            disabled={connection !== undefined}
            onChange={(event) => setDiagnosticProfileId(event.target.value)}
          >
            {diagnosticProfiles.map((candidate) => (
              <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
            ))}
          </TextField>
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

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button size="small" variant="contained" disabled={busy !== null} onClick={testPrint}>테스트 인쇄</Button>
              {activeProfile?.probe && (
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
            {!profile && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Raw 송수신</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="요청 바이트 (hex)"
                    value={rawRequest}
                    onChange={(event) => setRawRequest(event.target.value)}
                    sx={{ flexGrow: 1 }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="응답 길이"
                    value={rawResponseLength}
                    slotProps={{ htmlInput: { min: 0, max: 4096, step: 1 } }}
                    onChange={(event) => setRawResponseLength(event.target.value)}
                    sx={{ width: { sm: 120 } }}
                  />
                  <Button variant="outlined" disabled={busy !== null} onClick={transact}>전송</Button>
                </Stack>
                {rawResponse && <Typography component="code" variant="body2">{rawResponse}</Typography>}
              </Stack>
            )}
            {notice && <Alert severity="info" onClose={() => setNotice(null)}>{notice}</Alert>}

            <Box component="canvas" ref={previewRef} sx={{ maxWidth: "100%", border: "1px solid", borderColor: "divider" }} />
            {!profile && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">테스트 결과</Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {TEST_RESULTS.map((result) => (
                    <Button
                      key={result}
                      size="small"
                      variant={testResult === result ? "contained" : "outlined"}
                      onClick={() => setTestResult(result)}
                    >
                      {result}
                    </Button>
                  ))}
                  <Button size="small" disabled={!testResult || busy !== null} onClick={copyReport}>
                    프로필 후보 복사
                  </Button>
                </Stack>
                {testResult && (
                  <Alert severity={testResult === "정상 출력" ? "success" : testResult === "출력 안 됨" ? "error" : "warning"}>
                    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
                      <span>
                        판정: {testResult}. 진단 결과를 복사해 새 프린터 프로필을 만들 때 사용할 수 있습니다.
                      </span>
                      {testResult !== "정상 출력" && (
                        <Button size="small" color="inherit" onClick={tryAnotherLanguage}>
                          연결 해제 후 다른 언어 선택
                        </Button>
                      )}
                    </Stack>
                  </Alert>
                )}
              </Stack>
            )}
          </>
        )}
      </Stack>
      <PrinterDeviceDialog
        open={settingsOpen}
        deviceKey={device.key}
        onClose={() => setSettingsOpen(false)}
      />
    </Card>
  );
};

const EMPTY_PRINTERS: PrinterDevice[] = [];

export const PrinterDebugCard: FC = () => {
  const devices = usePrinterDevices();
  const loadPrinters = useCallback(() => printerManager.refresh({ includeUnknown: true }), []);
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
      const added = await printerManager.requestDevice({ includeUnknown: true });
      if (!added) {
        setRequestError("새로 붙일 프린터를 찾지 못했습니다");
        return;
      }
      refresh();
      if (added.profile) {
        setAdding("연결");
        await printerManager.connect(added.key);
      }
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
            {adding ? `${adding} 중…` : "프린터 또는 USB 장치 추가"}
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
