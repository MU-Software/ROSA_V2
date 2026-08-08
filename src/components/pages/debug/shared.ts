import { useCallback, useEffect, useState } from "react";
import { toMessage } from "../../../utils/bytes";

export const hex = (value?: number): string => (value === undefined ? "?" : `0x${value.toString(16).padStart(4, "0")}`);

export function useRefreshable<T>(load: () => Promise<T>, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // loading 을 상태로 두고 효과 안에서 동기로 setState 하면 렌더가 연쇄된다.
  const [settled, setSettled] = useState(-1);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then(
        (next) => { if (!cancelled) { setValue(next); setError(null); } },
        (err: unknown) => { if (!cancelled) setError(toMessage(err)); },
      )
      .finally(() => { if (!cancelled) setSettled(nonce); });
    return () => { cancelled = true; };
  }, [load, nonce]);

  return { value, error, loading: settled !== nonce, refresh };
}
