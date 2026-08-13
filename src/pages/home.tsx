import type { SvgIconComponent } from "@mui/icons-material";
import {
  AutoModeOutlined,
  BugReportOutlined,
  CheckCircleOutlined,
  DesktopWindowsOutlined,
  DesignServicesOutlined,
  DnsOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  PauseCircleOutlined,
  PowerSettingsNew,
  QrCodeScanner,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type MouseEvent } from "react";
import { Link } from "react-router";
import { QueryBoundary } from "../components/elements/queryBoundary";
import {
  AutomaticModeBanner,
  AutomaticRegistrationFailure,
  AutomaticRegistrationPanel,
  MockQrInput,
  type AutomaticProductDetailsController,
  type AutomaticRegistrationProgress,
  type AutomaticRegistrationStage,
} from "../components/pages/home/automaticRegistration";
import { MobileCameraInput } from "../components/pages/home/mobileCamera";
import { OrderSearchWorkspace } from "../components/pages/home/orderSearch";
import {
  DeviceStatusPanel,
  RegistrationStatisticsPanel,
} from "../components/pages/home/sidebar";
import { useAppContext, useTopBar } from "../contexts";
import {
  getAutomaticRegistrationUnavailableReason,
  parseOrderProductScancode,
  transitionRegistration,
  type OrderProductRelation,
  type RegistrationState,
} from "../domain";
import type { RegistrationDeskGateway } from "../gateways";
import {
  useModifyOrderProductMutation,
  useRegistrationConfigurationQuery,
  useRegistrationDeskQueryClient,
  useRegistrationStatisticsQuery,
} from "../hooks/useRegistrationDesk";
import { usePrintQueue } from "../hooks/usePrintQueue";
import { useQrScanner } from "../hooks/useQrScanner";
import { useQrTrigger } from "../hooks/useQrTrigger";
import { useRegistrationPrintExecutor } from "../hooks/useRegistrationPrintExecutor";
import {
  createRegistrationPrintQueue,
  type PrintJobExecution,
  type RegistrationPrintData,
} from "../printing/queue";
import { setActiveBadgeTemplateConfiguration } from "../printing/templates";
import { getQrInputMode } from "../utils/platform";

const DEFAULT_FAREWELL_DURATION_MS = 3000;

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

export const HomePage: FC<{
  gateway: RegistrationDeskGateway | null;
  onChangeServer: () => void;
  onLogout?: () => void;
}> = ({ gateway, onChangeServer, onLogout }) => {
  const {
    active_order_product_scancode: activeOrderProductScancode,
    automatic_registration_enabled: isAutomaticRegistrationEnabled,
    order_product_relation: registrationProduct,
    print_job_executions: printJobExecutions,
    registration_state: registrationState,
    setAppContext,
  } = useAppContext();
  const [automaticRegistrationStage, setAutomaticRegistrationStage] =
    useState<AutomaticRegistrationStage>("lookup");
  const [automaticFailureProduct, setAutomaticFailureProduct] =
    useState<OrderProductRelation | null>(null);
  const [closeDeskDialogOpen, setCloseDeskDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const automaticRunRef = useRef(false);
  const updatePrintJobExecutions = useCallback((executions: PrintJobExecution[]) => {
    setAppContext((current) => ({ ...current, print_job_executions: executions }));
  }, [setAppContext]);
  const {
    isPending: printOperationPending,
    markCompleted: markPrintJobCompleted,
    reset: resetPrintJobs,
    run: runPrintJobs,
  } = usePrintQueue<RegistrationPrintData>({
    executions: printJobExecutions,
    onExecutionsChange: updatePrintJobExecutions,
  });
  const { execute: executePrintJob } = useRegistrationPrintExecutor();
  const registrationDeskQueryClient = useRegistrationDeskQueryClient(gateway);
  const printRegistrationProduct = (
    product: OrderProductRelation,
    jobIds?: readonly string[],
  ): Promise<readonly PrintJobExecution[]> => runPrintJobs(
    createRegistrationPrintQueue(product).snapshot(),
    executePrintJob,
    jobIds,
  );
  const automaticMarkUsedMutation = useModifyOrderProductMutation(gateway);
  const automaticRegistrationMutation = useMutation({
    mutationFn: async (rawScancode: string) => {
      if (!gateway) throw new Error("등록 데스크 gateway가 준비되지 않았습니다.");

      setAutomaticRegistrationStage("lookup");
      const scancode = parseOrderProductScancode(rawScancode);
      const lookup = await registrationDeskQueryClient.fetchOrderProductByScancode(scancode);
      registrationDeskQueryClient.setOrderProduct(lookup);
      setAutomaticFailureProduct(lookup);
      const unavailableReason = getAutomaticRegistrationUnavailableReason(
        lookup.order,
        lookup,
      );
      if (unavailableReason) throw new Error(unavailableReason);
      setAppContext((current) => ({
        ...current,
        registration_state: current.registration_state === "idle"
          ? transitionRegistration(current.registration_state, "registering")
          : current.registration_state,
        order_product_relation: lookup,
        farewell_until: null,
      }));

      setAutomaticRegistrationStage("marking_used");
      await automaticMarkUsedMutation.mutateAsync({
        order_id: lookup.order.id,
        order_product_relation_id: lookup.id,
        status: "used",
      });
      const updatedLookup = await registrationDeskQueryClient.fetchOrderProduct(
        lookup.id,
      );
      const updatedProduct = updatedLookup;

      setAutomaticRegistrationStage("printing");
      setAppContext((current) => ({
        ...current,
        order_product_relation: updatedProduct,
      }));
      await printRegistrationProduct(updatedProduct);
      setAppContext((current) => ({
        ...current,
        registration_state: current.registration_state === "registering"
          ? transitionRegistration(current.registration_state, "awaiting_completion")
          : current.registration_state,
        order_product_relation: updatedProduct,
        farewell_until: null,
      }));
      return updatedProduct;
    },
    onSuccess: () => {
      setAutomaticFailureProduct(null);
    },
    onError: () => {
      setAppContext((current) => ({
        ...current,
        registration_state: current.registration_state === "registering"
          ? transitionRegistration(current.registration_state, "idle")
          : current.registration_state,
        order_product_relation: null,
        farewell_until: null,
      }));
    },
    onSettled: () => {
      automaticRunRef.current = false;
    },
  });
  const scanner = useQrScanner();
  const { start: startScanner, status: scannerStatus, stop: stopScanner } = scanner;
  const qrInputMode = getQrInputMode();
  const presentation = REGISTRATION_STATE_PRESENTATION[registrationState];
  const isDeskOpen = registrationState !== "closed";
  const automaticOperationPending = automaticRegistrationMutation.isPending ||
    printOperationPending;
  const hasActiveAutomaticProduct = registrationProduct !== null ||
    automaticFailureProduct !== null;
  const isNarrow = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  useEffect(() => {
    if (qrInputMode !== "camera") return;
    if (isDeskOpen && scannerStatus === "idle") {
      startScanner({ facingMode: "environment" });
    } else if (!isDeskOpen && scannerStatus !== "idle" && scannerStatus !== "stopping") {
      stopScanner();
    }
  }, [isDeskOpen, qrInputMode, scannerStatus, startScanner, stopScanner]);

  const startAutomaticRegistration = useCallback((value: string) => {
    if (
      !isAutomaticRegistrationEnabled ||
      registrationState !== "idle" ||
      automaticRegistrationMutation.isPending ||
      automaticRegistrationMutation.error ||
      (activeOrderProductScancode === value && hasActiveAutomaticProduct) ||
      automaticRunRef.current
    ) return;

    automaticRunRef.current = true;
    setAppContext((current) => ({ ...current, active_order_product_scancode: value }));
    setAutomaticFailureProduct(null);
    resetPrintJobs();
    automaticRegistrationMutation.reset();
    automaticRegistrationMutation.mutate(value);
  }, [
    automaticRegistrationMutation,
    activeOrderProductScancode,
    hasActiveAutomaticProduct,
    isAutomaticRegistrationEnabled,
    registrationState,
    resetPrintJobs,
    setAppContext,
  ]);

  useQrTrigger({
    cameraResult: scanner.result,
    onDetected: ({ value }) => startAutomaticRegistration(value),
  });

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

  const closeDesk = () => {
    setCloseDeskDialogOpen(false);
    setMenuAnchor(null);
    setAppContext((current) => ({
      ...current,
      registration_state: current.registration_state === "closed"
        ? current.registration_state
        : transitionRegistration(current.registration_state, "closed"),
      order_product_relation: null,
      farewell_until: null,
      automatic_registration_enabled: false,
      active_order_product_scancode: null,
    }));
    setAutomaticFailureProduct(null);
    resetPrintJobs();
    automaticRegistrationMutation.reset();
  };

  const toggleDesk = () => {
    if (registrationState === "closed") {
      setMenuAnchor(null);
      setAppContext((current) => ({
        ...current,
        registration_state: transitionRegistration(current.registration_state, "idle"),
        farewell_until: null,
      }));
      return;
    }

    if (registrationState !== "idle") {
      setMenuAnchor(null);
      setCloseDeskDialogOpen(true);
      return;
    }
    closeDesk();
  };

  const completeAutomaticRegistration = () => {
    setAppContext((current) => {
      if (current.registration_state !== "awaiting_completion") return current;
      return {
        ...current,
        registration_state: transitionRegistration(current.registration_state, "idle"),
        order_product_relation: null,
        farewell_until: Date.now() + DEFAULT_FAREWELL_DURATION_MS,
        active_order_product_scancode: null,
      };
    });
    automaticRegistrationMutation.reset();
    setAutomaticRegistrationStage("lookup");
    resetPrintJobs();
  };

  const dismissAutomaticRegistrationError = () => {
    setAppContext((current) => ({ ...current, active_order_product_scancode: null }));
    setAutomaticFailureProduct(null);
    resetPrintJobs();
    automaticRegistrationMutation.reset();
  };

  const reprintAutomaticProduct = (
    product: OrderProductRelation,
  ): Promise<readonly PrintJobExecution[]> => printRegistrationProduct(product);

  const retryAutomaticPrintJob = (
    product: OrderProductRelation,
    printJobId: string,
  ): Promise<readonly PrintJobExecution[]> => printRegistrationProduct(product, [printJobId]);

  const markAutomaticPrintJobCompleted = (
    product: OrderProductRelation,
    printJobId: string,
  ) => {
    markPrintJobCompleted(createRegistrationPrintQueue(product).snapshot(), printJobId);
  };

  const updateAutomaticProduct = (updatedProduct: OrderProductRelation) => {
    resetPrintJobs();
    setAppContext((current) => current.order_product_relation?.id === updatedProduct.id
      ? { ...current, order_product_relation: updatedProduct }
      : current);
    setAutomaticFailureProduct((current) => current?.id === updatedProduct.id
      ? updatedProduct
      : current);
  };

  const handleAutomaticStatusChanged = (updatedProduct: OrderProductRelation) => {
    setAppContext((current) => ({
      ...current,
      registration_state: current.registration_state === "idle" ||
        current.registration_state === "awaiting_completion"
        ? transitionRegistration(current.registration_state, "registering")
        : current.registration_state,
      order_product_relation: updatedProduct,
      farewell_until: null,
    }));
    setAutomaticFailureProduct(null);
    resetPrintJobs();
    automaticRegistrationMutation.reset();
  };

  const setAutomaticRegistrationMode = (enabled: boolean) => {
    setAppContext((current) => ({
      ...current,
      automatic_registration_enabled: enabled,
      active_order_product_scancode: enabled ? current.active_order_product_scancode : null,
    }));
    setMenuAnchor(null);
  };

  const automaticProgress: AutomaticRegistrationProgress = {
    stage: automaticRegistrationStage,
    processing: automaticOperationPending,
    print_jobs: printJobExecutions,
  };
  const automaticProductDetails: AutomaticProductDetailsController = {
    reprinting: printOperationPending,
    onProductUpdated: updateAutomaticProduct,
    onStatusChanged: handleAutomaticStatusChanged,
    onReprint: reprintAutomaticProduct,
    onRetryPrintJob: retryAutomaticPrintJob,
    onMarkPrintJobCompleted: markAutomaticPrintJobCompleted,
  };

  return (
    <Box sx={{ minHeight: "calc(100dvh - 64px)", bgcolor: "grey.50" }}>
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          disabled={registrationState !== "closed" && automaticOperationPending}
          onClick={toggleDesk}
        >
          <ListItemIcon><PowerSettingsNew fontSize="small" /></ListItemIcon>
          <ListItemText>{isDeskOpen ? "데스크 닫기" : "데스크 열기"}</ListItemText>
        </MenuItem>
        {gateway && isDeskOpen && (
          <MenuItem
            disabled={automaticOperationPending}
            onClick={() => setAutomaticRegistrationMode(!isAutomaticRegistrationEnabled)}
          >
            <ListItemIcon><AutoModeOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>자동 접수</ListItemText>
            <Switch
              size="small"
              edge="end"
              checked={isAutomaticRegistrationEnabled}
              disabled={automaticOperationPending}
              slotProps={{ input: { "aria-label": "자동 접수" } }}
              onClick={(event) => event.stopPropagation()}
              onChange={(_, checked) => setAutomaticRegistrationMode(checked)}
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
        <MenuItem component={Link} to="/templates" onClick={() => setMenuAnchor(null)}>
          <ListItemIcon><DesignServicesOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>명찰 템플릿</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={registrationState !== "closed"}
          onClick={() => {
            setMenuAnchor(null);
            onChangeServer();
          }}
        >
          <ListItemIcon><DnsOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>서버 변경</ListItemText>
        </MenuItem>
        {onLogout && (
          <MenuItem
            disabled={registrationState !== "closed"}
            onClick={() => {
              setMenuAnchor(null);
              onLogout();
            }}
          >
            <ListItemIcon><LogoutOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>로그아웃</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Dialog open={closeDeskDialogOpen} onClose={() => setCloseDeskDialogOpen(false)}>
        <DialogTitle>진행 중인 접수를 종료할까요?</DialogTitle>
        <DialogContent>
          현재 주문상품과 접수 진행 상태가 초기화됩니다. 접수 완료 전에는 종료 인사가
          표시되지 않습니다.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseDeskDialogOpen(false)}>취소</Button>
          <Button color="error" onClick={closeDesk}>데스크 닫기</Button>
        </DialogActions>
      </Dialog>

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        {gateway && (
          <QueryBoundary pendingFallback={null}>
            <RegistrationConfigurationQuery gateway={gateway} />
          </QueryBoundary>
        )}
        {isAutomaticRegistrationEnabled && (
          <AutomaticModeBanner
            processing={automaticOperationPending}
            onDisable={() => setAutomaticRegistrationMode(false)}
          />
        )}
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
            {gateway && (automaticRegistrationMutation.isPending ||
            (registrationState === "awaiting_completion" && registrationProduct)) ? (
              <AutomaticRegistrationPanel
                gateway={gateway}
                progress={automaticProgress}
                details={automaticProductDetails}
                onComplete={completeAutomaticRegistration}
              />
            ) : gateway && automaticRegistrationMutation.error ? (
              <AutomaticRegistrationFailure
                gateway={gateway}
                error={automaticRegistrationMutation.error}
                product={automaticFailureProduct}
                details={automaticProductDetails}
                onDismiss={dismissAutomaticRegistrationError}
              />
            ) : registrationState === "idle" || registrationState === "registering" ? (
              <OrderSearchWorkspace gateway={gateway}>
                <Stack sx={{ height: "100%", alignItems: "center" }}>
                  {qrInputMode === "camera" ? (
                    <MobileCameraInput scanner={scanner} />
                  ) : (
                    <RegistrationStateContent presentation={presentation} isDeskOpen={isDeskOpen} />
                  )}
                  {import.meta.env.DEV && isAutomaticRegistrationEnabled && registrationState === "idle" && (
                    <MockQrInput
                      disabled={automaticRegistrationMutation.isPending}
                      onSubmit={startAutomaticRegistration}
                    />
                  )}
                </Stack>
              </OrderSearchWorkspace>
            ) : (
              <RegistrationStateContent presentation={presentation} isDeskOpen={isDeskOpen} />
            )}
          </Paper>

          <Stack spacing={3}>
            {gateway ? (
              <QueryBoundary>
                <RegistrationStatisticsQuery gateway={gateway} defaultExpanded={!isNarrow} />
              </QueryBoundary>
            ) : (
              <RegistrationStatisticsPanel
                defaultExpanded={!isNarrow}
                statistics={null}
                error="등록 통계 gateway가 준비되지 않았습니다."
                requestedAt={null}
                refreshing={false}
                onRefresh={() => undefined}
              />
            )}
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

const RegistrationConfigurationQuery: FC<{
  gateway: RegistrationDeskGateway;
}> = ({ gateway }) => {
  const { data } = useRegistrationConfigurationQuery(gateway);
  const { event_logo_url: eventLogoUrl, setAppContext } = useAppContext();

  useEffect(() => {
    setActiveBadgeTemplateConfiguration(data.id);
    if (eventLogoUrl === data.event.logo_url) return;
    setAppContext((current) => ({
      ...current,
      event_logo_url: data.event.logo_url,
    }));
  }, [data.event.logo_url, data.id, eventLogoUrl, setAppContext]);

  return null;
};

const RegistrationStatisticsQuery: FC<{
  gateway: RegistrationDeskGateway;
  defaultExpanded: boolean;
}> = ({ gateway, defaultExpanded }) => {
  const { data, dataUpdatedAt, isFetching, refetch } = useRegistrationStatisticsQuery(gateway);

  return (
    <RegistrationStatisticsPanel
      defaultExpanded={defaultExpanded}
      statistics={data}
      error={null}
      requestedAt={dataUpdatedAt}
      refreshing={isFetching}
      onRefresh={() => void refetch()}
    />
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
