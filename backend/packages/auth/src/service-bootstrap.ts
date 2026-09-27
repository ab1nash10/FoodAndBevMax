import type { IncomingMessage, ServerResponse } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { correlationIdMiddleware } from './correlation-id.middleware';
import { GlobalExceptionFilter } from './global-exception.filter';
import { requestLoggingMiddleware } from './request-logging.middleware';

export interface SecurityBaselineOptions {
  swaggerDescription: string;
  swaggerTitle: string;
  serviceName: string;
}

const localDevelopmentCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://172.25.208.1:3000',
  'http://172.29.132.245:3000',
  'http://localhost:4001',
  'http://localhost:4002',
  'http://localhost:4003',
];

function parseAllowedOrigins(config: ConfigService): string[] {
  const configuredOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (config.get<string>('NODE_ENV') !== 'development') {
    return configuredOrigins;
  }

  return [...new Set([...configuredOrigins, ...localDevelopmentCorsOrigins])];
}

export function configureSecurityBaseline(
  app: INestApplication,
  config: ConfigService,
  options: SecurityBaselineOptions,
): void {
  const allowedOrigins = parseAllowedOrigins(config);

  // The services sit behind exactly one proxy (the ALB, or nginx locally). Without this,
  // request.ip is the proxy's address, so the throttler put every client in one bucket: five
  // send-otp calls a minute from anyone locked OTP sign-in for everyone. One hop means the
  // address the proxy itself appended, not the client-written left end of X-Forwarded-For.
  (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
    'trust proxy',
    1,
  );

  app.use(
    helmet({
      contentSecurityPolicy: config.get<string>('NODE_ENV') === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
      hsts: {
        includeSubDomains: true,
        maxAge: 15_552_000,
      },
    }),
  );
  app.enableCors({
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // No CORS headers is how a browser is refused; an Error here surfaced as a 500.
      callback(null, false);
    },
  });
  // Liveness at the root, ahead of the logging middleware so the probes stay out of the
  // logs. An ALB target group health-checks `/` unless it is explicitly told otherwise, and
  // under a routing prefix nothing is mapped there - the pod then answers 404 to every
  // probe, is marked unhealthy and receives no traffic, while filling the log with
  // "Cannot GET /".
  //
  // This reports only that the process is up. Readiness must keep using
  // <prefix>/api/v1/health, which also probes the database; using this one for readiness
  // would put a pod into rotation that cannot reach its dependencies.
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    // Health checkers sometimes append a cache-buster, so compare the path, not the URL.
    const path = (request.url ?? '').split('?')[0];

    if (path !== '/' || (request.method !== 'GET' && request.method !== 'HEAD')) {
      next();
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ service: options.serviceName, status: 'ok' }));
  });
  app.use(correlationIdMiddleware);
  app.use(requestLoggingMiddleware(options.serviceName));
  app.useGlobalFilters(new GlobalExceptionFilter());
  // BASE_PATH lets the whole API sit under a routing prefix, e.g. BASE_PATH=/fandb serves
  // /fandb/api/v1/... An AWS ALB cannot rewrite paths the way an NGINX ingress can, so when
  // the load balancer routes on a prefix the service has to answer on that prefix itself.
  const basePath = (config.get<string>('BASE_PATH') ?? '').replace(/^\/+|\/+$/g, '');

  app.setGlobalPrefix(basePath ? `${basePath}/api/v1` : 'api/v1');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  // The docs map every endpoint and DTO, so production serves them only when asked to.
  const swaggerEnabled =
    config.get<boolean>('SWAGGER_ENABLED') ?? config.get<string>('NODE_ENV') !== 'production';

  if (!swaggerEnabled) {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle(options.swaggerTitle)
    .setDescription(options.swaggerDescription)
    .setVersion('1.0')
    .addBearerAuth(
      {
        bearerFormat: 'JWT',
        scheme: 'bearer',
        type: 'http',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(basePath ? `${basePath}/api/docs` : 'api/docs', app, document);
}
