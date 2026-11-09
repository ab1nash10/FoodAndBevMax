// Characterisation of user-service over HTTP: users, roles, the permission catalogue, per-user
// permission overrides, location reach, the Super Admin rules, the credential lock and the
// signed-in user's own preferences. Pins today's statuses, messages, shapes and database effects.
//
// Runs only with DATABASE_URL_TEST (migrated and seeded). Every record it makes carries `run`, so
// it touches nothing else and needs no cleanup. user-service has no shared harness, so a small one
// lives below, modelled on organization-service/src/testing/int-harness.ts.
process.env.TZ = 'UTC';

import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { hashPassword } from '@aahar/auth';
import { titleCase } from '@aahar/config';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from './common/prisma/prisma.service';

type Body = Record<string, unknown>;
type Call = { body: Body; data: Body; status: number };

const databaseUrl = process.env.DATABASE_URL_TEST;
const run = Date.now().toString(36);
// Ten digits starting 57: no Indian mobile starts with 5, and the stamp keeps runs apart.
const mobileStamp = String(Date.now()).slice(-6);
let sequence = 10;
const nextMobile = () => `57${mobileStamp}${sequence++}`;
const PASSWORD = 'Secret123x';

/**
 * No request may leave this machine: the .env carries live Microsoft Graph and SMS credentials.
 * Copied from organization-service's int-harness.ts. Returns the real fetch, to put back later.
 */
function blockOutboundFetch(): typeof fetch {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return Promise.reject(new Error(`integration tests may not call ${url.origin}`));
    }
    return realFetch(input, init);
  };
  return realFetch;
}

/** Keys and value types only, so a shape change shows up without pinning ids and dates. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value === null) return null;
  if (typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, shape((value as Body)[key])]),
  );
}

function signAccessToken(secret: string, user: { id: string; sessionVersion: number }): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { exp: now + 3600, iat: now, sub: user.id, sv: user.sessionVersion };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

const userShape = {
  avatarUrl: null,
  createdAt: 'string',
  credentialsLockedUntil: null,
  defaultLocationId: 'string',
  deletedAt: null,
  designation: null,
  email: 'string',
  employeeCode: 'string',
  hospitals: [{ id: 'string', name: 'string' }],
  id: 'string',
  locationScope: 'string',
  mobile: 'string',
  name: 'string',
  roles: [
    { description: null, id: 'string', locationScope: 'string', name: 'string', status: 'string' },
  ],
  status: 'string',
  updatedAt: 'string',
};
const listMeta = { limit: 'number', page: 'number', total: 'number', totalPages: 'number' };
const ONLY_SUPER_ADMIN = 'Only a Super Admin can change Super Admin access';

describe.skipIf(!databaseUrl)(
  'user-service: users and access (integration)',
  { timeout: 30_000 },
  () => {
    let app: INestApplication | undefined;
    let prisma: PrismaService;
    let baseUrl = '';
    let secret = '';
    let saToken = '';
    let superAdminId = '';

    // Fixtures, all named with `run`.
    let hA = '';
    let hB = '';
    let hBName = '';
    const perm: Record<string, string> = {};
    let otherPermCode = '';
    let saRoleId = '';
    let adminRoleId = '';
    let staffRoleId = '';
    let multiRoleId = '';
    let globalRoleId = '';
    let extraRoleId = '';
    let viewerRoleId = '';
    let adminId = '';
    let adminToken = '';
    let staffId = '';
    let staffToken = '';
    let platformRoleId = '';
    let platformToken = '';

    const signFor = (user: { id: string; sessionVersion: number }) => signAccessToken(secret, user);
    /** A token at the user's current session version, read from the database. */
    async function tokenOf(id: string) {
      const { sessionVersion } = await prisma.user.findUniqueOrThrow({ where: { id } });
      return signFor({ id, sessionVersion });
    }

    async function api(method: string, path: string, body?: unknown, as = saToken): Promise<Call> {
      const response = await fetch(`${baseUrl}${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          ...(as ? { authorization: `Bearer ${as}` } : {}),
          'content-type': 'application/json',
        },
        method,
      });
      const text = await response.text();
      const json = (text ? JSON.parse(text) : {}) as Body;
      return { body: json, data: (json.data ?? {}) as Body, status: response.status };
    }
    async function ok(method: string, path: string, body?: unknown, as?: string) {
      const result = await api(method, path, body, as);
      if (result.status >= 300) {
        throw new Error(`${method} ${path} -> ${result.status} ${JSON.stringify(result.body)}`);
      }
      return result.data;
    }
    const refused = (call: Call) => [call.status, call.body.message];

    /** A user straight in the database (for the actors and targets the API should not make). */
    async function dbUser(input: {
      hospitalIds: string[];
      label: string;
      password?: string | null;
      roleId: string;
      status?: 'ACTIVE' | 'DISABLED';
    }) {
      const n = sequence;
      return prisma.user.create({
        data: {
          assignedHospitals: { create: input.hospitalIds.map((hospitalId) => ({ hospitalId })) },
          email: `${input.label}-${n}-${run}@int.test`,
          employeeCode: `INTU-${run}-${n}`.toUpperCase(),
          hospitalId: input.hospitalIds[0] ?? null,
          mobile: nextMobile(),
          name: `Int ${input.label} ${n}`,
          passwordHash:
            input.password === null ? null : await hashPassword(input.password ?? PASSWORD),
          roles: { create: [{ roleId: input.roleId }] },
          status: input.status ?? 'ACTIVE',
        },
      });
    }

    /** The create-user body the portal sends, uniquely named. */
    function newUserBody(overrides: Body = {}): Body {
      const n = sequence;
      return {
        email: `api-${n}-${run}@int.test`,
        employeeCode: `intu-${run}-${n}`,
        hospitalIds: [hA],
        mobile: nextMobile(),
        name: `int api user ${n}`,
        password: PASSWORD,
        roleId: staffRoleId,
        ...overrides,
      };
    }
    async function apiUser(overrides: Body = {}, as?: string) {
      return ok('POST', '/users', newUserBody(overrides), as);
    }

    let realFetch: typeof fetch | undefined;

    beforeAll(async () => {
      realFetch = blockOutboundFetch();
      // A single space, not '': ConfigModule expands the .env files with dotenv-expand, which
      // treats an empty variable as unset and writes the file's value over it. A space survives
      // and is trimmed to nothing, so no gateway credentials reach this process.
      Object.assign(process.env, {
        DATABASE_URL: databaseUrl,
        MAIL_CLIENT_SECRET: ' ',
        NODE_ENV: 'test',
        REDIS_URL: '',
        SMS_FEED_ID: ' ',
        SMS_PASSWORD: ' ',
        SMS_SENDER_ID: ' ',
        SMS_USERNAME: ' ',
        SWAGGER_ENABLED: 'false',
        THROTTLE_LIMIT: '100000',
      });
      process.env.JWT_ACCESS_SECRET ||= 'characterisation-access-secret-0123456789';
      process.env.JWT_REFRESH_SECRET ||= 'characterisation-refresh-secret-0123456789';

      // Imported here: ConfigModule reads the environment when app.module is first evaluated.
      const { configureSecurityBaseline, getSharedRedis } = await import('@aahar/auth');
      // REDIS_URL cannot be a space (the env schema refuses it) and the .env value would replace
      // '': settle the shared client as "none" now, so the throttle counters stay in memory.
      expect(getSharedRedis()).toBeNull();
      const { ConfigService } = await import('@nestjs/config');
      const { NestFactory } = await import('@nestjs/core');
      const { AppModule } = await import('./app.module.js');
      const { PrismaService: Prisma } = await import('./common/prisma/prisma.service.js');

      const nest = await NestFactory.create(AppModule, { logger: false });
      app = nest;
      const config = nest.get(ConfigService);
      configureSecurityBaseline(nest, config, {
        serviceName: 'user-service',
        swaggerDescription: '',
        swaggerTitle: '',
      });
      await nest.listen(0, '127.0.0.1');
      const { port } = (nest.getHttpServer() as { address(): AddressInfo }).address();
      baseUrl = `http://127.0.0.1:${port}/api/v1`;
      prisma = nest.get(Prisma);
      secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');

      const superAdmin = await prisma.user.findFirst({
        where: {
          deletedAt: null,
          roles: { some: { deletedAt: null, role: { deletedAt: null, name: 'Super Admin' } } },
          status: 'ACTIVE',
        },
      });
      if (!superAdmin) throw new Error('DATABASE_URL_TEST needs the seed: no active Super Admin');
      superAdminId = superAdmin.id;
      saToken = signFor(superAdmin);
      saRoleId = (await prisma.role.findUniqueOrThrow({ where: { name: 'Super Admin' } })).id;

      // Two locations of our own.
      const hospital = (suffix: string) =>
        prisma.hospital.create({
          data: {
            hospitalCode: `INTU-${run}-${suffix}`,
            hospitalName: `Int User Hosp ${suffix} ${run}`,
          },
        });
      const [a, b] = [await hospital('A'), await hospital('B')];
      hA = a.id;
      hB = b.id;
      hBName = b.hospitalName;

      const managed = [
        'USER_VIEW',
        'USER_CREATE',
        'USER_UPDATE',
        'USER_DELETE',
        'ROLE_VIEW',
        'ROLE_CREATE',
        'ROLE_UPDATE',
        'ROLE_DELETE',
        'PERMISSION_VIEW',
      ];
      const catalogue = await prisma.permission.findMany({ where: { deletedAt: null } });
      for (const row of catalogue) perm[row.code] = row.id;
      const other = catalogue.find((row) => !managed.includes(row.code));
      if (!other) throw new Error('expected a permission outside the user and role set');
      otherPermCode = other.code;

      const role = async (
        name: string,
        locationScope: 'ALL' | 'MULTI' | 'SINGLE',
        codes: string[],
      ) =>
        (
          await prisma.role.create({
            data: {
              locationScope,
              name: `${name} ${run}`,
              permissions: { create: codes.map((code) => ({ permissionId: perm[code] ?? '' })) },
            },
          })
        ).id;
      // A location Admin: every user, role and permission right, at location A only.
      adminRoleId = await role('Int Admin', 'MULTI', managed);
      staffRoleId = await role('Int Staff', 'SINGLE', []);
      multiRoleId = await role('Int Multi', 'MULTI', []);
      globalRoleId = await role('Int Global', 'ALL', []);
      extraRoleId = await role('Int Extra', 'SINGLE', [otherPermCode]);
      viewerRoleId = await role('Int Viewer', 'SINGLE', ['ROLE_VIEW']);
      // The same rights at every location: roles are global, so only this reach may change them.
      platformRoleId = await role('Int Platform', 'ALL', managed);

      const admin = await dbUser({ hospitalIds: [hA], label: 'admin', roleId: adminRoleId });
      adminId = admin.id;
      adminToken = signFor(admin);
      const staff = await dbUser({ hospitalIds: [hA], label: 'staff', roleId: staffRoleId });
      staffId = staff.id;
      staffToken = signFor(staff);
      platformToken = signFor(
        await dbUser({ hospitalIds: [hA], label: 'platform', roleId: platformRoleId }),
      );
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      if (realFetch) globalThis.fetch = realFetch;
    });

    it('401 without a token and 403 without the permission, on every guarded route', async () => {
      const id = randomUUID();
      const guarded: Array<[string, string]> = [
        ['GET', '/users'],
        ['GET', `/users/${id}`],
        ['POST', '/users'],
        ['PUT', `/users/${id}`],
        ['DELETE', `/users/${id}`],
        ['POST', `/users/${id}/roles`],
        ['POST', '/users/locations'],
        ['GET', `/users/${id}/permissions`],
        ['PUT', `/users/${id}/permissions`],
        ['GET', '/roles'],
        ['GET', `/roles/${id}`],
        ['POST', '/roles'],
        ['PUT', `/roles/${id}`],
        ['DELETE', `/roles/${id}`],
        ['POST', `/roles/${id}/permissions`],
        ['GET', '/permissions'],
      ];
      const selfService: Array<[string, string]> = [
        ['GET', '/users/me/access'],
        ['GET', '/users/me/preferences'],
        ['PATCH', '/users/me/preferences'],
        ['POST', '/users/me/password'],
      ];
      for (const [method, path] of [...guarded, ...selfService]) {
        const anonymous = await api(method, path, method === 'GET' ? undefined : {}, '');
        expect([method, path, ...refused(anonymous)]).toEqual([method, path, 401, 'Unauthorized']);
      }
      for (const [method, path] of guarded) {
        const denied = await api(method, path, method === 'GET' ? undefined : {}, staffToken);
        expect([method, path, ...refused(denied)]).toEqual([
          method,
          path,
          403,
          'Forbidden resource',
        ]);
      }
      expect(shape((await api('GET', '/users', undefined, staffToken)).body)).toEqual({
        errors: [],
        message: 'string',
        requestId: 'string',
        success: 'boolean',
        timestamp: 'string',
      });

      // A token from before an admin change, or a forged one, is refused too.
      const stale = signFor({ id: staffId, sessionVersion: 99 });
      expect(refused(await api('GET', '/users/me/preferences', undefined, stale))).toEqual([
        401,
        'Your account was updated. Please sign in again.',
      ]);
      expect(
        refused(await api('GET', '/users/me/preferences', undefined, `${staffToken}x`)),
      ).toEqual([401, 'Unauthorized']);
    });

    describe('users', () => {
      it('create: validates the body, then saves a normalised user with a hashed password', async () => {
        const invalid: Array<[Body, string]> = [
          [{ email: undefined }, 'email must be an email'],
          [{ mobile: '12345' }, 'mobile must match /^\\d{10}$/ regular expression'],
          [
            { password: 'short' },
            'Password must be at least 8 characters and include a letter and number.',
          ],
          [
            { password: 'lettersonly' },
            'Password must be at least 8 characters and include a letter and number.',
          ],
          [{ roleId: 'nope' }, 'roleId must be a UUID'],
          [{ hospitalIds: ['nope'] }, 'each value in hospitalIds must be a UUID'],
          [{ status: 'GONE' }, 'status must be one of the following values: ACTIVE, DISABLED'],
          [{ avatarUrl: 'javascript:alert(1)' }, 'avatarUrl must be a relative path or https URL'],
          [{ isAdmin: true }, 'property isAdmin should not exist'],
        ];
        for (const [overrides, message] of invalid) {
          const result = await api('POST', '/users', newUserBody(overrides));
          expect([result.status, result.body.message]).toEqual([400, message]);
        }
        const noName = await api('POST', '/users', newUserBody({ name: '' }));
        expect(noName.status).toBe(400);
        expect(noName.body.errors).toContain('name should not be empty');

        // Both mobile and email are required (the schema needs a mobile; the DTO an email).
        const noMobile = await api('POST', '/users', newUserBody({ mobile: undefined }));
        expect(refused(noMobile)).toEqual([
          400,
          'mobile must match /^\\d{10}$/ regular expression',
        ]);

        const single = `The Int Staff ${run} role works at a single location, so exactly one location must be assigned`;
        const rules: Array<[Body, string]> = [
          [{ roleId: randomUUID() }, 'Role not found'],
          [{ hospitalIds: [] }, single],
          [{ hospitalIds: [hA, hB] }, single],
          [{ hospitalIds: [randomUUID()] }, 'One or more locations were not found'],
          [
            { hospitalIds: [], roleId: multiRoleId },
            `The Int Multi ${run} role requires at least one assigned location`,
          ],
          [
            { hospitalIds: [], roleId: globalRoleId },
            `Choose a default location for the Int Global ${run} role`,
          ],
        ];
        for (const [overrides, message] of rules) {
          expect(refused(await api('POST', '/users', newUserBody(overrides)))).toEqual([
            400,
            message,
          ]);
        }

        const body = newUserBody({
          designation: 'Store Manager',
          email: `Mixed.Case-${run}@INT.test`,
          name: `asha kumari ${run}`,
        });
        const created = await api('POST', '/users', body);
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ message: 'Success', success: true });
        expect(shape(created.data)).toEqual({ ...userShape, designation: 'string' });
        expect(created.data).toMatchObject({
          credentialsLockedUntil: null,
          defaultLocationId: hA,
          designation: 'Store Manager',
          email: `mixed.case-${run}@int.test`,
          employeeCode: String(body.employeeCode).toUpperCase(),
          hospitals: [{ id: hA }],
          locationScope: 'SINGLE',
          mobile: body.mobile,
          name: titleCase(`asha kumari ${run}`),
          roles: [{ id: staffRoleId, locationScope: 'SINGLE', status: 'ACTIVE' }],
          status: 'ACTIVE',
        });
        expect(created.data).not.toHaveProperty('passwordHash');
        const row = await prisma.user.findUniqueOrThrow({ where: { id: String(created.data.id) } });
        expect(row.passwordHash).toMatch(/^scrypt\$/);
        expect([row.createdBy, row.hospitalId, row.sessionVersion]).toEqual([superAdminId, hA, 0]);

        // A MULTI role keeps every location; the first becomes the default.
        const multi = await apiUser({ hospitalIds: [hB, hA], roleId: multiRoleId });
        expect(multi.defaultLocationId).toBe(hB);
        expect((multi.hospitals as Body[]).map(({ id }) => id).sort()).toEqual([hA, hB].sort());
        // An ALL role still starts somewhere.
        const global = await apiUser({ roleId: globalRoleId });
        expect([global.locationScope, global.defaultLocationId]).toEqual(['ALL', hA]);
      });

      it('a clashing mobile, email or employee code is refused with the field named', async () => {
        const first = await apiUser();
        const clash = async (overrides: Body) =>
          refused(await api('POST', '/users', newUserBody(overrides)));

        expect(await clash({ mobile: first.mobile })).toEqual([
          409,
          'This mobile number is already assigned to another user, including disabled users',
        ]);
        expect(await clash({ email: String(first.email).toUpperCase() })).toEqual([
          409,
          'This email is already assigned to another user, including disabled users',
        ]);
        expect(await clash({ employeeCode: String(first.employeeCode).toLowerCase() })).toEqual([
          409,
          'This employee code is already assigned to another user, including disabled users',
        ]);

        // Updating another user onto a taken mobile or email is refused the same way.
        const second = await apiUser();
        expect(
          refused(await api('PUT', `/users/${String(second.id)}`, { mobile: first.mobile })),
        ).toEqual([
          409,
          'This mobile number is already assigned to another user, including disabled users',
        ]);
        expect(
          refused(await api('PUT', `/users/${String(second.id)}`, { email: first.email })),
        ).toEqual([
          409,
          'This email is already assigned to another user, including disabled users',
        ]);
      });

      it('list, search, filter and get', async () => {
        const inA = await apiUser({ name: `int findme ${run}` });
        const inB = await apiUser({ hospitalIds: [hB] });
        const disabled = await apiUser({ status: 'DISABLED' });

        const listed = await ok('GET', `/users?search=${run}&limit=100`);
        expect(shape(listed)).toEqual({ items: [userShape], meta: listMeta });
        const ids = (listed.items as Body[]).map(({ id }) => id);
        expect(ids).toEqual(
          expect.arrayContaining([inA.id, inB.id, disabled.id, adminId, staffId]),
        );
        expect(listed.meta).toMatchObject({ limit: 100, page: 1 });

        const idsOf = async (query: string) =>
          ((await ok('GET', `/users?search=${run}&limit=100&${query}`)).items as Body[]).map(
            ({ id }) => id,
          );
        // Search reaches name, email, mobile and employee code, case-insensitive.
        expect(await idsOf('')).toContain(inA.id);
        expect(
          ((await ok('GET', `/users?search=FINDME ${run}`)).items as Body[]).map(({ id }) => id),
        ).toEqual([inA.id]);
        expect(
          ((await ok('GET', `/users?search=${String(inB.mobile)}`)).items as Body[]).map(
            ({ id }) => id,
          ),
        ).toEqual([inB.id]);
        expect(await idsOf(`hospitalId=${hB}`)).toContain(inB.id);
        expect(await idsOf(`hospitalId=${hB}`)).not.toContain(inA.id);
        expect(await idsOf('status=DISABLED')).toEqual(expect.arrayContaining([disabled.id]));
        expect(await idsOf('status=DISABLED')).not.toContain(inA.id);
        expect(await idsOf(`roleId=${adminRoleId}`)).toEqual([adminId]);

        // Newest first, paged.
        const page = await ok('GET', `/users?search=${run}&limit=1&page=2`);
        expect((page.items as Body[]).length).toBe(1);
        expect(page.meta).toMatchObject({ limit: 1, page: 2 });

        for (const bad of [
          'limit=101',
          'limit=0',
          'page=0',
          'status=GONE',
          'roleId=nope',
          'hospitalId=1',
        ]) {
          expect([bad, (await api('GET', `/users?${bad}`)).status]).toEqual([bad, 400]);
        }

        const one = await ok('GET', `/users/${String(inA.id)}`);
        expect(one).toMatchObject({ id: inA.id, name: inA.name });
        expect(refused(await api('GET', '/users/nope'))).toEqual([
          400,
          'Validation failed (uuid is expected)',
        ]);
        expect(refused(await api('GET', `/users/${randomUUID()}`))).toEqual([
          404,
          'User not found',
        ]);
      });

      it('update, deactivate and reactivate: each real change ends the user’s sessions', async () => {
        const user = await apiUser();
        const id = String(user.id);
        const userToken = await tokenOf(id);
        expect((await api('GET', '/users/me/preferences', undefined, userToken)).status).toBe(200);

        // Re-sending what is already there changes nothing and keeps them signed in.
        const same = await ok('PUT', `/users/${id}`, {
          hospitalIds: [hA],
          name: user.name,
          roleId: staffRoleId,
          status: 'ACTIVE',
        });
        expect(same).toMatchObject({ name: user.name });
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionVersion).toBe(0);

        const updated = await ok('PUT', `/users/${id}`, {
          avatarUrl: '/uploads/a.png',
          designation: 'Cashier',
          name: `int renamed ${run}`,
        });
        expect(updated).toMatchObject({
          avatarUrl: '/uploads/a.png',
          designation: 'Cashier',
          name: titleCase(`int renamed ${run}`),
        });
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionVersion).toBe(1);
        expect(refused(await api('GET', '/users/me/preferences', undefined, userToken))).toEqual([
          401,
          'Your account was updated. Please sign in again.',
        ]);

        const validation: Array<[Body, string]> = [
          [{ name: '' }, 'name should not be empty'],
          [{ email: 'nope' }, 'email must be an email'],
          [{ mobile: '98765' }, 'mobile must match /^\\d{10}$/ regular expression'],
          [{ status: 'GONE' }, 'status must be one of the following values: ACTIVE, DISABLED'],
          [{ employeeCode: 'X1' }, 'property employeeCode should not exist'],
        ];
        for (const [body, message] of validation) {
          const result = await api('PUT', `/users/${id}`, body);
          expect([result.status, result.body.errors]).toEqual([
            400,
            expect.arrayContaining([message]),
          ]);
        }
        expect(refused(await api('PUT', `/users/${randomUUID()}`, { name: 'X' }))).toEqual([
          404,
          'User not found',
        ]);
        expect(refused(await api('PUT', `/users/${id}`, { hospitalIds: [hA, hB] }))).toEqual([
          400,
          expect.stringContaining('exactly one location must be assigned'),
        ]);

        const deactivated = await ok('PUT', `/users/${id}`, { status: 'DISABLED' });
        expect(deactivated.status).toBe('DISABLED');
        // A disabled user is signed out even with a token at the current version.
        expect(
          refused(await api('GET', '/users/me/preferences', undefined, await tokenOf(id))),
        ).toEqual([401, 'User is not registered or active']);
        // Still listed and readable by an admin.
        expect((await ok('GET', `/users/${id}`)).status).toBe('DISABLED');

        const reactivated = await ok('PUT', `/users/${id}`, { status: 'ACTIVE' });
        expect(reactivated.status).toBe('ACTIVE');
        expect(
          (await api('GET', '/users/me/preferences', undefined, await tokenOf(id))).status,
        ).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionVersion).toBe(3);
      });

      it('delete: soft-deletes, drops the roles and frees the mobile and email for reuse', async () => {
        const user = await apiUser();
        const id = String(user.id);

        const removed = await api('DELETE', `/users/${id}`);
        expect([removed.status, removed.data]).toEqual([200, { id }]);
        expect(refused(await api('GET', `/users/${id}`))).toEqual([404, 'User not found']);
        expect(refused(await api('DELETE', `/users/${id}`))).toEqual([404, 'User not found']);
        const ids = ((await ok('GET', `/users?search=${run}&limit=100`)).items as Body[]).map(
          (row) => row.id,
        );
        expect(ids).not.toContain(id);

        const row = await prisma.user.findUniqueOrThrow({
          include: { roles: true },
          where: { id },
        });
        expect(row).toMatchObject({ email: null, mobile: `deleted:${id}`, status: 'DISABLED' });
        expect(row.deletedAt).toBeInstanceOf(Date);
        expect(row.roles.every((link) => link.deletedAt !== null)).toBe(true);

        // The same mobile and email can be given to a new user (employee codes stay taken).
        const again = await apiUser({ email: user.email, mobile: user.mobile });
        expect([again.email, again.mobile]).toEqual([user.email, user.mobile]);
        expect(
          refused(await api('POST', '/users', newUserBody({ employeeCode: user.employeeCode }))),
        ).toEqual([
          409,
          'This employee code is already assigned to another user, including disabled users',
        ]);
      });

      it('assign a role, and locations in bulk (all or nothing)', async () => {
        const single = await apiUser();
        const multi = await apiUser({ hospitalIds: [hA, hB], roleId: multiRoleId });

        // Role change: the user keeps their locations but is held to the new role's scope.
        const toMulti = await ok('POST', `/users/${String(single.id)}/roles`, {
          roleId: multiRoleId,
        });
        expect(toMulti).toMatchObject({ hospitals: [{ id: hA }], roles: [{ id: multiRoleId }] });
        const toSingle = await api('POST', `/users/${String(multi.id)}/roles`, {
          roleId: staffRoleId,
        });
        expect(refused(toSingle)).toEqual([400, expect.stringContaining('exactly one location')]);
        expect(
          refused(await api('POST', `/users/${String(multi.id)}/roles`, { roleId: 'x' })),
        ).toEqual([400, 'roleId must be a UUID']);
        expect(
          refused(await api('POST', `/users/${String(multi.id)}/roles`, { roleId: randomUUID() })),
        ).toEqual([400, 'Role not found']);

        // An inactive role cannot be granted.
        const retired = await prisma.role.create({
          data: { name: `Int Retired ${run}`, status: 'INACTIVE' },
        });
        expect(
          refused(await api('POST', `/users/${String(multi.id)}/roles`, { roleId: retired.id })),
        ).toEqual([400, `The Int Retired ${run} role is inactive`]);

        const staff = await apiUser();
        const bulk = await api('POST', '/users/locations', {
          hospitalIds: [hB],
          userIds: [String(single.id), String(staff.id)],
        });
        expect(bulk.status).toBe(201);
        expect(shape(bulk.data)).toEqual({
          updated: [{ id: 'string', name: 'string' }],
          updatedCount: 'number',
        });
        expect(bulk.data.updatedCount).toBe(2);
        expect((await ok('GET', `/users/${String(staff.id)}`)).hospitals).toEqual([
          { id: hB, name: hBName },
        ]);

        // A single-location user in the batch with two locations fails the whole batch.
        const twoForSingle = await api('POST', '/users/locations', {
          hospitalIds: [hA, hB],
          userIds: [String(multi.id), String(staff.id)],
        });
        expect(refused(twoForSingle)).toEqual([
          400,
          expect.stringContaining('exactly one location'),
        ]);
        expect(((await ok('GET', `/users/${String(multi.id)}`)).hospitals as Body[]).length).toBe(
          2,
        );
        expect(
          refused(await api('POST', '/users/locations', { hospitalIds: [hA], userIds: [] })),
        ).toEqual([400, 'userIds must contain at least 1 elements']);
      });
    });

    describe('location reach', () => {
      it('an admin sees and manages only users who work inside their locations', async () => {
        const inA = await apiUser();
        const inB = await apiUser({ hospitalIds: [hB] });
        const inBoth = await apiUser({ hospitalIds: [hA, hB], roleId: multiRoleId });

        const visible = (
          (await ok('GET', `/users?search=${run}&limit=100`, undefined, adminToken)).items as Body[]
        ).map(({ id }) => id);
        expect(visible).toEqual(expect.arrayContaining([inA.id, inBoth.id, adminId, staffId]));
        expect(visible).not.toContain(inB.id);
        expect(visible).not.toContain(superAdminId);
        // Asking for location B only narrows within reach: the shared user, never B-only users.
        const atB = (
          (
            await ok(
              'GET',
              `/users?search=${run}&limit=100&hospitalId=${hB}`,
              undefined,
              adminToken,
            )
          ).items as Body[]
        ).map(({ id }) => id);
        expect(atB).toContain(inBoth.id);
        expect(atB).not.toContain(inB.id);

        // Outside reach reads as not found, on every route.
        const outside = String(inB.id);
        for (const [method, path, body] of [
          ['GET', `/users/${outside}`, undefined],
          ['PUT', `/users/${outside}`, { name: 'X' }],
          ['DELETE', `/users/${outside}`, undefined],
          ['POST', `/users/${outside}/roles`, { roleId: staffRoleId }],
          ['GET', `/users/${outside}/permissions`, undefined],
          ['PUT', `/users/${outside}/permissions`, { permissionIds: [] }],
          ['POST', '/users/locations', { hospitalIds: [hA], userIds: [outside] }],
        ] as Array<[string, string, Body | undefined]>) {
          const result = await api(method, path, body, adminToken);
          expect([method, path, ...refused(result)]).toEqual([method, path, 404, 'User not found']);
        }

        // Sharing one location is enough to see someone, not to change them.
        expect(
          (await api('GET', `/users/${String(inBoth.id)}`, undefined, adminToken)).status,
        ).toBe(200);
        for (const [method, path, body] of [
          ['PUT', `/users/${String(inBoth.id)}`, { name: 'X' }],
          ['DELETE', `/users/${String(inBoth.id)}`, undefined],
          ['PUT', `/users/${String(inBoth.id)}/permissions`, { permissionIds: [] }],
        ] as Array<[string, string, Body | undefined]>) {
          expect(refused(await api(method, path, body, adminToken))).toEqual([
            403,
            'This user works at a location outside your assigned access',
          ]);
        }

        // No placing anyone at a location the admin does not hold.
        const placeAtB: Array<[string, string, Body]> = [
          ['POST', '/users', newUserBody({ hospitalIds: [hB] })],
          ['PUT', `/users/${String(inA.id)}`, { hospitalIds: [hB] }],
          ['POST', '/users/locations', { hospitalIds: [hB], userIds: [String(inA.id)] }],
        ];
        for (const [method, path, body] of placeAtB) {
          expect(refused(await api(method, path, body, adminToken))).toEqual([
            403,
            'You can only assign locations within your own access',
          ]);
        }

        // No granting a wider scope or permissions the admin lacks.
        expect(
          refused(await api('POST', '/users', newUserBody({ roleId: globalRoleId }), adminToken)),
        ).toEqual([403, `You cannot assign the Int Global ${run} role`]);
        for (const [method, path, body] of [
          ['POST', '/users', newUserBody({ roleId: extraRoleId })],
          ['POST', `/users/${String(inA.id)}/roles`, { roleId: extraRoleId }],
          ['PUT', `/users/${String(inA.id)}`, { hospitalIds: [hA], roleId: extraRoleId }],
          ['PUT', `/users/${String(inA.id)}/permissions`, { permissionIds: [perm[otherPermCode]] }],
        ] as Array<[string, string, Body]>) {
          expect(refused(await api(method, path, body, adminToken))).toEqual([
            403,
            `You cannot grant permissions you do not hold: ${otherPermCode}`,
          ]);
        }

        // Inside reach it all works, and the admin is recorded as the creator.
        const made = await ok('POST', '/users', newUserBody(), adminToken);
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: String(made.id) } })).createdBy,
        ).toBe(adminId);
        expect(
          (await api('PUT', `/users/${String(inA.id)}`, { designation: 'Chef' }, adminToken))
            .status,
        ).toBe(200);

        // Only a Super Admin may change their own role, locations, status, permissions or account.
        const self: Array<[string, string, Body | undefined, string]> = [
          [
            'PUT',
            `/users/${adminId}`,
            { status: 'DISABLED' },
            'You cannot change your own role, locations or status',
          ],
          [
            'PUT',
            `/users/${adminId}`,
            { hospitalIds: [hA, hB] },
            'You cannot change your own role, locations or status',
          ],
          [
            'POST',
            `/users/${adminId}/roles`,
            { roleId: staffRoleId },
            'You cannot change your own role',
          ],
          [
            'PUT',
            `/users/${adminId}/permissions`,
            { permissionIds: [] },
            'You cannot change your own permissions',
          ],
          [
            'POST',
            '/users/locations',
            { hospitalIds: [hA], userIds: [adminId] },
            'You cannot change your own locations',
          ],
          ['DELETE', `/users/${adminId}`, undefined, 'You cannot change your own account'],
        ];
        for (const [method, path, body, message] of self) {
          expect([method, path, ...refused(await api(method, path, body, adminToken))]).toEqual([
            method,
            path,
            403,
            message,
          ]);
        }
      });

      it('an admin cannot disable, re-role, move, re-permission or delete someone holding more', async () => {
        // Inside the admin's location, but holding a permission the admin lacks.
        const extra = await apiUser({ roleId: extraRoleId });
        const id = String(extra.id);
        const before = await prisma.user.findUniqueOrThrow({ where: { id } });
        const holdsMore = (what: string) =>
          `${String(extra.name)} has access you do not hold, so only a Super Admin can change their ${what}`;

        for (const [method, path, body, what] of [
          ['PUT', `/users/${id}`, { status: 'DISABLED' }, 'role, locations or status'],
          [
            'PUT',
            `/users/${id}`,
            { hospitalIds: [hA], roleId: staffRoleId },
            'role, locations or status',
          ],
          ['POST', `/users/${id}/roles`, { roleId: staffRoleId }, 'role'],
          ['POST', '/users/locations', { hospitalIds: [hA], userIds: [id] }, 'locations'],
          ['PUT', `/users/${id}/permissions`, { permissionIds: [] }, 'permissions'],
          ['DELETE', `/users/${id}`, undefined, 'account'],
        ] as Array<[string, string, Body | undefined, string]>) {
          expect([method, path, ...refused(await api(method, path, body, adminToken))]).toEqual([
            method,
            path,
            403,
            holdsMore(what),
          ]);
        }
        const after = await prisma.user.findUniqueOrThrow({ where: { id } });
        expect([after.status, after.deletedAt, after.sessionVersion]).toEqual([
          'ACTIVE',
          null,
          before.sessionVersion,
        ]);

        // Someone holding no more than the admin is still theirs to manage.
        const staff = String((await apiUser()).id);
        expect(
          (await ok('PUT', `/users/${staff}`, { status: 'DISABLED' }, adminToken)).status,
        ).toBe('DISABLED');
        await ok('POST', `/users/${staff}/roles`, { roleId: staffRoleId }, adminToken);
        await ok('PUT', `/users/${staff}/permissions`, { permissionIds: [] }, adminToken);
        await ok('DELETE', `/users/${staff}`, undefined, adminToken);
      });
    });

    describe('Super Admin protection', () => {
      // Created DISABLED, so no other suite's harness ever picks one as "the" Super Admin.
      let saUser: Body = {};

      it('a Super Admin may grant Super Admin on create, and edit a Super Admin user', async () => {
        saUser = await apiUser({ roleId: saRoleId, status: 'DISABLED' });
        expect(saUser).toMatchObject({
          locationScope: 'ALL',
          roles: [{ name: 'Super Admin' }],
          status: 'DISABLED',
        });
        const renamed = await ok('PUT', `/users/${String(saUser.id)}`, { designation: 'Owner' });
        expect(renamed.designation).toBe('Owner');
      });

      it('refuses a non-Super-Admin on every path that would grant, revoke or edit Super Admin', async () => {
        const id = String(saUser.id);
        const target = await apiUser();
        const before = await prisma.user.findUniqueOrThrow({ where: { id } });

        // Holding every right at every location is still not being a Super Admin.
        const powerRole = await prisma.role.create({
          data: {
            locationScope: 'ALL',
            name: `Int Power ${run}`,
            permissions: { create: Object.values(perm).map((permissionId) => ({ permissionId })) },
          },
        });
        const power = await dbUser({ hospitalIds: [hA], label: 'power', roleId: powerRole.id });
        const powerToken = signFor(power);

        const paths: Array<[string, string, Body | undefined]> = [
          // Editing, demoting, disabling or deleting a Super Admin user.
          ['PUT', `/users/${id}`, { name: 'Taken Over' }],
          ['PUT', `/users/${id}`, { status: 'ACTIVE' }],
          ['PUT', `/users/${id}`, { password: 'Hijack123' }],
          ['PUT', `/users/${id}`, { hospitalIds: [hA], roleId: staffRoleId }],
          ['DELETE', `/users/${id}`, undefined],
          ['POST', `/users/${id}/roles`, { roleId: staffRoleId }],
          ['PUT', `/users/${id}/permissions`, { permissionIds: [] }],
          ['POST', '/users/locations', { hospitalIds: [hA], userIds: [String(target.id), id] }],
          // Granting Super Admin to anyone.
          ['POST', '/users', newUserBody({ roleId: saRoleId })],
          ['POST', `/users/${String(target.id)}/roles`, { roleId: saRoleId }],
          ['PUT', `/users/${String(target.id)}`, { hospitalIds: [hA], roleId: saRoleId }],
          // Changing the Super Admin role itself.
          ['PUT', `/roles/${saRoleId}`, { description: 'Mine now' }],
          ['PUT', `/roles/${saRoleId}`, { permissionIds: [] }],
          ['POST', `/roles/${saRoleId}/permissions`, { permissionIds: [perm.USER_VIEW] }],
          ['DELETE', `/roles/${saRoleId}`, undefined],
        ];
        for (const as of [adminToken, powerToken]) {
          for (const [method, path, body] of paths) {
            expect([method, path, ...refused(await api(method, path, body, as))]).toEqual([
              method,
              path,
              403,
              ONLY_SUPER_ADMIN,
            ]);
          }
        }

        // Nor can a new or renamed role take the protected name (role names are unique).
        expect(refused(await api('POST', '/roles', { name: 'Super Admin' }, powerToken))).toEqual([
          409,
          'Role already exists',
        ]);
        const mine = await ok('POST', '/roles', { name: `int mine ${run}` }, powerToken);
        expect(
          refused(
            await api('PUT', `/roles/${String(mine.id)}`, { name: 'Super Admin' }, powerToken),
          ),
        ).toEqual([409, 'Role already exists']);

        // Nothing moved: the user, the bulk batch's other user, and the role.
        const after = await prisma.user.findUniqueOrThrow({
          include: { roles: { include: { role: true }, where: { deletedAt: null } } },
          where: { id },
        });
        expect([after.name, after.status, after.deletedAt, after.sessionVersion]).toEqual([
          before.name,
          'DISABLED',
          null,
          before.sessionVersion,
        ]);
        expect(after.roles.map(({ role }) => role.name)).toEqual(['Super Admin']);
        expect((await ok('GET', `/users/${String(target.id)}`)).roles).toEqual([
          expect.objectContaining({ id: staffRoleId }),
        ]);
        const saRole = await prisma.role.findUniqueOrThrow({
          include: { permissions: { where: { deletedAt: null } } },
          where: { id: saRoleId },
        });
        expect([saRole.name, saRole.status, saRole.deletedAt]).toEqual([
          'Super Admin',
          'ACTIVE',
          null,
        ]);
        expect(saRole.permissions.length).toBeGreaterThan(0);
      });

      it('even a Super Admin cannot rename, deactivate or delete the Super Admin role', async () => {
        expect(refused(await api('PUT', `/roles/${saRoleId}`, { name: 'Root' }))).toEqual([
          400,
          'The Super Admin role cannot be renamed',
        ]);
        expect(refused(await api('PUT', `/roles/${saRoleId}`, { status: 'INACTIVE' }))).toEqual([
          400,
          'The Super Admin role cannot be made inactive',
        ]);
        expect(refused(await api('DELETE', `/roles/${saRoleId}`))).toEqual([
          409,
          'The Super Admin role cannot be deleted',
        ]);
      });

      it('a Super Admin may revoke Super Admin and grant it to another user', async () => {
        const id = String(saUser.id);
        const revoked = await ok('POST', `/users/${id}/roles`, { roleId: staffRoleId });
        expect(revoked).toMatchObject({ locationScope: 'SINGLE', roles: [{ id: staffRoleId }] });

        const other = await apiUser({ status: 'DISABLED' });
        const granted = await ok('POST', `/users/${String(other.id)}/roles`, { roleId: saRoleId });
        expect(granted).toMatchObject({ locationScope: 'ALL', roles: [{ name: 'Super Admin' }] });
        const viaUpdate = await ok('PUT', `/users/${id}`, { hospitalIds: [hA], roleId: saRoleId });
        expect(viaUpdate).toMatchObject({ roles: [{ name: 'Super Admin' }] });
      });
    });

    describe('credential lock', () => {
      const setActive = (id: string, sql: string) =>
        prisma.$executeRawUnsafe(
          `UPDATE users SET last_active_at = ${sql} WHERE id = $1::uuid`,
          id,
        );
      const LOCKED =
        / is signed in\. Their password, email and mobile can be changed after \d+ \w+ \d{4}, \d+:\d\d [ap]m, or once they sign out\.$/;

      it('an admin cannot change a signed-in user’s email, mobile or password for 8 hours', async () => {
        const user = await apiUser();
        const id = String(user.id);
        await setActive(id, 'now()');

        const read = await ok('GET', `/users/${id}`, undefined, adminToken);
        const until = new Date(String(read.credentialsLockedUntil)).getTime();
        expect(Math.abs(until - (Date.now() + 8 * 3_600_000))).toBeLessThan(120_000);

        for (const body of [
          { mobile: nextMobile() },
          { email: `locked-${run}@int.test` },
          { password: 'Another123' },
        ]) {
          const result = await api('PUT', `/users/${id}`, body, adminToken);
          expect(result.status).toBe(409);
          expect(String(result.body.message)).toMatch(LOCKED);
        }
        // Anything else, or re-sending the same values, still saves.
        const named = await api(
          'PUT',
          `/users/${id}`,
          { email: user.email, mobile: user.mobile, name: `int still locked ${run}` },
          adminToken,
        );
        expect(named.status).toBe(200);

        // Just under 8 hours: still locked. Just over: free.
        await setActive(id, "now() - interval '7 hours 58 minutes'");
        expect(
          (await api('PUT', `/users/${id}`, { mobile: nextMobile() }, adminToken)).status,
        ).toBe(409);
        await setActive(id, "now() - interval '8 hours 1 minute'");
        expect(
          (await ok('GET', `/users/${id}`, undefined, adminToken)).credentialsLockedUntil,
        ).toBeNull();
        const mobile = nextMobile();
        const changed = await ok('PUT', `/users/${id}`, { mobile }, adminToken);
        expect(changed.mobile).toBe(mobile);

        // Signed out (null), it is free straight away.
        await setActive(id, 'NULL');
        expect(
          (await api('PUT', `/users/${id}`, { password: 'Another123' }, adminToken)).status,
        ).toBe(200);
      });

      it('a Super Admin is always exempt', async () => {
        const user = await apiUser();
        const id = String(user.id);
        await setActive(id, 'now()');
        const mobile = nextMobile();
        const changed = await ok('PUT', `/users/${id}`, {
          email: `exempt-${run}@int.test`,
          mobile,
          password: 'Another123',
        });
        expect(changed).toMatchObject({ email: `exempt-${run}@int.test`, mobile });
        expect(changed.credentialsLockedUntil).not.toBeNull();
      });

      it('an admin cannot take over the sign-in of someone holding access they lack', async () => {
        const extra = await apiUser({ roleId: extraRoleId });
        expect(
          refused(
            await api('PUT', `/users/${String(extra.id)}`, { mobile: nextMobile() }, adminToken),
          ),
        ).toEqual([
          403,
          `${String(extra.name)} has access you do not hold, so only they or a Super Admin can change their password, email or mobile`,
        ]);
      });

      it('your own change is never locked, but needs your current password', async () => {
        await setActive(adminId, 'now()');
        const mobile = nextMobile();
        expect(refused(await api('PUT', `/users/${adminId}`, { mobile }, adminToken))).toEqual([
          400,
          'Enter your current password to change your password, email or mobile',
        ]);
        expect(
          refused(
            await api('PUT', `/users/${adminId}`, { currentPassword: 'wrong', mobile }, adminToken),
          ),
        ).toEqual([400, 'Enter your current password to change your password, email or mobile']);
        const changed = await ok(
          'PUT',
          `/users/${adminId}`,
          { currentPassword: PASSWORD, mobile },
          adminToken,
        );
        expect(changed.mobile).toBe(mobile);
        // The change ended the admin's own sessions.
        expect((await api('GET', '/users', undefined, adminToken)).status).toBe(401);
        adminToken = await tokenOf(adminId);

        const noPassword = await dbUser({
          hospitalIds: [hA],
          label: 'nopass',
          password: null,
          roleId: adminRoleId,
        });
        expect(
          refused(
            await api(
              'PUT',
              `/users/${noPassword.id}`,
              { mobile: nextMobile() },
              signFor(noPassword),
            ),
          ),
        ).toEqual([
          400,
          'Your account has no password yet. Ask another administrator to change these details.',
        ]);
      });
    });

    describe('per-user permission overrides', () => {
      it('reads the effective set, stores only the differences from the role, and applies them', async () => {
        const user = await apiUser({ roleId: viewerRoleId });
        const id = String(user.id);

        const before = await ok('GET', `/users/${id}/permissions`, undefined, adminToken);
        expect(shape(before)).toEqual({
          effectivePermissionIds: ['string'],
          permissions: [
            {
              action: 'string',
              code: 'string',
              description: 'string',
              id: 'string',
              module: 'string',
            },
          ],
        });
        expect(before.effectivePermissionIds).toEqual([perm.ROLE_VIEW]);
        expect((before.permissions as Body[]).length).toBe(Object.keys(perm).length);

        expect((await api('GET', '/roles', undefined, await tokenOf(id))).status).toBe(200);
        expect((await api('GET', '/permissions', undefined, await tokenOf(id))).status).toBe(403);

        // Drop the inherited ROLE_VIEW, add PERMISSION_VIEW.
        const replaced = await ok(
          'PUT',
          `/users/${id}/permissions`,
          { permissionIds: [perm.PERMISSION_VIEW] },
          adminToken,
        );
        expect(replaced.effectivePermissionIds).toEqual([perm.PERMISSION_VIEW]);
        const overrides = await prisma.userPermission.findMany({
          include: { permission: true },
          where: { deletedAt: null, userId: id },
        });
        expect(
          overrides.map(({ granted, permission }) => [permission.code, granted]).sort(),
        ).toEqual([
          ['PERMISSION_VIEW', true],
          ['ROLE_VIEW', false],
        ]);
        const userToken = await tokenOf(id);
        expect((await api('GET', '/roles', undefined, userToken)).status).toBe(403);
        expect((await api('GET', '/permissions', undefined, userToken)).status).toBe(200);
        expect(
          (await ok('GET', '/users/me/access', undefined, userToken)).permissions as string[],
        ).toEqual(['PERMISSION_VIEW']);

        // Back to exactly what the role gives: no overrides left.
        const reset = await ok(
          'PUT',
          `/users/${id}/permissions`,
          { permissionIds: [perm.ROLE_VIEW] },
          adminToken,
        );
        expect(reset.effectivePermissionIds).toEqual([perm.ROLE_VIEW]);
        expect(await prisma.userPermission.count({ where: { deletedAt: null, userId: id } })).toBe(
          0,
        );

        const bad: Array<[Body, string]> = [
          [{ permissionIds: [randomUUID()] }, 'One or more permissions were not found'],
          [{ permissionIds: ['nope'] }, 'each value in permissionIds must be a UUID'],
          [
            { permissionIds: [perm.ROLE_VIEW, perm.ROLE_VIEW] },
            "All permissionIds's elements must be unique",
          ],
          [{}, 'permissionIds must be an array'],
        ];
        for (const [body, message] of bad) {
          const result = await api('PUT', `/users/${id}/permissions`, body, adminToken);
          expect(result.status).toBe(400);
          expect(String(result.body.message)).toContain(message);
        }
        expect(
          refused(await api('GET', `/users/${randomUUID()}/permissions`, undefined, adminToken)),
        ).toEqual([404, 'User not found']);
      });
    });

    describe('roles', () => {
      it('create, read, list, update, assign permissions and delete a role', async () => {
        const name = `int cashier ${run}`;
        const created = await api('POST', '/roles', {
          description: 'Counter staff',
          name,
          permissionIds: [perm.USER_VIEW],
        });
        expect(created.status).toBe(201);
        const roleShape = {
          createdAt: 'string',
          deletedAt: null,
          description: 'string',
          id: 'string',
          locationScope: 'string',
          name: 'string',
          permissions: [
            {
              action: 'string',
              code: 'string',
              description: 'string',
              id: 'string',
              module: 'string',
            },
          ],
          status: 'string',
          updatedAt: 'string',
        };
        expect(shape(created.data)).toEqual(roleShape);
        // New roles always start single-location and active; the API cannot set the scope.
        expect(created.data).toMatchObject({
          description: 'Counter staff',
          locationScope: 'SINGLE',
          name: titleCase(name),
          permissions: [{ code: 'USER_VIEW' }],
          status: 'ACTIVE',
        });
        const id = String(created.data.id);

        expect(refused(await api('POST', '/roles', { name }))).toEqual([
          409,
          'Role already exists',
        ]);
        const invalid: Array<[Body, string]> = [
          [{}, 'name should not be empty'],
          [{ name: 'x'.repeat(81) }, 'name must be shorter than or equal to 80 characters'],
          [
            { name: `int bad ${run}`, permissionIds: ['nope'] },
            'each value in permissionIds must be a UUID',
          ],
          [
            { locationScope: 'ALL', name: `int bad ${run}` },
            'property locationScope should not exist',
          ],
        ];
        for (const [body, message] of invalid) {
          const result = await api('POST', '/roles', body);
          expect([result.status, result.body.errors]).toEqual([
            400,
            expect.arrayContaining([message]),
          ]);
        }
        expect(
          refused(
            await api('POST', '/roles', { name: `int bad ${run}`, permissionIds: [randomUUID()] }),
          ),
        ).toEqual([400, 'One or more permissions were not found']);

        expect(await ok('GET', `/roles/${id}`)).toMatchObject({ id, name: titleCase(name) });
        expect(refused(await api('GET', `/roles/${randomUUID()}`))).toEqual([
          404,
          'Role not found',
        ]);
        expect(refused(await api('GET', '/roles/nope'))).toEqual([
          400,
          'Validation failed (uuid is expected)',
        ]);
        const listed = await ok('GET', `/roles?search=${run}&limit=100`);
        expect(shape(listed)).toEqual({ items: [expect.anything()], meta: listMeta });
        const listedIds = (listed.items as Body[]).map((row) => row.id);
        expect(listedIds).toEqual(expect.arrayContaining([id, adminRoleId, staffRoleId]));
        expect((await api('GET', '/roles?status=GONE')).status).toBe(400);

        // A user holding the role gets its rights, live.
        const holder = await apiUser({ roleId: id });
        const holderToken = await tokenOf(String(holder.id));
        expect((await api('GET', '/users', undefined, holderToken)).status).toBe(200);

        const updated = await ok('PUT', `/roles/${id}`, {
          description: 'Till staff',
          name: `int till ${run}`,
        });
        expect(updated).toMatchObject({
          description: 'Till staff',
          name: titleCase(`int till ${run}`),
        });

        // Assigning permissions replaces the whole set.
        const assigned = await ok('POST', `/roles/${id}/permissions`, {
          permissionIds: [perm.ROLE_VIEW, perm.PERMISSION_VIEW],
        });
        expect((assigned.permissions as Body[]).map(({ code }) => code).sort()).toEqual([
          'PERMISSION_VIEW',
          'ROLE_VIEW',
        ]);
        expect((await api('GET', '/users', undefined, holderToken)).status).toBe(403);
        expect((await api('GET', '/roles', undefined, holderToken)).status).toBe(200);
        expect(
          refused(await api('POST', `/roles/${id}/permissions`, { permissionIds: [] })),
        ).toEqual([400, 'permissionIds should not be empty']);
        // PUT may empty it.
        expect((await ok('PUT', `/roles/${id}`, { permissionIds: [] })).permissions).toEqual([]);
        await ok('PUT', `/roles/${id}`, { permissionIds: [perm.ROLE_VIEW] });

        // An inactive role grants nothing to the people who hold it.
        expect((await ok('PUT', `/roles/${id}`, { status: 'INACTIVE' })).status).toBe('INACTIVE');
        expect((await api('GET', '/roles', undefined, holderToken)).status).toBe(403);
        expect(
          ((await ok('GET', `/roles?search=${run}&status=INACTIVE&limit=100`)).items as Body[]).map(
            (row) => row.id,
          ),
        ).toContain(id);
        await ok('PUT', `/roles/${id}`, { status: 'ACTIVE' });
        expect((await api('GET', '/roles', undefined, holderToken)).status).toBe(200);

        const removed = await api('DELETE', `/roles/${id}`);
        expect([removed.status, removed.data]).toEqual([200, { id }]);
        expect(refused(await api('GET', `/roles/${id}`))).toEqual([404, 'Role not found']);
        expect(refused(await api('DELETE', `/roles/${id}`))).toEqual([404, 'Role not found']);
        const row = await prisma.role.findUniqueOrThrow({
          include: { permissions: { where: { deletedAt: null } } },
          where: { id },
        });
        expect([row.status, row.deletedAt instanceof Date, row.permissions]).toEqual([
          'INACTIVE',
          true,
          [],
        ]);
        // Its holders lose it at once.
        expect((await api('GET', '/roles', undefined, holderToken)).status).toBe(403);
        // BUG?: a deleted role keeps its unique name, so the name can never be used again (users
        // free their mobile and email on delete; roles do not).
        expect(refused(await api('POST', '/roles', { name: `int till ${run}` }))).toEqual([
          409,
          'Role already exists',
        ]);
      });

      it('roles are global: only the all-locations reach changes one, and never its own', async () => {
        const notPlatformWide =
          'Roles apply at every location, so only someone with access to all locations can change them';
        // A location admin: not even a single-location role, nor the role they hold.
        const byAdmin: Array<[string, string, Body | undefined]> = [
          ['POST', '/roles', { name: `int local ${run}` }],
          ['PUT', `/roles/${staffRoleId}`, { status: 'INACTIVE' }],
          ['POST', `/roles/${staffRoleId}/permissions`, { permissionIds: [perm.USER_VIEW] }],
          ['DELETE', `/roles/${staffRoleId}`, undefined],
          ['PUT', `/roles/${adminRoleId}`, { status: 'INACTIVE' }],
          ['PUT', `/roles/${adminRoleId}`, { permissionIds: [] }],
        ];
        for (const [method, path, body] of byAdmin) {
          expect([method, path, ...refused(await api(method, path, body, adminToken))]).toEqual([
            method,
            path,
            403,
            notPlatformWide,
          ]);
        }
        // The all-locations reach, but on the role it holds itself.
        const ownRole = `You cannot change the Int Platform ${run} role because you hold it`;
        for (const [method, path, body] of [
          ['PUT', `/roles/${platformRoleId}`, { status: 'INACTIVE' }],
          ['POST', `/roles/${platformRoleId}/permissions`, { permissionIds: [perm.USER_VIEW] }],
          ['DELETE', `/roles/${platformRoleId}`, undefined],
        ] as Array<[string, string, Body | undefined]>) {
          expect([method, path, ...refused(await api(method, path, body, platformToken))]).toEqual([
            method,
            path,
            403,
            ownRole,
          ]);
        }
        const untouched = await prisma.role.findMany({
          include: { permissions: { where: { deletedAt: null } } },
          where: { id: { in: [staffRoleId, adminRoleId, platformRoleId] } },
        });
        expect(untouched.map((row) => [row.status, row.deletedAt])).toEqual(
          untouched.map(() => ['ACTIVE', null]),
        );
        expect(untouched.find((row) => row.id === adminRoleId)?.permissions.length).toBeGreaterThan(
          0,
        );
        expect(untouched.find((row) => row.id === staffRoleId)?.permissions).toEqual([]);

        // Any other role, the all-locations reach may change.
        expect(
          (await ok('PUT', `/roles/${multiRoleId}`, { description: 'Area' }, platformToken))
            .description,
        ).toBe('Area');
      });

      it('a platform admin may build roles only from permissions they hold', async () => {
        const made = await api(
          'POST',
          '/roles',
          { name: `int admin made ${run}`, permissionIds: [perm.USER_VIEW, perm.ROLE_VIEW] },
          platformToken,
        );
        expect(made.status).toBe(201);
        const id = String(made.data.id);
        const lacking = `You cannot grant permissions you do not hold: ${otherPermCode}`;
        expect(
          refused(
            await api(
              'POST',
              '/roles',
              { name: `int grab ${run}`, permissionIds: [perm[otherPermCode]] },
              platformToken,
            ),
          ),
        ).toEqual([403, lacking]);
        expect(
          refused(
            await api(
              'POST',
              `/roles/${id}/permissions`,
              { permissionIds: [perm[otherPermCode]] },
              platformToken,
            ),
          ),
        ).toEqual([403, lacking]);
        expect(
          refused(
            await api(
              'PUT',
              `/roles/${id}`,
              { permissionIds: [perm.USER_VIEW, perm[otherPermCode]] },
              platformToken,
            ),
          ),
        ).toEqual([403, lacking]);

        // A permission the role already carries may be kept even by someone who lacks it.
        await prisma.rolePermission.create({
          data: { permissionId: perm[otherPermCode] ?? '', roleId: id },
        });
        const kept = await ok(
          'PUT',
          `/roles/${id}`,
          { permissionIds: [perm.USER_VIEW, perm[otherPermCode]] },
          platformToken,
        );
        expect((kept.permissions as Body[]).map(({ code }) => code).sort()).toEqual(
          ['USER_VIEW', otherPermCode].sort(),
        );
        expect((await api('DELETE', `/roles/${id}`, undefined, platformToken)).status).toBe(200);
      });
    });

    describe('permissions', () => {
      it('lists the catalogue with search, module and action filters', async () => {
        const all = await ok('GET', '/permissions?limit=100');
        expect(shape(all)).toEqual({
          items: [
            {
              action: 'string',
              code: 'string',
              createdAt: 'string',
              description: 'string',
              id: 'string',
              module: 'string',
              updatedAt: 'string',
            },
          ],
          meta: listMeta,
        });
        expect(all.meta).toMatchObject({ limit: 100, page: 1, total: Object.keys(perm).length });

        const users = await ok('GET', '/permissions?module=user&limit=100');
        expect((users.items as Body[]).map(({ code }) => code)).toEqual([
          'USER_CREATE',
          'USER_DELETE',
          'USER_UPDATE',
          'USER_VIEW',
        ]);
        const views = await ok('GET', '/permissions?module=USER&action=view');
        expect((views.items as Body[]).map(({ code }) => code)).toEqual(['USER_VIEW']);
        const searched = await ok('GET', '/permissions?search=role_&limit=100');
        expect((searched.items as Body[]).map(({ code }) => code)).toEqual(
          expect.arrayContaining(['ROLE_CREATE', 'ROLE_DELETE', 'ROLE_UPDATE', 'ROLE_VIEW']),
        );
        const beyond = await ok('GET', '/permissions?page=1000&limit=100');
        expect(beyond.items).toEqual([]);
        for (const bad of ['limit=101', 'page=0', `module=${'x'.repeat(81)}`, 'other=1']) {
          expect([bad, (await api('GET', `/permissions?${bad}`)).status]).toEqual([bad, 400]);
        }
        // PERMISSION_VIEW alone is enough.
        const viewer = await dbUser({ hospitalIds: [hA], label: 'pview', roleId: staffRoleId });
        await prisma.userPermission.create({
          data: { granted: true, permissionId: perm.PERMISSION_VIEW ?? '', userId: viewer.id },
        });
        expect((await api('GET', '/permissions', undefined, signFor(viewer))).status).toBe(200);
      });
    });

    describe('my preferences and password', () => {
      it('get, set and clear my own preferences', async () => {
        const me = await dbUser({ hospitalIds: [hA], label: 'prefs', roleId: staffRoleId });
        const as = signFor(me);

        expect(await ok('GET', '/users/me/preferences', undefined, as)).toEqual({
          defaultLocationId: hA,
          hasPassword: true,
          startPage: null,
          theme: null,
        });
        const access = await ok('GET', '/users/me/access', undefined, as);
        expect(shape(access)).toEqual({
          defaultLocationId: 'string',
          locationScope: 'string',
          locations: [
            {
              city: null,
              displayName: 'string',
              hospitalCode: 'string',
              hospitalName: 'string',
              id: 'string',
              isActive: 'boolean',
              postalCode: null,
              state: null,
            },
          ],
          permissions: [],
        });
        expect(access).toMatchObject({ locationScope: 'SINGLE', locations: [{ id: hA }] });
        expect((await ok('GET', '/users/me/access')).locationScope).toBe('ALL');

        const set = await ok(
          'PATCH',
          '/users/me/preferences',
          { startPage: '/inventory/grns', theme: 'dark' },
          as,
        );
        expect(set).toEqual({
          defaultLocationId: hA,
          hasPassword: true,
          startPage: '/inventory/grns',
          theme: 'dark',
        });
        expect(await ok('GET', '/users/me/preferences', undefined, as)).toEqual(set);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).preferences).toEqual(
          {
            startPage: '/inventory/grns',
            theme: 'dark',
          },
        );

        // Omitted fields are kept; null clears one.
        expect(await ok('PATCH', '/users/me/preferences', { theme: null }, as)).toEqual({
          defaultLocationId: hA,
          hasPassword: true,
          startPage: '/inventory/grns',
          theme: null,
        });
        expect(await ok('PATCH', '/users/me/preferences', {}, as)).toEqual({
          defaultLocationId: hA,
          hasPassword: true,
          startPage: '/inventory/grns',
          theme: null,
        });

        const invalid: Array<[Body, string]> = [
          [{ theme: 'blue' }, 'theme must be one of the following values: light, dark, system'],
          [{ startPage: '//evil.example' }, 'startPage must be a portal path'],
          [{ startPage: 'https://evil.example' }, 'startPage must be a portal path'],
          [
            { startPage: `/${'a'.repeat(100)}` },
            'startPage must be shorter than or equal to 100 characters',
          ],
          [{ defaultLocationId: 'abc' }, 'defaultLocationId must be a location id'],
          [{ defaultLocationId: '' }, 'defaultLocationId must be a location id'],
          [{ notifications: [] }, 'property notifications should not exist'],
          [{ defaultLocationId: hB }, 'That location is outside your assigned access'],
        ];
        for (const [body, message] of invalid) {
          const result = await api('PATCH', '/users/me/preferences', body, as);
          expect([JSON.stringify(body), result.status, result.body.message]).toEqual([
            JSON.stringify(body),
            400,
            message,
          ]);
        }

        // A user who works at both may move their default; it becomes their home location.
        const both = await dbUser({ hospitalIds: [hA, hB], label: 'prefs2', roleId: multiRoleId });
        const moved = await ok(
          'PATCH',
          '/users/me/preferences',
          { defaultLocationId: hB },
          signFor(both),
        );
        expect(moved.defaultLocationId).toBe(hB);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: both.id } })).hospitalId).toBe(
          hB,
        );
        // An unknown location is refused even for a Super Admin (nothing is written).
        expect(
          refused(await api('PATCH', '/users/me/preferences', { defaultLocationId: randomUUID() })),
        ).toEqual([400, 'Location not found']);
      });

      it('change my password: checks the current one, then ends my sessions', async () => {
        const me = await dbUser({ hospitalIds: [hA], label: 'pw', roleId: staffRoleId });
        const as = signFor(me);
        const change = (body: Body) => api('POST', '/users/me/password', body, as);

        expect(
          refused(await change({ currentPassword: 'wrong', newPassword: 'Brandnew123' })),
        ).toEqual([400, 'Current password is incorrect']);
        expect(refused(await change({ currentPassword: PASSWORD, newPassword: PASSWORD }))).toEqual(
          [400, 'Choose a password different from the current one'],
        );
        expect(refused(await change({ currentPassword: PASSWORD, newPassword: 'short' }))).toEqual([
          400,
          'Password must be at least 8 characters and include a letter and number.',
        ]);
        const done = await change({ currentPassword: PASSWORD, newPassword: 'Brandnew123' });
        expect([done.status, done.body.message, done.data]).toEqual([
          201,
          'Password changed',
          { changed: true },
        ]);
        const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
        expect([row.sessionVersion, row.passwordHash === me.passwordHash]).toEqual([1, false]);
        expect(refused(await api('GET', '/users/me/preferences', undefined, as))).toEqual([
          401,
          'Your account was updated. Please sign in again.',
        ]);

        const noPassword = await dbUser({
          hospitalIds: [hA],
          label: 'pw0',
          password: null,
          roleId: staffRoleId,
        });
        // Without a password yet, a user sets their first one: no current password is asked for.
        const first = await api(
          'POST',
          '/users/me/password',
          { newPassword: 'Brandnew123' },
          signFor(noPassword),
        );
        expect([first.status, first.body.message]).toEqual([201, 'Password changed']);
      });
    });
  },
);
