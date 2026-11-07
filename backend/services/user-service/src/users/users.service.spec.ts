import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { verifyPassword, type JwtRequestUser } from '@aahar/auth';
import { Prisma } from '@prisma/client';
import { test, vi } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { UsersService } from './users.service';

// The permission catalogue: id → code.
const catalogue: Record<string, string> = {
  'perm-kot': 'KOT_VIEW',
  'perm-menu': 'MENU_UPDATE',
  'perm-user': 'USER_UPDATE',
};

const role = (
  id: string,
  name: string,
  locationScope: string,
  permissionIds: string[],
  status = 'ACTIVE',
) => ({
  description: null,
  id,
  locationScope,
  name,
  permissionIds,
  status,
});
const roles = {
  admin: role('role-admin', 'Admin', 'MULTI', ['perm-user']),
  kitchen: role('role-kitchen', 'Kitchen', 'SINGLE', ['perm-kot']),
  menu: role('role-menu', 'Menu Lead', 'SINGLE', ['perm-menu']),
  retired: role('role-retired', 'Retired', 'SINGLE', [], 'INACTIVE'),
  superAdmin: role('role-sa', 'Super Admin', 'ALL', ['perm-kot', 'perm-menu', 'perm-user']),
};
type RoleRow = ReturnType<typeof role>;

const hospitals = ['h1', 'h2', 'h3'];

function userRow(id: string, name: string, userRole: RoleRow | null, hospitalIds: string[]) {
  return {
    assignedHospitals: hospitalIds.map((hospitalId) => ({
      hospital: { hospitalName: hospitalId, id: hospitalId },
      hospitalId,
    })),
    avatarUrl: null,
    createdAt: new Date(),
    deletedAt: null as Date | null,
    designation: null as string | null,
    email: `${id}@max.in` as string | null,
    employeeCode: id.toUpperCase(),
    hospitalId: hospitalIds[0] ?? null,
    id,
    lastActiveAt: null,
    mobile: `9${String(hospitalIds.length).padStart(9, '0')}`,
    name,
    passwordHash: null,
    roles: userRole ? [{ role: userRole }] : [],
    sessionVersion: 0,
    status: 'ACTIVE',
    updatedAt: new Date(),
  };
}
type UserRow = ReturnType<typeof userRow>;

const actor = (
  id: string,
  roleNames: string[],
  locationScope: JwtRequestUser['locationScope'],
  allowedHospitalIds: string[] | null,
  permissions: string[],
): JwtRequestUser => ({ allowedHospitalIds, id, locationScope, permissions, roles: roleNames });
const context = (user: JwtRequestUser) => ({
  actor: user,
  actorId: user.id,
  actorRoles: user.roles,
});

const superAdmin = context(
  actor('actor-sa', ['Super Admin'], 'ALL', null, Object.values(catalogue)),
);
// An Admin working at h1 and h2, holding user and KOT permissions but not menu.
const admin = context(
  actor('u-admin', ['Admin'], 'MULTI', ['h1', 'h2'], ['USER_UPDATE', 'KOT_VIEW']),
);
// A single-location supervisor allowed to manage users.
const supervisor = context(
  actor('u-sup', ['Supervisor'], 'SINGLE', ['h1'], ['USER_UPDATE', 'KOT_VIEW']),
);

const onlySuperAdmin = (error: unknown) =>
  error instanceof ForbiddenException &&
  error.message === 'Only a Super Admin can change Super Admin access';
const badRequest = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);
const forbidden = (pattern: RegExp) => (error: unknown) =>
  error instanceof ForbiddenException && pattern.test(error.message);

const newUser = (roleId: string, hospitalIds?: string[]) => ({
  email: 'Asha.K@Max.IN',
  employeeCode: 'EMP9',
  hospitalIds,
  mobile: '9876543210',
  name: 'Asha K',
  password: 'Secret123',
  roleId,
});

function usersService(options: { createError?: Error; superAdminsLeft?: number } = {}) {
  const users = new Map<string, UserRow>(
    [
      userRow('u-sa', 'Sam', roles.superAdmin, ['h1']),
      userRow('u-admin', 'Anil', roles.admin, ['h1', 'h2']),
      userRow('u-cook', 'Cook', roles.kitchen, ['h1']),
      userRow('u-menu', 'Meera', roles.menu, ['h2']),
      userRow('u-far', 'Vik', roles.kitchen, ['h3']),
      userRow('u-shared', 'Shared', roles.admin, ['h1', 'h3']),
    ].map((user) => [user.id, user]),
  );
  const roleById = new Map(Object.values(roles).map((row) => [row.id, row]));
  const writes: Array<[string, unknown]> = [];
  const write = (name: string, apply?: (args: never) => void) => (args: never) => {
    writes.push([name, args]);
    apply?.(args);
    return Promise.resolve({ count: 1 });
  };
  const userById = (id: string) => {
    const user = users.get(id);
    if (!user) throw new Error(`no user ${id}`);
    return user;
  };
  // The reach filter userReachWhere adds: an OR of "works at one of these hospitals".
  const withinReach = (user: UserRow, where: { OR?: Array<{ hospitalId?: { in: string[] } }> }) => {
    const allowed = where.OR?.[0]?.hospitalId?.in;
    const worksAt = [
      user.hospitalId,
      ...user.assignedHospitals.map(({ hospitalId }) => hospitalId),
    ];
    return !allowed || worksAt.some((id) => id !== null && allowed.includes(id));
  };
  const permissionRows = (ids: string[]) =>
    ids.map((id) => ({
      action: 'X',
      code: catalogue[id] ?? '',
      description: null,
      id,
      module: 'M',
    }));

  const db = {
    $queryRaw: vi.fn(() => Promise.resolve([])),
    hospital: {
      count: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => hospitals.includes(id)).length),
    },
    permission: {
      count: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => id in catalogue).length),
      findMany: ({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(permissionRows(where.id?.in ?? Object.keys(catalogue))),
    },
    role: {
      findFirst: ({ where }: { where: { id: string } }) => {
        const row = roleById.get(where.id);
        return Promise.resolve(
          row && {
            ...row,
            permissions: row.permissionIds.map((id) => ({ permission: { code: catalogue[id] } })),
          },
        );
      },
    },
    rolePermission: {
      findMany: ({ where }: { where: { roleId: { in: string[] } } }) =>
        Promise.resolve(
          where.roleId.in.flatMap(
            (id) => roleById.get(id)?.permissionIds.map((permissionId) => ({ permissionId })) ?? [],
          ),
        ),
    },
    user: {
      count: () => Promise.resolve(options.superAdminsLeft ?? 1),
      create: (args: { data: Partial<UserRow> }) => {
        writes.push(['user.create', args]);
        if (options.createError) return Promise.reject(options.createError);
        users.set('u-new', {
          ...userRow('u-new', 'New', null, []),
          ...args.data,
          hospitalId: null,
        });
        return Promise.resolve({ id: 'u-new' });
      },
      findFirst: ({
        where,
      }: {
        where: { id: string; OR?: Array<{ hospitalId?: { in: string[] } }> };
      }) => {
        const user = users.get(where.id);
        // A copy, like a real query: later writes must not change what the service already read.
        return Promise.resolve(
          user && !user.deletedAt && withinReach(user, where) ? structuredClone(user) : null,
        );
      },
      findFirstOrThrow: ({ where }: { where: { id: string } }) =>
        Promise.resolve(structuredClone(userById(where.id))),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(users.get(where.id) ?? null),
      update: (args: { data: Partial<UserRow>; where: { id: string } }) => {
        writes.push(['user.update', args]);
        Object.assign(userById(args.where.id), args.data);
        return Promise.resolve(structuredClone(userById(args.where.id)));
      },
      updateMany: write('user.updateMany'),
    },
    userHospital: {
      createMany: write(
        'userHospital.createMany',
        ({ data }: { data: Array<{ hospitalId: string; userId: string }> }) => {
          for (const { hospitalId, userId } of data) {
            userById(userId).assignedHospitals.push({
              hospital: { hospitalName: hospitalId, id: hospitalId },
              hospitalId,
            });
          }
        },
      ),
      updateMany: write(
        'userHospital.updateMany',
        ({ where }: { where: { deletedAt?: null; userId: string } }) => {
          if (where.deletedAt === null) userById(where.userId).assignedHospitals = [];
        },
      ),
    },
    userPermission: {
      createMany: write('userPermission.createMany'),
      findMany: () => Promise.resolve([]),
      updateMany: write('userPermission.updateMany'),
    },
    userRole: {
      updateMany: write('userRole.updateMany', ({ where }: { where: { userId: string } }) => {
        userById(where.userId).roles = [];
      }),
      upsert: write(
        'userRole.upsert',
        ({ create }: { create: { roleId: string; userId: string } }) => {
          const granted = roleById.get(create.roleId);
          if (granted) userById(create.userId).roles.push({ role: granted });
        },
      ),
    },
  };
  const prisma = {
    ...db,
    $transaction: (work: unknown) =>
      typeof work === 'function'
        ? (work as (tx: unknown) => Promise<unknown>)(db)
        : Promise.all(work as unknown[]),
  };
  const record = vi.fn((_entry: { action: string; newValue?: unknown }) => Promise.resolve());
  const service = new UsersService(
    { record } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );
  const wrote = (name: string) => writes.filter(([call]) => call === name).map(([, args]) => args);

  return { queryRaw: db.$queryRaw, record, service, users, wrote, writes };
}

test('a non-Super Admin can never grant the Super Admin role', async () => {
  const { service, users, wrote } = usersService();

  await assert.rejects(service.create(newUser('role-sa', ['h1']), admin), onlySuperAdmin);
  await assert.rejects(service.assignRole('u-cook', { roleId: 'role-sa' }, admin), onlySuperAdmin);
  await assert.rejects(
    service.update('u-cook', { hospitalIds: ['h1'], roleId: 'role-sa' }, admin),
    onlySuperAdmin,
  );

  assert.equal(wrote('user.create').length, 0);
  assert.equal(wrote('userRole.upsert').length, 0);
  assert.equal(users.get('u-cook')?.roles[0]?.role.name, 'Kitchen');
});

test('a non-Super Admin cannot edit, demote, delete or re-permission a Super Admin user', async () => {
  const { service, users, writes } = usersService();

  for (const dto of [
    { name: 'Sam S' },
    { designation: 'Owner' },
    { password: 'Takeover1' },
    { email: 'mine@max.in' },
    { status: 'DISABLED' as const },
    { hospitalIds: ['h1'], roleId: 'role-kitchen' },
  ]) {
    await assert.rejects(service.update('u-sa', dto, admin), onlySuperAdmin, JSON.stringify(dto));
  }
  await assert.rejects(service.remove('u-sa', admin), onlySuperAdmin);
  await assert.rejects(
    service.assignRole('u-sa', { roleId: 'role-kitchen' }, admin),
    onlySuperAdmin,
  );
  await assert.rejects(
    service.assignLocations({ hospitalIds: ['h1'], userIds: ['u-cook', 'u-sa'] }, admin),
    onlySuperAdmin,
  );
  await assert.rejects(
    service.replacePermissions('u-sa', { permissionIds: [] }, admin),
    onlySuperAdmin,
  );
  // Holding every permission is still not being a Super Admin.
  const powerful = context(actor('u-x', ['Admin'], 'ALL', null, Object.values(catalogue)));
  await assert.rejects(service.update('u-sa', { name: 'Sam S' }, powerful), onlySuperAdmin);

  assert.deepEqual(
    writes.filter(([, args]) => JSON.stringify(args).includes('u-sa')),
    [],
    'nothing was written for the Super Admin user',
  );
  assert.equal(users.get('u-sa')?.name, 'Sam');
});

test('a Super Admin may grant and revoke Super Admin, as long as one active Super Admin remains', async () => {
  const granted = usersService();
  const created = await granted.service.create(newUser('role-sa', ['h1']), superAdmin);
  assert.deepEqual(
    created?.roles.map(({ name }) => name),
    ['Super Admin'],
  );

  // Sam is the last one. The real transaction rolls back; here each attempt gets a fresh store.
  const lastOne = (error: unknown) =>
    error instanceof ConflictException &&
    error.message === 'At least one active Super Admin must remain';
  for (const attempt of [
    (service: UsersService) => service.remove('u-sa', superAdmin),
    (service: UsersService) => service.update('u-sa', { status: 'DISABLED' }, superAdmin),
    (service: UsersService) => service.assignRole('u-sa', { roleId: 'role-admin' }, superAdmin),
  ]) {
    const { queryRaw, service } = usersService({ superAdminsLeft: 0 });
    await assert.rejects(attempt(service), lastOne);
    assert.equal(queryRaw.mock.calls.length, 1, 'the count is taken under the advisory lock');
  }

  // With another Super Admin left, the same demotion goes through.
  const demoted = await usersService({ superAdminsLeft: 1 }).service.assignRole(
    'u-sa',
    { roleId: 'role-admin' },
    superAdmin,
  );
  assert.deepEqual(
    demoted.roles.map(({ name }) => name),
    ['Admin'],
  );
});

test('the role’s location scope decides how many locations a user holds', async () => {
  const create = (roleId: string, hospitalIds?: string[]) =>
    usersService().service.create(newUser(roleId, hospitalIds), superAdmin);

  // SINGLE: exactly one.
  await assert.rejects(create('role-kitchen'), badRequest(/exactly one location/));
  await assert.rejects(create('role-kitchen', ['h1', 'h2']), badRequest(/exactly one location/));
  assert.deepEqual(
    (await create('role-kitchen', ['h2']))?.hospitals.map(({ id }) => id),
    ['h2'],
  );
  // MULTI: at least one.
  await assert.rejects(create('role-admin', []), badRequest(/at least one assigned location/));
  assert.deepEqual(
    (await create('role-admin', ['h1', 'h3']))?.hospitals.map(({ id }) => id),
    ['h1', 'h3'],
  );
  // ALL: reaches everything, but still starts somewhere.
  await assert.rejects(create('role-sa', []), badRequest(/Choose a default location/));
  // Locations must exist.
  await assert.rejects(create('role-kitchen', ['h9']), badRequest(/locations were not found/));
});

test('an admin stays inside their own locations, scope and permissions', async () => {
  const { service } = usersService();

  // Locations outside their own.
  await assert.rejects(
    service.create(newUser('role-kitchen', ['h3']), admin),
    forbidden(/only assign locations within your own access/),
  );
  await assert.rejects(
    service.assignLocations({ hospitalIds: ['h3'], userIds: ['u-cook'] }, admin),
    forbidden(/within your own access/),
  );
  // A user working only elsewhere reads as not found; one also working elsewhere is refused.
  await assert.rejects(service.update('u-far', { name: 'Vik S' }, admin), NotFoundException);
  await assert.rejects(service.getById('u-far', admin), NotFoundException);
  await assert.rejects(
    service.update('u-shared', { name: 'Shared S' }, admin),
    forbidden(/works at a location outside your assigned access/),
  );
  // A wider role than their own scope, a role with permissions they lack, an inactive role.
  await assert.rejects(
    service.create(newUser('role-admin', ['h1']), supervisor),
    forbidden(/You cannot assign the Admin role/),
  );
  await assert.rejects(
    service.create(newUser('role-menu', ['h1']), admin),
    forbidden(/do not hold: MENU_UPDATE/),
  );
  await assert.rejects(
    service.assignRole('u-cook', { roleId: 'role-retired' }, admin),
    badRequest(/Retired role is inactive/),
  );
  await assert.rejects(
    service.replacePermissions('u-cook', { permissionIds: ['perm-kot', 'perm-menu'] }, admin),
    forbidden(/do not hold: MENU_UPDATE/),
  );

  // Inside their reach the same calls work.
  await service.create(newUser('role-kitchen', ['h2']), admin);
  await service.replacePermissions('u-cook', { permissionIds: ['perm-user'] }, admin);
  // A user who already holds a role the admin could not grant keeps saving with it.
  await service.update(
    'u-menu',
    { hospitalIds: ['h2'], name: 'Meera S', roleId: 'role-menu' },
    admin,
  );
});

test('only a Super Admin may change their own role, locations, status, permissions or account', async () => {
  const { service } = usersService();
  const ownChange = forbidden(/You cannot change your own/);

  await assert.rejects(
    service.update('u-admin', { hospitalIds: ['h1'], roleId: 'role-kitchen' }, admin),
    ownChange,
  );
  await assert.rejects(service.update('u-admin', { hospitalIds: ['h1'] }, admin), ownChange);
  await assert.rejects(service.update('u-admin', { status: 'DISABLED' }, admin), ownChange);
  await assert.rejects(service.assignRole('u-admin', { roleId: 'role-admin' }, admin), ownChange);
  await assert.rejects(
    service.assignLocations({ hospitalIds: ['h1'], userIds: ['u-admin'] }, admin),
    ownChange,
  );
  await assert.rejects(
    service.replacePermissions('u-admin', { permissionIds: [] }, admin),
    ownChange,
  );
  await assert.rejects(service.remove('u-admin', admin), ownChange);

  // Re-sending the same role, locations and status with a new name is not a self change.
  const saved = await service.update(
    'u-admin',
    { hospitalIds: ['h2', 'h1'], name: 'Anil K', roleId: 'role-admin', status: 'ACTIVE' },
    admin,
  );
  assert.equal(saved?.name, 'Anil K');
});

test('a new user is saved with a lower-case email, a hashed password and active status', async () => {
  const { record, service, wrote } = usersService();

  const created = await service.create(newUser('role-kitchen', ['h1']), admin);

  const { data } = wrote('user.create')[0] as {
    data: { email: string; passwordHash: string; status: string };
  };
  assert.equal(data.email, 'asha.k@max.in');
  assert.equal(data.status, 'ACTIVE');
  assert.equal(await verifyPassword('Secret123', data.passwordHash), true);
  assert.equal(created?.email, 'asha.k@max.in');
  assert.ok(created && !('passwordHash' in created), 'the hash never leaves the service');
  assert.equal(record.mock.calls[0]?.[0].action, 'USER_CREATE');
});

test('a clashing mobile, email or employee code names the field that clashed', async () => {
  const clash = (target: string[]) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      clientVersion: 'test',
      code: 'P2002',
      meta: { target },
    });

  for (const [target, message] of [
    [
      ['mobile'],
      'This mobile number is already assigned to another user, including disabled users',
    ],
    [['email'], 'This email is already assigned to another user, including disabled users'],
    [
      ['employee_code'],
      'This employee code is already assigned to another user, including disabled users',
    ],
    [['something'], 'User already exists'],
  ] as const) {
    const { service } = usersService({ createError: clash([...target]) });
    await assert.rejects(
      service.create(newUser('role-kitchen', ['h1']), admin),
      (error: unknown) => error instanceof ConflictException && error.message === message,
    );
  }
});

test('re-sending unchanged details keeps the user signed in; a real change ends their sessions', async () => {
  const { service, wrote } = usersService();
  const cook = { email: 'U-COOK@max.in', hospitalIds: ['h1'], mobile: '9000000001', name: 'Cook' };

  await service.update('u-cook', { ...cook, roleId: 'role-kitchen', status: 'ACTIVE' }, admin);
  assert.equal(wrote('user.updateMany').length, 0);

  for (const dto of [
    { designation: 'Chef' },
    { email: 'Cook2@Max.in' },
    { status: 'DISABLED' as const },
    { hospitalIds: ['h2'] },
  ]) {
    const before = wrote('user.updateMany').length;
    await service.update('u-cook', dto, admin);
    assert.deepEqual(
      wrote('user.updateMany').slice(before),
      [{ data: { sessionVersion: { increment: 1 } }, where: { id: { in: ['u-cook'] } } }],
      JSON.stringify(dto),
    );
  }
  const saved = wrote('user.update').find((args) => JSON.stringify(args).includes('cook2'));
  assert.equal((saved as { data: { email: string } }).data.email, 'cook2@max.in');
});

test('an admin cannot reset the sign-in of a user who holds access the admin lacks', async () => {
  const { service } = usersService();

  // Meera's role carries MENU_UPDATE, which the admin does not hold.
  for (const dto of [
    { password: 'Takeover1' },
    { email: 'mine@max.in' },
    { mobile: '9111111111' },
  ]) {
    await assert.rejects(
      service.update('u-menu', dto, admin),
      forbidden(/only they or a Super Admin can change/),
      JSON.stringify(dto),
    );
  }
  // The cook holds nothing the admin lacks.
  await service.update('u-cook', { password: 'Newpass12' }, admin);
  await service.update('u-menu', { password: 'Newpass12' }, superAdmin);
});

test('an admin cannot disable, re-role, move, re-permission or delete a user holding access they lack', async () => {
  const { service, users, writes } = usersService();
  const holdsMore = (what: string) =>
    forbidden(
      new RegExp(
        `^Meera has access you do not hold, so only a Super Admin can change their ${what}$`,
      ),
    );

  // Meera's role carries MENU_UPDATE, which the admin does not hold.
  for (const dto of [
    { status: 'DISABLED' as const },
    { hospitalIds: ['h1'] },
    { hospitalIds: ['h2'], roleId: 'role-kitchen' },
  ]) {
    await assert.rejects(
      service.update('u-menu', dto, admin),
      holdsMore('role, locations or status'),
      JSON.stringify(dto),
    );
  }
  await assert.rejects(
    service.assignRole('u-menu', { roleId: 'role-kitchen' }, admin),
    holdsMore('role'),
  );
  await assert.rejects(
    service.assignLocations({ hospitalIds: ['h1'], userIds: ['u-menu'] }, admin),
    holdsMore('locations'),
  );
  await assert.rejects(
    service.replacePermissions('u-menu', { permissionIds: [] }, admin),
    holdsMore('permissions'),
  );
  await assert.rejects(service.remove('u-menu', admin), holdsMore('account'));
  assert.deepEqual(
    writes.filter(([, args]) => JSON.stringify(args).includes('u-menu')),
    [],
    'nothing was written for Meera',
  );
  assert.equal(users.get('u-menu')?.status, 'ACTIVE');

  // A peer holding no more than the admin, and anyone for a Super Admin, still works.
  await service.update('u-cook', { status: 'DISABLED' }, admin);
  await service.assignRole('u-cook', { roleId: 'role-kitchen' }, admin);
  await service.update('u-menu', { status: 'DISABLED' }, superAdmin);
  await service.remove('u-menu', superAdmin);
});

test('deleting a user disables them, drops their roles and frees their mobile and email', async () => {
  const { queryRaw, record, service, wrote } = usersService();

  assert.deepEqual(await service.remove('u-cook', admin), { id: 'u-cook' });

  const { data } = wrote('user.update')[0] as {
    data: { deletedAt: Date; email: null; mobile: string; status: string };
  };
  assert.equal(data.email, null);
  assert.equal(data.mobile, 'deleted:u-cook');
  assert.equal(data.status, 'DISABLED');
  assert.ok(data.deletedAt instanceof Date);
  assert.equal(wrote('userRole.updateMany').length, 1);
  assert.equal(record.mock.calls[0]?.[0].action, 'USER_DELETE');
  assert.equal(queryRaw.mock.calls.length, 0, 'the Super Admin count only runs for Super Admins');

  await assert.rejects(service.remove('u-cook', admin), NotFoundException, 'already deleted');
});

test('assigning locations in bulk is all or nothing, held to each user’s role', async () => {
  const { service, wrote } = usersService();

  await assert.rejects(
    service.assignLocations(
      { hospitalIds: ['h1', 'h2'], userIds: ['u-shared', 'u-cook'] },
      superAdmin,
    ),
    badRequest(/Kitchen role works at a single location/),
  );

  const before = wrote('user.updateMany').length;
  assert.deepEqual(
    await service.assignLocations({ hospitalIds: ['h2'], userIds: ['u-cook', 'u-cook'] }, admin),
    { updated: [{ id: 'u-cook', name: 'Cook' }], updatedCount: 1 },
  );
  assert.deepEqual(wrote('user.updateMany').slice(before), [
    { data: { sessionVersion: { increment: 1 } }, where: { id: { in: ['u-cook'] } } },
  ]);
});
