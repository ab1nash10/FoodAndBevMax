import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PaymentMachinesRepository } from './payment-machines.repository';
import { PaymentMachinesService } from './payment-machines.service';

type StoredMachine = {
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  pinelabSecurityToken: string | null;
  posDeviceId: string;
};

const hospitals: Record<string, boolean> = { saket: true, vaishali: true };
const posDevices: Record<string, { hospitalId: string; isActive: boolean }> = {
  'pos-1': { hospitalId: 'saket', isActive: true },
  'pos-2': { hospitalId: 'saket', isActive: true },
  'pos-off': { hospitalId: 'saket', isActive: false },
  'pos-v': { hospitalId: 'vaishali', isActive: true },
};

// Stands in for the repository: keeps machines in memory and filters like the real queries.
function serviceWith(machines: StoredMachine[] = []) {
  const actions: string[] = [];
  const withRelations = (machine: StoredMachine) => ({
    ...machine,
    hospital: { id: machine.hospitalId, isActive: hospitals[machine.hospitalId] },
    posDevice: { id: machine.posDeviceId, isActive: true },
  });
  const repository = {
    create: (data: Omit<StoredMachine, 'deletedAt' | 'id'>) => {
      const machine = {
        ...data,
        deletedAt: null,
        id: `machine-${machines.length + 1}`,
        // The DTO leaves the token out when none is given; the column then holds null.
        pinelabSecurityToken: data.pinelabSecurityToken ?? null,
      };
      machines.push(machine);
      return withRelations(machine);
    },
    findActiveById: (id: string) => {
      const machine = machines.find((stored) => stored.id === id && !stored.deletedAt);
      return machine ? withRelations(machine) : null;
    },
    findActiveHospital: (id: string) => (id in hospitals ? { id, isActive: hospitals[id] } : null),
    findActivePosDevice: (id: string, hospitalId: string) => {
      const device = posDevices[id];
      return device?.isActive && device.hospitalId === hospitalId ? { id } : null;
    },
    findDefaultsForPosDevice: (posDeviceId: string, excludeId: string | undefined) =>
      machines
        .filter(
          (machine) =>
            !machine.deletedAt &&
            machine.isDefault &&
            machine.posDeviceId === posDeviceId &&
            machine.id !== excludeId,
        )
        .map(withRelations),
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    update: (
      id: string,
      data: Partial<StoredMachine> & {
        hospital?: { connect: { id: string } };
        posDevice?: { connect: { id: string } };
      },
    ) => {
      const machine = machines.find((stored) => stored.id === id)!;
      const { hospital, posDevice, ...fields } = data;
      Object.assign(machine, fields);
      machine.hospitalId = hospital?.connect.id ?? machine.hospitalId;
      machine.posDeviceId = posDevice?.connect.id ?? machine.posDeviceId;
      return withRelations(machine);
    },
  };
  const service = new PaymentMachinesService(
    {
      record: (input: { action: string }) => {
        actions.push(input.action);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as PaymentMachinesRepository,
  );

  return { actions, machines, service };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const machine = (id: string, posDeviceId: string, isDefault = false): StoredMachine => ({
  deletedAt: null,
  hospitalId: posDevices[posDeviceId]!.hospitalId,
  id,
  isActive: true,
  isDefault,
  name: id,
  pinelabSecurityToken: null,
  posDeviceId,
});
const defaults = (machines: StoredMachine[]) =>
  machines.filter((stored) => stored.isDefault).map((stored) => stored.id);

test('the Pine Labs token is never returned, only its last four characters', async () => {
  const { service } = serviceWith();

  const created = await service.create(
    {
      hospitalId: 'saket',
      name: 'T1',
      pinelabSecurityToken: 'secret-token-9876',
      posDeviceId: 'pos-1',
    },
    actor,
  );
  assert.equal(created?.pinelabSecurityToken, '••••9876');
  assert.equal(created?.hasPinelabSecurityToken, true);

  const bare = await service.create(
    { hospitalId: 'saket', name: 'T2', posDeviceId: 'pos-1' },
    actor,
  );
  assert.equal(bare?.pinelabSecurityToken, null);
  assert.equal(bare?.hasPinelabSecurityToken, false);
});

test('a machine needs an active POS device of the chosen location', async () => {
  const { service } = serviceWith();
  const isRefused = (error: unknown) =>
    error instanceof BadRequestException &&
    error.message === 'POS device not found for selected location';

  await assert.rejects(
    service.create({ hospitalId: 'saket', name: 'T1', posDeviceId: 'pos-v' }, actor),
    isRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'saket', name: 'T1', posDeviceId: 'pos-off' }, actor),
    isRefused,
  );
});

test('a new default machine takes over from the old default of the same POS device only', async () => {
  const { actions, machines, service } = serviceWith([
    machine('old', 'pos-1', true),
    machine('other-device', 'pos-2', true),
  ]);

  const created = await service.create(
    { hospitalId: 'saket', isDefault: true, name: 'New', posDeviceId: 'pos-1' },
    actor,
  );

  assert.deepEqual(defaults(machines), ['other-device', created?.id]);
  assert.deepEqual(actions, ['PAYMENT_MACHINE_DEFAULT_CHANGE', 'PAYMENT_MACHINE_CREATE']);
});

test('making a machine the default demotes the current one; it does not demote itself', async () => {
  const { machines, service } = serviceWith([machine('a', 'pos-1', true), machine('b', 'pos-1')]);

  await service.update('a', { isDefault: true }, actor);
  assert.deepEqual(defaults(machines), ['a']);

  await service.update('b', { isDefault: true }, actor);
  assert.deepEqual(defaults(machines), ['b']);
});

test('moving a default machine to another POS device leaves that device one default', async () => {
  const { machines, service } = serviceWith([
    machine('a', 'pos-1', true),
    machine('b', 'pos-2', true),
  ]);

  await service.update('a', { posDeviceId: 'pos-2' }, actor);

  assert.deepEqual(defaults(machines), ['a']);
  assert.equal(machines[0]?.posDeviceId, 'pos-2');
});

test('deleting a machine also drops its default flag', async () => {
  const { actions, machines, service } = serviceWith([machine('a', 'pos-1', true)]);

  await service.remove('a', actor);

  assert.equal(machines[0]?.isDefault, false);
  assert.equal(machines[0]?.isActive, false);
  assert.ok(machines[0]?.deletedAt);
  assert.deepEqual(actions, ['PAYMENT_MACHINE_DELETE']);
});
