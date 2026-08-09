import { Alert, Stack } from "@mui/material";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FC,
  type SetStateAction,
} from "react";
import { Route, Routes, useLocation } from "react-router";
import { installDeviceCleanup } from "./apis/deviceLifecycle";
import {
  saveRegistrationSession,
  type RegistrationSession,
} from "./apis/registrationSession";
import { serialManager } from "./apis/serial";
import { TopBar } from "./components/elements/topbar";
import { AppContext, loadAppConfig, saveAppConfig, type AppContextData } from "./contexts";
import { DebugPage } from "./pages/debug";
import { ExternalDisplayPage } from "./pages/display";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/notFound";
import type { RegistrationDeskGateway } from "./gateways";
import { useLocalStorageSession } from "./hooks/useLocalStorageSession";

export const App: FC<{ registrationDeskGateway: RegistrationDeskGateway | null }> = ({
  registrationDeskGateway,
}) => {
  const location = useLocation();
  const isExternalDisplay = location.pathname === "/display";
  const [appState, setAppState] = useState<AppContextData>(loadAppConfig);
  const appStateRef = useRef(appState);
  const setAppContext = useCallback<Dispatch<SetStateAction<AppContextData>>>((nextState) => {
    const currentState = appStateRef.current;
    const updatedState = typeof nextState === "function"
      ? nextState(currentState)
      : nextState;
    appStateRef.current = updatedState;
    setAppState(updatedState);
    saveAppConfig(updatedState);

    if (
      currentState.registration_state !== updatedState.registration_state ||
      currentState.order_product_relation !== updatedState.order_product_relation ||
      currentState.farewell_until !== updatedState.farewell_until
    ) {
      saveRegistrationSession(updatedState);
    }
  }, []);

  const applyRegistrationSession = useCallback((registrationSession: RegistrationSession) => {
    const updatedState = { ...appStateRef.current, ...registrationSession };
    appStateRef.current = updatedState;
    setAppState(updatedState);
  }, []);
  useLocalStorageSession(applyRegistrationSession);

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
        <Route path="/" element={<HomePage gateway={registrationDeskGateway} />} />
        <Route path="/display" element={<ExternalDisplayPage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppContext.Provider>
  );
};
