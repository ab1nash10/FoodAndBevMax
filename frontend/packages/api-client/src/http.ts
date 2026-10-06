type QueryValue = boolean | number | string | null | undefined;

export type QueryParams = object;

export interface ApiResponse<TData = unknown> {
  data: TData;
  message?: string;
  success: boolean;
}

export interface ApiListMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface ApiList<TItem> {
  items: TItem[];
  meta: ApiListMeta;
}

export interface ApiErrorBody {
  errors?: unknown[];
  message?: string;
  requestId?: string;
  success?: false;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  onUnauthorized?: () => Promise<void> | void;
  refreshAccessToken?: () => Promise<string | null | undefined>;
  timeoutMs?: number;
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null;
  query?: QueryParams;
  skipAuthRefresh?: boolean;
  timeoutMs?: number;
}

export interface ApiClient {
  request<TResponse>(path: string, init?: ApiRequestInit): Promise<TResponse>;
}

export class ApiClientError extends Error {
  readonly category: string;
  readonly errors?: unknown[];
  readonly payload?: unknown;
  readonly requestId?: string;
  readonly status: number;

  constructor(
    status: number,
    message: string,
    payload?: unknown,
    errors?: unknown[],
    requestId?: string,
    category = 'UNKNOWN_ERROR',
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.category = category;
    this.errors = errors;
    this.payload = payload;
    this.requestId = requestId;
    this.status = status;
  }
}

export type SortOrder = 'asc' | 'desc';

export interface ListQuery {
  isActive?: boolean;
  limit?: number;
  page?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

function appendQuery(path: string, query?: QueryParams): string {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    const queryValue = value as QueryValue;

    if (queryValue !== undefined && queryValue !== null && queryValue !== '') {
      params.set(key, String(queryValue));
    }
  });

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

function getErrorBody(payload: unknown): ApiErrorBody | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  return payload;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isLikelyTechnicalMessage(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return [
    'failed to fetch',
    'internal server error',
    'jwt expired',
    'jwt malformed',
    'invalid token',
    'prisma',
    'nestjs',
    'stack',
    'exception',
  ].some((technicalText) => normalizedMessage.includes(technicalText));
}

function messageWithRequestId(message: string, requestId?: string): string {
  return requestId ? `${message} Request ID: ${requestId}` : message;
}

function getErrorCategory(status: number): string {
  if (status === 0) {
    return 'NETWORK_ERROR';
  }

  if (status === 400) {
    return 'VALIDATION_ERROR';
  }

  if (status === 401) {
    return 'AUTHENTICATION_ERROR';
  }

  if (status === 403) {
    return 'AUTHORIZATION_ERROR';
  }

  if (status === 404) {
    return 'NOT_FOUND_ERROR';
  }

  if (status === 409) {
    return 'DUPLICATE_ERROR';
  }

  if (status === 422) {
    return 'BUSINESS_RULE_ERROR';
  }

  if (status === 429) {
    return 'RATE_LIMIT_ERROR';
  }

  if (status >= 500) {
    return 'SERVER_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

function friendlyErrorMessage(status: number, message?: string, requestId?: string): string {
  const backendMessage = message?.trim();
  const canUseBackendMessage = backendMessage && !isLikelyTechnicalMessage(backendMessage);

  if (status === 0) {
    return 'Unable to connect to AAHAR services. Please check your network and try again.';
  }

  if (status === 400) {
    return canUseBackendMessage
      ? backendMessage
      : 'Unable to save. Please check the required fields.';
  }

  if (status === 401) {
    return canUseBackendMessage ? backendMessage : 'Your session has expired. Please login again.';
  }

  if (status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (status === 404) {
    return canUseBackendMessage ? backendMessage : 'The requested record was not found.';
  }

  if (status === 409) {
    return canUseBackendMessage ? backendMessage : 'This record already exists.';
  }

  if (status === 422) {
    return canUseBackendMessage
      ? backendMessage
      : 'This action cannot be completed because it violates a business rule.';
  }

  if (status === 429) {
    return 'Too many attempts. Please try again after some time.';
  }

  if (status >= 500) {
    return messageWithRequestId(
      'Something went wrong. Please try again. If the issue continues, contact support.',
      requestId,
    );
  }

  return canUseBackendMessage ? backendMessage : 'Something went wrong. Please try again.';
}

function isJsonBody(body: unknown): body is Record<string, unknown> | unknown[] {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isUrlSearchParams =
    typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  const isArrayBuffer = body instanceof ArrayBuffer;

  return !isFormData && !isUrlSearchParams && !isBlob && !isArrayBuffer;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createApiClient({
  baseUrl,
  fetcher = fetch,
  getAccessToken,
  onUnauthorized,
  refreshAccessToken,
  timeoutMs = 20_000,
}: ApiClientOptions): ApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    async request<TResponse>(path: string, init: ApiRequestInit = {}) {
      const {
        body,
        headers: initHeaders,
        query,
        skipAuthRefresh,
        timeoutMs: requestTimeoutMs,
        ...requestInit
      } = init;
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const requestPath = appendQuery(normalizedPath, query);
      const url = `${normalizedBaseUrl}${requestPath}`;

      const buildRequest = (accessToken?: string | null): RequestInit => {
        const headers = new Headers(initHeaders);
        const token = accessToken ?? getAccessToken?.();
        let requestBody: BodyInit | null | undefined;

        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        if (isJsonBody(body)) {
          requestBody = JSON.stringify(body);

          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
        } else {
          requestBody = body as BodyInit | null | undefined;
        }

        return {
          ...requestInit,
          body: requestBody,
          headers,
        };
      };

      const execute = async (accessToken?: string | null) => {
        const controller =
          typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        const timeout = requestTimeoutMs ?? timeoutMs;
        const timeoutId = controller
          ? globalThis.setTimeout(() => controller.abort(), timeout)
          : undefined;

        try {
          return await fetcher(url, {
            ...buildRequest(accessToken),
            signal: controller?.signal ?? requestInit.signal,
          });
        } catch (error) {
          if (isAbortError(error)) {
            throw new ApiClientError(
              0,
              'Unable to connect to AAHAR services. Please check your network and try again.',
              undefined,
              undefined,
              undefined,
              'NETWORK_ERROR',
            );
          }

          throw new ApiClientError(
            0,
            'Unable to connect to AAHAR services. Please check your network and try again.',
            error,
            undefined,
            undefined,
            'NETWORK_ERROR',
          );
        } finally {
          if (timeoutId) {
            globalThis.clearTimeout(timeoutId);
          }
        }
      };

      let response = await execute();
      let payload = await readPayload(response);

      if (response.status === 401 && refreshAccessToken && !skipAuthRefresh) {
        let refreshedAccessToken: string | null | undefined;

        try {
          refreshedAccessToken = await refreshAccessToken();
        } catch (error) {
          // Only a rejected refresh ends the session. A network blip or a 5xx used to sign the
          // user out too, discarding whatever form they were filling in.
          if (
            !(error instanceof ApiClientError) ||
            (error.status !== 401 && error.status !== 403)
          ) {
            throw error;
          }
        }

        if (refreshedAccessToken) {
          response = await execute(refreshedAccessToken);
          payload = await readPayload(response);
        }

        if (response.status === 401) {
          await onUnauthorized?.();
        }
      }

      if (!response.ok) {
        const errorBody = getErrorBody(payload);
        const requestId =
          errorBody?.requestId ??
          response.headers.get('x-request-id') ??
          response.headers.get('x-correlation-id') ??
          undefined;
        const message = friendlyErrorMessage(response.status, errorBody?.message, requestId);

        throw new ApiClientError(
          response.status,
          message,
          payload,
          errorBody?.errors,
          requestId,
          getErrorCategory(response.status),
        );
      }

      return payload as TResponse;
    },
  };
}
