import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { Navigate, Route, Routes } from "react-router";
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
import { ConnectingPage, ConnectionErrorPage } from "./pages/connection";
import { LoginPage } from "./pages/login";
import { ServerSetupPage } from "./pages/serverSetup";
import { setActiveBadgeTemplateConfiguration } from "./printing/templates";

type BootstrapState =
  | { status: "setup"; initial_server_origin?: string; return_to: string }
  | { status: "connecting"; return_to: string }
  | { status: "login"; connection: RosaConnection; return_to: string }
  | { status: "ready"; connection: RosaConnection; return_to: string }
  | { status: "error"; server_origin: string; message: string; return_to: string };

const BOOTSTRAP_PATHS = new Set(["/server", "/connecting", "/login", "/connection-error"]);

const currentAppPath = (): string => {
  if (BOOTSTRAP_PATHS.has(window.location.pathname)) return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bootstrapState = (
  { connection, authenticated }: CheckedRosaConnection,
  returnTo: string,
): BootstrapState => authenticated
  ? { status: "ready", connection, return_to: returnTo }
  : { status: "login", connection, return_to: returnTo };

const bootstrapPath = (state: BootstrapState): string => {
  switch (state.status) {
    case "setup": return "/server";
    case "connecting": return "/connecting";
    case "login": return "/login";
    case "error": return "/connection-error";
    case "ready": return state.return_to;
  }
};

export const AppBootstrap: FC = () => {
  const queryClient = useQueryClient();
  const isExternalDisplay = window.location.pathname === "/display";
  const { mutateAsync: connectRosa } = useConnectRosaMutation();
  const { mutateAsync: checkRosaSession } = useCheckRosaSessionMutation();
  const [state, setState] = useState<BootstrapState>(() => {
    const config = loadServerConfig();
    const returnTo = currentAppPath();
    return config
      ? { status: "connecting", return_to: returnTo }
      : { status: "setup", return_to: returnTo };
  });
  const initialConnectionStarted = useRef(false);
  const logoutMutation = useRosaLogoutMutation();

  const connect = useCallback(async (
    serverOrigin: string,
    persist: boolean,
    returnTo: string,
  ) => {
    const normalizedOrigin = normalizeServerOrigin(serverOrigin);
    setState({ status: "connecting", return_to: returnTo });
    try {
      const nextState = bootstrapState(await connectRosa(normalizedOrigin), returnTo);
      if (persist) saveServerConfig(normalizedOrigin);
      setState(nextState);
    } catch (error) {
      setState({
        status: "error",
        server_origin: normalizedOrigin,
        message: errorMessage(error),
        return_to: returnTo,
      });
    }
  }, [connectRosa]);

  useEffect(() => {
    if (isExternalDisplay || initialConnectionStarted.current) return;
    const config = loadServerConfig();
    if (!config) return;
    initialConnectionStarted.current = true;
    const returnTo = state.status === "connecting" ? state.return_to : "/";
    queueMicrotask(() => void connect(config.server_origin, false, returnTo));
  }, [connect, isExternalDisplay, state]);

  const changeServer = useCallback(() => {
    queryClient.clear();
    savePersistedAppState(DEFAULT_PERSISTED_APP_STATE);
    setActiveBadgeTemplateConfiguration(null);
    clearServerConfig();
    setState({
      status: "setup",
      return_to: "/",
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
      const returnTo = currentAppPath();
      queryClient.clear();
      setState((current) => current.status === "ready" && current.connection === connection
        ? { status: "login", connection, return_to: returnTo }
        : current);
    });
    return () => connection.gateway.setAuthenticationRequiredHandler(null);
  }, [queryClient, state]);

  const logout = useCallback(() => {
    if (state.status !== "ready") return;
    const connection = state.connection;
    setState({ status: "connecting", return_to: "/" });
    void logoutMutation.mutateAsync(connection).then(() => {
      queryClient.clear();
      savePersistedAppState(DEFAULT_PERSISTED_APP_STATE);
      setState({ status: "login", connection, return_to: "/" });
    }).catch((error: unknown) => {
      setState({
        status: "error",
        server_origin: connection.resolved.server_origin,
        message: errorMessage(error),
        return_to: "/",
      });
    });
  }, [logoutMutation, queryClient, state]);

  if (isExternalDisplay) {
    return <App registrationDeskGateway={null} onChangeServer={changeServer} />;
  }

  const redirect = <Navigate to={bootstrapPath(state)} replace />;

  return (
    <Routes>
      <Route
        path="/server"
        element={state.status === "setup" ? (
          <ServerSetupPage
            initialServerOrigin={state.initial_server_origin}
            onSubmit={(serverOrigin) => connect(serverOrigin, true, state.return_to)}
          />
        ) : redirect}
      />
      <Route
        path="/connecting"
        element={state.status === "connecting" ? <ConnectingPage /> : redirect}
      />
      <Route
        path="/connection-error"
        element={state.status === "error" ? (
          <ConnectionErrorPage
            message={state.message}
            onRetry={() => void connect(state.server_origin, false, state.return_to)}
            onChangeServer={changeServer}
          />
        ) : redirect}
      />
      <Route
        path="/login"
        element={state.status === "login" ? (
          <LoginPage
            connection={state.connection}
            onLoggedIn={() => {
              setState({
                status: "ready",
                connection: state.connection,
                return_to: state.return_to,
              });
            }}
            onCheckSession={() => {
              const { connection, return_to: returnTo } = state;
              setState({ status: "connecting", return_to: returnTo });
              void checkRosaSession(connection).then((checkedConnection) => {
                const nextState = bootstrapState(checkedConnection, returnTo);
                setState(nextState);
              }).catch((error: unknown) => {
                setState({
                  status: "error",
                  server_origin: connection.resolved.server_origin,
                  message: errorMessage(error),
                  return_to: returnTo,
                });
              });
            }}
            onChangeServer={changeServer}
          />
        ) : redirect}
      />
      <Route
        path="*"
        element={state.status === "ready" ? (
          <App
            registrationDeskGateway={state.connection.gateway}
            onChangeServer={changeServer}
            onLogout={logout}
          />
        ) : redirect}
      />
    </Routes>
  );
};
