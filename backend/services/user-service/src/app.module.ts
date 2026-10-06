import {
  AUTH_PRISMA,
  AccessResolver,
  AuditLoggerService,
  createThrottlerStorage,
  HealthCheckService,
  NotificationPublisher,
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
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { PrismaService } from './common/prisma/prisma.service';
import { HealthController } from './health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PreferencesModule } from './preferences/preferences.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

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
      validate: (config) => validateServiceEnvWithPort(config, 'USER_SERVICE_PORT', 4002),
    }),
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PermissionsModule,
    PreferencesModule,
    RolesModule,
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
    UsersModule,
  ],
  providers: [
    AccessResolver,
    { provide: AUTH_PRISMA, useExisting: PrismaService },
    AuditLoggerService,
    HealthCheckService,
    NotificationPublisher,
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
