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
import { App } from "./app";
import { AppErrorBoundary } from "./components/elements/appErrorBoundary";
import type { RegistrationDeskGateway } from "./gateways";

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

type LocalMockModule = {
  MockRegistrationDeskGateway: new () => RegistrationDeskGateway;
};

const loadRegistrationDeskGateway = async (): Promise<RegistrationDeskGateway | null> => {
  if (!import.meta.env.DEV) return null;

  try {
    const modulePath = "./mocks/index.ts";
    const localMock = await import(/* @vite-ignore */ modulePath) as LocalMockModule;
    return new localMock.MockRegistrationDeskGateway();
  } catch {
    return null;
  }
};

void loadRegistrationDeskGateway().then((registrationDeskGateway) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <AppErrorBoundary>
            <BrowserRouter>
              <App registrationDeskGateway={registrationDeskGateway} />
            </BrowserRouter>
          </AppErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
});
