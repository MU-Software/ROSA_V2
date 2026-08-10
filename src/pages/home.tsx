import type { SvgIconComponent } from "@mui/icons-material";
import {
  AutoModeOutlined,
  BugReportOutlined,
  CheckCircleOutlined,
  DesktopWindowsOutlined,
  LockOutlined,
  MenuOutlined,
  PauseCircleOutlined,
  PowerSettingsNew,
  QrCodeScanner,
} from "@mui/icons-material";
import {
  Box,
  Chip,
  Container,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography,
  useMediaQuery,
  type ChipProps,
  type Theme,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FC, type MouseEvent } from "react";
import { Link } from "react-router";
import { MobileCameraInput } from "../components/pages/home/mobileCamera";
import { OrderSearchWorkspace } from "../components/pages/home/orderSearch";
import {
  DeviceStatusPanel,
  RegistrationStatisticsPanel,
} from "../components/pages/home/sidebar";
import { useAppContext, useTopBar } from "../contexts";
import {
  transitionRegistration,
  type RegistrationState,
} from "../domain";
import type {
  RegistrationDeskGateway,
} from "../gateways";
import { useQrScanner } from "../hooks/useQrScanner";
import { getQrInputMode } from "../utils/platform";

type RegistrationStatePresentation = {
  label: string;
  description: string;
  color: ChipProps["color"];
  icon: SvgIconComponent;
};

const REGISTRATION_STATE_PRESENTATION: Record<
  RegistrationState,
  RegistrationStatePresentation
> = {
  closed: {
    label: "데스크 닫힘",
    description: "메뉴에서 데스크를 열면 주문 검색과 QR 접수를 할 수 있습니다.",
    color: "default",
    icon: LockOutlined,
  },
  idle: {
    label: "접수 대기",
    description: "주문을 검색하거나 참가자의 QR 코드를 인식해주세요.",
    color: "success",
    icon: CheckCircleOutlined,
  },
  registering: {
    label: "접수 진행 중",
    description: "현재 선택된 주문상품을 처리하고 있습니다.",
    color: "info",
    icon: QrCodeScanner,
  },
  awaiting_completion: {
    label: "완료 확인 대기",
    description: "출력물과 참가자를 확인한 뒤 접수를 완료해주세요.",
    color: "warning",
    icon: PauseCircleOutlined,
  },
};

export const HomePage: FC<{ gateway: RegistrationDeskGateway | null }> = ({ gateway }) => {
  const { registration_state: registrationState, setAppContext } = useAppContext();
  const [isAutomaticRegistrationEnabled, setAutomaticRegistrationEnabled] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const statisticsMutation = useMutation({
    mutationFn: async () => {
      if (!gateway) throw new Error("등록 통계 gateway가 준비되지 않았습니다.");
      return gateway.getStatistics();
    },
  });
  const { mutate: refreshStatistics } = statisticsMutation;
  const scanner = useQrScanner();
  const { start: startScanner, status: scannerStatus, stop: stopScanner } = scanner;
  const qrInputMode = getQrInputMode();
  const presentation = REGISTRATION_STATE_PRESENTATION[registrationState];
  const isDeskOpen = registrationState !== "closed";
  const isNarrow = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  useEffect(() => {
    if (gateway) refreshStatistics();
  }, [gateway, refreshStatistics]);

  useEffect(() => {
    if (qrInputMode !== "camera") return;
    if (isDeskOpen && scannerStatus === "idle") {
      startScanner({ facingMode: "environment" });
    } else if (!isDeskOpen && scannerStatus !== "idle" && scannerStatus !== "stopping") {
      stopScanner();
    }
  }, [isDeskOpen, qrInputMode, scannerStatus, startScanner, stopScanner]);

  useTopBar(useMemo(() => ({
    title: "ROSA",
    rightActionButtons: (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Chip
          size="small"
          label={presentation.label}
          color={presentation.color}
          sx={presentation.color === "default" ? { bgcolor: "grey.100" } : undefined}
        />
        <Tooltip title="등록 데스크 메뉴">
          <IconButton
            color="inherit"
            aria-label="등록 데스크 메뉴"
            onClick={(event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
          >
            <MenuOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
    ),
  }), [presentation.color, presentation.label]));

  const toggleDesk = () => {
    setMenuAnchor(null);
    if (registrationState === "closed") {
      setAppContext((current) => ({
        ...current,
        registration_state: transitionRegistration(current.registration_state, "idle"),
        farewell_until: null,
      }));
      return;
    }

    setAppContext((current) => ({
      ...current,
      registration_state: transitionRegistration(current.registration_state, "closed"),
      order_product_relation: null,
      farewell_until: null,
    }));
    setAutomaticRegistrationEnabled(false);
  };

  return (
    <Box sx={{ minHeight: "calc(100dvh - 64px)", bgcolor: "grey.50" }}>
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={toggleDesk}>
          <ListItemIcon><PowerSettingsNew fontSize="small" /></ListItemIcon>
          <ListItemText>{isDeskOpen ? "데스크 닫기" : "데스크 열기"}</ListItemText>
        </MenuItem>
        {isDeskOpen && (
          <MenuItem onClick={() => setAutomaticRegistrationEnabled((enabled) => !enabled)}>
            <ListItemIcon><AutoModeOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>자동 접수</ListItemText>
            <Switch
              size="small"
              edge="end"
              checked={isAutomaticRegistrationEnabled}
              slotProps={{ input: { "aria-label": "자동 접수" } }}
              onClick={(event) => event.stopPropagation()}
              onChange={(_, checked) => setAutomaticRegistrationEnabled(checked)}
            />
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          component="a"
          href="/display"
          target="_blank"
          rel="noreferrer"
          onClick={() => setMenuAnchor(null)}
        >
          <ListItemIcon><DesktopWindowsOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>외부 화면 열기</ListItemText>
        </MenuItem>
        <MenuItem component={Link} to="/debug" onClick={() => setMenuAnchor(null)}>
          <ListItemIcon><BugReportOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>장치 진단</ListItemText>
        </MenuItem>
      </Menu>

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 300px", xl: "minmax(0, 1fr) 320px" },
            gap: 3,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              minHeight: { xs: 400, md: 620 },
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {registrationState === "idle" || registrationState === "registering" ? (
              <OrderSearchWorkspace gateway={gateway}>
                {qrInputMode === "camera" ? (
                  <MobileCameraInput scanner={scanner} />
                ) : (
                  <RegistrationStateContent presentation={presentation} isDeskOpen={isDeskOpen} />
                )}
              </OrderSearchWorkspace>
            ) : (
              <RegistrationStateContent presentation={presentation} isDeskOpen={isDeskOpen} />
            )}
          </Paper>

          <Stack spacing={3}>
            <RegistrationStatisticsPanel
              defaultExpanded={!isNarrow}
              statistics={statisticsMutation.data ?? null}
              error={gateway ? statisticsMutation.error?.message ?? null : "등록 통계 gateway가 준비되지 않았습니다."}
              requestedAt={statisticsMutation.submittedAt || null}
              refreshing={statisticsMutation.isPending}
              onRefresh={refreshStatistics}
            />
            <DeviceStatusPanel
              defaultExpanded={!isNarrow}
              camera={qrInputMode === "camera" ? { status: scanner.status, error: scanner.error } : undefined}
            />
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

const RegistrationStateContent: FC<{
  presentation: RegistrationStatePresentation;
  isDeskOpen: boolean;
}> = ({ presentation, isDeskOpen }) => {
  const StateIcon = presentation.icon;

  return (
    <Stack
      spacing={2}
      sx={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        maxWidth: 480,
        mx: "auto",
        p: 3,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          bgcolor: isDeskOpen ? "primary.light" : "grey.100",
          color: isDeskOpen ? "primary.contrastText" : "text.disabled",
        }}
      >
        <StateIcon sx={{ fontSize: 38 }} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>{presentation.label}</Typography>
      <Typography color="text.secondary">{presentation.description}</Typography>
    </Stack>
  );
};
