import * as React from "react";
import { useLocalStorage } from "react-use";
import { isTauri } from "../adapters";
import type { TopBarInfo } from "../schemas/topBar";

export const CONTEXT_LOCAL_STORAGE_KEY = "appContext";
const JSONIFY_TARGET_FIELDS: string[] = [];

export type AppContextType = {
  isTauri: boolean;
  topBarInfo: TopBarInfo | null;

  setAppContext: React.Dispatch<React.SetStateAction<Omit<AppContextType, "setAppContext">>>;
};
export type AppContextData = Omit<AppContextType, "setAppContext">

export const INITIAL_APP_CONTEXT: AppContextData = {
  isTauri: isTauri(),
  topBarInfo: null,
};

export const loadAppConfig = (): AppContextData => {
  const config = localStorage.getItem(CONTEXT_LOCAL_STORAGE_KEY);
  if (!config) return INITIAL_APP_CONTEXT;

  try {
    return { ...INITIAL_APP_CONTEXT, ...JSON.parse(config) } as AppContextData;
  } catch (error) {
    console.error("Failed to parse app config from localStorage:", error);
    return INITIAL_APP_CONTEXT;
  }
};

export const saveAppConfig = (context: AppContextData): AppContextData => {
  const filteredContext = Object.entries(context)
    .filter(([key]) => JSONIFY_TARGET_FIELDS.includes(key))
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as Record<string, unknown>);
  localStorage.setItem(CONTEXT_LOCAL_STORAGE_KEY, JSON.stringify(filteredContext));
  return context;
};

export const useAppContextStorage = () => useLocalStorage<AppContextData>(CONTEXT_LOCAL_STORAGE_KEY);

export const AppContext = React.createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within an AppContextProvider");

  return context;
};
