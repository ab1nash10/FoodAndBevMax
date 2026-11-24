import 'reflect-metadata';
import tls from 'node:tls';
import { configureSecurityBaseline } from '@aahar/auth';
import { installProcessHandlers } from '@aahar/logging';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { encryptStoredSecrets } from './common/field-crypto';
import { PrismaService } from './common/prisma/prisma.service';
import { isImport, isJson } from './body-limits';

// Payment providers are called over HTTPS. Trust the computer's own certificate store too, not only
// Node's bundled list: on Max's network a proxy re-signs some sites (Pine Labs' Plutus, seen
// 2026-10-28) with Max's own root, which Windows trusts and Node alone does not.
tls.setDefaultCACertificates([
  ...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')]),
]);

// A crash is logged as one fatal JSON line before the process exits.
installProcessHandlers();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  // A spreadsheet import sends up to 1,000 rows in one request, past Express's 100 KB default,
  // and so can an ERP GRN with many batches.
  // Only those routes get 2 MB: bodies are parsed before the JWT guard runs, so a
  // global limit would let anyone make any route parse 2 MB. Each parser skips what it doesn't
  // own (its `type`), and the first to parse a request wins.
  app.useBodyParser('json', { limit: '2mb', type: (req) => isJson(req) && isImport(req) });
  app.useBodyParser('json', { limit: '100kb', type: (req) => isJson(req) && !isImport(req) });
  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 4003);
  // Unset = Node's default: every address, IPv6 and IPv4. Binding 0.0.0.0 alone made each new
  // connection to localhost wait ~0.2 s on Windows while ::1 was tried first.
  const host = process.env.HOST || undefined;

  configureSecurityBaseline(app, config, {
    serviceName: 'organization-service',
    swaggerDescription: 'Organization hierarchy foundation service.',
    swaggerTitle: 'AAHAR Organization Service',
  });

  // Secrets saved before FIELD_ENCRYPTION_KEY was set are sealed before any request reads them.
  await encryptStoredSecrets(app.get(PrismaService));
  await (host ? app.listen(port, host) : app.listen(port));
}

void bootstrap();
