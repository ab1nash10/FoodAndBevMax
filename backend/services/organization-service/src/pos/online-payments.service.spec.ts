import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OnlinePayment } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { OnlinePaymentsService } from './online-payments.service';
import type { PosService } from './pos.service';

// Fake Razorpay keys; fetch answers Razorpay's payment-link calls from `link` below.
const config = new ConfigService({ RAZORPAY_KEY_ID: 'rzp_test_fake', RAZORPAY_KEY_SECRET: 'x' });
let link: { payments?: unknown[]; status: string } = { status: 'created' };
let cancelRefused = false;
const urls: string[] = [];

// Pine Labs' Plutus calls, by the last part of the url; what each machine was sent is kept.
let plutus: Record<string, Record<string, unknown>> = {};
const plutusSent: Array<Record<string, unknown>> = [];

globalThis.fetch = ((url: string, init?: RequestInit) => {
  urls.push(url);

  if (url.startsWith('https://plutus.example.test/')) {
    plutusSent.push(JSON.parse(init!.body as string) as Record<string, unknown>);
    return Promise.resolve(Response.json(plutus[url.split('/').pop()!] ?? {}));
  }

  if (url.endsWith('/cancel')) {
    return Promise.resolve(
      cancelRefused
        ? Response.json({ error: { description: 'already paid' } }, { status: 400 })
        : Response.json({ status: 'cancelled' }),
    );
  }

  if (url.endsWith('/payment_links')) {
    return Promise.resolve(Response.json({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' }));
  }

  return Promise.resolve(Response.json(link));
}) as typeof fetch;

const counter = {
  counterName: 'Till 1',
  hospitalId: 'hospital-1',
  id: 'counter-1',
  restaurant: { restaurantName: 'Cafe' },
};

// The counter's POS device and its payment machines, as POS & Payment Machines keeps them.
interface Machine {
  createdAt: Date;
  id: string;
  isDefault: boolean;
  name: string;
  pinelabImei: string | null;
  pinelabMerchantId: string | null;
  pinelabMerchantStorePosCode: string | null;
  pinelabSecurityToken: string | null;
  posDeviceId: string;
}
const cardMachine = (extra: Partial<Machine> = {}): Machine => ({
  createdAt: new Date('2026-10-01'),
  id: 'machine-1',
  isDefault: false,
  name: 'Till 1 card machine',
  pinelabImei: 'IMEI-1',
  pinelabMerchantId: '29610',
  pinelabMerchantStorePosCode: '1221258437',
  pinelabSecurityToken: 'token-1',
  posDeviceId: 'pos-device-1',
  ...extra,
});
const plutusConfig = new ConfigService({ PINELABS_BASE_URL: 'https://plutus.example.test/V1' });

// Stands in for Prisma's onlinePayment table and PosService's pricing.
// The counter’s location: Razorpay picked, on the shared keys (none of its own).
const location = {
  onlinePaymentOption: 'RAZORPAY' as 'NONE' | 'PAYU' | 'RAZORPAY',
  payuClientId: null,
  payuClientSecret: null,
  payuMerchantId: null,
  razorpayKeyId: null,
  razorpayKeySecret: null,
};

/** A Pay later bill, as the till collects it: its total, location and whether still due. */
let dueBill: Record<string, unknown> | null = null;

function serviceWith(grandTotal = 105, settings = config, machines: Machine[] = []) {
  const payments: OnlinePayment[] = [];
  const queries: Array<{ where: Record<string, unknown> }> = [];
  const prisma = {
    hospital: { findFirst: () => location },
    restaurantOrder: { findFirst: () => dueBill },
    counter: {
      findFirst: () => ({ posDeviceId: 'pos-device-1' }),
    },
    paymentMachine: {
      findMany: ({ where }: { where: { id?: string; posDeviceId?: string } }) =>
        machines.filter(
          (machine) =>
            (!where.id || machine.id === where.id) &&
            (!where.posDeviceId || machine.posDeviceId === where.posDeviceId),
        ),
    },
    onlinePayment: {
      create: ({ data }: { data: Partial<OnlinePayment> & { amount: number } }) => {
        const payment = {
          ...data,
          amount: new Prisma.Decimal(data.amount),
          paidReference: null,
          status: 'PENDING',
        } as unknown as OnlinePayment;
        payments.push(payment);
        return payment;
      },
      findFirst: ({ where }: { where: { id: string } }) =>
        payments.find((payment) => payment.id === where.id) ?? null,
      // Waiting payments by age (a relation filter such as qrOrder is kept, not applied).
      findMany: (args: {
        where: { createdAt: { gte: Date; lt: Date }; status: string } & Record<string, unknown>;
      }) => {
        queries.push(args);
        const { gte, lt } = args.where.createdAt;
        return payments
          .filter((p) => p.status === args.where.status && p.createdAt >= gte && p.createdAt < lt)
          .map(({ id }) => ({ id }));
      },
      updateMany: ({
        data,
        where,
      }: {
        data: Partial<OnlinePayment>;
        where: { id: string; status: string };
      }) => {
        const matched = payments.filter((p) => p.id === where.id && p.status === where.status);
        matched.forEach((payment) => Object.assign(payment, data));
        return { count: matched.length };
      },
    },
  };
  const pos = {
    findCounter: () => Promise.resolve(counter),
    quoteBill: () => Promise.resolve({ grandTotal }),
  };
  const audits: string[] = [];
  const auditLog = {
    record: (entry: { summary: string }) => {
      audits.push(entry.summary);
      return Promise.resolve();
    },
  };

  return {
    audits,
    payments,
    queries,
    service: new OnlinePaymentsService(
      settings,
      pos as unknown as PosService,
      prisma as unknown as PrismaService,
      auditLog as unknown as AuditLogService,
    ),
  };
}

const dto = {
  channel: 'COUNTER' as const,
  counterId: 'counter-1',
  lines: [{ menuId: 'menu-1', quantity: 1 }],
  provider: 'RAZORPAY' as const,
};

test('the cashier is offered only the gateway the counter’s location picked, if set up', async () => {
  assert.deepEqual(await serviceWith().service.available('counter-1'), ['RAZORPAY']);

  const { service } = serviceWith(105, new ConfigService({}));
  assert.deepEqual(await service.available('counter-1'), []);
  await assert.rejects(
    service.start(dto, {}),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message.startsWith('Razorpay is not set up for this location.'),
  );

  // A location on None offers no gateway, whatever the server has set up.
  location.onlinePaymentOption = 'NONE';
  assert.deepEqual(await serviceWith().service.available('counter-1'), []);
  location.onlinePaymentOption = 'RAZORPAY';
});

test('a payment asks the provider for the bill’s server-priced total', async () => {
  const { payments, service } = serviceWith(105);

  const started = await service.start(dto, { actorId: 'cashier-1' });

  assert.deepEqual(
    { ...started, id: undefined },
    {
      amount: 105,
      id: undefined,
      paidReference: null,
      paymentUrl: 'https://rzp.io/i/abc',
      provider: 'RAZORPAY',
      status: 'PENDING',
    },
  );
  // The provider's reference is our payment's own id.
  assert.equal(payments[0]!.id, started.id);
  assert.equal(payments[0]!.providerRef, 'plink_1');
  assert.equal(payments[0]!.createdBy, 'cashier-1');
  assert.equal(payments[0]!.counterId, 'counter-1');
});

test('a bill that comes to nothing is not sent for payment', async () => {
  const { payments, service } = serviceWith(0);

  await assert.rejects(service.start(dto, {}), BadRequestException);
  assert.equal(payments.length, 0);
});

test('a pending payment settles from the provider, once, as paid or expired', async () => {
  const { service } = serviceWith();
  const { id } = await service.start(dto, {});

  link = { status: 'created' };
  assert.equal((await service.check(id)).status, 'PENDING');

  link = { payments: [{ payment_id: 'pay_XYZ' }], status: 'paid' };
  const paid = await service.check(id);
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.paidReference, 'pay_XYZ');

  // Settled for good: later checks do not ask the provider again.
  const asked = urls.length;
  link = { status: 'expired' };
  assert.equal((await service.check(id)).status, 'PAID');
  assert.equal(urls.length, asked);

  const second = await service.start(dto, {});
  assert.equal((await service.check(second.id)).status, 'EXPIRED');

  await assert.rejects(service.check('missing'), NotFoundException);
});

test('cancelling lets an unpaid link go, but one paid meanwhile comes back paid', async () => {
  const { service } = serviceWith();

  link = { status: 'created' };
  cancelRefused = false;
  const unpaid = await service.start(dto, {});
  assert.equal((await service.cancel(unpaid.id)).status, 'CANCELLED');

  // The provider refuses the cancel because the guest has just paid.
  const raced = await service.start(dto, {});
  cancelRefused = true;
  const cancelCalls = urls.filter((url) => url.endsWith('/cancel')).length;
  link = { status: 'created' };
  const fetchLink = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    // The check after the refusal finds it paid.
    if (url.endsWith('/cancel')) {
      link = { payments: [{ payment_id: 'pay_LATE' }], status: 'paid' };
    }
    return fetchLink(url, init);
  }) as typeof fetch;

  const result = await service.cancel(raced.id);
  globalThis.fetch = fetchLink;
  assert.equal(urls.filter((url) => url.endsWith('/cancel')).length, cancelCalls + 1);
  assert.equal(result.status, 'PAID');
  assert.equal(result.paidReference, 'pay_LATE');

  // Already paid: nothing to cancel.
  cancelRefused = false;
  assert.equal((await service.cancel(raced.id)).status, 'PAID');
  assert.equal(urls.filter((url) => url.endsWith('/cancel')).length, cancelCalls + 1);
});

const card = { ...dto, provider: 'PINELABS' as const };

test('Pine Labs: the card payment goes to the counter’s own card machine', async () => {
  const machines = [
    cardMachine({ id: 'no-token', isDefault: true, pinelabSecurityToken: null }),
    cardMachine({ id: 'other-till', pinelabImei: 'IMEI-9', posDeviceId: 'pos-device-9' }),
    cardMachine(),
  ];
  const { payments, service } = serviceWith(105, plutusConfig, machines);
  plutus = {
    UploadBilledTransaction: { PlutusTransactionReferenceID: 823486, ResponseCode: 0 },
  };
  plutusSent.length = 0;

  assert.deepEqual(await service.cardMachine('counter-1'), { name: 'Till 1 card machine' });

  const started = await service.start(card, {});
  assert.equal(started.provider, 'PINELABS');
  assert.equal(started.paymentUrl, '');
  assert.equal(payments[0]!.providerRef, '823486');
  assert.equal(payments[0]!.paymentMachineId, 'machine-1');
  assert.equal(plutusSent[0]!.IMEI, 'IMEI-1');
  assert.equal(plutusSent[0]!.Amount, 10500);

  // Its status is read from that machine, and the card's RRN goes on the bill.
  plutus.GetCloudBasedTxnStatus = {
    ResponseCode: 0,
    ResponseMessage: 'TXN APPROVED',
    TransactionData: [{ Tag: 'RRN', Value: '530112345678' }],
  };
  const paid = await service.check(started.id);
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.paidReference, '530112345678');
  assert.equal(plutusSent[1]!.IMEI, 'IMEI-1');
});

test('Pine Labs: a counter without a complete card machine, or no Plutus url, is refused', async () => {
  const noMachine = serviceWith(105, plutusConfig, [cardMachine({ pinelabImei: ' ' })]).service;
  assert.equal(await noMachine.cardMachine('counter-1'), null);
  await assert.rejects(
    noMachine.start(card, {}),
    (error: unknown) =>
      error instanceof BadRequestException && /no Pine Labs card machine/.test(error.message),
  );

  const notSetUp = serviceWith(105, config, [cardMachine()]).service;
  assert.equal(await notSetUp.cardMachine('counter-1'), null);
  await assert.rejects(
    notSetUp.start(card, {}),
    (error: unknown) =>
      error instanceof BadRequestException && error.message === 'Pine Labs is not set up here.',
  );
  // Card payments are not offered as UPI providers.
  assert.deepEqual(await notSetUp.available('counter-1'), ['RAZORPAY']);
});

test('Pine Labs: cancelling clears the machine for the payment’s amount', async () => {
  const { service } = serviceWith(105, plutusConfig, [cardMachine()]);
  plutus = {
    CancelTransaction: { ResponseCode: 0, ResponseMessage: 'APPROVED' },
    GetCloudBasedTxnStatus: { ResponseCode: 1001, ResponseMessage: 'TXN UPLOADED' },
    UploadBilledTransaction: { PlutusTransactionReferenceID: 823487, ResponseCode: 0 },
  };
  const { id } = await service.start(card, {});
  plutusSent.length = 0;

  assert.equal((await service.cancel(id)).status, 'CANCELLED');
  const cancel = plutusSent.find((body) => 'TakeToHomeScreen' in body)!;
  assert.equal(cancel.Amount, 10500);
  assert.equal(cancel.PlutusTransactionReferenceID, 823487);
});

test('a Razorpay order paid after it was cancelled is found, marked paid and flagged for a refund', async () => {
  const { audits, payments, service } = serviceWith();
  payments.push({
    amount: new Prisma.Decimal(105),
    hospitalId: 'hospital-1',
    id: 'late-1',
    paidReference: null,
    provider: 'RAZORPAY',
    providerRef: 'order_1',
    status: 'CANCELLED',
  } as unknown as OnlinePayment);
  const late = payments.at(-1)!;

  link = { items: [], status: 'created' } as typeof link;
  assert.equal(await service.paidAfterCancel('late-1'), false);
  assert.equal(late.status, 'CANCELLED');

  link = { items: [{ id: 'pay_LATE', status: 'captured' }], status: 'paid' } as typeof link;
  assert.equal(await service.paidAfterCancel('late-1'), true);
  assert.equal(late.status, 'PAID');
  assert.equal(late.paidReference, 'pay_LATE');
  assert.deepEqual(audits, ['RAZORPAY payment of 105 paid after it was cancelled: refund it']);

  // Settled: asked again, nothing moves and nothing more is said.
  assert.equal(await service.paidAfterCancel('late-1'), false);
  assert.equal(audits.length, 1);
});

test('the server cancels a till payment still waiting 30 s past its 3 minutes; one found paid is flagged for a refund', async () => {
  const { audits, payments, queries, service } = serviceWith();
  const now = Date.now();
  const waiting = (id: string, waitedMs: number) => {
    payments.push({
      amount: new Prisma.Decimal(105),
      createdAt: new Date(now - waitedMs),
      hospitalId: 'hospital-1',
      id,
      paidReference: null,
      provider: 'RAZORPAY',
      providerRef: 'plink_1',
      status: 'PENDING',
    } as unknown as OnlinePayment);
    return payments.at(-1)!;
  };
  link = { status: 'created' };
  cancelRefused = false;
  // Its till cancels it at 3 minutes; the server gives the till 30 s to do so.
  const tillStillThere = waiting('pay-recent', 3 * 60_000);
  const tillGone = waiting('pay-left', 3 * 60_000 + 31_000);

  await service.cancelAbandoned(now);

  assert.equal(tillGone.status, 'CANCELLED');
  assert.equal(tillStillThere.status, 'PENDING');
  const { where } = queries.at(-1)!;
  // QR and kiosk orders' payments are their own sweep's; not looked at again after a day.
  assert.deepEqual(where.qrOrder, { is: null });
  assert.equal((where.createdAt as { gte: Date }).gte.valueOf(), now - 24 * 60 * 60_000);

  // The guest paid before the server's last check: kept as paid, on no bill, flagged.
  const paidLate = waiting('pay-late', 4 * 60_000);
  link = { payments: [{ payment_id: 'pay_LATE' }], status: 'paid' };
  await service.cancelAbandoned(now);
  link = { status: 'created' };

  assert.equal(paidLate.status, 'PAID');
  assert.equal(audits.at(-1), 'RAZORPAY payment of 105 paid, but no till billed it: refund it');
});

test('a Pay later bill’s payment is started for its own total, while it is still due here', async () => {
  // The menu would price it at 999 now: the bill's own total is what is owed.
  const { service } = serviceWith(999);
  link = { status: 'created' };
  dueBill = {
    collectedAt: null,
    grandTotal: new Prisma.Decimal(150),
    hospitalId: 'hospital-1',
    paymentMode: 'PAY_LATER',
    status: 'COLLECTED',
  };
  const collect = { counterId: 'counter-1', orderId: 'bill-1', provider: 'RAZORPAY' } as never;

  assert.equal((await service.start(collect, {})).amount, 150);

  dueBill = { ...dueBill, collectedAt: new Date() };
  await assert.rejects(
    service.start(collect, {}),
    (error: unknown) => error instanceof ConflictException && /no payment due/.test(error.message),
  );
  dueBill = null;
});
