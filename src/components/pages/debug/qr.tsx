import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DebugCard } from "./card";
import { useRefreshable } from "./shared";
import { Refresh } from "@mui/icons-material";
import { TooltipIconButton } from "../../elements/buttons";
import { isCameraSupported, listCameras, type CameraInfo } from "../../../adapters";
import { type QrCode } from "../../../workers/qrProtocol";
import { useEffect, useRef, useState, type FC } from "react";
import { useQrScanner } from "../../../hooks/useQrScanner";

const EMPTY_CAMERAS: CameraInfo[] = [];

const describeCode = (code: QrCode): string =>
  [
    code.version && `v${code.version}`,
    code.eccLevel && `ECC ${code.eccLevel}`,
    code.mirrored && "mirrored",
    code.inverted && "inverted",
  ].filter(Boolean).join(" · ");

export const QrDebugCard: FC = () => {
  const { scanning, session, result, history, error, start, stop } = useQrScanner();
  const { value: cameras, refresh } = useRefreshable<CameraInfo[]>(listCameras, EMPTY_CAMERAS);
  const [deviceId, setDeviceId] = useState("");

  const previewRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // 권한을 받은 뒤에야 기기 라벨이 채워진다.
  useEffect(() => { if (session) refresh(); }, [session, refresh]);

  useEffect(() => {
    const host = previewRef.current;
    const video = session?.preview;
    if (!host || !video) return;
    // 크기는 컨테이너 쪽 CSS 로 준다. 어댑터가 만든 엘리먼트를 여기서 손대지 않는다.
    host.appendChild(video);
    return () => host.replaceChildren();
  }, [session]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !result) return;
    if (canvas.width !== result.width || canvas.height !== result.height) {
      canvas.width = result.width;
      canvas.height = result.height;
    }
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#00e676";
    context.lineWidth = 4;
    for (const code of result.codes) {
      context.beginPath();
      code.corners.forEach(({ x, y }, index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.closePath();
      context.stroke();
    }
  }, [result]);

  if (!isCameraSupported()) {
    return (
      <DebugCard title="QR Scanner">
        <Alert severity="warning">
          이 환경에서는 getUserMedia 를 쓸 수 없습니다. 보안 컨텍스트(https 또는 localhost)인지 확인하세요.
        </Alert>
      </DebugCard>
    );
  }

  return (
    <DebugCard
      title="QR Scanner"
      action={<TooltipIconButton tooltip="카메라 다시 검색" icon={Refresh} onClick={refresh} />}
    >
      <Stack spacing={2}>
        <Typography variant="caption" color="text.secondary">
          getUserMedia → 캔버스 프레임 → 워커의 zxing-wasm
        </Typography>

        {error && <Alert severity="error">{error.message}</Alert>}

        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            select
            size="small"
            label="카메라"
            value={deviceId}
            disabled={scanning}
            onChange={(event) => setDeviceId(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">자동 (후면 우선)</MenuItem>
            {cameras.map((camera) => (
              <MenuItem key={camera.id} value={camera.id}>{camera.label}</MenuItem>
            ))}
          </TextField>
          {scanning
            ? <Button variant="outlined" onClick={stop}>중지</Button>
            : <Button variant="contained" onClick={() => start(deviceId ? { deviceId } : undefined)}>스캔 시작</Button>}
        </Stack>

        {session && (
          <Box sx={{ position: "relative", maxWidth: 480, bgcolor: "black" }}>
            <Box ref={previewRef} sx={{ "& video": { display: "block", width: "100%" } }} />
            <canvas
              ref={overlayRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          </Box>
        )}

        {result && (
          <Typography variant="caption" color="text.secondary">
            {result.width}×{result.height} · {result.elapsedMs.toFixed(1)}ms/frame · 감지 {result.codes.length}개
          </Typography>
        )}

        {result?.codes.map((code, index) => (
          <Alert key={`${code.text}-${index}`} severity="success" sx={{ wordBreak: "break-all" }}>
            <Typography variant="body2">{code.text}</Typography>
            <Typography variant="caption" color="text.secondary">{describeCode(code)}</Typography>
          </Alert>
        ))}

        {history.length > 0 && (
          <>
            <Typography variant="subtitle2">최근 감지 ({history.length})</Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              {history.map((text) => (
                <Chip key={text} size="small" variant="outlined" label={text} sx={{ maxWidth: "100%" }} />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </DebugCard>
  );
};
