import {
  AUTH_PRISMA,
  AccessResolver,
  addressThrottler,
  ForgetAccessOnWriteInterceptor,
  AuditLoggerService,
  createThrottlerStorage,
  HealthCheckService,
  JwtAuthGuard,
  JwtStrategy,
  RbacGuard,
  UserThrottlerGuard,
} from '@aahar/auth';
import {
  getServiceEnvFilePaths,
  shouldUseRootEnvFileOnly,
  validateServiceEnvWithPort,
} from '@aahar/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
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
          // Signed-out traffic per network address; signed-in requests never count here.
          addressThrottler(),
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
      useClass: JwtAuthGuard,
    },
    // After JwtAuthGuard: signed-in requests are counted per user, public ones per address.
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    // A write here (sign-out, roles, permissions, locations) may change someone's access.
    {
      provide: APP_INTERCEPTOR,
      useClass: ForgetAccessOnWriteInterceptor,
    },
  ],
})
export class AppModule {}
