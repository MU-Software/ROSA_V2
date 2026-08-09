import * as React from "react";
import {
  DEFAULT_REGISTRATION_SESSION,
  loadRegistrationSession,
  type RegistrationSession,
} from "../apis/registrationSession";
import type { RestoreFailure } from "../apis/serial";
import { isTauri } from "../utils/platform";
import type { TopBarInfo } from "../schemas/topBar";

export const CONTEXT_LOCAL_STORAGE_KEY = "appContext";

// 필드를 추가하면 PERSISTED_DEFAULTS 를 통해 자동으로 저장·복원된다. 직렬화 가능한 값만.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type PersistedAppState = {
};

export type EphemeralAppState = {
  isTauri: boolean;
  topBarInfo: TopBarInfo | null;
  serialRestoreFailures: RestoreFailure[];
  serialRestoreError: string | null;
};

export type AppContextData = PersistedAppState & EphemeralAppState & RegistrationSession;

export type AppContextType = AppContextData & {
  setAppContext: React.Dispatch<React.SetStateAction<AppContextData>>;
};

const PERSISTED_DEFAULTS: PersistedAppState = {};
const PERSISTED_FIELDS = Object.keys(PERSISTED_DEFAULTS) as (keyof PersistedAppState)[];

const EPHEMERAL_DEFAULTS: EphemeralAppState = {
  isTauri: isTauri(),
  topBarInfo: null,
  serialRestoreFailures: [],
  serialRestoreError: null,
};

export const INITIAL_APP_CONTEXT: AppContextData = {
  ...PERSISTED_DEFAULTS,
  ...EPHEMERAL_DEFAULTS,
  ...DEFAULT_REGISTRATION_SESSION,
};

const loadInitialAppContext = (): AppContextData => ({
  ...INITIAL_APP_CONTEXT,
  ...loadRegistrationSession(),
});

export const loadAppConfig = (): AppContextData => {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CONTEXT_LOCAL_STORAGE_KEY) : null;
  if (!raw) return loadInitialAppContext();

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    // 저장 시점 이후 필드 구성이 바뀌었을 수 있어 화이트리스트만 통과시킨다.
    const restored = PERSISTED_FIELDS.reduce((acc, key) => {
      if (parsed[key] !== undefined) acc[key] = parsed[key];
      return acc;
    }, {} as Partial<PersistedAppState>);
    return { ...loadInitialAppContext(), ...restored };
  } catch (error) {
    console.error("Failed to parse app config from localStorage:", error);
    return loadInitialAppContext();
  }
};

export const saveAppConfig = (context: AppContextData): AppContextData => {
  if (typeof localStorage === "undefined") return context;
  const persisted = PERSISTED_FIELDS.reduce((acc, key) => {
    acc[key] = context[key];
    return acc;
  }, {} as Partial<PersistedAppState>);
  localStorage.setItem(CONTEXT_LOCAL_STORAGE_KEY, JSON.stringify(persisted));
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
