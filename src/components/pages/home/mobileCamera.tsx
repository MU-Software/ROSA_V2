import {
  CameraAltOutlined,
  CameraswitchOutlined,
  Check,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState, type FC } from "react";
import { listCameras, type CameraInfo } from "../../../adapters";
import type { UseQrScannerResult } from "../../../hooks/useQrScanner";
import { toMessage } from "../../../utils/bytes";

export const MobileCameraInput: FC<{ scanner: UseQrScannerResult }> = ({ scanner }) => {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [cameraListError, setCameraListError] = useState<string | null>(null);
  const [cameraMenuAnchor, setCameraMenuAnchor] = useState<HTMLElement | null>(null);
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

  if (!scanner.session) {
    return (
      <Stack
        spacing={2}
        sx={{
          flex: 1,
          minHeight: { xs: 360, sm: 440 },
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, sm: 3 },
          textAlign: "center",
        }}
      >
        <CameraAltOutlined sx={{ fontSize: 56, color: "text.disabled" }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>카메라를 시작해주세요</Typography>
          <Typography variant="body2" color="text.secondary">
            참가자의 QR 코드를 인식하려면 카메라 권한이 필요합니다.
          </Typography>
        </Box>
        {scanner.error && <Alert severity="error" sx={{ width: "100%" }}>{scanner.error.message}</Alert>}
        <Button
          variant="contained"
          startIcon={scanner.status === "starting" ? <CircularProgress size={18} color="inherit" /> : <CameraAltOutlined />}
          disabled={scanner.status === "starting" || scanner.status === "stopping"}
          onClick={() => scanner.start({ facingMode: "environment" })}
        >
          {scanner.status === "starting" ? "카메라 시작 중…" : "카메라 시작"}
        </Button>
      </Stack>
    );
  }

  const activeCameraIndex = cameras.findIndex((camera) => camera.id === scanner.session?.deviceId);
  const detected = (scanner.result?.codes.length ?? 0) > 0;
  const busy = scanner.status === "switching" || scanner.status === "stopping";

  return (
    <Stack spacing={1.5} sx={{ flex: 1 }}>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          bgcolor: "black",
          aspectRatio: "4 / 3",
          overflow: "hidden",
        }}
      >
        <Box
          ref={previewRef}
          sx={{
            width: "100%",
            height: "100%",
            "& video": {
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            },
          }}
        />

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              width: "58%",
              maxWidth: 300,
              aspectRatio: "1",
              border: 3,
              borderColor: detected ? "success.light" : "common.white",
              borderRadius: 2,
              boxShadow: "0 0 0 999px rgba(0, 0, 0, 0.22)",
              transition: "border-color 120ms ease",
            }}
          />
        </Box>

        {cameras.length > 1 && (
          <Tooltip title="카메라 전환">
            <IconButton
              aria-label="카메라 전환"
              aria-haspopup="menu"
              disabled={busy}
              onClick={(event) => setCameraMenuAnchor(event.currentTarget)}
              sx={{
                position: "absolute",
                top: 12,
                right: 12,
                color: "common.white",
                bgcolor: "rgba(0, 0, 0, 0.45)",
                "&:hover": { bgcolor: "rgba(0, 0, 0, 0.6)" },
              }}
            >
              <CameraswitchOutlined />
            </IconButton>
          </Tooltip>
        )}

        <Menu
          anchorEl={cameraMenuAnchor}
          open={cameraMenuAnchor !== null}
          onClose={() => setCameraMenuAnchor(null)}
        >
          {cameras.map((camera, index) => {
            const selected = index === activeCameraIndex;
            return (
              <MenuItem
                key={camera.id}
                selected={selected}
                disabled={busy}
                onClick={() => {
                  setCameraMenuAnchor(null);
                  if (!selected) scanner.switchCamera({ deviceId: camera.id });
                }}
              >
                <ListItemIcon>{selected && <Check fontSize="small" />}</ListItemIcon>
                <ListItemText>{camera.label}</ListItemText>
              </MenuItem>
            );
          })}
        </Menu>

        <Typography
          variant="body2"
          sx={{
            position: "absolute",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            color: "common.white",
            bgcolor: "rgba(0, 0, 0, 0.55)",
            borderRadius: 4,
            px: 2,
            py: 0.75,
            whiteSpace: "nowrap",
          }}
        >
          {detected ? "QR 코드를 인식했습니다" : "QR 코드를 사각형 안에 맞춰주세요"}
        </Typography>

        {busy && (
          <Stack
            spacing={1}
            sx={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
              color: "common.white",
              bgcolor: "rgba(0, 0, 0, 0.5)",
            }}
          >
            <CircularProgress size={28} color="inherit" />
            <Typography variant="body2">
              {scanner.status === "switching" ? "카메라 전환 중…" : "카메라 중단 중…"}
            </Typography>
          </Stack>
        )}
      </Box>

      {(scanner.error || cameraListError) && (
        <Alert severity={scanner.error ? "error" : "warning"} sx={{ mx: { xs: 1.5, sm: 0 } }}>
          {scanner.error?.message ?? `카메라 목록 조회 실패: ${cameraListError}`}
        </Alert>
      )}
    </Stack>
  );
};
