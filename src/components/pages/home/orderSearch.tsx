import {
  ArrowBack,
  Clear,
  SearchOutlined,
} from "@mui/icons-material";
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
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  type ChipProps,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState, type FC, type FormEvent, type ReactNode } from "react";
import { useAppContext } from "../../../contexts";
import {
  canFullyRefundOrder,
  canTransitionOrderProductStatus,
  getPaidOptionExchangeTargets,
  transitionRegistration,
  type EntityId,
  type Order,
  type OrderProductRelation,
  type OrderProductStatus,
  type PaymentHistoryStatus,
  type TicketInfo,
} from "../../../domain";
import type {
  ModifyOrderProductRequest,
  RefundOrderRequest,
  RegistrationDeskGateway,
} from "../../../gateways";
import { PrintPreviewDialog } from "./printPreview";
import { TicketInfoEditor } from "./ticketInfoEditor";

const PAYMENT_STATUS_PRESENTATION: Record<PaymentHistoryStatus, {
  label: string;
  color: ChipProps["color"];
}> = {
  pending: { label: "결제 대기", color: "warning" },
  completed: { label: "결제 완료", color: "success" },
  partial_refunded: { label: "부분 환불", color: "warning" },
  refunded: { label: "환불", color: "error" },
};

const PRODUCT_STATUS_PRESENTATION: Record<OrderProductStatus, {
  label: string;
  color: ChipProps["color"];
}> = {
  pending: { label: "결제 대기", color: "warning" },
  paid: { label: "사용 대기", color: "primary" },
  used: { label: "사용 완료", color: "success" },
  refunded: { label: "환불", color: "error" },
};

const formatDateTime = (value: string | null): string => {
  if (!value) return "결제 전";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatPrice = (value: number): string => new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
}).format(value);

export const OrderSearchWorkspace: FC<{
  gateway: RegistrationDeskGateway | null;
  children: ReactNode;
  onRegistrationChanged: () => void;
}> = ({
  gateway,
  children,
  onRegistrationChanged,
}) => {
  const {
    order_product_relation: restoredProduct,
    setAppContext,
  } = useAppContext();
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<EntityId | null>(restoredProduct?.id ?? null);
  const updateRegistrationProduct = (product: OrderProductRelation) => {
    setAppContext((current) => ({ ...current, order_product_relation: product }));
  };
  const openRegistrationProduct = (product: OrderProductRelation) => {
    setAppContext((current) => ({
      ...current,
      registration_state: current.registration_state === "idle"
        ? transitionRegistration(current.registration_state, "registering")
        : current.registration_state,
      order_product_relation: product,
      farewell_until: null,
    }));
  };
  const clearRegistrationProduct = () => {
    setAppContext((current) => ({
      ...current,
      registration_state: current.registration_state === "registering" ||
        current.registration_state === "awaiting_completion"
        ? transitionRegistration(current.registration_state, "idle")
        : current.registration_state,
      order_product_relation: null,
      farewell_until: null,
    }));
  };
  const updateOrder = (updatedOrder: Order) => {
    setOrders((current) => current.map((order) =>
      order.id === updatedOrder.id ? updatedOrder : order));
    setSelectedOrder(updatedOrder);
    const updatedProduct = updatedOrder.products.find(({ id }) => id === selectedProductId);
    if (updatedProduct) updateRegistrationProduct(updatedProduct);
  };
  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      if (!gateway) throw new Error("주문 검색 gateway가 준비되지 않았습니다.");
      return gateway.searchOrders({ query: searchQuery });
    },
    onSuccess: setOrders,
  });
  const modifyOptionMutation = useMutation({
    mutationFn: async (request: ModifyOrderProductRequest) => {
      if (!gateway) throw new Error("주문상품 수정 gateway가 준비되지 않았습니다.");
      return gateway.modifyOrderProduct(request);
    },
    onSuccess: updateOrder,
  });
  const modifyStatusMutation = useMutation({
    mutationFn: async (request: ModifyOrderProductRequest) => {
      if (!gateway) throw new Error("주문상품 수정 gateway가 준비되지 않았습니다.");
      return gateway.modifyOrderProduct(request);
    },
    onSuccess: (updatedOrder) => {
      updateOrder(updatedOrder);
      onRegistrationChanged();
    },
  });
  const modifyTicketInfoMutation = useMutation({
    mutationFn: async (request: ModifyOrderProductRequest) => {
      if (!gateway) throw new Error("참가자 정보 수정 gateway가 준비되지 않았습니다.");
      return gateway.modifyOrderProduct(request);
    },
    onSuccess: updateOrder,
  });
  const refundMutation = useMutation({
    mutationFn: async (request: RefundOrderRequest) => {
      if (!gateway) throw new Error("주문 환불 gateway가 준비되지 않았습니다.");
      return gateway.refundOrder(request);
    },
    onSuccess: (updatedOrder) => {
      updateOrder(updatedOrder);
      onRegistrationChanged();
    },
  });
  const hasSearched = searchMutation.status !== "idle";
  const showIdleContent = !!gateway && !searchMutation.isPending && !searchMutation.error &&
    !hasSearched && !selectedOrder && !restoredProduct;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery || searchMutation.isPending) return;
    if (selectedProductId) clearRegistrationProduct();
    setSelectedOrder(null);
    setSelectedProductId(null);
    searchMutation.mutate(normalizedQuery);
  };

  const reset = () => {
    if (selectedProductId) clearRegistrationProduct();
    setQuery("");
    setOrders([]);
    setSelectedOrder(null);
    setSelectedProductId(null);
    searchMutation.reset();
  };

  const selectOrder = (order: Order) => {
    setSelectedOrder(order);
    setSelectedProductId(null);
  };

  const selectProduct = (product: OrderProductRelation) => {
    setSelectedProductId(product.id);
    openRegistrationProduct(product);
  };

  const closeProduct = () => {
    setSelectedProductId(null);
    clearRegistrationProduct();
  };

  const selectedProduct = selectedOrder?.products.find(
    ({ id }) => id === selectedProductId,
  ) ?? (restoredProduct?.id === selectedProductId ? restoredProduct : null);

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Box component="form" onSubmit={search} sx={{ px: { xs: 1.5, sm: 2, md: 3 }, p: 2 }}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="주문 검색"
            placeholder="이름, 이메일, 전화번호 또는 주문번호"
            value={query}
            disabled={!gateway || searchMutation.isPending}
            onChange={(event) => setQuery(event.target.value)}
          />
          <IconButton
            type="submit"
            disabled={!gateway || !query.trim() || searchMutation.isPending}
            sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
          >
            {searchMutation.isPending ? <CircularProgress size={18} /> : <SearchOutlined />}
          </IconButton>
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Box
          aria-hidden={!showIdleContent}
          inert={!showIdleContent}
          sx={showIdleContent ? { height: "100%" } : {
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {children}
        </Box>

        {!showIdleContent && (
          <Box sx={{ position: "relative", zIndex: 1, minHeight: "100%", bgcolor: "background.paper" }}>
            {!gateway ? (
              <Alert severity="warning" sx={{ m: 2 }}>주문 검색 gateway가 준비되지 않았습니다.</Alert>
            ) : searchMutation.isPending ? (
              <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
                <Stack spacing={1.5} sx={{ alignItems: "center" }}>
                  <CircularProgress size={30} />
                  <Typography color="text.secondary">주문을 검색하고 있습니다.</Typography>
                </Stack>
              </Box>
            ) : searchMutation.error ? (
              <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>
                <Alert severity="error">{searchMutation.error.message}</Alert>
                <Button variant="outlined" onClick={() => searchMutation.mutate(query.trim())}>다시 검색</Button>
              </Stack>
            ) : selectedProduct ? (
              <OrderProductDetails
                orderName={selectedOrder?.name ?? "저장된 주문상품"}
                backLabel={selectedOrder ? "주문 상세" : "닫기"}
                product={selectedProduct}
                onBack={closeProduct}
                modifying={modifyOptionMutation.isPending}
                modifyError={modifyOptionMutation.error?.message ?? null}
                onClearModifyError={modifyOptionMutation.reset}
                onModifyOption={(optionId, customResponse) => modifyOptionMutation.mutateAsync({
                  order_product_relation_id: selectedProduct.id,
                  options: [{ id: optionId, custom_response: customResponse }],
                })}
                statusChanging={modifyStatusMutation.isPending}
                statusError={modifyStatusMutation.error?.message ?? null}
                onClearStatusError={modifyStatusMutation.reset}
                onChangeStatus={(nextStatus) => modifyStatusMutation.mutateAsync({
                  order_product_relation_id: selectedProduct.id,
                  status: nextStatus,
                })}
                ticketInfoSaving={modifyTicketInfoMutation.isPending}
                ticketInfoError={modifyTicketInfoMutation.error?.message ?? null}
                onClearTicketInfoError={modifyTicketInfoMutation.reset}
                onModifyTicketInfo={(ticketInfo) => modifyTicketInfoMutation.mutateAsync({
                  order_product_relation_id: selectedProduct.id,
                  ticket_info: ticketInfo,
                })}
              />
            ) : selectedOrder ? (
              <OrderDetails
                order={selectedOrder}
                onBack={() => setSelectedOrder(null)}
                onSelectProduct={selectProduct}
                refunding={refundMutation.isPending}
                refundError={refundMutation.error?.message ?? null}
                onClearRefundError={refundMutation.reset}
                onRefund={(otp) => refundMutation.mutateAsync({ order_id: selectedOrder.id, otp })}
              />
            ) : (
              <OrderSearchResults
                orders={orders}
                onReset={reset}
                onSelect={selectOrder}
              />
            )}
          </Box>
        )}
      </Box>
    </Stack>
  );
};

const OrderSearchResults: FC<{
  orders: Order[];
  onReset: () => void;
  onSelect: (order: Order) => void;
}> = ({ orders, onReset, onSelect }) => (
  <Stack sx={{ flex: 1, minHeight: 0 }}>
    <Stack
      direction="row"
      spacing={1}
      sx={{ px: { xs: 2, md: 3 }, py: 1.5, alignItems: "center", justifyContent: "space-between" }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>검색 결과 {orders.length}건</Typography>
      <Button size="small" startIcon={<Clear />} onClick={onReset}>초기화</Button>
    </Stack>
    <Divider />
    {orders.length === 0 ? (
      <Box sx={{ flex: 1, minHeight: 240, display: "grid", placeItems: "center", p: 3 }}>
        <Stack spacing={1} sx={{ textAlign: "center" }}>
          <Typography variant="h6">검색 결과가 없습니다.</Typography>
          <Typography variant="body2" color="text.secondary">
            이름, 이메일, 전화번호 또는 주문번호를 다시 확인해주세요.
          </Typography>
        </Stack>
      </Box>
    ) : (
      <Stack divider={<Divider flexItem />} sx={{ overflowY: "auto" }}>
        {orders.map((order) => (
          <OrderSearchResult key={order.id} order={order} onSelect={() => onSelect(order)} />
        ))}
      </Stack>
    )}
  </Stack>
);

const OrderSearchResult: FC<{ order: Order; onSelect: () => void }> = ({ order, onSelect }) => {
  const payment = PAYMENT_STATUS_PRESENTATION[order.current_status];
  const customer = order.customer_info;

  return (
    <Stack spacing={1.5} sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{order.name}</Typography>
          <Typography variant="caption" color="text.secondary">{order.id}</Typography>
        </Box>
        <Chip size="small" color={payment.color} label={payment.label} />
      </Stack>

      <Box>
        <Typography variant="body2">
          {customer?.name ?? order.user.username}
          {customer?.organization ? ` · ${customer.organization}` : ""}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {[customer?.email ?? order.user.email, customer?.phone].filter(Boolean).join(" · ")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(order.first_paid_at)} 결제
        </Typography>
      </Box>

      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
        {order.products.map((product) => {
          const status = PRODUCT_STATUS_PRESENTATION[product.status];
          return (
            <Chip
              key={product.id}
              size="small"
              variant="outlined"
              color={status.color}
              label={`${product.product.name} · ${status.label}`}
              sx={{ maxWidth: "100%", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
            />
          );
        })}
      </Stack>

      <Button variant="outlined" size="small" onClick={onSelect} sx={{ alignSelf: "flex-end" }}>
        주문 상세
      </Button>
    </Stack>
  );
};

const OrderDetails: FC<{
  order: Order;
  onBack: () => void;
  onSelectProduct: (product: OrderProductRelation) => void;
  refunding: boolean;
  refundError: string | null;
  onClearRefundError: () => void;
  onRefund: (otp: string) => Promise<Order>;
}> = ({
  order,
  onBack,
  onSelectProduct,
  refunding,
  refundError,
  onClearRefundError,
  onRefund,
}) => {
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundOtp, setRefundOtp] = useState("");
  const payment = PAYMENT_STATUS_PRESENTATION[order.current_status];
  const customer = order.customer_info;
  const refundable = canFullyRefundOrder(order);

  const openRefundDialog = () => {
    onClearRefundError();
    setRefundOtp("");
    setRefundDialogOpen(true);
  };

  const closeRefundDialog = () => {
    if (refunding) return;
    onClearRefundError();
    setRefundDialogOpen(false);
    setRefundOtp("");
  };

  const refund = async () => {
    try {
      await onRefund(refundOtp.trim());
    } catch {
      return;
    }
    setRefundDialogOpen(false);
    setRefundOtp("");
  };

  return (
    <Stack sx={{ minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ px: { xs: 1.5, md: 2 }, py: 1, alignItems: "center" }}
      >
        <Button size="small" startIcon={<ArrowBack />} onClick={onBack}>검색 결과</Button>
      </Stack>
      <Divider />

      <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, overflowY: "auto" }}>
        <Stack spacing={1}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{order.name}</Typography>
              <Typography variant="caption" color="text.secondary">{order.id}</Typography>
            </Box>
            <Chip size="small" color={payment.color} label={payment.label} />
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
              gap: 1.5,
            }}
          >
            <DetailValue label="최초 결제" value={formatDateTime(order.first_paid_at)} />
            <DetailValue label="최초 결제 금액" value={formatPrice(order.first_paid_price)} />
            <DetailValue label="현재 결제 금액" value={formatPrice(order.current_paid_price)} />
          </Box>
          {order.not_fully_refundable_reason && (
            <Alert severity="warning">{order.not_fully_refundable_reason}</Alert>
          )}
          {refundable && (
            <Button
              variant="outlined"
              color="error"
              onClick={openRefundDialog}
              sx={{ alignSelf: "flex-end" }}
            >
              주문 전체 환불
            </Button>
          )}
        </Stack>

        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>구매자 정보</Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography>{customer?.name ?? order.user.username}</Typography>
            {customer?.organization && (
              <Typography variant="body2" color="text.secondary">{customer.organization}</Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {[customer?.email ?? order.user.email, customer?.phone].filter(Boolean).join(" · ")}
            </Typography>
          </Paper>
        </Stack>

        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>결제 내역</Typography>
          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Stack divider={<Divider flexItem />}>
              {order.payment_histories.map((history, index) => {
                const historyPresentation = PAYMENT_STATUS_PRESENTATION[history.status];
                return (
                  <Stack
                    key={`${history.created_at}-${index}`}
                    direction="row"
                    spacing={1}
                    sx={{ p: 1.5, alignItems: "center", justifyContent: "space-between" }}
                  >
                    <Box>
                      <Typography variant="body2">{formatDateTime(history.created_at)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {historyPresentation.label}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatPrice(history.price)}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>
        </Stack>

        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            주문상품 {order.products.length}개
          </Typography>
          {order.products.map((product) => (
            <OrderProductSummary
              key={product.id}
              product={product}
              onSelect={() => onSelectProduct(product)}
            />
          ))}
        </Stack>
      </Stack>

      <Dialog open={refundDialogOpen} onClose={closeRefundDialog} fullWidth maxWidth="xs">
        <DialogTitle>주문 전체 환불</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              {order.name}의 모든 주문상품을 환불합니다. 계속하려면 관리자 OTP를 입력해주세요.
            </Typography>
            {refundError && <Alert severity="error">{refundError}</Alert>}
            <TextField
              autoFocus
              fullWidth
              label="관리자 OTP"
              type="password"
              value={refundOtp}
              disabled={refunding}
              slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "one-time-code" } }}
              onChange={(event) => setRefundOtp(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={refunding} onClick={closeRefundDialog}>취소</Button>
          <Button
            variant="contained"
            color="error"
            disabled={refunding || !refundOtp.trim()}
            onClick={() => void refund()}
          >
            {refunding ? "환불 중…" : "전체 환불"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

const DetailValue: FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
  </Box>
);

const OrderProductSummary: FC<{
  product: OrderProductRelation;
  onSelect: () => void;
}> = ({ product, onSelect }) => {
  const status = PRODUCT_STATUS_PRESENTATION[product.status];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{product.product.name}</Typography>
            <Typography variant="caption" color="text.secondary">{product.id}</Typography>
          </Box>
          <Chip size="small" color={status.color} label={status.label} />
        </Stack>

        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          <DetailValue label="상품 금액" value={formatPrice(product.price)} />
          <DetailValue label="기부금" value={formatPrice(product.donation_price)} />
        </Stack>

        {product.ticket_info && (
          <Typography variant="body2" color="text.secondary">
            {[product.ticket_info.name, product.ticket_info.organization, product.ticket_info.email]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        )}

        <Typography variant="body2" color="text.secondary">
          {product.is_ticket ? "티켓 상품" : "일반 상품"} · 옵션 {product.options.length}개
        </Typography>

        {product.not_refundable_reason && (
          <Alert severity="warning">{product.not_refundable_reason}</Alert>
        )}

        <Button variant="outlined" size="small" onClick={onSelect} sx={{ alignSelf: "flex-end" }}>
          주문상품 상세
        </Button>
      </Stack>
    </Paper>
  );
};

const OrderProductDetails: FC<{
  orderName: string;
  backLabel: string;
  product: OrderProductRelation;
  onBack: () => void;
  modifying: boolean;
  modifyError: string | null;
  onClearModifyError: () => void;
  onModifyOption: (optionId: EntityId, customResponse: string | null) => Promise<Order>;
  statusChanging: boolean;
  statusError: string | null;
  onClearStatusError: () => void;
  onChangeStatus: (nextStatus: OrderProductStatus) => Promise<Order>;
  ticketInfoSaving: boolean;
  ticketInfoError: string | null;
  onClearTicketInfoError: () => void;
  onModifyTicketInfo: (ticketInfo: TicketInfo) => Promise<Order>;
}> = ({
  orderName,
  backLabel,
  product,
  onBack,
  modifying,
  modifyError,
  onClearModifyError,
  onModifyOption,
  statusChanging,
  statusError,
  onClearStatusError,
  onChangeStatus,
  ticketInfoSaving,
  ticketInfoError,
  onClearTicketInfoError,
  onModifyTicketInfo,
}) => {
  const [editingOptionId, setEditingOptionId] = useState<EntityId | null>(null);
  const [customResponse, setCustomResponse] = useState("");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [ticketInfoEditorOpen, setTicketInfoEditorOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const status = PRODUCT_STATUS_PRESENTATION[product.status];
  const ticket = product.ticket_info;
  const optionsEditable = product.status !== "used" && product.status !== "refunded";
  const ticketInfoEditable = product.status === "paid" || product.status === "used";
  const exchangeTargetCount = getPaidOptionExchangeTargets(product).length;
  const printArtifactCount = (product.is_ticket && ticket ? 1 : 0) + exchangeTargetCount;
  const previewAvailable = printArtifactCount > 0 &&
    (product.status === "paid" || product.status === "used");
  const nextStatus: OrderProductStatus | null = product.status === "paid"
    ? "used"
    : product.status === "used" ? "paid" : null;
  const statusChangeAllowed = nextStatus !== null && canTransitionOrderProductStatus(
    product.status,
    nextStatus,
  );
  const statusActionLabel = nextStatus === "used" ? "사용 처리" : "사용 취소";
  const busy = modifying || statusChanging || ticketInfoSaving;

  const beginOptionEdit = (optionId: EntityId, value: string | null) => {
    onClearModifyError();
    setEditingOptionId(optionId);
    setCustomResponse(value ?? "");
  };

  const cancelOptionEdit = () => {
    onClearModifyError();
    setEditingOptionId(null);
    setCustomResponse("");
  };

  const saveOption = async (optionId: EntityId) => {
    const normalizedResponse = customResponse.trim() || null;
    try {
      await onModifyOption(optionId, normalizedResponse);
    } catch {
      return;
    }
    setEditingOptionId(null);
    setCustomResponse("");
  };

  const openStatusDialog = () => {
    onClearStatusError();
    setStatusDialogOpen(true);
  };

  const closeStatusDialog = () => {
    if (statusChanging) return;
    onClearStatusError();
    setStatusDialogOpen(false);
  };

  const changeStatus = async () => {
    if (!nextStatus) return;
    try {
      await onChangeStatus(nextStatus);
    } catch {
      return;
    }
    setStatusDialogOpen(false);
  };

  const openTicketInfoEditor = () => {
    onClearTicketInfoError();
    setTicketInfoEditorOpen(true);
  };

  const closeTicketInfoEditor = () => {
    onClearTicketInfoError();
    setTicketInfoEditorOpen(false);
  };

  return (
    <Stack sx={{ minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ px: { xs: 1.5, md: 2 }, py: 1, alignItems: "center" }}
      >
        <Button size="small" startIcon={<ArrowBack />} onClick={onBack}>{backLabel}</Button>
      </Stack>
      <Divider />

      <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, overflowY: "auto" }}>
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">{orderName}</Typography>
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
              <Chip size="small" variant="outlined" label={product.is_ticket ? "티켓" : "일반 상품"} />
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
                    {nextStatus === "used"
                      ? "현장에서 상품 제공을 확인한 뒤 사용 완료로 변경합니다."
                      : "잘못 처리한 상품을 사용 대기 상태로 되돌립니다."}
                  </Typography>
                </Box>
                <Button
                  variant={nextStatus === "used" ? "contained" : "outlined"}
                  color={nextStatus === "used" ? "primary" : "warning"}
                  disabled={busy || editingOptionId !== null}
                  onClick={openStatusDialog}
                >
                  {statusActionLabel}
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
                  disabled={busy || ticketInfoSaving}
                  onClick={openTicketInfoEditor}
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
              {ticket.contribution_message && (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  {ticket.contribution_message}
                </Typography>
              )}
            </Paper>
          </Stack>
        )}

        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            상품 옵션 {product.options.length}개
          </Typography>
          {modifyError && <Alert severity="error">{modifyError}</Alert>}
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
                            {modifying ? "저장 중…" : "저장"}
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
                        {option.product_option_group.is_custom_response && (
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
                  <Typography sx={{ fontWeight: 600 }}>출력물 {printArtifactCount}장</Typography>
                  <Typography variant="body2" color="text.secondary">
                    명찰 {product.is_ticket && ticket ? 1 : 0}장 · 유료 옵션 교환권 {exchangeTargetCount}장
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => setPrintPreviewOpen(true)}
                >
                  미리보기
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
              {product.product.name}을(를) {statusActionLabel}하시겠습니까?
            </Typography>
            {statusError && <Alert severity="error">{statusError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={statusChanging} onClick={closeStatusDialog}>취소</Button>
          <Button
            variant="contained"
            color={nextStatus === "used" ? "primary" : "warning"}
            disabled={statusChanging}
            onClick={() => void changeStatus()}
          >
            {statusChanging ? "처리 중…" : statusActionLabel}
          </Button>
        </DialogActions>
      </Dialog>
      {ticket && ticketInfoEditorOpen && (
        <TicketInfoEditor
          ticketInfo={ticket}
          saving={ticketInfoSaving}
          error={ticketInfoError}
          onClose={closeTicketInfoEditor}
          onSave={onModifyTicketInfo}
        />
      )}
      {printPreviewOpen && (
        <PrintPreviewDialog
          product={product}
          onClose={() => setPrintPreviewOpen(false)}
        />
      )}
    </Stack>
  );
};
