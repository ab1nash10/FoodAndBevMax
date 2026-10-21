import 'reflect-metadata';
import { configureSecurityBaseline } from '@aahar/auth';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 4001);
  // Unset = Node's default: every address, IPv6 and IPv4. Binding 0.0.0.0 alone made each new
  // connection to localhost wait ~0.2 s on Windows while ::1 was tried first.
  const host = process.env.HOST || undefined;

  configureSecurityBaseline(app, config, {
    serviceName: 'auth-service',
    swaggerDescription: 'Authentication, JWT, and RBAC foundation service.',
    swaggerTitle: 'AAHAR Auth Service',
  });

  await (host ? app.listen(port, host) : app.listen(port));
}

void bootstrap();
