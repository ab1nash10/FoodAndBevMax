import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { hospitalScopeStorage } from '@aahar/auth';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import type { TimeSlotsRepository } from './time-slots.repository';
import { TimeSlotsService } from './time-slots.service';

type StoredSlot = {
  deletedAt: Date | null;
  endTime: string | null;
  hospitalId: string | null;
  id: string;
  isActive: boolean;
  isAlwaysAvailable: boolean;
  slotName: string;
  startTime: string | null;
};

// Stands in for the repository and transaction: slots live in memory.
function serviceWith(slots: StoredSlot[] = []) {
  const hospitals: Record<string, boolean> = { 'hospital-a': true, 'hospital-b': true };
  const tx = {
    hospital: {
      findFirst: ({ where }: { where: { id: string } }) =>
        where.id in hospitals ? { isActive: hospitals[where.id] } : null,
    },
  };
  const repository = {
    create: (data: Omit<StoredSlot, 'deletedAt' | 'id'>) => {
      const slot = { ...data, deletedAt: null, id: `slot-${slots.length + 1}` };
      slots.push(slot);
      return { ...slot };
    },
    findActiveById: (id: string) => {
      const slot = slots.find((stored) => stored.id === id && !stored.deletedAt);
      return slot ? { ...slot } : null;
    },
    // Like the real query: case-insensitive, and deleted slots still count.
    findByName: (slotName: string, excludeId?: string) =>
      slots.find(
        (slot) => slot.slotName.toLowerCase() === slotName.toLowerCase() && slot.id !== excludeId,
      ) ?? null,
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (
      id: string,
      data: Partial<StoredSlot> & {
        hospital?: { connect?: { id: string }; disconnect?: boolean };
      },
    ) => {
      const slot = slots.find((stored) => stored.id === id)!;
      const { hospital, ...fields } = data;
      Object.assign(slot, fields);

      if (hospital) {
        slot.hospitalId = hospital.connect?.id ?? null;
      }

      return { ...slot };
    },
  };

  return new TimeSlotsService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as TimeSlotsRepository,
  );
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const slot = (overrides: Partial<StoredSlot> = {}): StoredSlot => ({
  deletedAt: null,
  endTime: '10:30',
  hospitalId: null,
  id: 'breakfast',
  isActive: true,
  isAlwaysAvailable: false,
  slotName: 'Breakfast',
  startTime: '07:00',
  ...overrides,
});
const breakfast = {
  endTime: '10:30',
  slotName: 'Breakfast',
  startTime: '07:00',
} as CreateTimeSlotDto;
const asLocationUser = <T>(work: () => Promise<T>) =>
  hospitalScopeStorage.run({ allowedHospitalIds: ['hospital-a'] }, work);
const isBadTimes = (error: unknown) =>
  error instanceof BadRequestException && error.message === 'End time must be after start time';

test('a slot must end after it starts', async () => {
  const service = serviceWith();

  await assert.rejects(service.create({ ...breakfast, endTime: '06:00' }, actor), isBadTimes);
  await assert.rejects(service.create({ ...breakfast, endTime: '07:00' }, actor), isBadTimes);
  const created = await service.create(breakfast, actor);
  assert.equal(created?.endTime, '10:30');
  // An edit is checked against the times it keeps.
  await assert.rejects(service.update(created.id, { startTime: '11:00' }, actor), isBadTimes);
});

test('an always-available slot keeps no times', async () => {
  const service = serviceWith();

  const created = await service.create({ ...breakfast, isAlwaysAvailable: true }, actor);

  assert.equal(created?.startTime, null);
  assert.equal(created?.endTime, null);
  assert.equal(created?.isAlwaysAvailable, true);
});

test('a slot that stops being always available needs both times', async () => {
  const service = serviceWith([slot({ endTime: null, isAlwaysAvailable: true, startTime: null })]);

  await assert.rejects(
    service.update('breakfast', { isAlwaysAvailable: false, startTime: '07:00' }, actor),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Start time and end time are required',
  );
  const updated = await service.update(
    'breakfast',
    { endTime: '10:30', isAlwaysAvailable: false, startTime: '07:00' },
    actor,
  );
  assert.equal(updated?.startTime, '07:00');
});

test('a slot name is used once, whatever its case', async () => {
  const service = serviceWith([slot()]);
  const isDuplicate = (error: unknown) =>
    error instanceof ConflictException && error.message === 'Time slot already exists';

  await assert.rejects(service.create({ ...breakfast, slotName: 'BREAKFAST' }, actor), isDuplicate);
  await assert.doesNotReject(service.update('breakfast', { slotName: 'breakfast' }, actor));
});

test('only a Super Admin adds or changes a slot shared by every location', async () => {
  const service = serviceWith([slot()]);
  const isForbidden = (error: unknown) => error instanceof ForbiddenException;

  await asLocationUser(async () => {
    await assert.rejects(service.create({ ...breakfast, slotName: 'Lunch' }, actor), isForbidden);
    await assert.rejects(service.update('breakfast', { slotName: 'Brunch' }, actor), isForbidden);
    await assert.rejects(service.remove('breakfast', actor), isForbidden);
    const own = await service.create(
      { ...breakfast, hospitalId: 'hospital-a', slotName: 'Lunch' },
      actor,
    );
    assert.equal(own?.hospitalId, 'hospital-a');
  });
});

test('a shared slot can be given to one location and shared again', async () => {
  const service = serviceWith([slot()]);

  const moved = await service.update('breakfast', { hospitalId: 'hospital-b' }, actor);
  assert.equal(moved?.hospitalId, 'hospital-b');
  const shared = await service.update('breakfast', { hospitalId: null }, actor);
  assert.equal(shared?.hospitalId, null);
});

// Menus keep their own on-sale times, so no menu holds a slot back.
test('deleting a slot switches it off', async () => {
  const slots = [slot()];
  const service = serviceWith(slots);

  await service.remove('breakfast', actor);
  assert.ok(slots[0]?.deletedAt);
  assert.equal(slots[0]?.isActive, false);
});
