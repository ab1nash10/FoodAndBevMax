import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

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

export function correlationIdMiddleware(
  request: CorrelatedRequest,
  response: Response,
  next: NextFunction,
) {
  const requestId = normalizeRequestId(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();

  request.requestId = requestId;
  response.locals.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
