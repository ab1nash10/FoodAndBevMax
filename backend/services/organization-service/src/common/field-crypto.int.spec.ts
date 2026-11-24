// Gateway secrets and bank account numbers over HTTP against a real database: the screens see
// what they saw before, the database holds only sealed values, and start-up seals old rows.
//
// Runs only with DATABASE_URL_TEST: a migrated and seeded database it may write to.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl, run, startHarness, type Harness } from '../testing/int-harness.js';
import { encryptStoredSecrets } from './field-crypto';
import { PrismaService } from './prisma/prisma.service';

describe.skipIf(!databaseUrl)('secrets sealed at rest (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  let hospitalId = '';

  beforeAll(async () => {
    h = await startHarness();
  }, 120_000);

  afterAll(() => h?.app.close());

  it('a location shows only the last four of its gateway secrets and stores them sealed', async () => {
    const created = await h.ok('POST', '/hospitals', {
      city: 'Gurugram',
      locationCode: `FC${run}`,
      onlinePaymentOption: 'RAZORPAY',
      payuClientSecret: 'payu-secret-8765', // gitleaks:allow (test value)
      razorpayKeyId: 'rzp_test_int',
      razorpayKeySecret: 'rzp-secret-4321', // gitleaks:allow (test value)
      state: 'Haryana',
      title: `Int Sealed ${run}`,
    });
    hospitalId = created.id as string;

    expect(created).toMatchObject({ payuClientSecret: '••••8765', razorpayKeySecret: '••••4321' });
    const [row] = await h.rawQuery<{ payu: string; rzp: string }>(
      `SELECT payu_client_secret AS payu, razorpay_key_secret AS rzp FROM hospitals WHERE id = $1::uuid`,
      hospitalId,
    );
    expect(row?.payu).toMatch(/^enc:v1:/);
    expect(row?.rzp).toMatch(/^enc:v1:/);
    expect(JSON.stringify(row)).not.toMatch(/8765|4321/);
  });

  it('a restaurant reads its account number back as entered while the database holds it sealed', async () => {
    const created = await h.ok('POST', '/restaurants', {
      accountNumber: '50100987654321',
      hospitalId,
      restaurantName: `Int Sealed Cafe ${run}`,
    });
    const id = created.id as string;

    expect(created.accountNumber).toBe('50100987654321');
    expect((await h.ok('GET', `/restaurants/${id}`)).accountNumber).toBe('50100987654321');
    const updated = await h.ok('PUT', `/restaurants/${id}`, { accountNumber: '50100111122223' });
    expect(updated.accountNumber).toBe('50100111122223');
    const [row] = await h.rawQuery<{ account: string }>(
      `SELECT account_number AS account FROM restaurants WHERE id = $1::uuid`,
      id,
    );
    expect(row?.account).toMatch(/^enc:v1:/);
  });

  it('start-up seals values saved before the key was set, and they still read the same', async () => {
    const created = await h.ok('POST', '/restaurants', {
      hospitalId,
      restaurantName: `Int Legacy Cafe ${run}`,
    });
    const id = created.id as string;
    await h.rawQuery(
      `UPDATE restaurants SET account_number = '50100555566667' WHERE id = $1::uuid`,
      id,
    );
    expect((await h.ok('GET', `/restaurants/${id}`)).accountNumber).toBe('50100555566667');

    expect(await encryptStoredSecrets(h.app.get(PrismaService))).toBeGreaterThan(0);
    const [row] = await h.rawQuery<{ account: string }>(
      `SELECT account_number AS account FROM restaurants WHERE id = $1::uuid`,
      id,
    );
    expect(row?.account).toMatch(/^enc:v1:/);
    expect((await h.ok('GET', `/restaurants/${id}`)).accountNumber).toBe('50100555566667');
  });
});
