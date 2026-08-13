import { z } from "zod";

const SERVER_CONFIG_STORAGE_KEY = "rosa.server-config";

const serverConfigSchema = z.object({
  server_origin: z.url(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export const normalizeServerOrigin = (value: string): string => {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("서버 주소는 HTTP 또는 HTTPS URL이어야 합니다.");
  }
  if (url.username || url.password) throw new Error("서버 주소에 인증 정보를 포함할 수 없습니다.");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("로컬 개발 서버를 제외한 서버 주소는 HTTPS여야 합니다.");
  }
  return url.origin;
};

export const loadServerConfig = (): ServerConfig | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(SERVER_CONFIG_STORAGE_KEY);
    return stored ? serverConfigSchema.parse(JSON.parse(stored) as unknown) : null;
  } catch {
    return null;
  }
};

export const saveServerConfig = (serverOrigin: string): ServerConfig => {
  const config = serverConfigSchema.parse({ server_origin: normalizeServerOrigin(serverOrigin) });
  localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, JSON.stringify(config));
  return config;
};

export const clearServerConfig = (): void => {
  localStorage.removeItem(SERVER_CONFIG_STORAGE_KEY);
};
