import { strict as assert } from 'node:assert';
import { ForbiddenException } from '@nestjs/common';
import type { JwtRequestUser } from '@aahar/auth';
import {
  assertCanChangeRoles,
  assertCanGrantScope,
  assertHoldsAccessOf,
  assertHoldsPermissions,
  assertHospitalsWithinReach,
  assertNotSelf,
  assertUserWithinReach,
  sameIds,
  userReachWhere,
} from './actor-scope';
import { SUPER_ADMIN_ROLE } from './super-admin';
import { test } from 'vitest';

test('actor reach rules', () => {
  const superAdmin: JwtRequestUser = {
    allowedHospitalIds: null,
    id: 'sa',
    locationScope: 'ALL',
    permissions: [],
    roles: [SUPER_ADMIN_ROLE],
  };
  const admin: JwtRequestUser = {
    allowedHospitalIds: ['A', 'B'],
    id: 'admin',
    locationScope: 'MULTI',
    permissions: ['USER_UPDATE', 'GRN_VIEW'],
    roles: ['Admin'],
  };

  const atA = { assignedHospitals: [{ hospitalId: 'A' }], hospitalId: 'A' };
  const atAandC = {
    assignedHospitals: [{ hospitalId: 'A' }, { hospitalId: 'C' }],
    hospitalId: 'A',
  };
  const nowhere = { assignedHospitals: [], hospitalId: null };

  // Reach
  assert.deepEqual(userReachWhere(superAdmin), {}, 'Super Admin lists everyone');
  assert.ok('OR' in userReachWhere(admin), 'an Admin list is narrowed to their hospitals');
  assert.doesNotThrow(() => assertUserWithinReach(atA, admin));
  assert.throws(
    () => assertUserWithinReach(atAandC, admin),
    ForbiddenException,
    'sharing one hospital is not enough to edit someone who also works elsewhere',
  );
  assert.throws(
    () => assertUserWithinReach(nowhere, admin),
    ForbiddenException,
    'a user with no hospital (a Super Admin) is outside an Admin reach',
  );
  assert.doesNotThrow(() => assertUserWithinReach(atAandC, superAdmin));
  assert.throws(() => userReachWhere(undefined), ForbiddenException, 'no actor fails closed');

  // Granting locations, scope and permissions
  assert.doesNotThrow(() => assertHospitalsWithinReach(['A', 'B'], admin));
  assert.throws(() => assertHospitalsWithinReach(['A', 'C'], admin), ForbiddenException);
  assert.doesNotThrow(() => assertHospitalsWithinReach(['Z'], superAdmin));

  assert.doesNotThrow(() => assertCanGrantScope({ locationScope: 'MULTI', name: 'Admin' }, admin));
  assert.doesNotThrow(() =>
    assertCanGrantScope({ locationScope: 'SINGLE', name: 'Cashier' }, admin),
  );
  assert.throws(
    () => assertCanGrantScope({ locationScope: 'ALL', name: 'Owner' }, admin),
    ForbiddenException,
    'an Admin cannot hand out a scope wider than their own',
  );

  assert.doesNotThrow(() => assertHoldsPermissions(['GRN_VIEW'], admin));
  assert.doesNotThrow(() => assertHoldsPermissions([], admin));
  assert.throws(() => assertHoldsPermissions(['USER_DELETE'], admin), ForbiddenException);
  assert.doesNotThrow(() => assertHoldsPermissions(['USER_DELETE'], superAdmin));

  // Changing someone's sign-in (password, email, mobile)
  const cashier = { name: 'Cashier', permissionCodes: ['GRN_VIEW'], scopes: ['SINGLE' as const] };
  assert.doesNotThrow(() => assertHoldsAccessOf(cashier, admin));
  assert.throws(
    () => assertHoldsAccessOf({ ...cashier, permissionCodes: ['ROLE_CREATE'] }, admin),
    ForbiddenException,
    'an Admin cannot take over someone holding a permission the Admin lacks',
  );
  assert.throws(
    () => assertHoldsAccessOf({ ...cashier, scopes: ['ALL'] }, admin),
    ForbiddenException,
    'nor someone with a wider location scope',
  );
  assert.doesNotThrow(() =>
    assertHoldsAccessOf(
      { ...cashier, permissionCodes: ['ROLE_CREATE'], scopes: ['ALL'] },
      superAdmin,
    ),
  );

  // Changing another user's role, locations, status or permissions needs the same.
  assert.throws(
    () => assertHoldsAccessOf({ ...cashier, permissionCodes: ['ROLE_CREATE'] }, admin, 'role'),
    /Cashier has access you do not hold, so only a Super Admin can change their role/,
  );
  assert.doesNotThrow(() => assertHoldsAccessOf(cashier, admin, 'status'));

  // Roles are global: only the platform-wide scope may create or change one, never their own.
  const platformAdmin: JwtRequestUser = {
    ...admin,
    allowedHospitalIds: null,
    locationScope: 'ALL',
  };
  for (const role of [undefined, { name: 'Cashier' }, { name: 'Admin' }]) {
    assert.throws(
      () => assertCanChangeRoles(admin, role),
      /Roles apply at every location, so only someone with access to all locations can change them/,
      'a location Admin changes no role, not even a single-location one',
    );
  }
  assert.doesNotThrow(() => assertCanChangeRoles(platformAdmin));
  assert.doesNotThrow(() => assertCanChangeRoles(platformAdmin, { name: 'Cashier' }));
  assert.throws(
    () => assertCanChangeRoles(platformAdmin, { name: 'Admin' }),
    /You cannot change the Admin role because you hold it/,
  );
  assert.doesNotThrow(() => assertCanChangeRoles(superAdmin, { name: SUPER_ADMIN_ROLE }));
  assert.throws(() => assertCanChangeRoles(undefined), ForbiddenException);

  // Self-service
  assert.throws(() => assertNotSelf('admin', admin, 'role'), ForbiddenException);
  assert.doesNotThrow(() => assertNotSelf('someone-else', admin, 'role'));
  assert.doesNotThrow(() => assertNotSelf('sa', superAdmin, 'role'), 'a Super Admin may');

  assert.equal(sameIds(['A', 'B'], ['B', 'A']), true, 'order does not matter');
  assert.equal(sameIds(['A'], ['A', 'B']), false);
});
