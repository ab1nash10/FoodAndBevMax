// Characterisation of AccessResolver.resolve against a real database: which roles, permissions,
// overrides and hospital assignments count, and which deleted or inactive rows do not. Runs only
// with DATABASE_URL_TEST; it adds uniquely named rows and leaves them.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AccessResolver } from './access-resolver';
import { createPrismaAdapter } from './prisma-adapter';

const databaseUrl = process.env.DATABASE_URL_TEST;
const skip = !databaseUrl && 'DATABASE_URL_TEST is not set';
const run = Date.now().toString(36);
const now = new Date();
const sorted = (values: string[] | null) => (values ? [...values].sort() : values);

let prisma: PrismaClient;
const ids: Record<string, string> = {};

before(async () => {
  if (skip) return;
  prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
  const hospital = (code: string) =>
    prisma.hospital.create({
      data: { hospitalCode: `AR-${code}-${run}`, hospitalName: `Access ${code} ${run}` },
    });
  const permission = (code: string, deleted = false) =>
    prisma.permission.create({
      data: {
        action: 'TEST',
        code: `AR_${code}_${run}`,
        deletedAt: deleted ? now : null,
        module: 'TEST',
      },
    });
  const [h1, h2, h3] = await Promise.all([hospital('H1'), hospital('H2'), hospital('H3')]);
  const [pa, pb, pc, pd, pdel] = await Promise.all([
    permission('A'),
    permission('B'),
    permission('C'),
    permission('D'),
    permission('DEL', true),
  ]);
  Object.assign(ids, { h1: h1.id, h2: h2.id, h3: h3.id, pa: pa.code, pb: pb.code, pc: pc.code });

  const multi = await prisma.role.create({
    data: { locationScope: 'MULTI', name: `AR Multi ${run}` },
  });
  const deletedRole = await prisma.role.create({
    data: { deletedAt: now, locationScope: 'SINGLE', name: `AR Deleted ${run}` },
  });
  const all = await prisma.role.create({ data: { locationScope: 'ALL', name: `AR All ${run}` } });
  ids.multiName = multi.name;
  await prisma.rolePermission.createMany({
    data: [
      { permissionId: pa.id, roleId: multi.id },
      { permissionId: pb.id, roleId: multi.id },
      { permissionId: pdel.id, roleId: multi.id },
      // A removed grant: the row stays, soft-deleted.
      { deletedAt: now, permissionId: pc.id, roleId: multi.id },
      { permissionId: pd.id, roleId: deletedRole.id },
      { permissionId: pd.id, roleId: all.id },
    ],
  });

  const user = (name: string, data: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: {
        employeeCode: `AR-${name}-${run}`,
        mobile: `4${String(Date.now()).slice(-6)}${name.length}${Math.floor(Math.random() * 100)}`
          .slice(0, 10)
          .padEnd(10, '0'),
        name: `Access ${name}`,
        ...data,
      },
    });
  const main = await user('main', { hospitalId: h1.id, sessionVersion: 3 });
  ids.main = main.id;
  await prisma.userRole.createMany({
    data: [
      { roleId: multi.id, userId: main.id },
      { roleId: deletedRole.id, userId: main.id },
      { deletedAt: now, roleId: all.id, userId: main.id },
    ],
  });
  await prisma.userPermission.createMany({
    data: [
      { granted: true, permissionId: pc.id, userId: main.id },
      { granted: false, permissionId: pb.id, userId: main.id },
      { deletedAt: now, granted: true, permissionId: pd.id, userId: main.id },
      { granted: true, permissionId: pdel.id, userId: main.id },
    ],
  });
  await prisma.userHospital.createMany({
    data: [
      { hospitalId: h2.id, userId: main.id },
      { deletedAt: now, hospitalId: h3.id, userId: main.id },
    ],
  });

  const everywhere = await user('all');
  ids.everywhere = everywhere.id;
  await prisma.userRole.create({ data: { roleId: all.id, userId: everywhere.id } });
  ids.noRoles = (await user('none', { hospitalId: h3.id })).id;
  ids.disabled = (await user('disabled', { status: 'DISABLED' })).id;
  ids.deleted = (await user('deleted', { deletedAt: now })).id;
});

after(async () => {
  await prisma?.$disconnect();
});

void test('roles, overrides and hospitals: only live rows count', { skip }, async () => {
  const access = await new AccessResolver(prisma).resolve(ids.main ?? '');
  assert.ok(access);
  assert.deepEqual(
    {
      ...access,
      allowedHospitalIds: sorted(access.allowedHospitalIds),
      permissions: sorted(access.permissions),
    },
    {
      // The home hospital counts as an assignment; the deleted assignment does not.
      allowedHospitalIds: sorted([ids.h1 ?? '', ids.h2 ?? '']),
      // MULTI from the live role; the deleted role and the deleted link to ALL are ignored.
      locationScope: 'MULTI',
      // A from the role; B revoked by override; C granted by override (its role grant was
      // removed); D only via a deleted role, a deleted link and a deleted override; the deleted
      // permission never counts.
      permissions: sorted([ids.pa ?? '', ids.pc ?? '']),
      roles: [ids.multiName],
      sessionVersion: 3,
    },
  );
});

void test('a live ALL-scope role means every hospital', { skip }, async () => {
  const access = await new AccessResolver(prisma).resolve(ids.everywhere ?? '');
  assert.equal(access?.locationScope, 'ALL');
  assert.equal(access?.allowedHospitalIds, null);
});

void test('no roles: SINGLE scope, the home hospital, no permissions', { skip }, async () => {
  const access = await new AccessResolver(prisma).resolve(ids.noRoles ?? '');
  assert.deepEqual(access, {
    allowedHospitalIds: [ids.h3],
    locationScope: 'SINGLE',
    permissions: [],
    roles: [],
    sessionVersion: 0,
  });
});

void test('disabled, deleted and unknown users resolve to null', { skip }, async () => {
  const resolver = new AccessResolver(prisma);
  assert.equal(await resolver.resolve(ids.disabled ?? ''), null);
  assert.equal(await resolver.resolve(ids.deleted ?? ''), null);
  assert.equal(await resolver.resolve('00000000-0000-4000-8000-000000000000'), null);
});
