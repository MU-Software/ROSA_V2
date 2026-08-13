import { isTauri } from "../utils/platform";

export type HttpTransport = {
  fetch: typeof globalThis.fetch;
  native: boolean;
};

let transportPromise: Promise<HttpTransport> | undefined;

export const getHttpTransport = (): Promise<HttpTransport> => {
  transportPromise ??= isTauri()
    ? import("@tauri-apps/plugin-http").then(({ fetch }) => ({ fetch, native: true }))
    : Promise.resolve({ fetch: globalThis.fetch.bind(globalThis), native: false });
  return transportPromise;
};
