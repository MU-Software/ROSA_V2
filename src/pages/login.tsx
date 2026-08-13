import { LoginOutlined, SettingsOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { FC } from "react";
import type { RosaDiscovery } from "../apis/rosaDiscovery";

export const LoginPage: FC<{
  serverOrigin: string;
  discovery: RosaDiscovery;
  checking: boolean;
  onCheckSession: () => void;
  onChangeServer: () => void;
}> = ({ serverOrigin, discovery, checking, onCheckSession, onChangeServer }) => (
  <Box sx={{ minHeight: "100dvh", bgcolor: "grey.50", display: "grid", placeItems: "center" }}>
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
        <Stack spacing={3}>
          <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
            <LoginOutlined color="primary" sx={{ fontSize: 48 }} />
            <Typography variant="h4" sx={{ fontWeight: 700 }}>로그인</Typography>
            <Typography color="text.secondary">
              등록 데스크를 사용하려면 서버에 로그인해야 합니다.
            </Typography>
          </Stack>
          <Alert severity="info">
            <strong>{serverOrigin}</strong>
            <br />
            지원 로그인: {discovery.authentication.login.providers.join(", ")}
          </Alert>
          <Button
            size="large"
            variant="contained"
            disabled
            startIcon={<LoginOutlined />}
          >
            로그인
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
            로그인 실행은 다음 구현 단계에서 연결합니다.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              fullWidth
              variant="outlined"
              disabled={checking}
              onClick={onCheckSession}
            >
              {checking ? "확인 중" : "로그인 상태 다시 확인"}
            </Button>
            <Button
              fullWidth
              color="inherit"
              startIcon={<SettingsOutlined />}
              onClick={onChangeServer}
            >
              서버 변경
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  </Box>
);
