import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '@aahar/logging';
import {
  Inject,
  Injectable,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Client } from 'pg';
import { type Observable, tap } from 'rxjs';
import { AUTH_PRISMA } from './access-resolver';
import { prismaPgSettings } from './prisma-adapter';

/**
 * Live changes: a save on any screen reaches every other open screen at once, instead of when
 * that screen next polls. A successful write names the area it touched (`hospitals`, `items`,
 * `pos`), Postgres NOTIFY carries it to every service process and replica, and the
 * organization service relays it to each open screen over one server-sent-event stream
 * (GET /changes). Only area names travel, never data: each screen refetches what it shows.
 */
export const CHANGES_CHANNEL = 'aahar_changes';
/** Sent after the relay lost Postgres for a while: notices may have been missed, refresh all. */
export const EVERYTHING_CHANGED = '["*"]';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Long enough to fold a burst (a save that also writes its audit log, an import) into one notice.
const BURST_MS = 50;

/** The area a request writes to: the first path segment after /api/v1, or null outside it. */
export function changedArea(path: string): string | null {
  return /\/api\/v1\/([^/?#]+)/.exec(path)?.[1] ?? null;
}

type Notifier = { $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown> };

/** Announces each successful write's area, after the handler (and its transaction) finished. */
@Injectable()
export class PublishChangesInterceptor implements NestInterceptor {
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(AUTH_PRISMA) private readonly prisma: Notifier) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { method, path, url } = context
      .switchToHttp()
      .getRequest<{ method: string; path?: string; url?: string }>();
    const area = READS.has(method) ? null : changedArea(path ?? url ?? '');

    return area ? next.handle().pipe(tap(() => this.announce(area))) : next.handle();
  }

  private announce(area: string): void {
    this.pending.add(area);
    this.timer ??= setTimeout(() => this.flush(), BURST_MS);
  }

  private flush(): void {
    const areas = JSON.stringify([...this.pending]);
    this.pending.clear();
    this.timer = undefined;
    // A lost notice only means a screen refreshes on its own timer, as before: never fail a save.
    this.prisma
      .$executeRawUnsafe('SELECT pg_notify($1, $2)', CHANGES_CHANNEL, areas)
      .catch((error: unknown) =>
        logger.warn(
          { reason: error instanceof Error ? error.message : error },
          'changes_notify_failed',
        ),
      );
  }
}

export const CHANGE_RELAY_OPTIONS = Symbol('CHANGE_RELAY_OPTIONS');
export interface ChangeRelayOptions {
  /** Screens one address may hold open; a hospital's tills often share one public address. */
  maxPerAddress?: number;
  maxViewers?: number;
}

type Viewer = { address: string; response: ServerResponse };
type ViewerRequest = IncomingMessage & { ip?: string };

// Under the load balancer's 60 s idle timeout, so an idle stream is never cut.
const HEARTBEAT_MS = 20_000;

/** Listens on Postgres and relays each notice to every open screen. */
@Injectable()
export class ChangeRelay implements OnModuleInit, OnModuleDestroy {
  private readonly viewers = new Set<Viewer>();
  private readonly perAddress = new Map<string, number>();
  private heartbeat: NodeJS.Timeout | undefined;
  private listener: Client | undefined;
  private retryMs = 1000;
  private stopped = false;

  constructor(
    @Optional() @Inject(CHANGE_RELAY_OPTIONS) private readonly options: ChangeRelayOptions = {},
  ) {}

  onModuleInit(): void {
    if (process.env.DATABASE_URL) void this.listen(false);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearInterval(this.heartbeat);
    for (const viewer of this.viewers) viewer.response.end();
    this.viewers.clear();
    void this.listener?.end().catch(() => undefined);
  }

  attach(request: ViewerRequest, response: ServerResponse): void {
    const address = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const held = this.perAddress.get(address) ?? 0;

    if (
      held >= (this.options.maxPerAddress ?? 200) ||
      this.viewers.size >= (this.options.maxViewers ?? 5000)
    ) {
      response.statusCode = 429;
      response.end();
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream');
    // no-transform: compression and proxies pass each event through instead of buffering it.
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write(': connected\n\n');

    const viewer = { address, response };
    this.viewers.add(viewer);
    this.perAddress.set(address, held + 1);
    request.on('close', () => this.detach(viewer));

    this.heartbeat ??= setInterval(() => this.send(': ping\n\n'), HEARTBEAT_MS).unref();
  }

  deliver(payload: string): void {
    this.send(`data: ${payload}\n\n`);
  }

  private send(chunk: string): void {
    for (const viewer of this.viewers) viewer.response.write(chunk);
  }

  private detach(viewer: Viewer): void {
    if (!this.viewers.delete(viewer)) return;
    const left = (this.perAddress.get(viewer.address) ?? 1) - 1;
    if (left > 0) this.perAddress.set(viewer.address, left);
    else this.perAddress.delete(viewer.address);
  }

  private async listen(reconnecting: boolean): Promise<void> {
    const settings = prismaPgSettings(process.env.DATABASE_URL ?? '');
    const open = async (ssl: typeof settings.pool.ssl) => {
      const client = new Client({ ...settings.pool, ssl });
      await client.connect();
      return client;
    };

    try {
      let client: Client;
      try {
        client = await open(settings.pool.ssl);
      } catch (error) {
        // libpq's sslmode=prefer, as the Prisma adapter does it.
        if (settings.sslmode !== 'prefer' || !/does not support SSL/i.test(String(error)))
          throw error;
        client = await open(false);
      }

      client.on('notification', ({ channel, payload }) => {
        if (channel === CHANGES_CHANNEL && payload) this.deliver(payload);
      });
      client.once('error', () => this.retry(client));
      client.once('end', () => this.retry(client));
      await client.query(`LISTEN ${CHANGES_CHANNEL}`);
      this.listener = client;
      this.retryMs = 1000;
      // Notices sent while the relay was away are lost: every screen refreshes once instead.
      if (reconnecting) this.deliver(EVERYTHING_CHANGED);
    } catch (error) {
      logger.warn(
        { reason: error instanceof Error ? error.message : error },
        'changes_listen_failed',
      );
      this.retry(undefined);
    }
  }

  private retry(client: Client | undefined): void {
    if (this.stopped || (client && client !== this.listener && this.listener)) return;
    this.listener = undefined;
    void client?.end().catch(() => undefined);
    setTimeout(() => void this.listen(true), this.retryMs).unref();
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }
}
