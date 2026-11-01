import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { logger } from '@aahar/logging';
import type { Request, Response } from 'express';
import { getRequestId, type CorrelatedRequest } from './correlation-id.middleware';
import { uniqueViolationTarget } from './prisma-adapter';
import { loggedPath } from './request-logging.middleware';

interface ErrorResponseBody {
  error?: string;
  errors?: unknown[];
  message?: string | string[];
}

/**
 * body-parser's errors (from "http-errors") are not HttpExceptions; a client error among them,
 * such as 413 for a body over the size limit, carries `expose: true` and a safe message.
 */
function isExposedHttpError(
  exception: unknown,
): exception is Error & { expose: true; statusCode: number } {
  const error = exception as { expose?: unknown; status?: unknown; statusCode?: unknown };

  return (
    exception instanceof Error &&
    error.expose === true &&
    typeof error.statusCode === 'number' &&
    error.status === error.statusCode
  );
}

const DATABASE_UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1017']);

/** The Prisma error code, matched by name: the services and this package load separate clients. */
function prismaCode(exception: unknown): string | undefined {
  const error = exception as { code?: unknown; name?: unknown };

  return exception instanceof Error &&
    error.name === 'PrismaClientKnownRequestError' &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function isDatabaseUnreachable(exception: unknown): boolean {
  return DATABASE_UNREACHABLE_CODES.has(prismaCode(exception) ?? '');
}

/**
 * Constraint errors a service did not turn into its own message: a clear 404/409 instead of a
 * 500, naming only the column(s), never the values.
 */
function prismaClientError(exception: unknown): { message: string; statusCode: number } | null {
  switch (prismaCode(exception)) {
    case 'P2002': {
      const target = uniqueViolationTarget((exception as { meta?: Record<string, unknown> }).meta);
      return {
        message: target
          ? `A record with this ${target} already exists`
          : 'This record already exists',
        statusCode: HttpStatus.CONFLICT,
      };
    }
    case 'P2025':
      return { message: 'Record not found', statusCode: HttpStatus.NOT_FOUND };
    case 'P2003':
      return {
        message: 'A linked record is missing or still in use',
        statusCode: HttpStatus.CONFLICT,
      };
    default:
      return null;
  }
}

function normalizeException(exception: unknown): {
  errors: unknown[];
  message: string;
  statusCode: number;
} {
  if (isExposedHttpError(exception)) {
    return {
      errors: [],
      message: exception.message,
      statusCode: exception.statusCode,
    };
  }

  // node-postgres's pool, when every connection stayed busy past connect_timeout: the service is
  // overloaded, not broken, and a retry a moment later usually works.
  if (
    exception instanceof Error &&
    exception.message === 'timeout exceeded when trying to connect'
  ) {
    return {
      errors: [],
      message: 'The server is busy right now. Please try again in a moment.',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    };
  }

  // Prisma cannot reach the database, timed out reaching it, or lost the connection (Postgres
  // restarting): a short outage, so ask for a retry instead of a bare 500.
  if (isDatabaseUnreachable(exception)) {
    return {
      errors: [],
      message: 'The server is briefly unavailable. Please try again in a minute.',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    };
  }

  const prismaError = prismaClientError(exception);

  if (prismaError) {
    return { errors: [], ...prismaError };
  }

  if (!(exception instanceof HttpException)) {
    return {
      errors: [],
      message: 'Internal Server Error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  const response = exception.getResponse();
  const statusCode = exception.getStatus();

  if (typeof response === 'string') {
    return {
      errors: [],
      message: response,
      statusCode,
    };
  }

  const body = response as ErrorResponseBody;
  const message = Array.isArray(body.message)
    ? body.message.join(', ')
    : (body.message ?? body.error ?? exception.message);

  return {
    errors: body.errors ?? (Array.isArray(body.message) ? body.message : []),
    message,
    statusCode,
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>() as CorrelatedRequest;
    const response = context.getResponse<Response>();
    const { errors, message, statusCode } = normalizeException(exception);
    const requestId = getRequestId(request);

    const details = {
      errorName: exception instanceof Error ? exception.name : 'UnknownError',
      method: request.method,
      path: loggedPath(request),
      statusCode,
    };

    // 5xx: the server's fault, logged with the stack. 4xx: the caller's, a warning without one.
    // Either way the client gets only the message and the requestId to quote to support.
    if (statusCode >= 500) {
      logger.error({ ...details, err: exception }, 'http_exception');
    } else {
      logger.warn(
        { ...details, reason: exception instanceof Error ? exception.message : message },
        'http_exception',
      );
    }

    response.status(statusCode).json({
      errors,
      message,
      requestId,
      success: false,
      timestamp: new Date().toISOString(),
    });
  }
}
