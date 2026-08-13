import { Alert, Box, Button, CircularProgress, Container, Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type FC } from "react";
import { App } from "./app";
import type { RosaConnection } from "./apis/rosaDiscovery";
import {
  clearServerConfig,
  loadServerConfig,
  normalizeServerOrigin,
  saveServerConfig,
} from "./apis/serverConfig";
import { DEFAULT_PERSISTED_APP_STATE, savePersistedAppState } from "./apis/appState";
import {
  useCheckRosaSessionMutation,
  useConnectRosaMutation,
  useRosaLogoutMutation,
  type CheckedRosaConnection,
} from "./hooks/useRosaConnection";
import { LoginPage } from "./pages/login";
import { ServerSetupPage } from "./pages/serverSetup";
import { setActiveBadgeTemplateConfiguration } from "./printing/templates";

type BootstrapState =
  | { status: "setup"; initial_server_origin?: string }
  | { status: "connecting" }
  | { status: "login"; connection: RosaConnection }
  | { status: "ready"; connection: RosaConnection }
  | { status: "error"; server_origin: string; message: string };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bootstrapState = ({ connection, authenticated }: CheckedRosaConnection): BootstrapState =>
  authenticated ? { status: "ready", connection } : { status: "login", connection };

export const AppBootstrap: FC = () => {
  const queryClient = useQueryClient();
  const isExternalDisplay = window.location.pathname === "/display";
  const { mutateAsync: connectRosa } = useConnectRosaMutation();
  const { mutateAsync: checkRosaSession } = useCheckRosaSessionMutation();
  const [state, setState] = useState<BootstrapState>(() => {
    const config = loadServerConfig();
    return config
      ? { status: "connecting" }
      : { status: "setup" };
  });
  const logoutMutation = useRosaLogoutMutation();

  const connect = useCallback(async (serverOrigin: string, persist: boolean) => {
    const normalizedOrigin = normalizeServerOrigin(serverOrigin);
    const nextState = bootstrapState(await connectRosa(normalizedOrigin));
    if (persist) saveServerConfig(normalizedOrigin);
    setState(nextState);
  }, [connectRosa]);

  useEffect(() => {
    if (isExternalDisplay) return;
    const config = loadServerConfig();
    if (!config) return;
    const timeoutId = window.setTimeout(() => {
      void connect(config.server_origin, false).catch((error: unknown) => {
        setState({
          status: "error",
          server_origin: config.server_origin,
          message: errorMessage(error),
        });
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [connect, isExternalDisplay]);

  const changeServer = useCallback(() => {
    queryClient.clear();
    savePersistedAppState(DEFAULT_PERSISTED_APP_STATE);
    setActiveBadgeTemplateConfiguration(null);
    clearServerConfig();
    setState({
      status: "setup",
      initial_server_origin: state.status === "login" || state.status === "ready"
        ? state.connection.resolved.server_origin
        : state.status === "error"
          ? state.server_origin
          : undefined,
    });
  }, [queryClient, state]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const connection = state.connection;
    connection.gateway.setAuthenticationRequiredHandler(() => {
      queryClient.clear();
      setState((current) => current.status === "ready" && current.connection === connection
        ? { status: "login", connection }
        : current);
    });
    return () => connection.gateway.setAuthenticationRequiredHandler(null);
  }, [queryClient, state]);

  const logout = useCallback(() => {
    if (state.status !== "ready") return;
    const connection = state.connection;
    setState({ status: "connecting" });
    void logoutMutation.mutateAsync(connection).then(() => {
      queryClient.clear();
      savePersistedAppState(DEFAULT_PERSISTED_APP_STATE);
      setState({ status: "login", connection });
    }).catch((error: unknown) => {
      setState({
        status: "error",
        server_origin: connection.resolved.server_origin,
        message: errorMessage(error),
      });
    });
  }, [logoutMutation, queryClient, state]);

  if (isExternalDisplay) {
    return <App registrationDeskGateway={null} onChangeServer={changeServer} />;
  }

  if (state.status === "setup") {
    return (
      <ServerSetupPage
        initialServerOrigin={state.initial_server_origin}
        onSubmit={(serverOrigin) => connect(serverOrigin, true)}
      />
    );
  }

  if (state.status === "connecting") {
    return (
      <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Stack spacing={2}>
          <Alert severity="error">{state.message}</Alert>
          <Button
            variant="contained"
            onClick={() => {
              const serverOrigin = state.server_origin;
              setState({ status: "connecting" });
              void connect(serverOrigin, false).catch((error: unknown) => {
                setState({
                  status: "error",
                  server_origin: serverOrigin,
                  message: errorMessage(error),
                });
              });
            }}
          >
            다시 시도
          </Button>
          <Button color="inherit" onClick={changeServer}>서버 변경</Button>
        </Stack>
      </Container>
    );
  }

  if (state.status === "login") {
    return (
      <LoginPage
        connection={state.connection}
        onLoggedIn={() => setState({ status: "ready", connection: state.connection })}
        onCheckSession={() => {
          setState({ status: "connecting" });
          void checkRosaSession(state.connection).then((connection) => {
            setState(bootstrapState(connection));
          }).catch((error: unknown) => {
            setState({
              status: "error",
              server_origin: state.connection.resolved.server_origin,
              message: errorMessage(error),
            });
          });
        }}
        onChangeServer={changeServer}
      />
    );
  }

  return (
    <App
      registrationDeskGateway={state.connection.gateway}
      onChangeServer={changeServer}
      onLogout={logout}
    />
  );
};
