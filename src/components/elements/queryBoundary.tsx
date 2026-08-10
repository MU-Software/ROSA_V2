import { ErrorBoundary } from "@suspensive/react";
import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Suspense, type FC, type PropsWithChildren, type ReactNode } from "react";

const QueryErrorFallback: FC<{ error: Error; reset: () => void }> = ({ error, reset }) => (
  <Stack spacing={2} sx={{ p: 3 }}>
    <Alert severity="error">{error.message}</Alert>
    <Button variant="outlined" onClick={reset}>다시 시도</Button>
  </Stack>
);

const QueryPendingFallback: FC = () => (
  <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
    <CircularProgress size={30} />
  </Box>
);

export const QueryBoundary: FC<PropsWithChildren<{
  resetKeys?: unknown[];
  pendingFallback?: ReactNode;
}>> = ({ children, resetKeys, pendingFallback = <QueryPendingFallback /> }) => (
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <ErrorBoundary
        resetKeys={resetKeys}
        onReset={reset}
        fallback={QueryErrorFallback}
      >
        <Suspense fallback={pendingFallback}>{children}</Suspense>
      </ErrorBoundary>
    )}
  </QueryErrorResetBoundary>
);
