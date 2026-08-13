import { getHttpTransport } from "../adapters/http";
import { rosaDiscoverySchema } from "../schemas/registrationDesk";
import { HttpRegistrationDeskGateway } from "../gateways/httpRegistrationDesk";
import { normalizeServerOrigin } from "./serverConfig";

export type RosaDiscovery = ReturnType<typeof rosaDiscoverySchema.parse>;

export type ResolvedRosaDiscovery = {
  server_origin: string;
  api_base_url: string;
  discovery: RosaDiscovery;
};

export type RosaConnection = {
  resolved: ResolvedRosaDiscovery;
  gateway: HttpRegistrationDeskGateway;
};

export const discoverRosa = async (serverUrl: string): Promise<ResolvedRosaDiscovery> => {
  const serverOrigin = normalizeServerOrigin(serverUrl);
  const transport = await getHttpTransport();
  const response = await transport.fetch(new URL("/.well-known/rosa", serverOrigin), {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`ROSA discovery 조회에 실패했습니다. (HTTP ${response.status})`);
  const discovery = rosaDiscoverySchema.parse(await response.json());
  const major = Number(discovery.schema_version.split(".")[0]);
  if (major !== 1) throw new Error(`지원하지 않는 ROSA discovery 버전입니다: ${discovery.schema_version}`);
  const apiBaseUrl = new URL(discovery.api.base_url, serverOrigin);
  if (!apiBaseUrl.pathname.endsWith("/")) apiBaseUrl.pathname += "/";

  return {
    server_origin: serverOrigin,
    api_base_url: apiBaseUrl.href,
    discovery,
  };
};

export const connectRosa = async (serverUrl: string): Promise<RosaConnection> => {
  const resolved = await discoverRosa(serverUrl);
  return {
    resolved,
    gateway: new HttpRegistrationDeskGateway(resolved, await getHttpTransport()),
  };
};

export const createHttpRegistrationDeskGateway = async (
  serverUrl: string,
): Promise<HttpRegistrationDeskGateway> => (await connectRosa(serverUrl)).gateway;
