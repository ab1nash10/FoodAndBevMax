import { PrismaClient } from '@prisma/client';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaAdapter } from './prisma-adapter';
import { closeSharedRedis, getSharedRedis } from './redis';

interface DependencyHealth {
  latencyMs?: number;
  message?: string;
  status: 'ok' | 'error';
}

export interface ServiceHealthDetails {
  checks: {
    database: DependencyHealth;
    // Present only when REDIS_URL is set.
    redis?: DependencyHealth;
  };
  service: string;
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
}

@Injectable()
export class HealthCheckService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient({ adapter: createPrismaAdapter() });
  private readonly redis = getSharedRedis();

  /**
   * Only the database decides the status, and so the readiness probe. Every instance shares
   * the one Redis, so failing readiness over it would take the whole API out of rotation,
   * while the rate limiter already carries on without it and sign-in reports its own error.
   * Its state is still reported here, for monitoring.
   */
  async getHealth(service: string): Promise<ServiceHealthDetails> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    return {
      checks: redis ? { database, redis } : { database },
      service,
      status: database.status === 'ok' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.prisma.$disconnect(), closeSharedRedis()]);
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

  private async checkRedis(): Promise<DependencyHealth | undefined> {
    if (!this.redis) {
      return undefined;
    }

    // Answer at once when the client already knows it is disconnected: probes time out after
    // a second, and a slow answer here would fail readiness on the database's behalf.
    if (this.redis.status !== 'ready') {
      return { message: 'Redis is not connected', status: 'error' };
    }

    const startedAt = performance.now();

    try {
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timed out')), 500),
        ),
      ]);

      return {
        latencyMs: Math.round(performance.now() - startedAt),
        status: 'ok',
      };
    } catch {
      // The client logs the cause; the endpoint is public.
      return { message: 'Redis connectivity check failed', status: 'error' };
    }
  }
}
