import { ErrorBoundary, type ErrorBoundaryFallbackProps } from "@suspensive/react";
import { Alert, Button, Container, Stack, Typography } from "@mui/material";
import { useState, type FC, type PropsWithChildren } from "react";
import { closeAllDevicesWithin } from "../../apis/deviceLifecycle";

const AppErrorFallback: FC<ErrorBoundaryFallbackProps> = ({ error, reset }) => {
  const [recovering, setRecovering] = useState(false);

  const retry = async () => {
    setRecovering(true);
    await closeAllDevicesWithin();
    reset();
  };

  const reload = async () => {
    setRecovering(true);
    await closeAllDevicesWithin();
    window.location.reload();
  };

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Typography variant="h5">앱을 계속 실행할 수 없습니다</Typography>
        <Alert severity="error">{error.message || "알 수 없는 화면 오류가 발생했습니다."}</Alert>
        <Typography variant="body2" color="text.secondary">
          연결된 장치를 안전하게 정리한 뒤 화면을 다시 시도할 수 있습니다.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={recovering} onClick={() => void retry()}>
            다시 시도
          </Button>
          <Button disabled={recovering} onClick={() => void reload()}>
            앱 다시 시작
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
};

export const AppErrorBoundary: FC<PropsWithChildren> = ({ children }) => (
  <ErrorBoundary
    fallback={AppErrorFallback}
    onError={(error, info) => console.error("Unhandled React render error:", error, info.componentStack)}
  >
    {children}
  </ErrorBoundary>
);
