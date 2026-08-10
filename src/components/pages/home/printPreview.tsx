import { QrCode2 } from "@mui/icons-material";
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
  Typography,
} from "@mui/material";
import type { FC } from "react";
import {
  getPaidOptionExchangeTargets,
  type OrderProductOptionRelation,
  type OrderProductRelation,
} from "../../../domain";

const QrPlaceholder: FC = () => (
  <Box
    sx={{
      aspectRatio: "1",
      minWidth: 72,
      maxWidth: 132,
      display: "grid",
      placeItems: "center",
      border: 1,
      borderColor: "grey.900",
      bgcolor: "common.white",
    }}
  >
    <Stack spacing={0.25} sx={{ alignItems: "center" }}>
      <QrCode2 sx={{ fontSize: { xs: 40, sm: 64 } }} />
      <Typography variant="caption" sx={{ fontSize: { xs: 8, sm: 10 } }}>QR 연동 예정</Typography>
    </Stack>
  </Box>
);

const BadgePreview: FC<{ product: OrderProductRelation }> = ({ product }) => {
  const ticket = product.ticket_info;
  if (!ticket) return null;

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>명찰</Typography>
        <Chip size="small" label="참가자 기본 템플릿" />
      </Stack>
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: 720,
          aspectRatio: "90 / 38",
          mx: "auto",
          p: { xs: 1.5, sm: 3 },
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: { xs: 1.5, sm: 3 },
          alignItems: "stretch",
          bgcolor: "common.white",
          color: "common.black",
          overflow: "hidden",
        }}
      >
        <Stack sx={{ minWidth: 0, justifyContent: "space-between" }}>
          <Typography variant="overline" sx={{ fontWeight: 700, lineHeight: 1 }}>ROSA</Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: "clamp(1.15rem, 4vw, 2.6rem)",
                fontWeight: 800,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.name}
            </Typography>
            <Typography
              color="text.secondary"
              sx={{
                mt: 0.5,
                fontSize: "clamp(0.7rem, 2vw, 1.15rem)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.organization || "소속 없음"}
            </Typography>
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: "clamp(0.7rem, 2vw, 1rem)" }}>
            참가자
          </Typography>
        </Stack>
        <QrPlaceholder />
      </Paper>
    </Stack>
  );
};

const ExchangeVoucherPreview: FC<{
  product: OrderProductRelation;
  targets: OrderProductOptionRelation[];
}> = ({ product, targets }) => (
  <Paper
    variant="outlined"
    sx={{
      width: "100%",
      maxWidth: 560,
      aspectRatio: "3 / 2",
      mx: "auto",
      p: { xs: 2, sm: 3 },
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gap: 2,
      bgcolor: "common.white",
      color: "common.black",
      overflow: "hidden",
    }}
  >
    <Stack sx={{ minWidth: 0, justifyContent: "space-between" }}>
      <Box>
        <Typography variant="overline" sx={{ fontWeight: 700 }}>유료 옵션 교환권</Typography>
        <Stack spacing={0.75} sx={{ mt: 0.5 }}>
          {targets.map((target) => (
            <Box key={target.id}>
              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {target.product_option_group.name}
              </Typography>
              <Typography variant="body2">{target.product_option?.name}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {product.id}
        </Typography>
      </Box>
    </Stack>
    <QrPlaceholder />
  </Paper>
);

export const PrintPreviewDialog: FC<{
  product: OrderProductRelation;
  onClose: () => void;
}> = ({ product, onClose }) => {
  const exchangeTargets = getPaidOptionExchangeTargets(product);
  const hasBadge = product.is_ticket && !!product.ticket_info;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>출력물 미리보기</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 0.5 }}>
          <Alert severity="info">
            역할 태그와 signed QR은 서버 연동 단계에서 적용됩니다. 현재는 참가자 기본 템플릿을 표시합니다.
          </Alert>
          {!hasBadge && exchangeTargets.length === 0 && (
            <Alert severity="warning">미리볼 출력물이 없습니다.</Alert>
          )}
          {hasBadge && <BadgePreview product={product} />}
          {hasBadge && exchangeTargets.length > 0 && <Divider />}
          {exchangeTargets.length > 0 && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                유료 옵션 교환권 1장 · {exchangeTargets.length}개 항목
              </Typography>
              <ExchangeVoucherPreview product={product} targets={exchangeTargets} />
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
};
