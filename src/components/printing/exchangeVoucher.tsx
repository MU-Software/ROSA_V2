import { Box, Paper, Stack, Typography } from "@mui/material";
import type { FC } from "react";
import type {
  OrderProductOptionRelation,
} from "../../domain";
import type { TemplateLayoutType } from "../../printing/templateDocument";

const getTargetLabel = (target: OrderProductOptionRelation): string => [
  target.product_option_group.name,
  target.product_option?.name ?? target.custom_response,
].filter(Boolean).join(" · ");

export const ExchangeVoucher: FC<{
  targets: readonly OrderProductOptionRelation[];
  layoutType: TemplateLayoutType;
  aspectRatio?: string;
}> = ({ targets, layoutType, aspectRatio = layoutType === "wide" ? "90 / 38" : "40 / 30" }) => {
  const labels = targets.map(getTargetLabel);
  const longestText = Math.max(...labels.map(({ length }) => length));
  const columns = layoutType === "wide" && targets.length >= 4 && longestText <= 24 ? 2 : 1;
  const rowCount = Math.ceil(targets.length / columns);
  const density = Math.max(rowCount, longestText / (layoutType === "wide" ? 24 : 16));
  const optionFontSize = Math.max(1, Math.min(3.5, 3.7 - (density - 1) * 0.42));

  return (
    <Paper
      variant="outlined"
      sx={{
        width: "100%",
        aspectRatio,
        p: layoutType === "wide" ? "2.5cqi" : "4cqi",
        display: "flex",
        containerType: "inline-size",
        bgcolor: "common.white",
        color: "common.black",
        overflow: "hidden",
      }}
    >
      <Stack sx={{ width: "100%", minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: "clamp(0.8rem, 3.2cqi, 1.5rem)",
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          교환권
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            alignContent: "center",
            gap: "1cqi",
            flex: 1,
            py: "1cqi",
          }}
        >
          {targets.map((target, index) => (
            <Box key={target.id} sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 900,
                  fontSize: `clamp(1rem, ${layoutType === "wide" ? 7 : 9}cqi, ${optionFontSize}rem)`,
                  lineHeight: 1.05,
                  whiteSpace: "nowrap",
                }}
              >
                {labels[index]}
              </Typography>
            </Box>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
};
