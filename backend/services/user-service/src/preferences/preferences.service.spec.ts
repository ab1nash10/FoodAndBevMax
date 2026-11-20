import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import type { JwtRequestUser } from '@aahar/auth';
import { test, vi } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { PreferencesService } from './preferences.service';

const actor = { id: 'user-1' } as JwtRequestUser;

// A user working at locations a and b, home a, with a theme saved and an old JSON default.
function serviceForDefaults(allowedHospitalIds: string[] | null) {
  const update = vi.fn();
  const prisma = {
    hospital: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        { displayName: null, hospitalName: 'Hospital A', id: 'hospital-a', legalEntity: null },
        {
          displayName: 'B',
          hospitalName: 'Hospital B',
          id: 'hospital-b',
          legalEntity: { locationName: 'Apollo Wing' },
        },
      ]),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        employeeCode: 'E1001',
        hospitalId: 'hospital-a',
        preferences: { defaultLocationId: 'all', theme: 'dark' },
      }),
      update,
    },
  };
  const service = new PreferencesService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );
  const user = {
    ...actor,
    allowedHospitalIds,
    locationScope: 'MULTI',
    permissions: ['RESTAURANT_UPDATE'],
  } as JwtRequestUser;

  return { prisma, service, update, user };
}

test('the default location is the home location, not the old JSON value', async () => {
  const { service, user } = serviceForDefaults(['hospital-a', 'hospital-b']);

  assert.equal((await service.get('user-1')).defaultLocationId, 'hospital-a');
  assert.deepEqual(await service.access(user), {
    defaultLocationId: 'hospital-a',
    // Shown under Preferences → My details.
    employeeCode: 'E1001',
    locationScope: 'MULTI',
    // Named as the Locations list names them: the entity's Location, else the location's own
    // title; in that order. A location without a display name shows its name there.
    locations: [
      { displayName: 'B', hospitalName: 'Hospital B', id: 'hospital-b', title: 'Apollo Wing' },
      {
        displayName: 'Hospital A',
        hospitalName: 'Hospital A',
        id: 'hospital-a',
        title: 'Hospital A',
      },
    ],
    // The caller's current permissions, for the portal's own server routes.
    permissions: ['RESTAURANT_UPDATE'],
  });
});

test('the locations offered are the active ones within reach', async () => {
  const { prisma, service, user } = serviceForDefaults(['hospital-a', 'hospital-b']);

  await service.access(user);
  await service.access({ ...user, allowedHospitalIds: null });

  const [scoped, everywhere] = prisma.hospital.findMany.mock.calls.map(
    ([args]) => (args as { where: Record<string, unknown> }).where,
  );
  assert.deepEqual(scoped, {
    deletedAt: null,
    id: { in: ['hospital-a', 'hospital-b'] },
    isActive: true,
  });
  assert.deepEqual(everywhere, { deletedAt: null, isActive: true });
});

test('choosing another of your locations saves it as your home location', async () => {
  const { service, update, user } = serviceForDefaults(['hospital-a', 'hospital-b']);

  const saved = await service.update(user, { defaultLocationId: 'hospital-b' });

  assert.equal(saved.defaultLocationId, 'hospital-b');
  const { data } = update.mock.calls[0]?.[0] as {
    data: { hospitalId?: string; preferences: Record<string, unknown> };
  };
  assert.equal(data.hospitalId, 'hospital-b');
  assert.equal('defaultLocationId' in data.preferences, false, 'no copy left in the JSON');
  assert.equal(data.preferences.theme, 'dark', 'other preferences are kept');
});

test('saving other preferences leaves the default location alone', async () => {
  const { service, update, user } = serviceForDefaults(['hospital-a', 'hospital-b']);

  await service.update(user, { theme: 'light' });

  const { data } = update.mock.calls[0]?.[0] as { data: { hospitalId?: string } };
  assert.equal('hospitalId' in data, false);
});

test('a default outside your locations, or none at all, is refused', async () => {
  const { service, update, user } = serviceForDefaults(['hospital-a', 'hospital-b']);

  await assert.rejects(
    service.update(user, { defaultLocationId: 'hospital-z' }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'That location is outside your assigned access',
  );
  await assert.rejects(
    service.update(user, { defaultLocationId: null as unknown as string }),
    (error: unknown) =>
      error instanceof BadRequestException && error.message === 'Choose a location as your default',
  );
  assert.equal(update.mock.calls.length, 0);
});

test('a user who reaches every location may choose any location as default', async () => {
  const { service, update } = serviceForDefaults(null);

  await service.update(
    { ...actor, allowedHospitalIds: null },
    {
      defaultLocationId: 'hospital-z',
    },
  );

  assert.equal(
    (update.mock.calls[0]?.[0] as { data: { hospitalId: string } }).data.hospitalId,
    'hospital-z',
  );
});

test('your preferences say nothing about a password: sign-in is by code only', async () => {
  const findFirst = vi.fn().mockResolvedValue({ hospitalId: null, preferences: {} });
  const service = new PreferencesService(
    { record: vi.fn() } as unknown as AuditLogService,
    { user: { findFirst } } as unknown as PrismaService,
  );

  const preferences = await service.get(actor.id);

  assert.equal('hasPassword' in preferences, false);
  assert.equal(
    'passwordHash' in (findFirst.mock.calls[0]?.[0] as { select: object }).select,
    false,
  );
});
