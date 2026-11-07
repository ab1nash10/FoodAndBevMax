import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { test } from 'vitest';
import { assertActiveLegalEntity, GSTIN_PATTERN, normalizeGstNumber } from './legal-entity-guards';

test('a GST number loses every space, tab and newline, not just the ends', () => {
  assert.equal(normalizeGstNumber('07 aadcm\t0815\nb1zq'), '07AADCM0815B1ZQ');
});

test('a GSTIN needs a state code, PAN, non-zero entity number, Z and a check character', () => {
  assert.ok(GSTIN_PATTERN.test('07AADCM0815B1ZQ'));
  for (const invalid of [
    'A7AADCM0815B1ZQ', // state code must be digits
    '07AADC10815B1ZQ', // PAN starts with five letters
    '07AADCM081XB1ZQ', // then four digits
    '07AADCM08151B1Z', // then a letter, so this shifts everything
    '07AADCM0815B0ZQ', // entity number 0 does not exist
    '07AADCM0815B1ZQQ', // 16 characters
    '',
  ]) {
    assert.throws(
      () => normalizeGstNumber(invalid),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'Enter a valid 15-character GST number, e.g. 07AADCM0815B1ZQ',
      invalid,
    );
  }
});

// The client answers like Prisma: an entity is found only if live and active.
function clientWith(entities: { deletedAt: Date | null; id: string; isActive: boolean }[]) {
  const queries: unknown[] = [];
  const client = {
    legalEntity: {
      findFirst: (args: { where: { id: string } }) => {
        queries.push(args);
        const entity = entities.find(
          (stored) => stored.id === args.where.id && stored.isActive && !stored.deletedAt,
        );
        return Promise.resolve(entity ? { id: entity.id } : null);
      },
    },
  };

  return { client: client as unknown as Prisma.TransactionClient, queries };
}

test('a location or restaurant may only be linked to a live, active entity', async () => {
  const { client, queries } = clientWith([
    { deletedAt: null, id: 'live', isActive: true },
    { deletedAt: null, id: 'off', isActive: false },
    { deletedAt: new Date(), id: 'gone', isActive: true },
  ]);
  const isRefused = (error: unknown) =>
    error instanceof BadRequestException && error.message === 'Choose an active entity';

  await assert.doesNotReject(assertActiveLegalEntity(client, 'live'));
  await assert.rejects(assertActiveLegalEntity(client, 'off'), isRefused);
  await assert.rejects(assertActiveLegalEntity(client, 'gone'), isRefused);
  await assert.rejects(assertActiveLegalEntity(client, 'missing'), isRefused);
  assert.deepEqual(queries[0], {
    select: { id: true },
    where: { deletedAt: null, id: 'live', isActive: true },
  });
});
