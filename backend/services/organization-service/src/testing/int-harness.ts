// Shared set-up for the *.int.spec.ts suites: boots the whole service on a random port against
// DATABASE_URL_TEST (migrated and seeded), signed in as the seeded Super Admin. Each suite names
// its own records with `run`, so suites never touch existing data and need no cleanup.
// Kept out of the build (tsconfig.build.json excludes src/testing).
import { createHash, createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatErpTimestamp, sign, stringToSign } from '../erp-grns/erp-signature.js';
import { superAdminForRun } from './super-admin-for-run.js';

export type Body = Record<string, unknown>;

export const databaseUrl = process.env.DATABASE_URL_TEST;
// Every suite runs with secrets sealed at rest, as production does (a fixed, test-only key).
process.env.FIELD_ENCRYPTION_KEY ||= 'dGVzdC1vbmx5LWZpZWxkLWVuY3J5cHRpb24ta2V5ISE='; // gitleaks:allow
// Two random characters on the clock: suites start in parallel and can share a millisecond.
export const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
export const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Keys and value types only, so a shape change shows up without pinning ids and dates. */
export function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value === null) return null;
  if (typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, shape((value as Body)[key])]),
  );
}

export function firstOf(list: Body[]): Body {
  const [value] = list;
  if (!value) throw new Error('expected at least one row');
  return value;
}

function signAccessToken(secret: string, user: { id: string; sessionVersion: number }): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { exp: now + 3600, iat: now, sub: user.id, sv: user.sessionVersion };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

/**
 * Lists a user on the POS device of this till, with its computer, as an admin would in the
 * device's form. They still type the computer's name (POST /pos/till as them) to work it.
 */
export async function listOnTill(
  db: { rawQuery(sql: string, ...values: unknown[]): Promise<unknown> },
  tillKey: string,
  userId: string,
): Promise<void> {
  await db.rawQuery(
    `INSERT INTO pos_device_users (id, pos_device_id, user_id, host_name, updated_at)
     SELECT gen_random_uuid(), pos_device_id, $2::uuid, host_name, now()
     FROM pos_device_users WHERE till_key_hash = $1 LIMIT 1
     ON CONFLICT (pos_device_id, user_id) DO NOTHING`,
    createHash('sha256').update(tillKey).digest('hex'),
    userId,
  );
}

/**
 * Puts `qty` of a batch into a store, as stock comes in. A location's Main Store gets it the way
 * the ERP sends goods in: a signed POST /erp/grns (GRN `grnNumber`, from `supplier`). Any other
 * store (the seeded "Main F&B Store" has no ERP feed) gets the balance and its GRN_IN ledger line
 * written directly.
 */
export async function receiveStock(
  h: Pick<Harness, 'app' | 'baseUrl' | 'rawQuery'>,
  stock: {
    batchNumber: string;
    expiryDate?: string;
    grnNumber?: string;
    itemId: string;
    qty: number;
    storeId: string;
    supplier?: string;
  },
): Promise<{ batchNumber: string; expiryDate: string }> {
  const { batchNumber, expiryDate = day(60), itemId, qty, storeId } = stock;
  const [target] = await h.rawQuery<{
    hospital_code: string;
    hospital_id: string;
    hsn_code: string | null;
    item_code: string;
    item_name: string;
    main: boolean;
  }>(
    `SELECT h.id AS hospital_id, h.hospital_code, i.item_code, i.item_name, i.hsn_code,
            lower(s.store_name) = 'main store' AS main
       FROM stores s JOIN hospitals h ON h.id = s.hospital_id, items i
      WHERE s.id = $1::uuid AND i.id = $2::uuid`,
    storeId,
    itemId,
  );
  if (!target) throw new Error(`receiveStock: no store ${storeId} or item ${itemId}`);

  if (!target.main) {
    const values = [target.hospital_id, storeId, itemId, batchNumber, expiryDate, qty];
    await h.rawQuery(
      `INSERT INTO stock_balances (stock_balance_id, hospital_id, location_type, location_id,
         item_id, item_type, batch_number, expiry_date, available_qty, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'STORE', $2::uuid, $3::uuid, 'MRP', $4, $5::date, $6, now())`,
      ...values,
    );
    await h.rawQuery(
      `INSERT INTO stock_ledgers (stock_ledger_id, hospital_id, location_type, location_id, item_id,
         item_type, batch_number, expiry_date, transaction_type, qty_in, balance_after,
         business_date, transaction_datetime, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'STORE', $2::uuid, $3::uuid, 'MRP', $4, $5::date,
         'GRN_IN', $6, $6, current_date, now(), now())`,
      ...values,
    );
    return { batchNumber, expiryDate };
  }

  const config = h.app.get(ConfigService);
  const key = config.getOrThrow<string>('ERP_API_KEY');
  const timestamp = formatErpTimestamp(new Date());
  const response = await fetch(`${h.baseUrl}/erp/grns`, {
    body: JSON.stringify([
      {
        // Every field is required: the item's own name and HSN, the ERP's sample for the rest.
        'Discount/Extra Charges': 0,
        'HSN No': target.hsn_code ?? '998313',
        MRP: 15,
        'Tax Rate': 'IGST@18%',
        'Total Value': Math.round(qty * 980) / 100,
        UOM: 'No.',
        'Unit Rate': 9.8,
        batch: batchNumber,
        date: new Date().toISOString(),
        expiry_date: expiryDate,
        flag: 0,
        grn_No: stock.grnNumber ?? `INT-${batchNumber}`,
        issued_by: 'M030634',
        item_name: target.item_name,
        location: target.hospital_code,
        part_item_code: target.item_code,
        purchase_order: '392851',
        requisition: '918590',
        supplier: stock.supplier ?? 'CAGR0008',
        transaction_qty: qty,
      },
    ]),
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'x-signature': sign(
        stringToSign(key, timestamp, config.getOrThrow<string>('ERP_API_SECRET')),
      ),
      'x-timestamp': timestamp,
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`POST /erp/grns -> ${response.status} ${await response.text()}`);
  }
  return { batchNumber, expiryDate };
}

export interface Harness {
  app: INestApplication;
  baseUrl: string;
  /** Calls the API as `as` (a signed token; the Super Admin's by default, '' for none). */
  api(
    method: string,
    path: string,
    body?: unknown,
    as?: string,
  ): Promise<{ body: Body; data: Body; status: number }>;
  /** Like api, but throws on a non-2xx and returns `data`. */
  ok(method: string, path: string, body?: unknown, as?: string): Promise<Body>;
  rawQuery<T>(sql: string, ...values: unknown[]): Promise<T[]>;
  signFor(user: { id: string; sessionVersion: number }): string;
  superAdmin: { id: string; sessionVersion: number };
  /** Sent with /pos/ calls once set, as a till's browser sends its key (X-Till-Key). */
  tillKey?: string;
  token: string;
}

/**
 * Refuses every request that isn't to this machine, so no SMS, email or payment gateway is ever
 * reached. Blanking their keys is not enough: ConfigModule's expandVariables fills an empty
 * process.env value back in from .env. Installed on import, so a suite's fake gateway (a spy on
 * fetch) always sits on top of it.
 */
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    return Promise.reject(new Error(`integration tests may not call ${url.origin}`));
  }
  return realFetch(input, init);
};

export async function startHarness(): Promise<Harness> {
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    REDIS_URL: '',
    SWAGGER_ENABLED: 'false',
    THROTTLE_LIMIT: '100000',
  });
  process.env.JWT_ACCESS_SECRET ||= 'characterisation-access-secret-0123456789';
  process.env.JWT_REFRESH_SECRET ||= 'characterisation-refresh-secret-0123456789';

  // Imported here: ConfigModule reads the environment when app.module is first evaluated.
  const { configureSecurityBaseline, getSharedRedis } = await import('@aahar/auth');
  // Caches "no Redis" while REDIS_URL is still blank: ConfigModule refills it from .env, and the
  // suite would then share the dev Redis.
  getSharedRedis();
  const { ConfigService } = await import('@nestjs/config');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { PrismaService } = await import('../common/prisma/prisma.service.js');

  const app = await NestFactory.create(AppModule, { logger: false });
  const config = app.get(ConfigService);
  configureSecurityBaseline(app, config, {
    serviceName: 'organization-service',
    swaggerDescription: '',
    swaggerTitle: '',
  });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as { address(): AddressInfo }).address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const prisma = app.get(PrismaService);

  const superAdmin = await superAdminForRun(prisma, 'h');
  const signFor = (user: { id: string; sessionVersion: number }) =>
    signAccessToken(config.getOrThrow<string>('JWT_ACCESS_SECRET'), user);
  const token = signFor(superAdmin);

  const api: Harness['api'] = async (method, path, body, as = token) => {
    const response = await fetch(`${baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(as ? { authorization: `Bearer ${as}` } : {}),
        ...(harness.tillKey && path.startsWith('/pos/') ? { 'x-till-key': harness.tillKey } : {}),
        'content-type': 'application/json',
      },
      method,
    });
    const text = await response.text();
    const json = (text ? JSON.parse(text) : {}) as Body;
    return { body: json, data: (json.data ?? {}) as Body, status: response.status };
  };

  const harness: Harness = {
    api,
    app,
    baseUrl,
    async ok(method, path, body, as) {
      const result = await api(method, path, body, as);
      if (result.status >= 300) {
        throw new Error(`${method} ${path} -> ${result.status} ${JSON.stringify(result.body)}`);
      }
      return result.data;
    },
    rawQuery: <T>(sql: string, ...values: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...values),
    signFor,
    superAdmin,
    token,
  };
  return harness;
}
