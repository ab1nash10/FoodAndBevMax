import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { encryptStoredSecrets, openField, sealField } from './field-crypto';

const key = randomBytes(32).toString('base64');
const withKey = (value: string | undefined) => {
  if (value === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = value;
};

afterEach(() => withKey(undefined));

describe('field encryption', () => {
  it('seals a value so the database never holds it, and opens it back', () => {
    withKey(key);
    const sealed = sealField('rzp_secret_9876');

    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain('rzp_secret_9876');
    // A fresh IV each time: equal secrets do not give equal ciphertext.
    expect(sealField('rzp_secret_9876')).not.toBe(sealed);
    expect(openField(sealed)).toBe('rzp_secret_9876');
  });

  it('leaves null, blank and already-sealed values as they are', () => {
    withKey(key);
    const sealed = sealField('x');

    expect(sealField(null)).toBeNull();
    expect(sealField(undefined)).toBeUndefined();
    expect(sealField('')).toBe('');
    expect(sealField(sealed)).toBe(sealed);
    expect(openField(null)).toBeNull();
  });

  it('reads values saved before encryption, and stores plain text while no key is set', () => {
    expect(openField('legacy-plain')).toBe('legacy-plain');
    expect(sealField('no-key-yet')).toBe('no-key-yet');
  });

  it('refuses a tampered value, a missing key and a key of the wrong size', () => {
    withKey(key);
    const sealed = sealField('pinelabs-token');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + '=';

    expect(() => openField(tampered)).toThrow();
    withKey(undefined);
    expect(() => openField(sealed)).toThrow(/FIELD_ENCRYPTION_KEY/);
    withKey(randomBytes(16).toString('base64'));
    expect(() => sealField('x')).toThrow(/32 bytes/);
  });
});

describe('encryptStoredSecrets', () => {
  /** One model's rows, with the findMany/updateMany subset the backfill uses. */
  function table(rows: Array<Record<string, unknown>>) {
    return {
      findMany: ({ where }: { where: { OR: Array<Record<string, unknown>> } }) =>
        Promise.resolve(
          rows.filter((row) =>
            where.OR.some((clause) => {
              const [field] = Object.keys(clause);
              const value = row[field!];
              return typeof value === 'string' && !value.startsWith('enc:v1:');
            }),
          ),
        ),
      rows,
      updateMany: ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
      }) => {
        const row = rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
        if (row) Object.assign(row, data);
        return Promise.resolve({ count: row ? 1 : 0 });
      },
    };
  }

  it('seals every plain secret once, keeping updatedAt, and does nothing without a key', async () => {
    const touched = new Date('2026-01-01T00:00:00Z');
    const prisma = {
      hospital: table([
        { id: 'h1', payuClientSecret: 'payu-s', razorpayKeySecret: null, updatedAt: touched },
      ]),
      paymentMachine: table([{ id: 'm1', pinelabSecurityToken: 'pl-tok', updatedAt: touched }]),
      restaurant: table([{ accountNumber: '50100123456789', id: 'r1', updatedAt: touched }]),
    };

    expect(await encryptStoredSecrets(prisma as never)).toBe(0);
    expect(prisma.hospital.rows[0]!.payuClientSecret).toBe('payu-s');

    withKey(key);
    expect(await encryptStoredSecrets(prisma as never)).toBe(3);
    const [location] = prisma.hospital.rows;
    expect(location!.payuClientSecret).toMatch(/^enc:v1:/);
    expect(openField(location!.payuClientSecret as string)).toBe('payu-s');
    expect(location!.razorpayKeySecret).toBeNull();
    expect(location!.updatedAt).toBe(touched);
    expect(openField(prisma.paymentMachine.rows[0]!.pinelabSecurityToken as string)).toBe('pl-tok');
    expect(openField(prisma.restaurant.rows[0]!.accountNumber as string)).toBe('50100123456789');
    // A second boot finds nothing left to do.
    expect(await encryptStoredSecrets(prisma as never)).toBe(0);
  });
});
