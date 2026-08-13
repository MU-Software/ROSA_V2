import {
  AutoModeOutlined,
  CheckCircleOutlined,
  ErrorOutlined,
  PrintOutlined,
  QrCodeScannerOutlined,
  ScheduleOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
  type ChipProps,
} from "@mui/material";
import { useState, type FC, type FormEvent } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { QueryBoundary } from "../../elements/queryBoundary";
import { useAppContext } from "../../../contexts";
import type { OrderProductRelation } from "../../../domain";
import type { RegistrationDeskGateway } from "../../../gateways";
import { useOrderProductQuery } from "../../../hooks/useRegistrationDesk";
import {
  createRegistrationPrintQueue,
  getPrintTemplateLabel,
  type PrintJobExecution,
  type PrintJobExecutionStatus,
} from "../../../printing/queue";
import { OrderProductDetails } from "./orderProductDetails";

export type AutomaticRegistrationStage = "lookup" | "marking_used" | "printing";

export type AutomaticRegistrationProgress = {
  stage: AutomaticRegistrationStage;
  processing: boolean;
  print_jobs: readonly PrintJobExecution[];
};

export type AutomaticProductDetailsController = {
  reprinting: boolean;
  onProductUpdated: (product: OrderProductRelation) => void;
  onStatusChanged: (product: OrderProductRelation) => void;
  onReprint: (product: OrderProductRelation) => Promise<readonly PrintJobExecution[]>;
  onRetryPrintJob: (
    product: OrderProductRelation,
    printJobId: string,
  ) => Promise<readonly PrintJobExecution[]>;
  onMarkPrintJobCompleted: (product: OrderProductRelation, printJobId: string) => void;
};

export type AutomaticRegistrationRouteContext = {
  gateway: RegistrationDeskGateway;
  progress: AutomaticRegistrationProgress;
  details: AutomaticProductDetailsController;
  error: Error | null;
  failureProduct: OrderProductRelation | null;
  onComplete: () => void;
  onDismissError: () => void;
};

type ProcessStatus = Exclude<PrintJobExecutionStatus, "failed">;

const STAGE_LABELS: Record<AutomaticRegistrationStage, string> = {
  lookup: "주문상품을 확인하고 있습니다.",
  marking_used: "주문상품을 사용 처리하고 있습니다.",
  printing: "필요한 출력물을 준비하고 있습니다.",
};

const PRODUCT_STATUS_LABELS: Record<OrderProductRelation["status"], string> = {
  pending: "결제 대기",
  paid: "사용 대기",
  used: "사용 완료",
  refunded: "환불",
};

const PRINT_JOB_STATUS_PRESENTATION: Record<PrintJobExecutionStatus, {
  label: string;
  color: ChipProps["color"];
}> = {
  waiting: { label: "출력 대기", color: "default" },
  printing: { label: "출력 중", color: "info" },
  completed: { label: "출력 완료", color: "success" },
  failed: { label: "출력 실패", color: "error" },
};

const PROCESS_STATUS_PRESENTATION: Record<ProcessStatus, {
  label: string;
  color: ChipProps["color"];
}> = {
  waiting: { label: "대기", color: "default" },
  printing: { label: "진행 중", color: "info" },
  completed: { label: "완료", color: "success" },
};

const allPrintJobsCompleted = (executions: readonly PrintJobExecution[]): boolean =>
  executions.every(({ status }) => status === "completed");

export const AutomaticRegistrationPanel: FC<{
  progress: AutomaticRegistrationProgress;
  details: AutomaticProductDetailsController;
  onComplete: () => void;
  onOpenDetails: (productId: string) => void;
}> = ({
  progress,
  details,
  onComplete,
  onOpenDetails,
}) => {
  const {
    order_product_relation: product,
    registration_state: registrationState,
  } = useAppContext();
  const ready = registrationState === "awaiting_completion";
  const printQueue = product ? createRegistrationPrintQueue(product).snapshot() : [];
  const executionById = new Map(progress.print_jobs.map((execution) => [execution.id, execution]));
  const printJobsCompleted = printQueue.every(
    ({ id }) => executionById.get(id)?.status === "completed",
  );
  const hasPrintFailures = progress.print_jobs.some(({ status }) => status === "failed");
  const retryPrintJob = async (printJobId: string) => {
    if (!product) return;
    await details.onRetryPrintJob(product, printJobId);
  };

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
        <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
          {hasPrintFailures ? (
            <ErrorOutlined color="error" sx={{ fontSize: 56 }} />
          ) : progress.processing ? (
            <CircularProgress size={44} />
          ) : ready ? (
            <CheckCircleOutlined color="success" sx={{ fontSize: 56 }} />
          ) : (
            <CircularProgress size={44} />
          )}
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {hasPrintFailures
              ? "일부 출력에 실패했습니다"
              : progress.processing && progress.stage === "printing"
              ? "출력을 진행하고 있습니다"
              : ready ? "출력을 확인해주세요" : "자동 접수 진행 중"}
          </Typography>
          <Typography color="text.secondary">
            {hasPrintFailures
              ? "실패한 출력물만 다시 출력한 뒤 접수를 완료해주세요."
              : progress.processing
              ? STAGE_LABELS[progress.stage]
              : ready
              ? "출력물과 참가자를 확인한 뒤 접수를 완료해주세요."
              : STAGE_LABELS[progress.stage]}
          </Typography>
        </Stack>

        {product ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {product.ticket_info?.name ?? product.product.name}
                </Typography>
                {product.ticket_info?.organization && (
                  <Typography color="text.secondary">{product.ticket_info.organization}</Typography>
                )}
                <Typography variant="body2" color="text.secondary">{product.product.name}</Typography>
              </Box>
              <Button variant="outlined" onClick={() => onOpenDetails(product.id)}>
                주문상품 상세
              </Button>
            </Stack>
          </Paper>
        ) : (
          <Alert severity="info">QR 코드에서 주문상품을 조회하고 있습니다.</Alert>
        )}

        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>처리 현황</Typography>
          <ProcessingRow
            label="주문상품 확인"
            status={product ? "completed" : "printing"}
          />
          <ProcessingRow
            label="사용 처리"
            status={ready || product?.status === "used"
              ? "completed"
              : progress.stage === "marking_used" ? "printing" : "waiting"}
          />
        </Stack>

        <Divider />

        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>출력 현황</Typography>
            {product && <Chip size="small" label={`${printQueue.length}개`} />}
          </Stack>
          {!product ? (
            <Typography color="text.secondary">주문상품 확인 후 출력물이 표시됩니다.</Typography>
          ) : printQueue.length > 0 ? printQueue.map((entry) => {
            const execution = executionById.get(entry.id);
            const status = execution?.status ?? "waiting";
            const presentation = PRINT_JOB_STATUS_PRESENTATION[status];
            return (
              <Stack
                key={entry.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{
                  alignItems: { xs: "stretch", sm: "center" },
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                <Stack direction="row" spacing={1.5} sx={{ flex: 1, alignItems: "center" }}>
                  {status === "printing" ? (
                    <CircularProgress size={24} />
                  ) : status === "failed" ? (
                    <ErrorOutlined color="error" />
                  ) : (
                    <PrintOutlined color="action" />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography>{getPrintTemplateLabel(entry.job.template_id)}</Typography>
                    {execution?.error && (
                      <Typography variant="caption" color="error">{execution.error}</Typography>
                    )}
                    {status === "completed" && execution?.completion_confirmed === false && (
                      <Typography variant="caption" color="text.secondary">
                        프린터 전송 완료 · 실제 출력물 확인 필요
                      </Typography>
                    )}
                  </Box>
                </Stack>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "flex-end" }}
                >
                  {ready && status !== "completed" && (
                    <>
                      <Button
                        size="small"
                        disabled={progress.processing || details.reprinting}
                        onClick={() => void retryPrintJob(entry.id)}
                      >
                        {status === "failed" ? "다시 출력" : "출력"}
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        disabled={progress.processing || details.reprinting}
                        onClick={() => details.onMarkPrintJobCompleted(product, entry.id)}
                      >
                        출력 완료로 표시
                      </Button>
                    </>
                  )}
                  <Chip size="small" color={presentation.color} label={presentation.label} />
                </Stack>
              </Stack>
            );
          }) : (
            <Alert severity="info">이 주문상품에는 필요한 출력물이 없습니다.</Alert>
          )}
        </Stack>

        {ready && (
          hasPrintFailures ? (
            <Alert severity="error">
              출력 실패가 남아 있습니다. 다시 출력하거나 실물 출력이 완료됐다면 완료로 표시해주세요.
            </Alert>
          ) : !printJobsCompleted ? (
            <Alert severity="warning">
              출력 대기 항목을 출력하거나 이미 출력된 항목을 완료로 표시해주세요.
            </Alert>
          ) : (
            <Alert severity="info">
              실제 출력물과 참가자를 확인한 뒤 접수를 완료해주세요.
            </Alert>
          )
        )}

        <Button
          variant="contained"
          size="large"
          disabled={!ready || progress.processing || details.reprinting || !printJobsCompleted}
          onClick={onComplete}
          sx={{ minHeight: 52 }}
        >
          접수 완료
        </Button>
    </Stack>
  );
};

const ProcessingRow: FC<{ label: string; status: ProcessStatus }> = ({ label, status }) => {
  const presentation = PROCESS_STATUS_PRESENTATION[status];
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      {status === "completed" ? (
        <CheckCircleOutlined color="success" />
      ) : status === "printing" ? (
        <CircularProgress size={22} />
      ) : (
        <ScheduleOutlined color="disabled" />
      )}
      <Typography sx={{ flex: 1 }}>{label}</Typography>
      <Chip size="small" color={presentation.color} label={presentation.label} />
    </Stack>
  );
};

const AutomaticOrderProductDetails: FC<{
  gateway: RegistrationDeskGateway;
  productId: string;
  editingDisabled: boolean;
  details: AutomaticProductDetailsController;
  onBack: () => void;
}> = ({
  gateway,
  productId,
  editingDisabled,
  details,
  onBack,
}) => (
  <QueryBoundary resetKeys={[productId]}>
    <AutomaticOrderProductDetailsContent
      gateway={gateway}
      productId={productId}
      editingDisabled={editingDisabled}
      details={details}
      onBack={onBack}
    />
  </QueryBoundary>
);

const AutomaticOrderProductDetailsContent: FC<{
  gateway: RegistrationDeskGateway;
  productId: string;
  editingDisabled: boolean;
  details: AutomaticProductDetailsController;
  onBack: () => void;
}> = ({
  gateway,
  productId,
  editingDisabled,
  details,
  onBack,
}) => {
  const { data: lookup } = useOrderProductQuery(gateway, productId);
  const product = lookup;
  const [savedChanges, setSavedChanges] = useState(false);
  const [reprintCompleted, setReprintCompleted] = useState(false);
  const reprintAvailable = product.status === "used" &&
    createRegistrationPrintQueue(product).snapshot().length > 0;

  const productUpdated = (updatedProduct: OrderProductRelation) => {
    details.onProductUpdated(updatedProduct);
    setSavedChanges(true);
    setReprintCompleted(false);
  };

  const reprint = async () => {
    const executions = await details.onReprint(product);
    const completed = allPrintJobsCompleted(executions);
    setSavedChanges(!completed);
    setReprintCompleted(completed);
  };

  return (
    <OrderProductDetails
      orderId={lookup.order.id}
      product={product}
      gateway={gateway}
      disabled={editingDisabled || details.reprinting}
      statusMode="automatic_revert"
      navigation={{
        orderName: "자동 접수",
        backLabel: "자동 접수 진행",
        onBack,
      }}
      onProductUpdated={productUpdated}
      onStatusChanged={details.onStatusChanged}
      alerts={(
        <>
          {savedChanges && (
            <Alert severity="warning">수정한 정보로 명찰을 다시 출력해주세요.</Alert>
          )}
          {reprintCompleted && (
            <Alert severity="success">최신 정보로 출력물을 다시 출력했습니다.</Alert>
          )}
        </>
      )}
      printAction={reprintAvailable ? {
        label: savedChanges ? "수정 내용으로 다시 출력" : "전체 다시 출력",
        pendingLabel: "다시 출력 중…",
        pending: details.reprinting,
        variant: savedChanges ? "contained" : "outlined",
        onClick: () => void reprint(),
      } : undefined}
    />
  );
};

export const AutomaticRegistrationFailure: FC<{
  error: Error;
  product: OrderProductRelation | null;
  onDismiss: () => void;
  onOpenDetails: (productId: string) => void;
}> = ({
  error,
  product,
  onDismiss,
  onOpenDetails,
}) => {
  return (
    <Stack
      spacing={2.5}
      sx={{ minHeight: 420, alignItems: "center", justifyContent: "center", p: 3, textAlign: "center" }}
    >
        <ErrorOutlined color="error" sx={{ fontSize: 56 }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>자동 접수를 진행할 수 없습니다</Typography>
          <Typography color="error" sx={{ mt: 0.75 }}>{error.message}</Typography>
        </Box>
        {product && (
          <Paper variant="outlined" sx={{ width: "100%", maxWidth: 560, p: 2, textAlign: "left" }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  {product.ticket_info?.name ?? product.product.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">{product.product.name}</Typography>
                <Chip size="small" sx={{ mt: 1 }} label={PRODUCT_STATUS_LABELS[product.status]} />
              </Box>
              <Button variant="outlined" onClick={() => onOpenDetails(product.id)}>
                주문상품 상세
              </Button>
            </Stack>
          </Paper>
        )}
        <Button variant="contained" onClick={onDismiss}>확인 후 다시 스캔</Button>
    </Stack>
  );
};

const useAutomaticRegistrationRoute = (): AutomaticRegistrationRouteContext =>
  useOutletContext<AutomaticRegistrationRouteContext>();

const automaticProductRoute = (productId: string): string =>
  `/automatic/order-products/${productId}`;

export const AutomaticRegistrationRoute: FC = () => {
  const context = useAutomaticRegistrationRoute();
  const navigate = useNavigate();
  const openDetails = (productId: string) => {
    void navigate(`${automaticProductRoute(productId)}/details`);
  };

  if (context.error) {
    return (
      <AutomaticRegistrationFailure
        error={context.error}
        product={context.failureProduct}
        onDismiss={context.onDismissError}
        onOpenDetails={openDetails}
      />
    );
  }

  return (
    <AutomaticRegistrationPanel
      progress={context.progress}
      details={context.details}
      onComplete={context.onComplete}
      onOpenDetails={openDetails}
    />
  );
};

export const AutomaticRegistrationDetailsRoute: FC = () => {
  const context = useAutomaticRegistrationRoute();
  const navigate = useNavigate();
  const { productId } = useParams();

  if (!productId) return <AutomaticRegistrationRoute />;

  return (
    <AutomaticOrderProductDetails
      gateway={context.gateway}
      productId={productId}
      editingDisabled={context.progress.processing}
      details={context.details}
      onBack={() => void navigate(automaticProductRoute(productId), { replace: true })}
    />
  );
};

export const AutomaticModeBanner: FC<{
  processing: boolean;
  onDisable: () => void;
}> = ({ processing, onDisable }) => (
  <Alert
    severity="info"
    icon={<AutoModeOutlined />}
    sx={{
      mb: 2,
      alignItems: "center",
      "& .MuiAlert-message": { width: "100%" },
    }}
  >
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
    >
      <Box>
        <Typography sx={{ fontWeight: 700 }}>자동 접수 모드 사용 중</Typography>
        <Typography variant="body2">
          {processing
            ? "현재 자동 접수를 처리하고 있습니다. 완료 후 자동 모드를 끌 수 있습니다."
            : "QR을 인식하면 사용 처리와 출력 단계까지 자동으로 진행합니다."}
        </Typography>
      </Box>
      <Button
        color="inherit"
        variant="outlined"
        disabled={processing}
        onClick={onDisable}
        sx={{ flexShrink: 0 }}
      >
        자동 모드 끄기
      </Button>
    </Stack>
  </Alert>
);

export const MockQrInput: FC<{
  disabled: boolean;
  onSubmit: (value: string) => void;
}> = ({ disabled, onSubmit }) => {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValue = value.trim();
    if (!normalizedValue || disabled) return;
    onSubmit(normalizedValue);
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ width: "100%", maxWidth: 620, px: 2, pb: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          fullWidth
          size="small"
          label="개발용 QR 입력"
          placeholder="opr:<short_id>:<salt>"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          type="submit"
          variant="outlined"
          startIcon={<QrCodeScannerOutlined />}
          disabled={disabled || !value.trim()}
        >
          인식
        </Button>
      </Stack>
    </Box>
  );
};
