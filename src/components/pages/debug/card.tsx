import { ExpandMore } from "@mui/icons-material";
import { Accordion, AccordionDetails, AccordionSummary, Card, Stack, Typography } from "@mui/material";
import type { FC, PropsWithChildren, ReactNode } from "react";

export const DebugSection: FC<PropsWithChildren<{ title: string; defaultExpanded?: boolean }>> = ({
  title,
  defaultExpanded = false,
  children,
}) => (
  <Accordion defaultExpanded={defaultExpanded} sx={{ mt: 2 }}>
    <AccordionSummary expandIcon={<ExpandMore />}>
      <Typography variant="h5">{title}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>
      <Stack sx={{ "& > .MuiCard-root:first-of-type": { mt: 0 } }}>{children}</Stack>
    </AccordionDetails>
  </Accordion>
);

export const DebugCard: FC<PropsWithChildren<{ title: string; action?: ReactNode }>> = ({ title, action, children }) => (
  <Card sx={{ mt: 4, p: 2 }}>
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {action}
    </Stack>
    {children}
  </Card>
);
