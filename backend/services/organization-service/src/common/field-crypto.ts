import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { logger } from '@aahar/logging';
import type { PrismaClient } from '@prisma/client';

/**
 * Gateway secrets and bank account numbers are stored sealed (AES-256-GCM), so a database dump
 * or backup does not give them away. FIELD_ENCRYPTION_KEY is 32 bytes, base64
 * (`openssl rand -base64 32`); losing it means entering those values again.
 * ponytail: one key, no rotation; the v1 tag leaves room for a v2 key when one is needed.
 */
const PREFIX = 'enc:v1:';

/** The columns sealed at rest, per Prisma model. */
const SEALED_COLUMNS = {
  hospital: ['payuClientSecret', 'razorpayKeySecret'],
  paymentMachine: ['pinelabSecurityToken'],
  restaurant: ['accountNumber'],
} as const;

function encryptionKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();

  if (!raw) {
    return null;
  }

  const key = Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)');
  }

  return key;
}

/** The value as it is stored: sealed when a key is set; null, blank and sealed values as given. */
export function sealField<T extends string | null | undefined>(value: T): T {
  const key = encryptionKey();

  if (!value || !key || value.startsWith(PREFIX)) {
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}` as T;
}

/** The stored value in plain text. A value saved before encryption is read as it is. */
export function openField(value: string | null): string | null {
  if (!value?.startsWith(PREFIX)) {
    return value;
  }

  const key = encryptionKey();

  if (!key) {
    throw new Error('FIELD_ENCRYPTION_KEY is not set, so a stored secret cannot be read');
  }

  const data = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));

  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

type SealedTable = {
  findMany(args: object): Promise<Array<Record<string, unknown>>>;
  updateMany(args: object): Promise<{ count: number }>;
};

/**
 * Seals every value still in plain text (saved before the key was set). Runs at start-up; safe
 * on several pods at once, as a row is only rewritten while it still holds what was read.
 * Returns the number of rows sealed.
 */
export async function encryptStoredSecrets(prisma: PrismaClient): Promise<number> {
  if (!encryptionKey()) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'field_encryption_off: FIELD_ENCRYPTION_KEY is not set; gateway secrets stay in plain text',
      );
    }
    return 0;
  }

  let sealed = 0;

  for (const [model, fields] of Object.entries(SEALED_COLUMNS)) {
    const table = (prisma as unknown as Record<string, SealedTable>)[model]!;
    const rows = await table.findMany({
      select: { id: true, updatedAt: true, ...Object.fromEntries(fields.map((f) => [f, true])) },
      where: { OR: fields.map((field) => ({ [field]: { not: { startsWith: PREFIX } } })) },
    });

    for (const row of rows) {
      const { count } = await table.updateMany({
        // updatedAt as it was: sealing is not an edit anyone made.
        data: {
          updatedAt: row.updatedAt,
          ...Object.fromEntries(fields.map((f) => [f, sealField(row[f] as string | null)])),
        },
        where: { id: row.id, ...Object.fromEntries(fields.map((f) => [f, row[f]])) },
      });
      sealed += count;
    }
  }

  if (sealed) {
    logger.info({ rows: sealed }, 'field_encryption_backfill');
  }

  return sealed;
}
