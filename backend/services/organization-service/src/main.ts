import 'reflect-metadata';
import { configureSecurityBaseline } from '@aahar/auth';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 4003);
  const host = process.env.HOST ?? '0.0.0.0';

  configureSecurityBaseline(app, config, {
    serviceName: 'organization-service',
    swaggerDescription: 'Organization hierarchy foundation service.',
    swaggerTitle: 'AAHAR Organization Service',
  });

  await app.listen(port, host);
}

void bootstrap();
