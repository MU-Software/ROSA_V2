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
  Alert,
  Box,
  Button,
  Chip,
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
  Stack,
  Switch,
  Tooltip,
  Typography,
  type ChipProps,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type FC, type MouseEvent } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { QueryBoundary } from "../components/elements/queryBoundary";
import { RegistrationDeskLayout } from "../components/layouts/registrationDeskLayout";
import {
  AutomaticModeBanner,
  MockQrInput,
  type AutomaticProductDetailsController,
  type AutomaticRegistrationProgress,
  type AutomaticRegistrationRouteContext,
  type AutomaticRegistrationStage,
} from "../components/pages/home/automaticRegistration";
import { MobileCameraInput } from "../components/pages/home/mobileCamera";
import { OrderSearchWorkspace } from "../components/pages/home/orderSearch";
import { useAppContext, useTopBar } from "../contexts";
import { useAppLayout } from "../contexts/appLayout";
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
} from "../hooks/useRegistrationDesk";
import { useManualRegistration } from "../hooks/useManualRegistration";
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
  useAppLayout({ topBarVisible: true, sidebarVisible: true });
  const location = useLocation();
  const navigate = useNavigate();
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
  const manualRegistration = useManualRegistration(gateway);
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
  const deskOperationPending = automaticOperationPending || manualRegistration.isPending;
  const hasActiveAutomaticProduct = registrationProduct !== null ||
    automaticFailureProduct !== null;
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
    void navigate("/automatic", { replace: true });
    automaticRegistrationMutation.mutate(value);
  }, [
    automaticRegistrationMutation,
    activeOrderProductScancode,
    hasActiveAutomaticProduct,
    isAutomaticRegistrationEnabled,
    registrationState,
    resetPrintJobs,
    setAppContext,
    navigate,
  ]);

  useQrTrigger({
    cameraResult: scanner.result,
    onDetected: ({ value }) => {
      if (isAutomaticRegistrationEnabled) startAutomaticRegistration(value);
      else manualRegistration.openScannedProduct(value);
    },
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
    manualRegistration.reset();
    automaticRegistrationMutation.reset();
    void navigate("/", { replace: true });
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
    void navigate("/", { replace: true });
  };

  const dismissAutomaticRegistrationError = () => {
    setAppContext((current) => ({ ...current, active_order_product_scancode: null }));
    setAutomaticFailureProduct(null);
    resetPrintJobs();
    automaticRegistrationMutation.reset();
    void navigate("/", { replace: true });
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
      active_order_product_scancode: null,
    }));
    setAutomaticFailureProduct(null);
    resetPrintJobs();
    automaticRegistrationMutation.reset();
    void navigate(`/order-products/${updatedProduct.id}`, { replace: true });
  };

  const setAutomaticRegistrationMode = (enabled: boolean) => {
    manualRegistration.reset();
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
  const automaticProductId = registrationProduct?.id ?? automaticFailureProduct?.id ?? null;
  const automaticWorkflowActive = activeOrderProductScancode !== null ||
    automaticRegistrationMutation.isPending ||
    automaticRegistrationMutation.error !== null ||
    (registrationState === "awaiting_completion" && registrationProduct !== null);
  const automaticRouteActive = location.pathname.startsWith("/automatic");
  const automaticRouteContext: AutomaticRegistrationRouteContext | null = gateway ? {
    gateway,
    progress: automaticProgress,
    details: automaticProductDetails,
    error: automaticRegistrationMutation.error,
    failureProduct: automaticFailureProduct,
    onComplete: completeAutomaticRegistration,
    onDismissError: dismissAutomaticRegistrationError,
  } : null;
  const initialAutomaticSession = useRef({
    routeActive: automaticRouteActive,
    registrationState,
    productId: registrationProduct?.id ?? null,
    activeScancode: activeOrderProductScancode,
  });

  useEffect(() => {
    const initial = initialAutomaticSession.current;
    if (!initial.routeActive) return;
    if (initial.registrationState === "registering" && initial.productId) {
      setAppContext((current) => ({ ...current, active_order_product_scancode: null }));
      void navigate(`/order-products/${initial.productId}`, { replace: true });
    } else if (initial.registrationState === "idle" && initial.activeScancode) {
      setAppContext((current) => ({ ...current, active_order_product_scancode: null }));
      void navigate("/", { replace: true });
    }
  }, [
    navigate,
    setAppContext,
  ]);

  useEffect(() => {
    if (automaticWorkflowActive && !automaticRouteActive) {
      const route = automaticProductId
        ? `/automatic/order-products/${automaticProductId}`
        : "/automatic";
      void navigate(route, { replace: true });
    } else if (!automaticWorkflowActive && automaticRouteActive) {
      void navigate("/", { replace: true });
    } else if (
      automaticWorkflowActive &&
      automaticProductId &&
      location.pathname === "/automatic"
    ) {
      void navigate(`/automatic/order-products/${automaticProductId}`, { replace: true });
    }
  }, [
    automaticProductId,
    automaticRouteActive,
    automaticWorkflowActive,
    location.pathname,
    navigate,
  ]);

  return (
    <>
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          disabled={registrationState !== "closed" && deskOperationPending}
          onClick={toggleDesk}
        >
          <ListItemIcon><PowerSettingsNew fontSize="small" /></ListItemIcon>
          <ListItemText>{isDeskOpen ? "데스크 닫기" : "데스크 열기"}</ListItemText>
        </MenuItem>
        {gateway && isDeskOpen && (
          <MenuItem
            disabled={deskOperationPending}
            onClick={() => setAutomaticRegistrationMode(!isAutomaticRegistrationEnabled)}
          >
            <ListItemIcon><AutoModeOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>자동 접수</ListItemText>
            <Switch
              size="small"
              edge="end"
              checked={isAutomaticRegistrationEnabled}
              disabled={deskOperationPending}
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

      {gateway && (
        <QueryBoundary pendingFallback={null}>
          <RegistrationConfigurationQuery gateway={gateway} />
        </QueryBoundary>
      )}
      <RegistrationDeskLayout
        gateway={gateway}
        camera={qrInputMode === "camera"
          ? { status: scanner.status, error: scanner.error }
          : undefined}
        banner={isAutomaticRegistrationEnabled ? (
          <AutomaticModeBanner
            processing={automaticOperationPending}
            onDisable={() => setAutomaticRegistrationMode(false)}
          />
        ) : undefined}
      >
        {automaticRouteActive && automaticRouteContext ? (
          <Outlet context={automaticRouteContext} />
        ) : registrationState === "idle" || registrationState === "registering" ? (
          <OrderSearchWorkspace gateway={gateway}>
            <Stack sx={{ height: "100%", alignItems: "center" }}>
              {manualRegistration.isPending && (
                <Alert severity="info" sx={{ width: "100%" }}>QR 주문상품을 조회하고 있습니다.</Alert>
              )}
              {manualRegistration.error && (
                <Alert
                  severity="error"
                  onClose={manualRegistration.reset}
                  sx={{ width: "100%" }}
                >
                  {manualRegistration.error.message}
                </Alert>
              )}
              {qrInputMode === "camera" ? (
                <MobileCameraInput scanner={scanner} />
              ) : (
                <RegistrationStateContent presentation={presentation} isDeskOpen={isDeskOpen} />
              )}
              {import.meta.env.DEV && registrationState === "idle" && (
                <MockQrInput
                  disabled={deskOperationPending}
                  onSubmit={isAutomaticRegistrationEnabled
                    ? startAutomaticRegistration
                    : manualRegistration.openScannedProduct}
                />
              )}
            </Stack>
          </OrderSearchWorkspace>
        ) : (
          <RegistrationStateContent presentation={presentation} isDeskOpen={isDeskOpen} />
        )}
      </RegistrationDeskLayout>
    </>
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
