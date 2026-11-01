import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Who and what the current request is about; read by every log line and audit row. */
export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  /** The route template (`/api/v1/grns/:id`), never the raw URL with ids. */
  route?: string;
  userId?: string;
  roles?: string[];
  /** The hospital the request acts in, when it names one or the caller has only one. */
  hospitalId?: string;
  /** The hospitals the caller may act in; null means every hospital (Super Admin). */
  locationIds?: string[] | null;
  /** A store or kitchen the request names. */
  locationId?: string;
  source?: 'api' | 'job' | 'system';
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

/**
 * Adds what is learned later in the request (route, user, hospital) to its context. The store is
 * one object per request, so guards can fill it in without re-entering the storage, which would
 * not survive back into the caller (see hospital-scope.interceptor.ts). Outside a request it does
 * nothing.
 */
export function setRequestContext(fields: Partial<RequestContext>): void {
  const store = requestContextStorage.getStore();

  if (store) {
    Object.assign(store, fields);
  }
}

export const REQUEST_ID_HEADER = 'x-request-id';

export interface CorrelatedRequest extends Request {
  requestId?: string;
}

// The id is client-supplied and echoed into every log line and a response header, so only a
// short token-like value is kept; anything else gets a fresh id.
const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

function normalizeRequestId(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;

  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : undefined;
}

export function getRequestId(request: Partial<CorrelatedRequest>): string | undefined {
  return request.requestId ?? normalizeRequestId(request.headers?.[REQUEST_ID_HEADER]);
}

/**
 * Reuses the caller's X-Request-Id (or makes one), echoes it in the response, and runs the rest
 * of the request inside its RequestContext.
 */
export function requestContextMiddleware(
  request: CorrelatedRequest,
  response: Response,
  next: NextFunction,
) {
  const requestId = normalizeRequestId(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

  request.requestId = requestId;
  response.locals.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestContext(
    {
      ip: request.ip,
      requestId,
      source: 'api',
      userAgent: request.headers['user-agent']?.slice(0, 256),
    },
    next,
  );
}
