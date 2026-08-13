import { Box, Paper, Stack, Typography } from "@mui/material";
import type { FC } from "react";
import type {
  OrderProductOptionRelation,
  OrderProductRelation,
} from "../../domain";

export const ExchangeVoucher: FC<{
  product: OrderProductRelation;
  targets: readonly OrderProductOptionRelation[];
  aspectRatio?: string;
}> = ({ product, targets, aspectRatio = "3 / 2" }) => {
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
        aspectRatio,
        p: "3.5cqi",
        display: "flex",
        containerType: "inline-size",
        bgcolor: "common.white",
        color: "common.black",
        overflow: "hidden",
      }}
    >
      <Stack sx={{ width: "100%", minWidth: 0, justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: "2.5cqi", fontWeight: 800, lineHeight: 1 }}>
          유료 옵션 교환권
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            alignContent: "center",
            gap: "1.5cqi",
            flex: 1,
            py: "1.5cqi",
          }}
        >
          {targets.map((target) => (
            <Box key={target.id} sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 900,
                  fontSize: `clamp(1rem, 6cqi, ${titleFontSize}rem)`,
                  lineHeight: 1.08,
                  overflowWrap: "anywhere",
                }}
              >
                {target.product_option_group.name}
              </Typography>
              <Typography
                sx={{
                  mt: "0.5cqi",
                  fontWeight: 700,
                  fontSize: `clamp(0.9rem, 4cqi, ${valueFontSize}rem)`,
                  lineHeight: 1.1,
                  overflowWrap: "anywhere",
                }}
              >
                {target.product_option?.name}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography color="text.secondary" sx={{ fontSize: "1.7cqi", lineHeight: 1 }}>
          {product.id}
        </Typography>
      </Stack>
    </Paper>
  );
};
