import { LocationScope, PrismaClient, type Prisma } from '@prisma/client';

/**
 * Role definitions are data, not code paths: every role here can be edited in the portal
 * afterwards, and new roles can be created without touching this file. Seeding only guarantees
 * the personas from the operating model exist with a sensible starting permission set.
 *
 * `locationScope` encodes the hierarchy:
 *   ALL    - every location (Super Admin)
 *   MULTI  - the locations explicitly assigned (Admin)
 *   SINGLE - exactly the one location assigned to the user (everyone else)
 *
 * Permission codes are limited to those that guard an endpoint that exists today. POS Cashier
 * and Delivery Operator are deliberately thin until the ordering, billing, KOT and delivery
 * modules ship their own permissions.
 */
export const OPERATIONAL_ROLES: Array<{
  description: string;
  locationScope: LocationScope;
  name: string;
  permissionCodes: string[];
}> = [
  {
    description: 'Billing, POS orders and payments at an assigned counter',
    locationScope: LocationScope.SINGLE,
    name: 'POS Cashier',
    permissionCodes: [
      'COUNTER_VIEW',
      'ITEM_PRICE_VIEW',
      'ITEM_VIEW',
      'PAYMENT_MACHINE_VIEW',
      'POS_DEVICE_VIEW',
      'RESTAURANT_MENU_VIEW',
      'RESTAURANT_STOCK_VIEW',
      'RESTAURANT_VIEW',
    ],
  },
  {
    description: 'Kitchen production entry and order preparation status',
    locationScope: LocationScope.SINGLE,
    name: 'Kitchen Operator',
    permissionCodes: [
      'ITEM_VIEW',
      'KITCHEN_ITEM_VIEW',
      'KITCHEN_PRODUCTION_CREATE',
      'KITCHEN_PRODUCTION_POST',
      'KITCHEN_PRODUCTION_UPDATE',
      'KITCHEN_PRODUCTION_VIEW',
      'KITCHEN_STOCK_VIEW',
      'KITCHEN_TRANSFER_CREATE',
      'KITCHEN_TRANSFER_DISPATCH',
      'KITCHEN_TRANSFER_VIEW',
      'KITCHEN_VIEW',
      'TIME_SLOT_VIEW',
    ],
  },
  {
    description: 'Stock receipt, movement and distribution to counters',
    locationScope: LocationScope.SINGLE,
    name: 'Inventory Manager',
    permissionCodes: [
      'GRN_CREATE',
      'GRN_POST',
      'GRN_UPDATE',
      'GRN_VIEW',
      'ITEM_CATEGORY_VIEW',
      'ITEM_VIEW',
      'KITCHEN_STOCK_VIEW',
      'KITCHEN_VIEW',
      'RESTAURANT_STOCK_VIEW',
      'RESTAURANT_VIEW',
      'STOCK_VIEW',
      'STORE_ITEM_VIEW',
      'STORE_VIEW',
      'TRANSFER_ACKNOWLEDGE',
      'TRANSFER_CANCEL',
      'TRANSFER_CREATE',
      'TRANSFER_DISPATCH',
      'TRANSFER_VIEW',
    ],
  },
  {
    description: 'Order assignment and delivery at an assigned location',
    locationScope: LocationScope.SINGLE,
    name: 'Delivery Operator',
    permissionCodes: ['ITEM_VIEW', 'RESTAURANT_MENU_VIEW', 'RESTAURANT_VIEW'],
  },
];

export async function seedOperationalRoles(tx: Prisma.TransactionClient): Promise<void> {
  const permissions = await tx.permission.findMany({ select: { code: true, id: true } });
  const permissionByCode = new Map(
    permissions.map((permission) => [permission.code, permission.id]),
  );

  for (const definition of OPERATIONAL_ROLES) {
    const role = await tx.role.upsert({
      create: {
        description: definition.description,
        locationScope: definition.locationScope,
        name: definition.name,
      },
      update: {
        deletedAt: null,
        description: definition.description,
        locationScope: definition.locationScope,
      },
      where: { name: definition.name },
    });

    const permissionIds = definition.permissionCodes
      .map((code) => permissionByCode.get(code))
      .filter((id): id is string => Boolean(id));

    // Re-seeding reflects the definition above rather than accumulating stale grants.
    await tx.rolePermission.deleteMany({
      where: { permissionId: { notIn: permissionIds }, roleId: role.id },
    });
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ permissionId, roleId: role.id })),
      skipDuplicates: true,
    });
  }
}

/**
 * Standalone entry point, so the personas can be (re)seeded without running the full seed —
 * useful on an existing database where other seed data would collide.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.role.updateMany({
        data: { locationScope: LocationScope.ALL },
        where: { name: 'Super Admin' },
      });
      await tx.role.updateMany({
        data: { locationScope: LocationScope.MULTI },
        where: { name: 'Admin' },
      });
      await seedOperationalRoles(tx);
    });

    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { _count: { select: { permissions: true } }, locationScope: true, name: true },
    });
    console.table(
      roles.map((role) => ({
        permissions: role._count.permissions,
        role: role.name,
        scope: role.locationScope,
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes('seed-roles')) {
  void main();
}
