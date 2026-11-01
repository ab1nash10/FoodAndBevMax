import pino, { type DestinationStream, type Logger } from 'pino';
import { getRequestContext } from './context';
import { censor, REDACT_PATHS } from './redact';

let serviceName = process.env.SERVICE_NAME ?? 'aahar';

/** Names the service on every line; called once at bootstrap. */
export function setServiceName(name: string): void {
  serviceName = name;
}

export function defaultLogLevel(env: NodeJS.ProcessEnv = process.env): string {
  return env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug');
}

/** The request fields every line carries, read from the current RequestContext. */
function contextFields() {
  const context = getRequestContext();

  return context
    ? {
        hospitalId: context.hospitalId,
        locationId: context.locationId,
        requestId: context.requestId,
        route: context.route,
        service: serviceName,
        userId: context.userId,
      }
    : { service: serviceName };
}

/**
 * The JSON logger: time, level, service, env, version and the request's ids on every line, with
 * secrets redacted. Pretty-printed only in development (LOG_PRETTY=0 keeps JSON there too); in
 * every other environment it writes asynchronously to stdout, which Fluent Bit ships.
 */
export function createLogger(destination?: DestinationStream): Logger {
  const pretty =
    !destination && process.env.NODE_ENV === 'development' && process.env.LOG_PRETTY !== '0';
  const options: pino.LoggerOptions = {
    base: {
      env: process.env.APP_ENV || process.env.NODE_ENV || 'development',
      version: process.env.GIT_SHA || 'dev',
    },
    formatters: { level: (label) => ({ level: label }) },
    level: defaultLogLevel(),
    mixin: contextFields,
    redact: { censor, paths: REDACT_PATHS },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (pretty) {
    return pino({
      ...options,
      transport: { options: { singleLine: true }, target: 'pino-pretty' },
    });
  }

  return pino(options, destination ?? pino.destination({ sync: false }));
}

export const logger = createLogger();

let handlersInstalled = false;

/** Logs an uncaught exception or unhandled rejection as fatal, flushes, and exits with 1. */
export function installProcessHandlers(log: Logger = logger): void {
  if (handlersInstalled) {
    return;
  }

  handlersInstalled = true;
  const exitAfterLogging = (event: string) => (error: unknown) => {
    log.fatal({ err: error }, event);
    const exit = () => process.exit(1);
    setTimeout(exit, 1000).unref();
    log.flush(exit);
  };

  process.on('uncaughtException', exitAfterLogging('uncaught_exception'));
  process.on('unhandledRejection', exitAfterLogging('unhandled_rejection'));
}
