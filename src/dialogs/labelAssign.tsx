import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useRef, useState, type FC } from "react";
import { serialManager, type SerialDevice } from "../apis/serial";
import type { BaudProbeResult } from "../apis/serialScan";
import { PhDialog } from "../components/elements/dialog";

type Props = {
  dialogKey: string;
  currentDialogKey: string | null;
  device: SerialDevice | null;
  unassignedLabels: string[];
  onClose: () => void;
};

type Status = "idle" | "probing" | "success" | "failed";

const escape = (text: string): string =>
  text.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") || "(없음)";

export const LabelAssignDialog: FC<Props> = ({ dialogKey, currentDialogKey, device, unassignedLabels, onClose }) => {
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState<number | null>(null);
  const [result, setResult] = useState<BaudProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [trackedDevice, setTrackedDevice] = useState(device);
  if (device !== trackedDevice) {
    setTrackedDevice(device);
    setLabel(device?.label ?? "");
    setStatus("idle");
    setAttempt(null);
    setResult(null);
    setError(null);
  }

  const start = async () => {
    if (!device) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("probing");
    setError(null);
    setResult(null);

    try {
      const probed = await serialManager.assignLabel(device.key, label, {
        signal: controller.signal,
        onAttempt: setAttempt,
      });
      if (!probed) {
        setStatus(controller.signal.aborted ? "idle" : "failed");
        return;
      }
      setResult(probed);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    } finally {
      abortRef.current = null;
      setAttempt(null);
    }
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  return (
    <PhDialog title="라벨 할당" dialogKey={dialogKey} currentDialogKey={currentDialogKey} size="sm">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          기기: <strong>{device?.key ?? "-"}</strong>
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        {status === "idle" && (
          <>
            <TextField
              label="라벨 이름"
              size="small"
              fullWidth
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            {unassignedLabels.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">기존 라벨</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mt: 0.5 }}>
                  {unassignedLabels.map((l) => (
                    <Chip key={l} label={l} size="small" onClick={() => setLabel(l)} />
                  ))}
                </Stack>
              </Box>
            )}
            <Button variant="contained" disabled={!label.trim() || !device} onClick={() => void start()}>
              스캔 시작
            </Button>
          </>
        )}

        {status === "probing" && (
          <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
            <CircularProgress size={28} />
            <Typography variant="body1">주문상품 QR 또는 UUID QR 코드를 스캔해 주세요.</Typography>
            <Typography variant="caption" color="text.secondary">
              통신 속도 {attempt ?? "-"} 시도 중 · 인식되지 않으면 다음 속도로 넘어갑니다
            </Typography>
          </Stack>
        )}

        {status === "failed" && (
          <Alert severity="warning">
            모든 통신 속도에서 QR 값을 인식하지 못했습니다. 스캐너 설정이나 QR 값을 확인한 뒤 다시 시도하세요.
          </Alert>
        )}

        {status === "success" && result && (
          <Alert severity="success">
            <Stack spacing={0.5}>
              <span><strong>{label}</strong> 할당 완료</span>
              <span>통신 속도: {result.baudRate}</span>
              <span>인식된 값: <code>{result.match.value}</code></span>
              <span>접두어: <code>{escape(result.match.prefix)}</code> · 종결 문자: <code>{escape(result.match.suffix)}</code></span>
            </Stack>
          </Alert>
        )}

        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          {status === "failed" && <Button onClick={() => setStatus("idle")}>다시 시도</Button>}
          <Button onClick={close} variant={status === "success" ? "contained" : "text"}>
            {status === "success" ? "닫기" : "취소"}
          </Button>
        </Stack>
      </Stack>
    </PhDialog>
  );
};
