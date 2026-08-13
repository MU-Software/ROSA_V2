import { Alert, CircularProgress, Stack } from "@mui/material";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type Dispatch,
  type FC,
  type SetStateAction,
} from "react";
import { Route, Routes, useLocation } from "react-router";
import type { PersistedAppState } from "./apis/appState";
import { installDeviceCleanup } from "./apis/deviceLifecycle";
import { serialManager } from "./apis/serial";
import { TopBar } from "./components/elements/topbar";
import { QueryBoundary } from "./components/elements/queryBoundary";
import { FullScreenRouteDialog } from "./components/layouts/fullScreenRouteDialog";
import { AppLayoutProvider } from "./components/providers/appLayoutProvider";
import { AppContext, loadAppConfig, saveAppConfig, type AppContextData } from "./contexts";
import { DebugPage } from "./pages/debug";
import { ExternalDisplayPage } from "./pages/display";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/notFound";
import {
  OrderDetailsRoute,
  OrderProductDetailsRoute,
  OrderSearchResultsRoute,
  OrderWorkspaceNotFoundRoute,
} from "./components/pages/home/orderSearch";
import type { RegistrationDeskGateway } from "./gateways";
import { useLocalStorageAppState } from "./hooks/useLocalStorageAppState";

const TemplatesPage = lazy(async () => ({
  default: (await import("./pages/templates")).TemplatesPage,
}));

export const App: FC<{
  registrationDeskGateway: RegistrationDeskGateway | null;
  onChangeServer: () => void;
  onLogout?: () => void;
}> = ({ registrationDeskGateway, onChangeServer, onLogout }) => {
  const location = useLocation();
  const isExternalDisplay = location.pathname === "/display";
  const [appState, setAppState] = useState<AppContextData>(loadAppConfig);
  const appStateRef = useRef(appState);
  const setAppContext = useCallback<Dispatch<SetStateAction<AppContextData>>>((nextState) => {
    const updatedState = typeof nextState === "function"
      ? nextState(appStateRef.current)
      : nextState;
    appStateRef.current = updatedState;
    setAppState(updatedState);
    saveAppConfig(updatedState);
  }, []);

  const applyPersistedAppState = useCallback((persistedAppState: PersistedAppState) => {
    const updatedState = { ...appStateRef.current, ...persistedAppState };
    appStateRef.current = updatedState;
    setAppState(updatedState);
  }, []);
  useLocalStorageAppState(applyPersistedAppState);

  useEffect(() => {
    if (isExternalDisplay) return;
    let active = true;
    serialManager.restore().then(
      ({ failed }) => {
        if (!active) return;
        setAppContext((prev) => ({
          ...prev,
          serialRestoreFailures: failed,
          serialRestoreError: null,
        }));
      },
      (err: unknown) => {
        if (!active) return;
        setAppContext((prev) => ({
          ...prev,
          serialRestoreFailures: [],
          serialRestoreError: err instanceof Error ? err.message : String(err),
        }));
      },
    );
    return () => { active = false; };
  }, [isExternalDisplay, setAppContext]);

  useEffect(() => {
    if (isExternalDisplay) return;
    return installDeviceCleanup();
  }, [isExternalDisplay]);

  const contextValue = useMemo(() => ({ ...appState, setAppContext }), [appState, setAppContext]);

  return (
    <AppContext.Provider value={contextValue}>
      <AppLayoutProvider>
        {!isExternalDisplay && <TopBar />}
        {!isExternalDisplay && (
          appState.serialRestoreError || appState.serialRestoreFailures.length > 0
        ) && (
          <Alert
            severity="warning"
            onClose={() => setAppContext((prev) => ({
              ...prev,
              serialRestoreFailures: [],
              serialRestoreError: null,
            }))}
            sx={{ m: 2 }}
          >
            <Stack spacing={0.5}>
              {appState.serialRestoreError && (
                <span>시리얼 장치 복원 실패: {appState.serialRestoreError}</span>
              )}
              {appState.serialRestoreFailures.map((failure) => (
                <span key={failure.label}>
                  <strong>{failure.label}</strong>: {failure.reason}
                </span>
              ))}
            </Stack>
          </Alert>
        )}
        <Routes>
          <Route
            path="/"
            element={(
              <HomePage
                gateway={registrationDeskGateway}
                onChangeServer={onChangeServer}
                onLogout={onLogout}
              />
            )}
          >
            <Route index element={null} />
            <Route path="orders" element={<OrderSearchResultsRoute />} />
            <Route path="orders/:orderId" element={<OrderDetailsRoute />} />
            <Route path="order-products/:productId" element={<OrderProductDetailsRoute />} />
            <Route path="*" element={<OrderWorkspaceNotFoundRoute />} />
          </Route>
          <Route path="/display" element={<ExternalDisplayPage />} />
          <Route
            path="/templates"
            element={(
              <FullScreenRouteDialog title="명찰 템플릿">
                <Suspense fallback={<Stack sx={{ p: 4, alignItems: "center" }}><CircularProgress /></Stack>}>
                  {registrationDeskGateway ? (
                    <QueryBoundary>
                      <TemplatesPage gateway={registrationDeskGateway} />
                    </QueryBoundary>
                  ) : (
                    <Alert severity="error">등록 데스크 서버 연결이 필요합니다.</Alert>
                  )}
                </Suspense>
              </FullScreenRouteDialog>
            )}
          />
          <Route
            path="/debug"
            element={(
              <FullScreenRouteDialog title="장치 진단">
                <DebugPage />
              </FullScreenRouteDialog>
            )}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppLayoutProvider>
    </AppContext.Provider>
  );
};
