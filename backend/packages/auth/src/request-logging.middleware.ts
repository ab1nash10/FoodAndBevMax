import { getRequestContext, logger, runWithRequestContext } from '@aahar/logging';
import type { NextFunction, Request, Response } from 'express';
import { startQueryCount } from './query-log';

/**
 * The path to log, without the query string: it can carry secrets (the order board's ?token=)
 * and people's details (a search for a name or mobile number).
 */
export function loggedPath(request: { originalUrl?: string; url?: string }): string {
  return (request.originalUrl || request.url || '').split('?')[0]!;
}

/** Probes, logged only when they fail. */
const PROBE_PATH = /\/(?:health|metrics)\/?$/;

export function slowRequestMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.SLOW_REQUEST_MS) || 1000;
}

/** info below 400, warn for 4xx and for slow requests, error for 5xx. */
export function accessLogLevel(
  statusCode: number,
  durationMs: number,
  slowMs = slowRequestMs(),
): 'error' | 'info' | 'warn' {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400 || durationMs > slowMs) return 'warn';
  return 'info';
}

/**
 * One `http_request` line per request, at completion, carrying the route template rather than
 * the raw URL. A line per request once cost ~12% CPU as JSON.stringify + console.info; pino
 * writes asynchronously, and LOG_LEVEL=warn drops the info lines before they are built.
 */
export function requestLoggingMiddleware(_serviceName?: string) {
  const slowMs = slowRequestMs();

  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const context = getRequestContext();
    let queryCount: { queries: number } | null = null;

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const { statusCode } = response;
      const level = queryCount ? 'info' : accessLogLevel(statusCode, durationMs, slowMs);

      if (!logger.isLevelEnabled(level)) return;
      const path = loggedPath(request);
      if (statusCode < 400 && PROBE_PATH.test(path)) return;

      const route = context?.route ?? (request.route as { path?: string } | undefined)?.path;
      const length = Number(response.getHeader('content-length'));
      const line = {
        durationMs: Math.round(durationMs * 10) / 10,
        method: request.method,
        // Unmatched requests have no template; their path (without the query) stands in.
        ...(route ? {} : { path }),
        // Only with PRISMA_QUERY_LOG=1 outside production (see query-log.ts).
        ...(queryCount ? { prismaQueries: queryCount.queries } : {}),
        ...(Number.isFinite(length) ? { responseBytes: length } : {}),
        ...(durationMs > slowMs ? { slow: true } : {}),
        statusCode,
      };
      const write = () => logger[level](line, 'http_request');

      if (context) {
        context.route ??= route;
        runWithRequestContext(context, write);
      } else {
        write();
      }
    });

    queryCount = startQueryCount(next);
  };
}
