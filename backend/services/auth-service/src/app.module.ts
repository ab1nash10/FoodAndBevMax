import {
  AUTH_PRISMA,
  AccessResolver,
  AuditLoggerService,
  createThrottlerStorage,
  HealthCheckService,
  JwtAuthGuard,
  JwtStrategy,
  RbacGuard,
} from '@aahar/auth';
import {
  getServiceEnvFilePaths,
  shouldUseRootEnvFileOnly,
  validateServiceEnvWithPort,
} from '@aahar/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { PrismaService } from './common/prisma/prisma.service';
import { HealthController } from './health.controller';

type JwtExpiresIn = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

@Module({
  controllers: [HealthController],
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      cache: true,
      envFilePath: getServiceEnvFilePaths(),
      expandVariables: true,
      ignoreEnvVars: shouldUseRootEnvFileOnly(),
      isGlobal: true,
      skipProcessEnv: shouldUseRootEnvFileOnly(),
      validate: (config) => validateServiceEnvWithPort(config, 'AUTH_SERVICE_PORT', 4001),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_TOKEN_TTL') ?? '30m') as JwtExpiresIn,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // Counted in Redis when REDIS_URL is set, so the limit holds across every instance.
      useFactory: (config: ConfigService) => ({
        storage: createThrottlerStorage(),
        throttlers: [
          {
            limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
            ttl: config.get<number>('THROTTLE_TTL') ?? 60000,
          },
        ],
      }),
    }),
    AuthModule,
  ],
  providers: [
    AccessResolver,
    { provide: AUTH_PRISMA, useExisting: PrismaService },
    AuditLoggerService,
    HealthCheckService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
})
export class AppModule {}
