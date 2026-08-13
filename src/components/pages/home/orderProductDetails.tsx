import { ArrowBack } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
  type ButtonProps,
  type ChipProps,
} from "@mui/material";
import { useState, type FC, type ReactNode } from "react";
import {
  canTransitionOrderProductStatus,
  getPaidOptionExchangeTargets,
  type EntityId,
  type OrderProductRelation,
  type OrderProductStatus,
  type TicketInfo,
} from "../../../domain";
import type { RegistrationDeskGateway } from "../../../gateways";
import {
  useModifyOrderProductMutation,
  useRefundOrderProductMutation,
  useRegistrationDeskQueryClient,
} from "../../../hooks/useRegistrationDesk";
import { createRegistrationPrintQueue } from "../../../printing/queue";
import { PrintPreviewDialog } from "./printPreview";
import { TicketInfoEditor } from "./ticketInfoEditor";

const PRODUCT_STATUS_PRESENTATION: Record<OrderProductStatus, {
  label: string;
  color: ChipProps["color"];
}> = {
  pending: { label: "결제 대기", color: "warning" },
  paid: { label: "사용 대기", color: "primary" },
  used: { label: "사용 완료", color: "success" },
  refunded: { label: "환불", color: "error" },
};

const formatPrice = (value: number): string => new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
}).format(value);

export type OrderProductPrintAction = {
  label: string;
  pendingLabel?: string;
  pending?: boolean;
  variant?: ButtonProps["variant"];
  onClick: () => void;
};

export type OrderProductDetailsNavigation = {
  orderName?: string;
  backLabel: string;
  onBack: () => void;
  orderDetailsAction?: {
    label: string;
    onClick: () => void;
  };
};

export const OrderProductDetails: FC<{
  orderId: EntityId;
  product: OrderProductRelation;
  gateway: RegistrationDeskGateway;
  navigation?: OrderProductDetailsNavigation;
  disabled?: boolean;
  alerts?: ReactNode;
  variant?: "page" | "dialog";
  statusMode?: "default" | "automatic_revert";
  onProductUpdated?: (product: OrderProductRelation) => void;
  onStatusChanged?: (product: OrderProductRelation) => void;
  printAction?: OrderProductPrintAction;
}> = ({
  orderId,
  product,
  gateway,
  navigation,
  disabled = false,
  alerts,
  variant = "page",
  statusMode = "default",
  onProductUpdated,
  onStatusChanged,
  printAction,
}) => {
  const registrationDeskQueryClient = useRegistrationDeskQueryClient(gateway);
  const [editingOptionId, setEditingOptionId] = useState<EntityId | null>(null);
  const [customResponse, setCustomResponse] = useState("");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [ticketInfoEditorOpen, setTicketInfoEditorOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const getUpdatedProduct = () => {
    const lookup = registrationDeskQueryClient.getOrderProduct(product.id);
    if (!lookup) throw new Error("수정된 주문상품을 찾을 수 없습니다.");
    onProductUpdated?.(lookup);
    return lookup;
  };
  const modifyOptionMutation = useModifyOrderProductMutation(gateway);
  const modifyStatusMutation = useModifyOrderProductMutation(gateway);
  const modifyTicketInfoMutation = useModifyOrderProductMutation(gateway);
  const refundMutation = useRefundOrderProductMutation(gateway);
  const status = PRODUCT_STATUS_PRESENTATION[product.status];
  const ticket = product.ticket_info;
  const optionsEditable = product.status !== "used" && product.status !== "refunded";
  const ticketInfoEditable = product.status === "paid" || product.status === "used";
  const exchangeTargetCount = getPaidOptionExchangeTargets(product).length;
  const printJobCount = createRegistrationPrintQueue(product).snapshot().length;
  const previewAvailable = printJobCount > 0 &&
    (product.status === "paid" || product.status === "used");
  const refundable = variant === "page" && product.status === "paid" &&
    product.not_refundable_reason === null;
  const nextStatus: OrderProductStatus | null = product.status === "paid"
    ? "used"
    : product.status === "used" ? "paid" : null;
  const statusChangeAllowed = nextStatus !== null &&
    canTransitionOrderProductStatus(product.status, nextStatus);
  const automaticRevert = statusMode === "automatic_revert" && nextStatus === "paid";
  const statusActionLabel = automaticRevert
    ? "사용 대기로 되돌리기"
    : nextStatus === "used" ? "사용 처리" : "사용 취소";
  const busy = disabled || modifyOptionMutation.isPending || modifyStatusMutation.isPending ||
    modifyTicketInfoMutation.isPending || refundMutation.isPending || !!printAction?.pending;

  const beginOptionEdit = (optionId: EntityId, value: string | null) => {
    modifyOptionMutation.reset();
    setEditingOptionId(optionId);
    setCustomResponse(value ?? "");
  };

  const cancelOptionEdit = () => {
    modifyOptionMutation.reset();
    setEditingOptionId(null);
    setCustomResponse("");
  };

  const saveOption = async (optionId: EntityId) => {
    try {
      await modifyOptionMutation.mutateAsync({
        order_id: orderId,
        order_product_relation_id: product.id,
        options: [{ id: optionId, custom_response: customResponse.trim() || null }],
      });
      getUpdatedProduct();
    } catch {
      return;
    }
    setEditingOptionId(null);
    setCustomResponse("");
  };

  const closeStatusDialog = () => {
    if (modifyStatusMutation.isPending) return;
    modifyStatusMutation.reset();
    setStatusDialogOpen(false);
  };

  const changeStatus = async () => {
    if (!nextStatus) return;
    try {
      await modifyStatusMutation.mutateAsync({
        order_id: orderId,
        order_product_relation_id: product.id,
        status: nextStatus,
      });
      onStatusChanged?.(getUpdatedProduct());
    } catch {
      return;
    }
    setStatusDialogOpen(false);
  };

  const closeRefundDialog = () => {
    if (refundMutation.isPending) return;
    refundMutation.reset();
    setRefundDialogOpen(false);
  };

  const refund = async () => {
    try {
      await refundMutation.mutateAsync({
        order_product_relation_id: product.id,
      });
      getUpdatedProduct();
    } catch {
      return;
    }
    setRefundDialogOpen(false);
  };

  return (
    <Stack sx={{ minHeight: 0 }}>
      {navigation && (
        <>
          <Stack direction="row" spacing={1} sx={{ px: { xs: 1.5, md: 2 }, py: 1 }}>
            <Button size="small" startIcon={<ArrowBack />} onClick={navigation.onBack}>
              {navigation.backLabel}
            </Button>
            {navigation.orderDetailsAction && (
              <Button size="small" onClick={navigation.orderDetailsAction.onClick}>
                {navigation.orderDetailsAction.label}
              </Button>
            )}
          </Stack>
          <Divider />
        </>
      )}

      <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, overflowY: "auto" }}>
        <Stack spacing={1}>
          {navigation?.orderName && (
            <Typography variant="caption" color="text.secondary">
              {navigation.orderName}
            </Typography>
          )}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{product.product.name}</Typography>
              <Typography variant="caption" color="text.secondary">{product.id}</Typography>
            </Box>
            <Stack direction="row" spacing={0.75}>
              {variant === "page" && (
                <Chip size="small" variant="outlined" label={product.is_ticket ? "티켓" : "일반 상품"} />
              )}
              <Chip size="small" color={status.color} label={status.label} />
            </Stack>
          </Stack>

          <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: "wrap" }}>
            <DetailValue label="상품 금액" value={formatPrice(product.price)} />
            <DetailValue label="기부금" value={formatPrice(product.donation_price)} />
          </Stack>

          {product.not_refundable_reason && (
            <Alert severity="warning">{product.not_refundable_reason}</Alert>
          )}
        </Stack>

        {alerts}

        {statusChangeAllowed && (
          <Stack spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>주문상품 작업</Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{statusActionLabel}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {automaticRevert
                      ? "잘못 처리한 주문상품을 사용 대기 상태로 되돌립니다."
                      : nextStatus === "used"
                      ? "현장에서 상품 제공을 확인한 뒤 사용 완료로 변경합니다."
                      : "잘못 처리한 상품을 사용 대기 상태로 되돌립니다."}
                  </Typography>
                </Box>
                <Button
                  variant={nextStatus === "used" ? "contained" : "outlined"}
                  color={nextStatus === "used" ? "primary" : "warning"}
                  disabled={busy || editingOptionId !== null}
                  onClick={() => {
                    modifyStatusMutation.reset();
                    setStatusDialogOpen(true);
                  }}
                >
                  {statusActionLabel}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        )}

        {refundable && (
          <Stack spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>환불</Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>주문상품 부분 환불</Typography>
                  <Typography variant="body2" color="text.secondary">
                    이 주문상품만 환불하고 같은 주문의 다른 상품은 유지합니다.
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={busy || editingOptionId !== null}
                  onClick={() => {
                    refundMutation.reset();
                    setRefundDialogOpen(true);
                  }}
                >
                  부분 환불
                </Button>
              </Stack>
            </Paper>
          </Stack>
        )}

        {ticket && (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>참가자 정보</Typography>
              {ticketInfoEditable && (
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    modifyTicketInfoMutation.reset();
                    setTicketInfoEditorOpen(true);
                  }}
                >
                  수정
                </Button>
              )}
            </Stack>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography>{ticket.name}</Typography>
              {ticket.organization && (
                <Typography variant="body2" color="text.secondary">{ticket.organization}</Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {[ticket.email, ticket.phone].filter(Boolean).join(" · ")}
              </Typography>
            </Paper>
          </Stack>
        )}

        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            상품 옵션 {product.options.length}개
          </Typography>
          {modifyOptionMutation.error && (
            <Alert severity="error">{modifyOptionMutation.error.message}</Alert>
          )}
          {product.options.length === 0 ? (
            <Alert severity="info">선택된 상품 옵션이 없습니다.</Alert>
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <Stack divider={<Divider flexItem />}>
                {product.options.map((option) => {
                  const value = option.custom_response ?? option.product_option?.name ?? "선택 없음";
                  const additionalPrice = option.product_option?.additional_price ?? 0;
                  const customResponseOption = option.product_option_group.is_custom_response;
                  const editing = editingOptionId === option.id;
                  const responseRequired = option.product_option_group.placeholder_mode === "required";

                  if (editing) {
                    return (
                      <Stack key={option.id} spacing={1.5} sx={{ p: 1.5 }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {option.product_option_group.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">직접 응답</Typography>
                        </Box>
                        <TextField
                          multiline
                          minRows={2}
                          size="small"
                          label="응답"
                          value={customResponse}
                          disabled={busy}
                          required={responseRequired}
                          onChange={(event) => setCustomResponse(event.target.value)}
                        />
                        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                          <Button size="small" disabled={busy} onClick={cancelOptionEdit}>취소</Button>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busy || (responseRequired && !customResponse.trim())}
                            onClick={() => void saveOption(option.id)}
                          >
                            {modifyOptionMutation.isPending ? "저장 중…" : "저장"}
                          </Button>
                        </Stack>
                      </Stack>
                    );
                  }

                  return (
                    <Stack
                      key={option.id}
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ p: 1.5, justifyContent: "space-between" }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {option.product_option_group.name}
                        </Typography>
                        {customResponseOption && (
                          <Typography variant="caption" color="text.secondary">직접 응답</Typography>
                        )}
                      </Box>
                      <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
                        <Typography variant="body2">{value}</Typography>
                        {additionalPrice > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            추가 {formatPrice(additionalPrice)}
                          </Typography>
                        )}
                        {customResponseOption && optionsEditable && (
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={() => beginOptionEdit(option.id, option.custom_response)}
                            sx={{ mt: 0.5 }}
                          >
                            수정
                          </Button>
                        )}
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </Paper>
          )}
        </Stack>

        {previewAvailable && (
          <Stack spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>출력물</Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>출력 작업 {printJobCount}개</Typography>
                  <Typography variant="body2" color="text.secondary">
                    명찰 {product.is_ticket && ticket ? 1 : 0}장 · 유료 옵션 교환권{" "}
                    {exchangeTargetCount > 0 ? `1장 (${exchangeTargetCount}개 항목)` : "0장"}
                  </Typography>
                </Box>
                <Button
                  variant={printAction?.variant ?? "outlined"}
                  disabled={busy}
                  onClick={printAction?.onClick ?? (() => setPrintPreviewOpen(true))}
                >
                  {printAction?.pending
                    ? printAction.pendingLabel ?? printAction.label
                    : printAction?.label ?? "미리보기"}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        )}
      </Stack>

      <Dialog open={statusDialogOpen} onClose={closeStatusDialog} fullWidth maxWidth="xs">
        <DialogTitle>{statusActionLabel}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              {automaticRevert
                ? "현재 자동 접수 완료 흐름을 종료하고 주문상품을 다시 처리할 수 있는 상태로 되돌립니다. 종료 인사는 표시되지 않습니다."
                : `${product.product.name}을(를) ${statusActionLabel}하시겠습니까?`}
            </Typography>
            {modifyStatusMutation.error && (
              <Alert severity="error">{modifyStatusMutation.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={modifyStatusMutation.isPending} onClick={closeStatusDialog}>취소</Button>
          <Button
            variant="contained"
            color={nextStatus === "used" ? "primary" : "warning"}
            disabled={modifyStatusMutation.isPending}
            onClick={() => void changeStatus()}
          >
            {modifyStatusMutation.isPending ? "처리 중…" : statusActionLabel}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={refundDialogOpen} onClose={closeRefundDialog} fullWidth maxWidth="xs">
        <DialogTitle>주문상품 부분 환불</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Alert severity="warning">
              {product.product.name}만 환불합니다. 환불은 되돌릴 수 없습니다.
            </Alert>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">환불 대상 금액</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatPrice(product.price + product.donation_price)}
              </Typography>
            </Stack>
            {refundMutation.error && (
              <Alert severity="error">{refundMutation.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={refundMutation.isPending} onClick={closeRefundDialog}>취소</Button>
          <Button
            variant="contained"
            color="error"
            disabled={refundMutation.isPending}
            onClick={() => void refund()}
          >
            {refundMutation.isPending ? "환불 중…" : "부분 환불"}
          </Button>
        </DialogActions>
      </Dialog>

      {ticket && ticketInfoEditorOpen && (
        <TicketInfoEditor
          ticketInfo={ticket}
          saving={modifyTicketInfoMutation.isPending}
          error={modifyTicketInfoMutation.error?.message ?? null}
          onSave={async (ticketInfo: TicketInfo) => {
            await modifyTicketInfoMutation.mutateAsync({
              order_id: orderId,
              order_product_relation_id: product.id,
              ticket_info: ticketInfo,
            });
            getUpdatedProduct();
          }}
          onClose={() => {
            modifyTicketInfoMutation.reset();
            setTicketInfoEditorOpen(false);
          }}
        />
      )}

      {printPreviewOpen && (
        <PrintPreviewDialog product={product} onClose={() => setPrintPreviewOpen(false)} />
      )}
    </Stack>
  );
};

const DetailValue: FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
  </Box>
);
