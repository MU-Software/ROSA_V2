import { isTauri } from "../utils/platform";

export type HttpTransport = {
  fetch: typeof globalThis.fetch;
  native: boolean;
};

export const cookieValue = (cookieHeader: string, name: string): string | undefined => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = new RegExp(`(?:^|[,;]\\s*)${escaped}=([^;,]+)`).exec(cookieHeader)?.[1];
  return value ? decodeURIComponent(value) : undefined;
};

let transportPromise: Promise<HttpTransport> | undefined;

export const getHttpTransport = (): Promise<HttpTransport> => {
  transportPromise ??= isTauri()
    ? import("@tauri-apps/plugin-http").then(({ fetch }) => ({ fetch, native: true }))
    : Promise.resolve({ fetch: globalThis.fetch.bind(globalThis), native: false });
  return transportPromise;
};
