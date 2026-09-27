import { PrismaClient } from '@prisma/client';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import Redis from 'ioredis';

interface DependencyHealth {
  latencyMs?: number;
  message?: string;
  status: 'ok' | 'error';
}

export interface ServiceHealthDetails {
  checks: {
    database: DependencyHealth;
    // redis: DependencyHealth;
  };
  service: string;
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
}

@Injectable()
export class HealthCheckService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();
  // private readonly redis: Redis;

  // Redis is commented out for now, so the only dependency left to check is the database.
  // constructor(config: ConfigService) {
  //   this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
  //     connectTimeout: 1000,
  //     enableOfflineQueue: false,
  //     lazyConnect: true,
  //     maxRetriesPerRequest: 1,
  //   });
  //   this.redis.on('error', () => undefined);
  // }

  async getHealth(service: string): Promise<ServiceHealthDetails> {
    // const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    // const isHealthy = database.status === 'ok' && redis.status === 'ok';
    const database = await this.checkDatabase();
    const isHealthy = database.status === 'ok';

    return {
      checks: {
        database,
        // redis,
      },
      service,
      status: isHealthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    // this.redis.disconnect();
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    const startedAt = performance.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        latencyMs: Math.round(performance.now() - startedAt),
        status: 'ok',
      };
    } catch (error) {
      // The endpoint is public; Prisma's message names the database host and user, so it goes
      // to the log, not the response.
      console.error(
        JSON.stringify({
          event: 'health_database_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      return {
        message: 'Database connectivity check failed',
        status: 'error',
      };
    }
  }

  //   private async checkRedis(): Promise<DependencyHealth> {
  //     const startedAt = performance.now();
  //
  //     try {
  //       if (this.redis.status === 'wait') {
  //         await this.redis.connect();
  //       }
  //
  //       await this.redis.ping();
  //
  //       return {
  //         latencyMs: Math.round(performance.now() - startedAt),
  //         status: 'ok',
  //       };
  //     } catch (error) {
  //       return {
  //         message: error instanceof Error ? error.message : 'Redis connectivity check failed',
  //         status: 'error',
  //       };
  //     }
  //   }
  //
}
