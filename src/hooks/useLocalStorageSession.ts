import { useEffect } from "react";
import {
  DEFAULT_REGISTRATION_SESSION,
  parseRegistrationSession,
  REGISTRATION_SESSION_STORAGE_KEY,
  type RegistrationSession,
} from "../apis/registrationSession";

export const useLocalStorageSession = (onSession: (session: RegistrationSession) => void): void => {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== REGISTRATION_SESSION_STORAGE_KEY) return;

      try {
        const session = event.newValue
          ? parseRegistrationSession(JSON.parse(event.newValue) as unknown)
          : DEFAULT_REGISTRATION_SESSION;
        onSession(session);
      } catch {
        return;
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [onSession]);
};
