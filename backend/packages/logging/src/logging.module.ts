import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { logger } from './logger';

/**
 * nestjs-pino over the shared logger, so Nest's own lines and every `new Logger()` come out as
 * the same JSON. Request lines are written by the access-log middleware (requestLoggingMiddleware
 * in @aahar/auth) and the request ids come from RequestContext, so pino-http here logs nothing
 * and binds nothing of its own (an undefined id adds no field).
 */
export const LoggingModule = LoggerModule.forRoot({
  pinoHttp: {
    autoLogging: false,
    genReqId: (() => undefined) as unknown as (request: IncomingMessage) => string,
    logger,
    quietReqLogger: true,
  },
});
