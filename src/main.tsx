import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { StrictMode, useEffect, useState, type FC } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { TopBar } from "./components/elements/topbar";
import { AppContext, loadAppConfig, saveAppConfig, type AppContextData } from "./contexts";
import { DebugPage } from "./pages/debug";

const theme = createTheme({});

const App: FC = () => {
  const [appState, setAppContext] = useState<AppContextData>(loadAppConfig());
  useEffect(() => { saveAppConfig(appState) }, [appState]);

  return (
    <AppContext.Provider value={{ ...appState, setAppContext }}>
      <TopBar />
      <Routes>
        <Route path="/" element={<></>} />
        <Route path="/debug" element={<DebugPage />} />
      </Routes>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
