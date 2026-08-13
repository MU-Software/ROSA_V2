import { Casino, Refresh } from "@mui/icons-material";
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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import type { PortInfo } from "../../adapters";
import { serialManager, type SerialDevice } from "../../apis/serial";
import type { BaudProbeResult } from "../../apis/serialScan";
import { useSerialDevices } from "../../hooks/useSerialPort";
import { toMessage } from "../../utils/bytes";
import { isTauri } from "../../utils/platform";

type Props = {
  open: boolean;
  /** 기존 장치를 다시 설정할 때 지정한다. 없으면 장치 선택부터 시작한다. */
  targetKey?: string;
  onClose: () => void;
};

type SetupStatus = "idle" | "probing" | "success" | "failed";

const describePort = (port: PortInfo): string =>
  [port.manufacturer, port.product, port.serialNumber && `SN:${port.serialNumber}`]
    .filter(Boolean)
    .join(" · ") || port.portType;

const escapeFraming = (text: string): string =>
  text.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") || "(없음)";

/** 사용자 입력을 필터링하는 대신, 검수된 후보만 생성해 비속어가 섞일 여지를 없앤다. */
const SAFE_KOREAN_LABELS = [
  "가람", "나래", "다솜", "라온", "마루", "미리내", "보름", "새봄", "소담", "윤슬",
  "초롱", "해솔", "하늘", "구름", "노을", "별빛", "햇살", "바다", "나무", "여울",
  "단비", "이슬", "꽃비", "산들", "아람", "한결", "누리", "나루", "샛별", "푸름",
  "솔빛", "달빛", "해오름", "봄빛", "은하", "솔바람", "물결", "새벽", "한울", "보라",
] as const;

const randomIndex = (length: number): number => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % length;
};

const createRandomLabel = (usedLabels: Set<string>): string => {
  const available = SAFE_KOREAN_LABELS.filter((candidate) => !usedLabels.has(candidate));
  if (available.length > 0) return available[randomIndex(available.length)];

  // 단일 후보를 모두 쓴 경우에도 검수된 단어끼리만 조합한다.
  for (let attempt = 0; attempt < SAFE_KOREAN_LABELS.length; attempt += 1) {
    const candidate = `${SAFE_KOREAN_LABELS[randomIndex(SAFE_KOREAN_LABELS.length)]}${SAFE_KOREAN_LABELS[randomIndex(SAFE_KOREAN_LABELS.length)]}`;
    if (!usedLabels.has(candidate)) return candidate;
  }
  return `새봄${usedLabels.size + 1}`;
};

const SerialDeviceSetupDialogContent: FC<Omit<Props, "open">> = ({ targetKey, onClose }) => {
  const initialTarget = targetKey ? serialManager.getDevice(targetKey) : undefined;
  const devices = useSerialDevices();
  const [step, setStep] = useState<"devices" | "setup">(initialTarget ? "setup" : "devices");
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(!initialTarget);
  const [target, setTarget] = useState<SerialDevice | null>(initialTarget ?? null);
  const [label, setLabel] = useState(initialTarget?.label ?? "");
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [attempt, setAttempt] = useState<number | null>(null);
  const [result, setResult] = useState<BaudProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const registeredKeys = useMemo(() => new Set(devices.map((device) => device.key)), [devices]);
  const unassignedLabels = serialManager.listUnassignedLabels();
  const usedLabels = new Set(serialManager.listKnownLabels().filter((known) => known !== target?.label));

  const refreshPorts = useCallback(async () => {
    setLoadingPorts(true);
    setError(null);
    try {
      setPorts(await serialManager.listAvailablePorts());
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setLoadingPorts(false);
    }
  }, []);

  useEffect(() => {
    if (initialTarget) return;
    let active = true;
    void serialManager.listAvailablePorts().then(
      (found) => { if (active) setPorts(found); },
      (reason: unknown) => { if (active) setError(toMessage(reason)); },
    ).finally(() => { if (active) setLoadingPorts(false); });
    return () => { active = false; };
  }, [initialTarget]);

  const choose = (device: SerialDevice) => {
    setTarget(device);
    setLabel(device.label ?? "");
    setStatus("idle");
    setResult(null);
    setError(null);
    setStep("setup");
  };

  const requestWebPort = async () => {
    setError(null);
    try {
      const device = await serialManager.requestDevice();
      if (device) choose(device);
      await refreshPorts();
    } catch (reason) {
      setError(toMessage(reason));
    }
  };

  const beginSetup = async () => {
    if (!target) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("probing");
    setError(null);
    setResult(null);
    try {
      const probed = await serialManager.assignLabel(target.key, label, {
        signal: controller.signal,
        onAttempt: setAttempt,
      });
      if (!probed) {
        setStatus(controller.signal.aborted ? "idle" : "failed");
        return;
      }
      setResult(probed);
      setStatus("success");
    } catch (reason) {
      setError(toMessage(reason));
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
    <Dialog open onClose={status === "probing" ? undefined : close} maxWidth="sm" fullWidth>
      <DialogTitle>Serial QR 리더 추가</DialogTitle>
      <DialogContent dividers>
        {step === "devices" ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              QR 리더로 사용할 Serial 장치를 선택하세요.
            </Typography>
            <Stack direction="row" spacing={1}>
              {isTauri() ? (
                <Button startIcon={<Refresh />} disabled={loadingPorts} onClick={() => void refreshPorts()}>
                  새로고침
                </Button>
              ) : (
                <Button variant="contained" onClick={() => void requestWebPort()}>
                  새 장치 권한 요청
                </Button>
              )}
              {loadingPorts && <CircularProgress size={22} />}
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            <List dense>
              {ports.length === 0 && !loadingPorts && (
                <ListItem><ListItemText primary="(등록 가능한 Serial 장치 없음)" /></ListItem>
              )}
              {ports.map((port) => {
                const existing = serialManager.getDevice(port.path);
                return (
                  <ListItem
                    key={port.path}
                    secondaryAction={
                      <Button
                        size="small"
                        onClick={() => choose(existing ?? serialManager.registerDevice(port))}
                      >
                        {registeredKeys.has(port.path) ? "설정" : "추가"}
                      </Button>
                    }
                  >
                    <ListItemText primary={port.path} secondary={describePort(port)} />
                  </ListItem>
                );
              })}
            </List>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              장치: <strong>{target?.key ?? "-"}</strong>
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}

            {status === "idle" && (
              <>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    label="리더 라벨"
                    size="small"
                    fullWidth
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<Casino />}
                    sx={{ flexShrink: 0 }}
                    onClick={() => setLabel(createRandomLabel(usedLabels))}
                  >
                    무작위 이름
                  </Button>
                </Stack>
                {unassignedLabels.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">기존 라벨</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mt: 0.5 }}>
                      {unassignedLabels.map((known) => (
                        <Chip key={known} label={known} size="small" onClick={() => setLabel(known)} />
                      ))}
                    </Stack>
                  </Box>
                )}
                <Alert severity="info">
                  시작 후 주문상품 QR 또는 UUID 형식의 QR 코드를 리더로 스캔하세요.
                  통신 속도와 입력 앞뒤 문자를 자동으로 확인합니다.
                </Alert>
                <Button variant="contained" disabled={!label.trim() || !target} onClick={() => void beginSetup()}>
                  속도 및 입력 형식 확인
                </Button>
              </>
            )}

            {status === "probing" && (
              <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
                <CircularProgress size={28} />
                <Typography>주문상품 QR 또는 UUID QR 코드를 스캔해 주세요.</Typography>
                <Typography variant="caption" color="text.secondary">
                  통신 속도 {attempt ?? "-"} 시도 중
                </Typography>
              </Stack>
            )}

            {status === "failed" && (
              <Alert severity="warning">
                QR 코드를 인식하지 못했습니다. 리더 설정을 확인한 뒤 다시 시도하세요.
              </Alert>
            )}

            {status === "success" && result && (
              <Alert severity="success">
                <Stack spacing={0.5}>
                  <span><strong>{label}</strong> 설정 완료</span>
                  <span>통신 속도: {result.baudRate}</span>
                  <span>인식된 값: <code>{result.match.value}</code></span>
                  <span>접두어: <code>{escapeFraming(result.match.prefix)}</code></span>
                  <span>종결 문자: <code>{escapeFraming(result.match.suffix)}</code></span>
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {step === "setup" && status !== "probing" && status !== "success" && (
          <Button onClick={() => { setStep("devices"); void refreshPorts(); }}>장치 목록</Button>
        )}
        {status === "failed" && <Button onClick={() => setStatus("idle")}>다시 시도</Button>}
        {status === "probing" ? (
          <Button onClick={() => abortRef.current?.abort()}>중단</Button>
        ) : (
          <Button variant={status === "success" ? "contained" : "text"} onClick={close}>
            {status === "success" ? "완료" : "닫기"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export const SerialDeviceSetupDialog: FC<Props> = ({ open, targetKey, onClose }) =>
  open
    ? <SerialDeviceSetupDialogContent key={targetKey ?? "new-device"} targetKey={targetKey} onClose={onClose} />
    : null;
