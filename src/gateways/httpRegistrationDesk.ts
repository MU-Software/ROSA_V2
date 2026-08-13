import { z } from "zod";
import { cookieValue, type HttpTransport } from "../adapters/http";
import type { ResolvedRosaDiscovery } from "../apis/rosaDiscovery";
import { orderSchema } from "../schemas/order";
import {
  paginatedOrderSchema,
  paginatedRegistrationDeskOrderProductSchema,
  registrationDeskConfigurationSchema,
  registrationDeskSessionSchema,
  registrationDeskStatisticsSchema,
} from "../schemas/registrationDesk";
import type {
  ListOrderProductsParams,
  ModifyOrderProductRequest,
  PaginatedResponse,
  RefundOrderProductRequest,
  RefundOrderRequest,
  RegistrationDeskConfiguration,
  RegistrationDeskGateway,
  RegistrationDeskOrderProduct,
  RegistrationDeskSession,
  RegistrationDeskStatistics,
  SearchOrdersParams,
} from "./registrationDesk";
import type { Order } from "../domain";

type RouteKey = keyof ResolvedRosaDiscovery["discovery"]["routes"];

const queryString = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  return search.toString();
};

const errorDetail = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(errorDetail).find(Boolean);
  if (value && typeof value === "object") {
    const values = value as Record<string, unknown>;
    for (const key of ["detail", "message", "errors"]) {
      const detail = errorDetail(values[key]);
      if (detail) return detail;
    }
    for (const [key, item] of Object.entries(values)) {
      if (["code", "param", "type", "status"].includes(key)) continue;
      const detail = errorDetail(item);
      if (detail) return detail;
    }
  }
  return undefined;
};

export class RegistrationDeskHttpError extends Error {
  readonly name = "RegistrationDeskHttpError";
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(errorDetail(body) ?? `등록 데스크 API 요청에 실패했습니다. (HTTP ${status})`);
    this.status = status;
    this.body = body;
  }
}

export class HttpRegistrationDeskGateway implements RegistrationDeskGateway {
  private csrfToken: string | undefined;
  private authenticationRequiredHandler: (() => void) | null = null;
  private readonly resolved: ResolvedRosaDiscovery;
  private readonly transport: HttpTransport;

  constructor(resolved: ResolvedRosaDiscovery, transport: HttpTransport) {
    this.resolved = resolved;
    this.transport = transport;
  }

  setAuthenticationRequiredHandler(handler: (() => void) | null): void {
    this.authenticationRequiredHandler = handler;
  }

  private routeUrl(routeKey: RouteKey, id?: string): URL {
    const path = this.resolved.discovery.routes[routeKey].path;
    return new URL(id ? path.replace("{id}", encodeURIComponent(id)) : path, this.resolved.api_base_url);
  }

  private captureCsrf(response: Response): void {
    if (!this.transport.native) return;
    const cookieName = this.resolved.discovery.authentication.csrf.cookie_name;
    const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
    for (const value of values) this.csrfToken = cookieValue(value, cookieName) ?? this.csrfToken;
  }

  private browserCsrfToken(): string | undefined {
    if (this.transport.native || typeof document === "undefined") return undefined;
    return cookieValue(document.cookie, this.resolved.discovery.authentication.csrf.cookie_name);
  }

  private async responseError(response: Response): Promise<RegistrationDeskHttpError> {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    if (response.status === 401 || response.status === 403) {
      this.authenticationRequiredHandler?.();
    }
    return new RegistrationDeskHttpError(response.status, body);
  }

  private async ensureCsrfToken(): Promise<string> {
    const csrfToken = this.browserCsrfToken() ?? this.csrfToken;
    if (csrfToken) return csrfToken;

    const response = await this.transport.fetch(
      new URL(this.resolved.discovery.authentication.session_url, this.resolved.server_origin),
      { credentials: "include" },
    );
    this.captureCsrf(response);
    if (!response.ok) throw await this.responseError(response);

    const initializedToken = this.browserCsrfToken() ?? this.csrfToken;
    if (!initializedToken) throw new Error("서버에서 CSRF 토큰을 받지 못했습니다.");
    return initializedToken;
  }

  private async request<T>(
    url: URL,
    schema: z.ZodType<T> | null,
    init: RequestInit = {},
    acceptedStatuses: readonly number[] = [],
  ): Promise<T> {
    const method = init.method?.toUpperCase() ?? "GET";
    const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(method);
    const csrfToken = isSafeMethod ? undefined : await this.ensureCsrfToken();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Accept-Language", "ko");
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.transport.native && !isSafeMethod) {
      headers.set("Origin", this.resolved.server_origin);
    }
    if (csrfToken) {
      headers.set(this.resolved.discovery.authentication.csrf.header_name, csrfToken);
    }
    const response = await this.transport.fetch(url, {
      ...init,
      credentials: "include",
      headers,
    });
    this.captureCsrf(response);
    if (!response.ok && !acceptedStatuses.includes(response.status)) {
      throw await this.responseError(response);
    }
    if (!schema) return undefined as T;
    return schema.parse(await response.json());
  }

  getSession(): Promise<RegistrationDeskSession> {
    const url = new URL(
      this.resolved.discovery.authentication.session_url,
      this.resolved.server_origin,
    );
    return this.request(url, registrationDeskSessionSchema);
  }

  async login(email: string, password: string): Promise<RegistrationDeskSession> {
    const login = this.resolved.discovery.authentication.login;
    const url = new URL(login.url, this.resolved.server_origin);
    await this.request(url, z.unknown(), {
      method: login.method,
      body: JSON.stringify({
        [login.identifier_field]: email,
        [login.password_field]: password,
      }),
    });
    return this.getSession();
  }

  logout(): Promise<void> {
    const authentication = this.resolved.discovery.authentication;
    const url = new URL(authentication.logout_url, this.resolved.server_origin);
    return this.request(url, null, { method: authentication.logout_method }, [401]);
  }

  searchOrders(params: SearchOrdersParams): Promise<PaginatedResponse<Order>> {
    const url = this.routeUrl("list_orders");
    url.search = queryString(params);
    return this.request(url, paginatedOrderSchema);
  }

  listOrderProducts(
    params: ListOrderProductsParams,
  ): Promise<PaginatedResponse<RegistrationDeskOrderProduct>> {
    const url = this.routeUrl("list_order_products");
    url.search = queryString(params);
    return this.request(url, paginatedRegistrationDeskOrderProductSchema);
  }

  modifyOrderProduct(request: ModifyOrderProductRequest): Promise<Order> {
    const url = this.routeUrl("modify_order", request.order_id);
    const product = {
      id: request.order_product_relation_id,
      ...(request.status === undefined ? {} : { status: request.status }),
      ...(request.options === undefined ? {} : { options: request.options }),
      ...(request.ticket_info === undefined ? {} : { ticket_info: request.ticket_info }),
    };
    return this.request(url, orderSchema, {
      method: "PATCH",
      body: JSON.stringify({ products: [product] }),
    });
  }

  refundOrder(request: RefundOrderRequest): Promise<void> {
    const url = this.routeUrl("refund_order", request.order_id);
    return this.request(url, null, { method: "DELETE" });
  }

  refundOrderProduct(request: RefundOrderProductRequest): Promise<void> {
    const url = this.routeUrl("refund_order_product", request.order_product_relation_id);
    return this.request(url, null, { method: "DELETE" });
  }

  getConfiguration(): Promise<RegistrationDeskConfiguration> {
    return this.request(this.routeUrl("retrieve_configuration"), registrationDeskConfigurationSchema)
      .then((configuration) => ({
        ...configuration,
        event: {
          ...configuration.event,
          logo_url: configuration.event.logo_url
            ? new URL(configuration.event.logo_url, this.resolved.server_origin).href
            : null,
        },
      }));
  }

  getStatistics(): Promise<RegistrationDeskStatistics> {
    return this.request(this.routeUrl("retrieve_statistics"), registrationDeskStatisticsSchema);
  }
}
