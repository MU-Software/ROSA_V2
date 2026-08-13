import { LoginOutlined, SettingsOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useForm } from "react-hook-form";
import type { FC } from "react";
import type { RosaConnection } from "../apis/rosaDiscovery";
import { FormTextField } from "../components/elements/forms";
import { useRosaLoginMutation } from "../hooks/useRosaConnection";

type LoginForm = {
  email: string;
  password: string;
};

export const LoginPage: FC<{
  connection: RosaConnection;
  onLoggedIn: () => void;
  onCheckSession: () => void;
  onChangeServer: () => void;
}> = ({ connection, onLoggedIn, onCheckSession, onChangeServer }) => {
  const loginMutation = useRosaLoginMutation(connection);
  const { control, handleSubmit } = useForm<LoginForm>({
    defaultValues: { email: "", password: "" },
  });

  const login = (credentials: LoginForm) => {
    loginMutation.mutate(credentials, { onSuccess: onLoggedIn });
  };

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.50", display: "grid", placeItems: "center" }}>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
          <Stack
            component="form"
            spacing={3}
            onSubmit={(event) => void handleSubmit(login)(event)}
          >
            <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
              <LoginOutlined color="primary" sx={{ fontSize: 48 }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>로그인</Typography>
              <Typography color="text.secondary">
                등록 데스크를 사용하려면 서버 계정으로 로그인해주세요.
              </Typography>
            </Stack>
            <Alert severity="info">
              <strong>{connection.resolved.server_origin}</strong>
            </Alert>
            {loginMutation.error && <Alert severity="error">{loginMutation.error.message}</Alert>}
            <Stack spacing={2}>
              <FormTextField
                name="email"
                control={control}
                label="이메일"
                rules={{ required: true }}
                inputProps={{
                  autoFocus: true,
                  required: true,
                  fullWidth: true,
                  type: "email",
                  disabled: loginMutation.isPending,
                  slotProps: { htmlInput: { autoComplete: "username" } },
                }}
              />
              <FormTextField
                name="password"
                control={control}
                label="비밀번호"
                rules={{ required: true }}
                inputProps={{
                  required: true,
                  fullWidth: true,
                  type: "password",
                  disabled: loginMutation.isPending,
                  slotProps: { htmlInput: { autoComplete: "current-password" } },
                }}
              />
            </Stack>
            <Button
              type="submit"
              size="large"
              variant="contained"
              disabled={loginMutation.isPending}
              startIcon={loginMutation.isPending
                ? <CircularProgress size={18} color="inherit" />
                : <LoginOutlined />}
            >
              {loginMutation.isPending ? "로그인 중" : "로그인"}
            </Button>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                fullWidth
                variant="outlined"
                disabled={loginMutation.isPending}
                onClick={onCheckSession}
              >
                로그인 상태 다시 확인
              </Button>
              <Button
                fullWidth
                color="inherit"
                disabled={loginMutation.isPending}
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
};
