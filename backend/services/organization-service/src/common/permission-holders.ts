import type { Prisma } from '@prisma/client';
import { RecordStatus, UserStatus } from '@prisma/client';

/**
 * Active users who hold a permission: through an active role or a grant of their own, and not
 * denied it by a grant. Where they work is up to the caller.
 */
export const holdsPermission = (code: string): Prisma.UserWhereInput => ({
  AND: [
    {
      OR: [
        {
          roles: {
            some: {
              deletedAt: null,
              role: {
                deletedAt: null,
                permissions: { some: { deletedAt: null, permission: { code } } },
                status: RecordStatus.ACTIVE,
              },
            },
          },
        },
        { permissionOverrides: { some: { deletedAt: null, granted: true, permission: { code } } } },
      ],
    },
  ],
  deletedAt: null,
  NOT: { permissionOverrides: { some: { deletedAt: null, granted: false, permission: { code } } } },
  status: UserStatus.ACTIVE,
});

/** Users who work at a location: it is theirs, or they are assigned to it. */
export const worksAt = (hospitalId: string): Prisma.UserWhereInput => ({
  OR: [{ hospitalId }, { assignedHospitals: { some: { deletedAt: null, hospitalId } } }],
});
