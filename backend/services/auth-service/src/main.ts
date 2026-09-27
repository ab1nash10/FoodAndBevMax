import 'reflect-metadata';
import { configureSecurityBaseline } from '@aahar/auth';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 4001);
  const host = process.env.HOST ?? '0.0.0.0';

  configureSecurityBaseline(app, config, {
    serviceName: 'auth-service',
    swaggerDescription: 'Authentication, JWT, and RBAC foundation service.',
    swaggerTitle: 'AAHAR Auth Service',
  });

  await app.listen(port, host);
}

void bootstrap();
