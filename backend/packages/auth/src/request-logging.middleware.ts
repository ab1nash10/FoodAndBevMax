import type { NextFunction, Request, Response } from 'express';
import { getRequestId, type CorrelatedRequest } from './correlation-id.middleware';
import { startQueryCount } from './query-log';

export function requestLoggingMiddleware(serviceName: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    let queryCount: { queries: number } | null = null;

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = request.originalUrl || request.url;

      console.info(
        JSON.stringify({
          durationMs: Math.round(durationMs),
          event: 'http_request',
          method: request.method,
          path,
          // Only with PRISMA_QUERY_LOG=1 outside production (see query-log.ts).
          ...(queryCount ? { prismaQueries: queryCount.queries } : {}),
          requestId: getRequestId(request as CorrelatedRequest),
          service: serviceName,
          statusCode: response.statusCode,
        }),
      );
    });

    queryCount = startQueryCount(next);
  };
}
