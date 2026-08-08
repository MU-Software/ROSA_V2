import { Card, Stack, Typography } from "@mui/material";
import type { FC, PropsWithChildren, ReactNode } from "react";

export const DebugCard: FC<PropsWithChildren<{ title: string; action?: ReactNode }>> = ({ title, action, children }) => (
  <Card sx={{ mt: 4, p: 2 }}>
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {action}
    </Stack>
    {children}
  </Card>
);
