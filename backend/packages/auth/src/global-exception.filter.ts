import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestId, type CorrelatedRequest } from './correlation-id.middleware';

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

    console.error(
      JSON.stringify({
        errorName: exception instanceof Error ? exception.name : 'UnknownError',
        event: 'http_exception',
        message: exception instanceof Error ? exception.message : message,
        method: request.method,
        path: request.originalUrl || request.url,
        requestId,
        statusCode,
      }),
    );

    response.status(statusCode).json({
      errors,
      message,
      requestId,
      success: false,
      timestamp: new Date().toISOString(),
    });
  }
}
