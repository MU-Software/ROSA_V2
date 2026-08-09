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
import type {
  Order,
  OrderProductRelation,
  OrderProductStatus,
  PaymentHistoryStatus,
} from "../../../domain";
import type { RegistrationDeskGateway } from "../../../gateways";

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
}> = ({ gateway, children }) => {
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      if (!gateway) throw new Error("주문 검색 gateway가 준비되지 않았습니다.");
      return gateway.searchOrders({ query: searchQuery });
    },
  });
  const hasSearched = searchMutation.status !== "idle";
  const showIdleContent = !!gateway && !searchMutation.isPending && !searchMutation.error && !hasSearched;

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery || searchMutation.isPending) return;
    setSelectedOrder(null);
    searchMutation.mutate(normalizedQuery);
  };

  const reset = () => {
    setQuery("");
    setSelectedOrder(null);
    searchMutation.reset();
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
            ) : selectedOrder ? (
              <OrderDetails order={selectedOrder} onBack={() => setSelectedOrder(null)} />
            ) : (
              <OrderSearchResults
                orders={searchMutation.data ?? []}
                onReset={reset}
                onSelect={setSelectedOrder}
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

const OrderDetails: FC<{ order: Order; onBack: () => void }> = ({ order, onBack }) => {
  const payment = PAYMENT_STATUS_PRESENTATION[order.current_status];
  const customer = order.customer_info;

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
            <OrderProductSummary key={product.id} product={product} />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};

const DetailValue: FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
  </Box>
);

const OrderProductSummary: FC<{ product: OrderProductRelation }> = ({ product }) => {
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

        {product.options.length > 0 && (
          <Stack spacing={0.75}>
            {product.options.map((option) => (
              <Stack
                key={option.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 0, sm: 1 }}
                sx={{ justifyContent: "space-between" }}
              >
                <Typography variant="body2" color="text.secondary">
                  {option.product_option_group.name}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {option.custom_response ?? option.product_option?.name ?? "선택 없음"}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}

        {product.not_refundable_reason && (
          <Alert severity="warning">{product.not_refundable_reason}</Alert>
        )}
      </Stack>
    </Paper>
  );
};
