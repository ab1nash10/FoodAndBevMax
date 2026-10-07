import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { hashPassword, verifyPassword, type JwtRequestUser } from '@aahar/auth';
import { test, vi } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { PreferencesService } from './preferences.service';

const actor = { id: 'user-1' } as JwtRequestUser;

async function serviceWithPassword(current: string) {
  const update = vi.fn();
  const record = vi.fn<(entry: { action: string }) => Promise<void>>();
  const prisma = {
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work({ user: { update } }),
    user: { findFirst: vi.fn().mockResolvedValue({ passwordHash: await hashPassword(current) }) },
  };
  const service = new PreferencesService(
    { record } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );

  return { record, service, update };
}

test('changing your own password stores the new one and ends every session', async () => {
  const { record, service, update } = await serviceWithPassword('Current123');

  assert.deepEqual(
    await service.changePassword(actor, {
      currentPassword: 'Current123',
      newPassword: 'Newpass456',
    }),
    { changed: true },
  );

  assert.equal(update.mock.calls.length, 1);
  const { data, where } = update.mock.calls[0]?.[0] as {
    data: { passwordHash: string; sessionVersion: unknown; updatedBy: string };
    where: { id: string };
  };
  assert.deepEqual(where, { id: 'user-1' });
  assert.deepEqual(
    data.sessionVersion,
    { increment: 1 },
    'the session version moves on, so every token issued before the change is refused',
  );
  assert.equal(await verifyPassword('Newpass456', data.passwordHash), true);
  assert.equal(data.updatedBy, 'user-1');
  assert.equal(record.mock.calls[0]?.[0].action, 'USER_PASSWORD_CHANGE');
});

test('a wrong current password changes nothing and keeps the sessions', async () => {
  const { service, update } = await serviceWithPassword('Current123');

  await assert.rejects(
    service.changePassword(actor, { currentPassword: 'Wrong999', newPassword: 'Newpass456' }),
    (error: unknown) =>
      error instanceof BadRequestException && error.message === 'Current password is incorrect',
  );
  assert.equal(update.mock.calls.length, 0);
});
