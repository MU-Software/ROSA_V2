import { DnsOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FC, type FormEvent } from "react";

export const ServerSetupPage: FC<{
  initialServerOrigin?: string;
  onSubmit: (serverOrigin: string) => Promise<void>;
}> = ({ initialServerOrigin = "", onSubmit }) => {
  const [serverOrigin, setServerOrigin] = useState(initialServerOrigin);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit(serverOrigin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.50", display: "grid", placeItems: "center" }}>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
          <Stack component="form" spacing={3} onSubmit={(event) => void submit(event)}>
            <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
              <DnsOutlined color="primary" sx={{ fontSize: 48 }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>ROSA</Typography>
              <Typography color="text.secondary">
                사용할 서버를 설정해주세요. 연결 가능한 ROSA 서버인지 확인한 뒤 저장합니다.
              </Typography>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              autoFocus
              required
              fullWidth
              type="url"
              label="서버 주소"
              placeholder="https://example.com"
              value={serverOrigin}
              disabled={pending}
              slotProps={{ htmlInput: { autoCapitalize: "none", autoCorrect: "off" } }}
              onChange={(event) => setServerOrigin(event.target.value)}
            />
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={pending || !serverOrigin.trim()}
              startIcon={pending ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {pending ? "서버 확인 중" : "계속"}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};
