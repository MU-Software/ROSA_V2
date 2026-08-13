import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
  matchQuery,
} from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AppBootstrap } from "./bootstrap";
import { AppErrorBoundary } from "./components/elements/appErrorBoundary";
import { EXTERNAL_DISPLAY_PATH, isExternalDisplayWindow } from "./apis/externalDisplay";

// 라우터가 보기 전에 맞춰야 한다.
if (isExternalDisplayWindow() && window.location.pathname !== EXTERNAL_DISPLAY_PATH) {
  window.history.replaceState(null, "", EXTERNAL_DISPLAY_PATH);
}

const theme = createTheme({});
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onSuccess: async (_data, _variables, _onMutateResult, mutation) => {
      await queryClient.invalidateQueries({
        predicate: (query) => mutation.meta?.invalidates?.some((queryKey) => matchQuery({ queryKey }, query)) ?? false,
      });
    },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <BrowserRouter>
            <AppBootstrap />
          </BrowserRouter>
        </AppErrorBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
