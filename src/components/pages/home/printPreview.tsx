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
import { selectBadgeTemplate } from "../../../printing/templates";

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
  const template = selectBadgeTemplate(product);
  const roleMarker = template.variant === "solid"
    ? { bgcolor: "common.black", color: "common.white", border: 1, borderColor: "common.black" }
    : template.variant === "outlined"
    ? { border: 2, borderColor: "common.black" }
    : { border: 1, borderColor: "grey.400" };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>명찰</Typography>
        <Chip size="small" label={template.name} />
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
          <Typography
            sx={{
              alignSelf: "flex-start",
              px: 1.25,
              py: 0.25,
              borderRadius: 0.75,
              fontWeight: 800,
              fontSize: "clamp(0.7rem, 2vw, 1rem)",
              ...roleMarker,
            }}
          >
            {template.role_label}
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
}> = ({ product, targets }) => {
  const longestText = Math.max(...targets.flatMap((target) => [
    target.product_option_group.name.length,
    target.product_option?.name.length ?? 0,
  ]));
  const density = Math.max(targets.length, longestText / 18);
  const titleFontSize = Math.max(1.1, Math.min(2.5, 2.7 - (density - 1) * 0.32));
  const valueFontSize = Math.max(0.95, titleFontSize * 0.72);
  const columns = targets.length >= 4 && longestText <= 24 ? 2 : 1;

  return (
    <Paper
      variant="outlined"
      sx={{
        width: "100%",
        maxWidth: 560,
        aspectRatio: "3 / 2",
        mx: "auto",
        p: { xs: 2, sm: 3 },
        display: "flex",
        bgcolor: "common.white",
        color: "common.black",
        overflow: "hidden",
      }}
    >
      <Stack sx={{ width: "100%", minWidth: 0, justifyContent: "space-between" }}>
        <Typography variant="overline" sx={{ fontWeight: 800, lineHeight: 1 }}>
          유료 옵션 교환권
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            alignContent: "center",
            gap: { xs: 1, sm: 1.5 },
            flex: 1,
            py: 1,
          }}
        >
          {targets.map((target) => (
            <Box key={target.id} sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 900,
                  fontSize: `clamp(1rem, 6vw, ${titleFontSize}rem)`,
                  lineHeight: 1.08,
                  overflowWrap: "anywhere",
                }}
              >
                {target.product_option_group.name}
              </Typography>
              <Typography
                sx={{
                  mt: 0.25,
                  fontWeight: 700,
                  fontSize: `clamp(0.9rem, 4vw, ${valueFontSize}rem)`,
                  lineHeight: 1.1,
                  overflowWrap: "anywhere",
                }}
              >
                {target.product_option?.name}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
          {product.id}
        </Typography>
      </Stack>
    </Paper>
  );
};

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
            역할 태그에 따라 기본 명찰 템플릿을 선택합니다. 명찰 QR 데이터 연결은 서버 연동 단계에서 적용됩니다.
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
