import { useEffect, useMemo, useState, type FC } from "react";
import { Route, Routes } from "react-router";
import { TopBar } from "./components/elements/topbar";
import { AppContext, loadAppConfig, saveAppConfig, type AppContextData } from "./contexts";
import { DebugPage } from "./pages/debug";
import { HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/notFound";

export const App: FC = () => {
  const [appState, setAppContext] = useState<AppContextData>(loadAppConfig);
  useEffect(() => { saveAppConfig(appState); }, [appState]);

  const contextValue = useMemo(() => ({ ...appState, setAppContext }), [appState]);

  return (
    <AppContext.Provider value={contextValue}>
      <TopBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppContext.Provider>
  );
};
