import { Alert, Stack } from "@mui/material";
import { useEffect, useMemo, useState, type FC } from "react";
import { Route, Routes } from "react-router";
import { installDeviceCleanup } from "./apis/deviceLifecycle";
import { serialManager } from "./apis/serial";
import { TopBar } from "./components/elements/topbar";
import { AppContext, loadAppConfig, saveAppConfig, type AppContextData } from "./contexts";
import { DebugPage } from "./pages/debug";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/notFound";
import type { RegistrationDeskGateway } from "./gateways";

export const App: FC<{ registrationDeskGateway: RegistrationDeskGateway | null }> = ({
  registrationDeskGateway,
}) => {
  const [appState, setAppContext] = useState<AppContextData>(loadAppConfig);
  useEffect(() => { saveAppConfig(appState); }, [appState]);

  useEffect(() => {
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
  }, []);

  useEffect(() => installDeviceCleanup(), []);

  const contextValue = useMemo(() => ({ ...appState, setAppContext }), [appState]);

  return (
    <AppContext.Provider value={contextValue}>
      <TopBar />
      {(appState.serialRestoreError || appState.serialRestoreFailures.length > 0) && (
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
            {appState.serialRestoreError && <span>시리얼 장치 복원 실패: {appState.serialRestoreError}</span>}
            {appState.serialRestoreFailures.map((failure) => (
              <span key={failure.label}><strong>{failure.label}</strong>: {failure.reason}</span>
            ))}
          </Stack>
        </Alert>
      )}
      <Routes>
        <Route path="/" element={<HomePage gateway={registrationDeskGateway} />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppContext.Provider>
  );
};
