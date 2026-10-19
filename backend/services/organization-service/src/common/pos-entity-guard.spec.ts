import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { test } from 'vitest';
import { assertPosEntitiesMatch } from './pos-entity-guard';

const max = { entityName: 'Max Healthcare', id: 'e-max' };
const blk = { entityName: 'BLK Hospital', id: 'e-blk' };
const at = (location: typeof max | null, own: typeof max | null = null) => ({
  hospital: { legalEntity: location },
  legalEntity: own,
});
const tx = (links: unknown[]) =>
  ({ posDeviceRestaurant: { findMany: () => Promise.resolve(links) } }) as never;
const link = (posDevice: object, restaurant: object) => ({
  posDevice: { ...posDevice, name: 'Counter 1 POS' },
  restaurant: { ...restaurant, restaurantName: 'BLK main restaurant' },
});

test('a POS device may serve restaurants of its own entity', async () => {
  await assertPosEntitiesMatch(tx([link(at(max), at(max))]), {});
  // Its own entity, or its location's when it has none: the effective ones match.
  await assertPosEntitiesMatch(tx([link(at(blk, max), at(max))]), {});
  // Neither side has an entity at all.
  await assertPosEntitiesMatch(tx([link(at(null), at(null))]), {});
});

test('a restaurant of another entity is refused, naming both', async () => {
  await assert.rejects(
    assertPosEntitiesMatch(tx([link(at(max), at(max)), link(at(max), at(blk))]), {}),
    (error: unknown) =>
      error instanceof BadRequestException &&
      /Counter 1 POS bills under Max Healthcare, but BLK main restaurant belongs to BLK Hospital/.test(
        error.message,
      ),
  );
  await assert.rejects(
    assertPosEntitiesMatch(tx([link(at(null), at(max))]), {}),
    BadRequestException,
  );
});
