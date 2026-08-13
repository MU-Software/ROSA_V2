import { Alert, Box, Button, CircularProgress, Container, Stack } from "@mui/material";
import type { FC } from "react";

export const ConnectingPage: FC = () => (
  <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
    <CircularProgress />
  </Box>
);

export const ConnectionErrorPage: FC<{
  message: string;
  onRetry: () => void;
  onChangeServer: () => void;
}> = ({ message, onRetry, onChangeServer }) => (
  <Container maxWidth="sm" sx={{ py: 8 }}>
    <Stack spacing={2}>
      <Alert severity="error">{message}</Alert>
      <Button variant="contained" onClick={onRetry}>다시 시도</Button>
      <Button color="inherit" onClick={onChangeServer}>서버 변경</Button>
    </Stack>
  </Container>
);
