import { useEffect } from "react";
import {
  APP_STATE_STORAGE_KEY,
  DEFAULT_PERSISTED_APP_STATE,
  parsePersistedAppState,
  type PersistedAppState,
} from "../apis/appState";

export const useLocalStorageAppState = (
  onState: (state: PersistedAppState) => void,
): void => {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APP_STATE_STORAGE_KEY) return;

      try {
        const state = event.newValue
          ? parsePersistedAppState(JSON.parse(event.newValue) as unknown)
          : DEFAULT_PERSISTED_APP_STATE;
        onState(state);
      } catch {
        return;
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [onState]);
};
