import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  SUPER_ADMIN_ROLE,
  assertSuperAdminActor,
  assertSuperAdminRemains,
  holdsSuperAdminRole,
  isSuperAdminRole,
} from './super-admin';
import { test } from 'vitest';

test('Super Admin guard', () => {
  const superAdmin = { name: SUPER_ADMIN_ROLE };
  const admin = { name: 'Admin' };

  assert.equal(isSuperAdminRole(superAdmin), true);
  assert.equal(isSuperAdminRole(admin), false);
  assert.equal(isSuperAdminRole({ name: 'super admin' }), false, 'match is exact, not fuzzy');

  assert.equal(holdsSuperAdminRole([{ role: admin }, { role: superAdmin }]), true);
  assert.equal(holdsSuperAdminRole([{ role: admin }]), false);
  assert.equal(holdsSuperAdminRole([]), false);

  assert.doesNotThrow(() => assertSuperAdminActor([SUPER_ADMIN_ROLE]));
  assert.throws(() => assertSuperAdminActor(['Admin']), ForbiddenException);
  assert.throws(() => assertSuperAdminActor([]), ForbiddenException);
  assert.throws(
    () => assertSuperAdminActor(undefined),
    ForbiddenException,
    'an actor with no roles must be refused, not allowed through',
  );

  assert.doesNotThrow(() => assertSuperAdminRemains(1), 'one survivor is enough');
  assert.doesNotThrow(() => assertSuperAdminRemains(7));
  assert.throws(
    () => assertSuperAdminRemains(0),
    ConflictException,
    'removing the last Super Admin must be refused',
  );
});
