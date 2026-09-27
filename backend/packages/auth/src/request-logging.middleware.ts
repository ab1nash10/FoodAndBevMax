import type { NextFunction, Request, Response } from 'express';
import { getRequestId, type CorrelatedRequest } from './correlation-id.middleware';

export function requestLoggingMiddleware(serviceName: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = request.originalUrl || request.url;

      console.info(
        JSON.stringify({
          durationMs: Math.round(durationMs),
          event: 'http_request',
          method: request.method,
          path,
          requestId: getRequestId(request as CorrelatedRequest),
          service: serviceName,
          statusCode: response.statusCode,
        }),
      );
    });

    next();
  };
}
