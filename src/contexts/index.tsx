import * as React from "react";
import {
  DEFAULT_PERSISTED_APP_STATE,
  loadPersistedAppState,
  savePersistedAppState,
  type PersistedAppState,
} from "../apis/appState";
import type { RestoreFailure } from "../apis/serial";
import { isTauri } from "../utils/platform";
import type { TopBarInfo } from "../schemas/topBar";

export type EphemeralAppState = {
  isTauri: boolean;
  topBarInfo: TopBarInfo | null;
  serialRestoreFailures: RestoreFailure[];
  serialRestoreError: string | null;
};

export type AppContextData = PersistedAppState & EphemeralAppState;

export type AppContextType = AppContextData & {
  setAppContext: React.Dispatch<React.SetStateAction<AppContextData>>;
};

const EPHEMERAL_DEFAULTS: EphemeralAppState = {
  isTauri: isTauri(),
  topBarInfo: null,
  serialRestoreFailures: [],
  serialRestoreError: null,
};

export const INITIAL_APP_CONTEXT: AppContextData = {
  ...DEFAULT_PERSISTED_APP_STATE,
  ...EPHEMERAL_DEFAULTS,
};

export const loadAppConfig = (): AppContextData => ({
  ...INITIAL_APP_CONTEXT,
  ...loadPersistedAppState(),
});

export const saveAppConfig = (context: AppContextData): AppContextData => {
  savePersistedAppState(context);
  return context;
};

export const AppContext = React.createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within an AppContextProvider");

  return context;
};

/** `info` 는 useMemo 로 감싸 넘길 것. */
export const useTopBar = (info: TopBarInfo | null): void => {
  const { setAppContext } = useAppContext();
  React.useEffect(() => {
    setAppContext((prev) => ({ ...prev, topBarInfo: info }));
    return () => setAppContext((prev) => ({ ...prev, topBarInfo: null }));
  }, [setAppContext, info]);
};
