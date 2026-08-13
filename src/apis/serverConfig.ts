import { z } from "zod";

const SERVER_CONFIG_STORAGE_KEY = "rosa.server-config";

const serverConfigSchema = z.object({
  server_origin: z.url(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

const PRIVATE_IPV4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
];

const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "[::1]") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host));
};

export const normalizeServerOrigin = (value: string): string => {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("서버 주소는 HTTP 또는 HTTPS URL이어야 합니다.");
  }
  if (url.username || url.password) throw new Error("서버 주소에 인증 정보를 포함할 수 없습니다.");
  if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
    throw new Error("HTTPS가 아닌 주소는 사설망에서만 쓸 수 있습니다.");
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
