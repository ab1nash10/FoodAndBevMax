import { availableParallelism } from 'node:os';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client, type PoolConfig } from 'pg';

// Options that only Prisma's old engine understood. node-postgres would misread sslmode and
// ignore the rest, so they are translated below and removed from the URL it receives.
const PRISMA_URL_OPTIONS = [
  'connect_timeout',
  'connection_limit',
  'pgbouncer',
  'pool_timeout',
  'schema',
  'socket_timeout',
  'sslaccept',
  'sslmode',
  'statement_cache_size',
];

export interface PrismaPgSettings {
  pool: PoolConfig;
  schema?: string;
  sslmode: 'disable' | 'prefer' | 'require';
}

/**
 * Prisma 7 connects through node-postgres, which does not read Prisma's URL options. This keeps
 * DATABASE_URL meaning what it did under Prisma 6: `schema`, `connection_limit` (default
 * 2 x CPUs + 1) and `connect_timeout` (seconds, default 5) carry over, and SSL follows
 * `sslmode` - `prefer` (the default) uses TLS when the server offers it, `require` insists on
 * it, `disable` never uses it - with certificates verified only under `sslaccept=strict`.
 */
export function prismaPgSettings(databaseUrl: string): PrismaPgSettings {
  const url = new URL(databaseUrl);
  const option = (name: string) => url.searchParams.get(name) ?? undefined;
  const sslmode = option('sslmode');
  const limit = Number(option('connection_limit'));
  const connectTimeoutSeconds = Number(option('connect_timeout') ?? 5);
  const verifyCertificate = option('sslaccept') === 'strict';
  const schema = option('schema');

  for (const name of PRISMA_URL_OPTIONS) {
    url.searchParams.delete(name);
  }

  return {
    pool: {
      connectionString: url.toString(),
      connectionTimeoutMillis: connectTimeoutSeconds * 1000,
      max: limit > 0 ? limit : availableParallelism() * 2 + 1,
      ssl: sslmode === 'disable' ? false : { rejectUnauthorized: verifyCertificate },
    },
    schema,
    sslmode: sslmode === 'disable' || sslmode === 'require' ? sslmode : 'prefer',
  };
}

// libpq's `prefer`, which node-postgres lacks: one probe connection decides whether the pool
// uses TLS. Any failure other than the server refusing TLS keeps TLS on, so the pool reports
// the real error (bad password, unreachable host) exactly as it would have.
class PreferSslPrismaPg extends PrismaPg {
  constructor(private readonly settings: PrismaPgSettings) {
    super(settings.pool, { schema: settings.schema });
  }

  override async connect() {
    const probe = new Client(this.settings.pool);
    let ssl = this.settings.pool.ssl;

    try {
      await probe.connect();
    } catch (error) {
      if (error instanceof Error && /does not support SSL/i.test(error.message)) {
        ssl = false;
      }
    } finally {
      await probe.end().catch(() => undefined);
    }

    return new PrismaPg({ ...this.settings.pool, ssl }, { schema: this.settings.schema }).connect();
  }
}

/** The driver adapter every PrismaClient in AAHAR is constructed with. */
export function createPrismaAdapter(databaseUrl = process.env.DATABASE_URL): PrismaPg {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  const settings = prismaPgSettings(databaseUrl);

  return settings.sslmode === 'prefer'
    ? new PreferSslPrismaPg(settings)
    : new PrismaPg(settings.pool, { schema: settings.schema });
}

type ConstraintCause = { constraint?: { fields?: string[]; index?: string } };

/**
 * What a unique-constraint error (P2002) collided on, as one string to match against. Prisma 6
 * reported the columns in `meta.target`; with Prisma 7's driver adapter they arrive as the
 * constraint (`users_mobile_key`) or its columns under `meta.driverAdapterError`. Postgres
 * names constraints after their columns, so one pattern matches every shape.
 */
export function uniqueViolationTarget(meta: Record<string, unknown> | undefined): string {
  const cause = (meta?.driverAdapterError as { cause?: ConstraintCause } | undefined)?.cause;

  return [meta?.target, cause?.constraint?.fields, cause?.constraint?.index]
    .flat()
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}
