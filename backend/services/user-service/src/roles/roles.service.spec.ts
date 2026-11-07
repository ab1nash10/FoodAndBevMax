import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { JwtRequestUser } from '@aahar/auth';
import { Prisma } from '@prisma/client';
import { test, vi } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RolesService } from './roles.service';

// The permission catalogue: id → code.
const catalogue: Record<string, string> = {
  'perm-kot': 'KOT_VIEW',
  'perm-menu': 'MENU_UPDATE',
  'perm-role': 'ROLE_UPDATE',
  'perm-user': 'USER_UPDATE',
};

function roleRow(id: string, name: string, permissionIds: string[], locationScope = 'SINGLE') {
  return {
    createdAt: new Date(),
    deletedAt: null as Date | null,
    description: null,
    id,
    locationScope,
    name,
    permissions: permissionIds.map((permissionId) => ({
      permission: { action: 'X', code: catalogue[permissionId], id: permissionId, module: 'M' },
      permissionId,
    })),
    status: 'ACTIVE',
    updatedAt: new Date(),
  };
}

const actor = (
  roles: string[],
  permissions: string[],
  locationScope: JwtRequestUser['locationScope'] = 'MULTI',
): JwtRequestUser => ({
  allowedHospitalIds: locationScope === 'ALL' ? null : ['h1'],
  id: 'actor-1',
  locationScope,
  permissions,
  roles,
});
const context = (user: JwtRequestUser) => ({
  actor: user,
  actorId: user.id,
  actorRoles: user.roles,
});

// A location Admin holding the role and user permissions, but not menu or KOT.
const admin = context(actor(['Admin'], ['ROLE_UPDATE', 'USER_UPDATE']));
// The same rights at every location: roles are global, so only this scope may change them.
const platformAdmin = context(actor(['Platform Admin'], ['ROLE_UPDATE', 'USER_UPDATE'], 'ALL'));
const superAdmin = context(actor(['Super Admin'], [], 'ALL'));

const onlySuperAdmin = (error: unknown) =>
  error instanceof ForbiddenException &&
  error.message === 'Only a Super Admin can change Super Admin access';

function rolesService(createError?: Error) {
  const roles = new Map([
    ['role-sa', roleRow('role-sa', 'Super Admin', ['perm-role', 'perm-user'], 'ALL')],
    ['role-kitchen', roleRow('role-kitchen', 'Kitchen', ['perm-kot'])],
    ['role-auditor', roleRow('role-auditor', 'Auditor', ['perm-user'], 'ALL')],
    ['role-admin', roleRow('role-admin', 'Admin', ['perm-role', 'perm-user'], 'MULTI')],
    [
      'role-platform',
      roleRow('role-platform', 'Platform Admin', ['perm-role', 'perm-user'], 'ALL'),
    ],
  ]);
  // Every call that would change the database.
  const writes: string[] = [];
  const write = (name: string) => () => {
    writes.push(name);
    return Promise.resolve({ count: 0 });
  };
  const db = {
    permission: {
      count: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => id in catalogue).length),
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ code: catalogue[id] }))),
    },
    role: {
      create: ({ data }: { data: { name: string } }) => {
        writes.push('role.create');
        if (createError) return Promise.reject(createError);
        roles.set('role-new', roleRow('role-new', data.name, []));
        return Promise.resolve(roles.get('role-new'));
      },
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(roles.get(where.id) ?? null),
      update: ({ data, where }: { data: object; where: { id: string } }) => {
        writes.push('role.update');
        const role = { ...roles.get(where.id), ...data } as ReturnType<typeof roleRow>;
        roles.set(where.id, role);
        return Promise.resolve(role);
      },
    },
    rolePermission: {
      createMany: vi.fn(write('rolePermission.createMany')),
      updateMany: write('rolePermission.updateMany'),
    },
  };
  const prisma = {
    ...db,
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(db),
  };
  const record = vi.fn((_entry: { action: string }) => Promise.resolve());
  const service = new RolesService(
    { record } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );

  return { createMany: db.rolePermission.createMany, record, roles, service, writes };
}

test('only a Super Admin may edit, re-permission or delete the Super Admin role', async () => {
  const { service, writes } = rolesService();

  for (const dto of [
    { description: 'Owner' },
    { name: 'Super Admin' },
    { permissionIds: ['perm-role'] },
    { permissionIds: ['perm-role', 'perm-user'] },
    { status: 'ACTIVE' as const },
  ]) {
    await assert.rejects(
      service.update('role-sa', dto, admin),
      onlySuperAdmin,
      JSON.stringify(dto),
    );
  }
  await assert.rejects(
    service.assignPermissions('role-sa', { permissionIds: ['perm-role'] }, admin),
    onlySuperAdmin,
  );
  await assert.rejects(service.remove('role-sa', admin), onlySuperAdmin);

  // No role names at all, or a missing actor, is refused too: never allowed by default.
  await assert.rejects(service.update('role-sa', { description: 'x' }, {}), onlySuperAdmin);
  await assert.rejects(service.remove('role-sa', { actorRoles: ['super admin'] }), onlySuperAdmin);

  assert.deepEqual(writes, []);
});

test('a Super Admin may edit the role, but never rename, deactivate or delete it', async () => {
  const { record, roles, service, writes } = rolesService();

  const updated = await service.update(
    'role-sa',
    { description: 'Platform owner', permissionIds: ['perm-role', 'perm-menu'] },
    superAdmin,
  );
  assert.equal(updated.description, 'Platform owner');
  assert.equal(record.mock.calls[0]?.[0].action, 'ROLE_UPDATE');
  await service.assignPermissions('role-sa', { permissionIds: ['perm-kot'] }, superAdmin);

  writes.length = 0;
  await assert.rejects(
    service.update('role-sa', { name: 'Owner' }, superAdmin),
    (error: unknown) =>
      error instanceof BadRequestException && /cannot be renamed/.test(error.message),
  );
  await assert.rejects(
    service.update('role-sa', { status: 'INACTIVE' }, superAdmin),
    (error: unknown) =>
      error instanceof BadRequestException && /cannot be made inactive/.test(error.message),
  );
  await assert.rejects(
    service.remove('role-sa', superAdmin),
    (error: unknown) =>
      error instanceof ConflictException && /cannot be deleted/.test(error.message),
  );
  assert.deepEqual(writes, []);
  assert.equal(roles.get('role-sa')?.name, 'Super Admin');
});

test('roles are data: a platform admin creates one with permissions they hold themselves', async () => {
  const { createMany, record, service } = rolesService();

  const created = await service.create(
    { description: 'Runs the counter', name: 'Counter Lead', permissionIds: ['perm-user'] },
    platformAdmin,
  );

  assert.equal(created?.name, 'Counter Lead');
  assert.deepEqual(
    (
      createMany.mock.calls[0] as unknown as [{ data: Array<{ permissionId: string }> }]
    )[0].data.map(({ permissionId }) => permissionId),
    ['perm-user'],
  );
  assert.equal(record.mock.calls[0]?.[0].action, 'ROLE_CREATE');
});

test('nobody but a Super Admin can put a permission they lack into a role', async () => {
  const { service, writes } = rolesService();
  const lacking = (error: unknown) =>
    error instanceof ForbiddenException && /do not hold: MENU_UPDATE/.test(error.message);

  await assert.rejects(
    service.create({ name: 'Menu Lead', permissionIds: ['perm-menu'] }, platformAdmin),
    lacking,
  );
  await assert.rejects(
    service.update('role-kitchen', { permissionIds: ['perm-kot', 'perm-menu'] }, platformAdmin),
    lacking,
  );
  await assert.rejects(
    service.assignPermissions('role-kitchen', { permissionIds: ['perm-menu'] }, platformAdmin),
    lacking,
  );
  assert.deepEqual(writes, []);

  // A Super Admin may grant anything.
  await service.create({ name: 'Menu Lead', permissionIds: ['perm-menu'] }, superAdmin);
});

test('only what a save adds must be held: keeping or removing a permission is not a grant', async () => {
  const { service } = rolesService();

  // The admin lacks KOT_VIEW, which the Kitchen role already has.
  await service.update('role-kitchen', { permissionIds: ['perm-kot', 'perm-user'] }, platformAdmin);
  await service.assignPermissions('role-kitchen', { permissionIds: ['perm-user'] }, platformAdmin);
  await service.update('role-kitchen', { description: 'Cooks' }, platformAdmin);
});

test('unknown permissions, missing roles and duplicate names are refused', async () => {
  const { service } = rolesService();

  await assert.rejects(
    service.create({ name: 'Ghost', permissionIds: ['perm-nope'] }, superAdmin),
    (error: unknown) =>
      error instanceof BadRequestException && /permissions were not found/.test(error.message),
  );
  await assert.rejects(
    service.assignPermissions(
      'role-kitchen',
      { permissionIds: ['perm-kot', 'perm-nope'] },
      superAdmin,
    ),
    BadRequestException,
  );
  await assert.rejects(service.getById('role-gone'), NotFoundException);
  await assert.rejects(service.update('role-gone', {}, superAdmin), NotFoundException);
  await assert.rejects(service.remove('role-gone', superAdmin), NotFoundException);

  const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    clientVersion: 'test',
    code: 'P2002',
  });
  await assert.rejects(
    rolesService(duplicate).service.create({ name: 'Kitchen' }, superAdmin),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Role already exists',
  );
});

test('roles are global: a location admin can create or change none of them', async () => {
  const { service, writes } = rolesService();
  const notPlatformWide = (error: unknown) =>
    error instanceof ForbiddenException &&
    error.message ===
      'Roles apply at every location, so only someone with access to all locations can change them';

  await assert.rejects(service.create({ name: 'Counter Lead' }, admin), notPlatformWide);
  // Not even a single-location role: every cashier everywhere would change. Nor their own.
  for (const id of ['role-kitchen', 'role-admin', 'role-auditor']) {
    await assert.rejects(service.update(id, { status: 'INACTIVE' }, admin), notPlatformWide, id);
    await assert.rejects(service.update(id, { description: 'x' }, admin), notPlatformWide, id);
    await assert.rejects(
      service.assignPermissions(id, { permissionIds: ['perm-user'] }, admin),
      notPlatformWide,
      id,
    );
    await assert.rejects(service.remove(id, admin), notPlatformWide, id);
  }
  assert.deepEqual(writes, []);
});

test('nobody but a Super Admin may change a role they hold themselves', async () => {
  const { roles, service, writes } = rolesService();
  const ownRole = (error: unknown) =>
    error instanceof ForbiddenException &&
    error.message === 'You cannot change the Platform Admin role because you hold it';

  await assert.rejects(
    service.update('role-platform', { status: 'INACTIVE' }, platformAdmin),
    ownRole,
  );
  await assert.rejects(
    service.update('role-platform', { permissionIds: ['perm-user'] }, platformAdmin),
    ownRole,
  );
  await assert.rejects(
    service.assignPermissions('role-platform', { permissionIds: ['perm-user'] }, platformAdmin),
    ownRole,
  );
  await assert.rejects(service.remove('role-platform', platformAdmin), ownRole);
  assert.deepEqual(writes, []);

  // Other roles, at any reach, they may change; a Super Admin may change any but their own rules.
  await service.update('role-admin', { status: 'INACTIVE' }, platformAdmin);
  await service.update('role-auditor', { description: 'Reads' }, platformAdmin);
  await service.update('role-platform', { description: 'Runs it all' }, superAdmin);
  assert.equal(roles.get('role-admin')?.status, 'INACTIVE');
});

test('deleting an ordinary role retires it and its permission links', async () => {
  const { record, roles, service, writes } = rolesService();

  assert.deepEqual(await service.remove('role-kitchen', platformAdmin), { id: 'role-kitchen' });

  assert.deepEqual(writes, ['role.update', 'rolePermission.updateMany']);
  assert.equal(roles.get('role-kitchen')?.status, 'INACTIVE');
  assert.ok(roles.get('role-kitchen')?.deletedAt instanceof Date);
  assert.equal(record.mock.calls[0]?.[0].action, 'ROLE_DELETE');
});
