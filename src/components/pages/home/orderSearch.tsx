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
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
  type ChipProps,
} from "@mui/material";
import { useEffect, useState, type FC, type FormEvent, type ReactNode } from "react";
import { QueryBoundary } from "../../elements/queryBoundary";
import { useAppContext } from "../../../contexts";
import {
  canFullyRefundOrder,
  transitionRegistration,
  type EntityId,
  type Order,
  type OrderProductRelation,
  type OrderProductStatus,
  type PaymentHistoryStatus,
} from "../../../domain";
import type { RegistrationDeskGateway } from "../../../gateways";
import {
  ORDER_SEARCH_PAGE_SIZE,
  useOrderProductQuery,
  useOrderSearchFetching,
  useOrderSearchQuery,
  useRefundOrderMutation,
  useRegistrationDeskQueryClient,
} from "../../../hooks/useRegistrationDesk";
import { OrderProductDetails } from "./orderProductDetails";

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
}> = ({
  gateway,
  children,
}) => {
  const registrationDeskQueryClient = useRegistrationDeskQueryClient(gateway);
  const {
    order_product_relation: restoredProduct,
    setAppContext,
  } = useAppContext();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<EntityId | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<EntityId | null>(null);
  const searching = useOrderSearchFetching(submittedQuery);
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
      active_order_product_scancode: null,
    }));
  };
  const activeProductId = selectedProductId ??
    (selectedOrderId ? null : restoredProduct?.id) ?? null;
  const showIdleContent = !!gateway && !submittedQuery && !activeProductId;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery || searching) return;
    if (restoredProduct) clearRegistrationProduct();
    setSelectedOrderId(null);
    setSelectedProductId(null);
    if (submittedQuery === normalizedQuery) {
      void registrationDeskQueryClient.refetchOrderSearch(normalizedQuery);
    }
    setSubmittedQuery(normalizedQuery);
  };

  const reset = () => {
    if (restoredProduct) clearRegistrationProduct();
    setQuery("");
    setSubmittedQuery(null);
    setSelectedOrderId(null);
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
            disabled={!gateway || searching}
            onChange={(event) => setQuery(event.target.value)}
          />
          <IconButton
            type="submit"
            disabled={!gateway || !query.trim() || searching}
            sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
          >
            {searching ? <CircularProgress size={18} /> : <SearchOutlined />}
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
            ) : activeProductId ? (
              <QueryBoundary resetKeys={[activeProductId]}>
                <OrderProductDetailsQuery
                  gateway={gateway}
                  productId={activeProductId}
                  orderName={selectedOrderId ? undefined : "저장된 주문상품"}
                  backLabel={selectedOrderId ? "주문 상세" : "닫기"}
                  onBack={closeProduct}
                />
              </QueryBoundary>
            ) : submittedQuery ? (
              <QueryBoundary resetKeys={[submittedQuery]}>
                <OrderSearchQueryContent
                  key={submittedQuery}
                  gateway={gateway}
                  query={submittedQuery}
                  selectedOrderId={selectedOrderId}
                  onReset={reset}
                  onSelectOrder={setSelectedOrderId}
                  onBack={() => setSelectedOrderId(null)}
                  onSelectProduct={selectProduct}
                />
              </QueryBoundary>
            ) : null}
          </Box>
        )}
      </Box>
    </Stack>
  );
};

const OrderProductDetailsQuery: FC<{
  gateway: RegistrationDeskGateway;
  productId: EntityId;
  orderName?: string;
  backLabel: string;
  onBack: () => void;
}> = ({ gateway, productId, orderName, backLabel, onBack }) => {
  const { data } = useOrderProductQuery(gateway, productId);
  const { setAppContext } = useAppContext();

  useEffect(() => {
    setAppContext((current) => current.order_product_relation?.id === productId
      ? { ...current, order_product_relation: data }
      : current);
  }, [data, productId, setAppContext]);

  return (
    <OrderProductDetails
      orderId={data.order.id}
      product={data}
      gateway={gateway}
      navigation={{ orderName: orderName ?? data.order.name, backLabel, onBack }}
    />
  );
};

const OrderSearchQueryContent: FC<{
  gateway: RegistrationDeskGateway;
  query: string;
  selectedOrderId: EntityId | null;
  onReset: () => void;
  onSelectOrder: (id: EntityId) => void;
  onBack: () => void;
  onSelectProduct: (product: OrderProductRelation) => void;
}> = ({
  gateway,
  query,
  selectedOrderId,
  onReset,
  onSelectOrder,
  onBack,
  onSelectProduct,
}) => {
  const [page, setPage] = useState(1);
  const { data } = useOrderSearchQuery(gateway, query, page);
  const selectedOrder = data.results.find(({ id }) => id === selectedOrderId) ?? null;
  const refundMutation = useRefundOrderMutation(gateway);

  return selectedOrder ? (
    <OrderDetails
      order={selectedOrder}
      onBack={onBack}
      onSelectProduct={onSelectProduct}
      refunding={refundMutation.isPending}
      refundError={refundMutation.error?.message ?? null}
      onClearRefundError={refundMutation.reset}
      onRefund={() => refundMutation.mutateAsync({ order_id: selectedOrder.id })}
    />
  ) : (
    <OrderSearchResults
      page={page}
      result={data}
      onReset={onReset}
      onSelect={(order) => onSelectOrder(order.id)}
      onPageChange={setPage}
    />
  );
};

const OrderSearchResults: FC<{
  page: number;
  result: { count: number; results: Order[] };
  onReset: () => void;
  onSelect: (order: Order) => void;
  onPageChange: (page: number) => void;
}> = ({ page, result, onReset, onSelect, onPageChange }) => (
  <Stack sx={{ flex: 1, minHeight: 0 }}>
    <Stack
      direction="row"
      spacing={1}
      sx={{ px: { xs: 2, md: 3 }, py: 1.5, alignItems: "center", justifyContent: "space-between" }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>검색 결과 {result.count}건</Typography>
      <Button size="small" startIcon={<Clear />} onClick={onReset}>초기화</Button>
    </Stack>
    <Divider />
    {result.results.length === 0 ? (
      <Box sx={{ flex: 1, minHeight: 240, display: "grid", placeItems: "center", p: 3 }}>
        <Stack spacing={1} sx={{ textAlign: "center" }}>
          <Typography variant="h6">검색 결과가 없습니다.</Typography>
          <Typography variant="body2" color="text.secondary">
            이름, 이메일, 전화번호 또는 주문번호를 다시 확인해주세요.
          </Typography>
        </Stack>
      </Box>
    ) : (
      <Stack sx={{ overflowY: "auto" }}>
        <Stack divider={<Divider flexItem />}>
          {result.results.map((order) => (
            <OrderSearchResult key={order.id} order={order} onSelect={() => onSelect(order)} />
          ))}
        </Stack>
        {result.count > ORDER_SEARCH_PAGE_SIZE && (
          <Pagination
            page={page}
            count={Math.ceil(result.count / ORDER_SEARCH_PAGE_SIZE)}
            onChange={(_event, nextPage) => onPageChange(nextPage)}
            sx={{ p: 2, alignSelf: "center" }}
          />
        )}
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
  onRefund: () => Promise<void>;
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
  const payment = PAYMENT_STATUS_PRESENTATION[order.current_status];
  const customer = order.customer_info;
  const refundable = canFullyRefundOrder(order);

  const openRefundDialog = () => {
    onClearRefundError();
    setRefundDialogOpen(true);
  };

  const closeRefundDialog = () => {
    if (refunding) return;
    onClearRefundError();
    setRefundDialogOpen(false);
  };

  const refund = async () => {
    try {
      await onRefund();
    } catch {
      return;
    }
    setRefundDialogOpen(false);
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
              {order.name}의 모든 주문상품을 환불합니다. 환불은 되돌릴 수 없습니다.
            </Typography>
            {refundError && <Alert severity="error">{refundError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={refunding} onClick={closeRefundDialog}>취소</Button>
          <Button
            variant="contained"
            color="error"
            disabled={refunding}
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
