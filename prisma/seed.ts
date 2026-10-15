import { LocationScope, PrismaClient, UserStatus } from '@prisma/client';
import { hashPassword } from '../backend/packages/auth/src/passwords';
import { createPrismaAdapter } from '../backend/packages/auth/src/prisma-adapter';
import { seedOperationalRoles } from './seed-roles';

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

// The Super Admin's first password comes from the environment (the Jenkins credential
// aahar-admin, via the chart's Secret), never from source: this repository is public. It is
// applied only while the account has no password, so one changed later survives every deploy.
const INITIAL_SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();

const defaultPermissions = [
  ['USER_CREATE', 'USER', 'CREATE', 'Create users'],
  ['USER_VIEW', 'USER', 'VIEW', 'View users'],
  ['USER_UPDATE', 'USER', 'UPDATE', 'Update users'],
  ['USER_DELETE', 'USER', 'DELETE', 'Disable users'],
  ['ROLE_CREATE', 'ROLE', 'CREATE', 'Create roles'],
  ['ROLE_VIEW', 'ROLE', 'VIEW', 'View roles'],
  ['ROLE_UPDATE', 'ROLE', 'UPDATE', 'Update roles'],
  ['ROLE_DELETE', 'ROLE', 'DELETE', 'Disable roles'],
  ['PERMISSION_VIEW', 'PERMISSION', 'VIEW', 'View permissions'],
  ['HOSPITAL_CREATE', 'HOSPITAL', 'CREATE', 'Create hospitals'],
  ['HOSPITAL_VIEW', 'HOSPITAL', 'VIEW', 'View hospitals'],
  ['HOSPITAL_UPDATE', 'HOSPITAL', 'UPDATE', 'Update hospitals'],
  ['HOSPITAL_DELETE', 'HOSPITAL', 'DELETE', 'Disable hospitals'],
  ['LOCATION_CREATE', 'LOCATION', 'CREATE', 'Create locations'],
  ['LOCATION_VIEW', 'LOCATION', 'VIEW', 'View locations'],
  ['LOCATION_UPDATE', 'LOCATION', 'UPDATE', 'Update locations'],
  ['LOCATION_DELETE', 'LOCATION', 'DELETE', 'Disable locations'],
  ['STORE_CREATE', 'STORE', 'CREATE', 'Create stores'],
  ['STORE_VIEW', 'STORE', 'VIEW', 'View stores'],
  ['STORE_UPDATE', 'STORE', 'UPDATE', 'Update stores'],
  ['STORE_DELETE', 'STORE', 'DELETE', 'Disable stores'],
  ['KITCHEN_CREATE', 'KITCHEN', 'CREATE', 'Create kitchens'],
  ['KITCHEN_VIEW', 'KITCHEN', 'VIEW', 'View kitchens'],
  ['KITCHEN_UPDATE', 'KITCHEN', 'UPDATE', 'Update kitchens'],
  ['KITCHEN_DELETE', 'KITCHEN', 'DELETE', 'Disable kitchens'],
  ['RESTAURANT_CREATE', 'RESTAURANT', 'CREATE', 'Create restaurants'],
  ['RESTAURANT_VIEW', 'RESTAURANT', 'VIEW', 'View restaurants'],
  ['RESTAURANT_UPDATE', 'RESTAURANT', 'UPDATE', 'Update restaurants'],
  ['RESTAURANT_DELETE', 'RESTAURANT', 'DELETE', 'Disable restaurants'],
  ['COUNTER_CREATE', 'COUNTER', 'CREATE', 'Create counters'],
  ['COUNTER_VIEW', 'COUNTER', 'VIEW', 'View counters'],
  ['COUNTER_UPDATE', 'COUNTER', 'UPDATE', 'Update counters'],
  ['COUNTER_DELETE', 'COUNTER', 'DELETE', 'Disable counters'],
  ['POS_DEVICE_CREATE', 'POS_DEVICE', 'CREATE', 'Create POS devices'],
  ['POS_DEVICE_VIEW', 'POS_DEVICE', 'VIEW', 'View POS devices'],
  ['POS_DEVICE_UPDATE', 'POS_DEVICE', 'UPDATE', 'Update POS devices'],
  ['POS_DEVICE_DELETE', 'POS_DEVICE', 'DELETE', 'Disable POS devices'],
  ['PAYMENT_MACHINE_CREATE', 'PAYMENT_MACHINE', 'CREATE', 'Create payment machines'],
  ['PAYMENT_MACHINE_VIEW', 'PAYMENT_MACHINE', 'VIEW', 'View payment machines'],
  ['PAYMENT_MACHINE_UPDATE', 'PAYMENT_MACHINE', 'UPDATE', 'Update payment machines'],
  ['PAYMENT_MACHINE_DELETE', 'PAYMENT_MACHINE', 'DELETE', 'Disable payment machines'],
  ['ITEM_CATEGORY_CREATE', 'ITEM_CATEGORY', 'CREATE', 'Create item categories'],
  ['ITEM_CATEGORY_VIEW', 'ITEM_CATEGORY', 'VIEW', 'View item categories'],
  ['ITEM_CATEGORY_UPDATE', 'ITEM_CATEGORY', 'UPDATE', 'Update item categories'],
  ['ITEM_CATEGORY_DELETE', 'ITEM_CATEGORY', 'DELETE', 'Disable item categories'],
  ['ITEM_CREATE', 'ITEM', 'CREATE', 'Create items'],
  ['ITEM_VIEW', 'ITEM', 'VIEW', 'View items'],
  ['ITEM_UPDATE', 'ITEM', 'UPDATE', 'Update items'],
  ['ITEM_DELETE', 'ITEM', 'DELETE', 'Disable items'],
  ['ITEM_PRICE_CREATE', 'ITEM_PRICE', 'CREATE', 'Create item sale prices'],
  ['ITEM_PRICE_VIEW', 'ITEM_PRICE', 'VIEW', 'View item sale prices'],
  ['ITEM_PRICE_UPDATE', 'ITEM_PRICE', 'UPDATE', 'Update item sale prices'],
  ['ITEM_PRICE_DELETE', 'ITEM_PRICE', 'DELETE', 'Disable item sale prices'],
  ['EMPLOYEE_CREATE', 'EMPLOYEE', 'CREATE', 'Create employees'],
  ['EMPLOYEE_VIEW', 'EMPLOYEE', 'VIEW', 'View employees'],
  ['EMPLOYEE_UPDATE', 'EMPLOYEE', 'UPDATE', 'Update employees'],
  ['EMPLOYEE_DELETE', 'EMPLOYEE', 'DELETE', 'Disable employees'],
  ['TIME_SLOT_CREATE', 'TIME_SLOT', 'CREATE', 'Create time slots'],
  ['TIME_SLOT_VIEW', 'TIME_SLOT', 'VIEW', 'View time slots'],
  ['TIME_SLOT_UPDATE', 'TIME_SLOT', 'UPDATE', 'Update time slots'],
  ['TIME_SLOT_DELETE', 'TIME_SLOT', 'DELETE', 'Disable time slots'],
  ['STORE_ITEM_CREATE', 'STORE_ITEM', 'CREATE', 'Create store item mappings'],
  ['STORE_ITEM_VIEW', 'STORE_ITEM', 'VIEW', 'View store item mappings'],
  ['STORE_ITEM_UPDATE', 'STORE_ITEM', 'UPDATE', 'Update store item mappings'],
  ['STORE_ITEM_DELETE', 'STORE_ITEM', 'DELETE', 'Disable store item mappings'],
  ['KITCHEN_ITEM_CREATE', 'KITCHEN_ITEM', 'CREATE', 'Create kitchen item mappings'],
  ['KITCHEN_ITEM_VIEW', 'KITCHEN_ITEM', 'VIEW', 'View kitchen item mappings'],
  ['KITCHEN_ITEM_UPDATE', 'KITCHEN_ITEM', 'UPDATE', 'Update kitchen item mappings'],
  ['KITCHEN_ITEM_DELETE', 'KITCHEN_ITEM', 'DELETE', 'Disable kitchen item mappings'],
  [
    'KITCHEN_PRODUCTION_CREATE',
    'KITCHEN_PRODUCTION',
    'CREATE',
    'Create kitchen production entries',
  ],
  ['KITCHEN_PRODUCTION_VIEW', 'KITCHEN_PRODUCTION', 'VIEW', 'View kitchen production entries'],
  [
    'KITCHEN_PRODUCTION_UPDATE',
    'KITCHEN_PRODUCTION',
    'UPDATE',
    'Update kitchen production entries',
  ],
  [
    'KITCHEN_PRODUCTION_DELETE',
    'KITCHEN_PRODUCTION',
    'DELETE',
    'Delete draft kitchen production entries',
  ],
  ['KITCHEN_PRODUCTION_POST', 'KITCHEN_PRODUCTION', 'POST', 'Post kitchen production to stock'],
  ['KITCHEN_STOCK_VIEW', 'KITCHEN_STOCK', 'VIEW', 'View kitchen stock ledger and balances'],
  ['RESTAURANT_MENU_CREATE', 'RESTAURANT_MENU', 'CREATE', 'Create restaurant menu mappings'],
  ['RESTAURANT_MENU_VIEW', 'RESTAURANT_MENU', 'VIEW', 'View restaurant menu mappings'],
  ['RESTAURANT_MENU_UPDATE', 'RESTAURANT_MENU', 'UPDATE', 'Update restaurant menu mappings'],
  ['RESTAURANT_MENU_DELETE', 'RESTAURANT_MENU', 'DELETE', 'Disable restaurant menu mappings'],
  ['GRN_CREATE', 'GRN', 'CREATE', 'Create goods receipt notes'],
  ['GRN_VIEW', 'GRN', 'VIEW', 'View goods receipt notes'],
  ['GRN_UPDATE', 'GRN', 'UPDATE', 'Update goods receipt notes'],
  ['GRN_DELETE', 'GRN', 'DELETE', 'Delete draft goods receipt notes'],
  ['GRN_POST', 'GRN', 'POST', 'Post goods receipt notes to stock'],
  ['STOCK_VIEW', 'STOCK', 'VIEW', 'View stock ledger and balances'],
  ['TRANSFER_CREATE', 'TRANSFER', 'CREATE', 'Create store to restaurant transfers'],
  ['TRANSFER_VIEW', 'TRANSFER', 'VIEW', 'View transfers and acknowledgements'],
  ['TRANSFER_DISPATCH', 'TRANSFER', 'DISPATCH', 'Dispatch transfers from store stock'],
  ['TRANSFER_CANCEL', 'TRANSFER', 'CANCEL', 'Cancel draft transfers'],
  ['TRANSFER_ACKNOWLEDGE', 'TRANSFER', 'ACKNOWLEDGE', 'Acknowledge restaurant transfers'],
  ['KITCHEN_TRANSFER_CREATE', 'TRANSFER', 'CREATE', 'Create kitchen to restaurant transfers'],
  ['KITCHEN_TRANSFER_VIEW', 'TRANSFER', 'VIEW', 'View kitchen to restaurant transfers'],
  ['KITCHEN_TRANSFER_DISPATCH', 'TRANSFER', 'DISPATCH', 'Dispatch transfers from kitchen stock'],
  [
    'RESTAURANT_STOCK_VIEW',
    'RESTAURANT_STOCK',
    'VIEW',
    'View restaurant stock ledger and balances',
  ],
  ['ORDER_VIEW', 'ORDER', 'VIEW', 'View guest orders on the kitchen screen'],
  ['ORDER_UPDATE', 'ORDER', 'UPDATE', 'Move guest orders to preparing, ready and collected'],
  ['AUDIT_LOG_VIEW', 'AUDIT_LOG', 'VIEW', 'View audit logs'],
] as const;

const defaultTimeSlots = [
  ['Breakfast', '07:00', '10:30', false],
  ['Lunch', '12:00', '15:00', false],
  ['Dinner', '19:00', '22:30', false],
  ['All Time', null, null, true],
  ['24x7', '00:00', '23:59', true],
] as const;

async function main() {
  await prisma.$transaction(async (tx) => {
    const permissions = await Promise.all(
      defaultPermissions.map(([code, module, action, description]) =>
        tx.permission.upsert({
          create: {
            action,
            code,
            description,
            module,
          },
          update: {
            action,
            deletedAt: null,
            description,
            module,
          },
          where: {
            code,
          },
        }),
      ),
    );

    await tx.permission.updateMany({
      data: {
        deletedAt: new Date(),
      },
      where: {
        module: 'COMPANY',
      },
    });

    const superAdmin = await tx.role.upsert({
      create: {
        description: 'Full platform administration',
        locationScope: LocationScope.ALL,
        name: 'Super Admin',
      },
      update: {
        deletedAt: null,
        description: 'Full platform administration',
        locationScope: LocationScope.ALL,
      },
      where: {
        name: 'Super Admin',
      },
    });

    const admin = await tx.role.upsert({
      create: {
        description: 'Administration role for day-to-day management',
        locationScope: LocationScope.MULTI,
        name: 'Admin',
      },
      update: {
        deletedAt: null,
        description: 'Administration role for day-to-day management',
        locationScope: LocationScope.MULTI,
      },
      where: {
        name: 'Admin',
      },
    });

    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        permissionId: permission.id,
        roleId: superAdmin.id,
      })),
      skipDuplicates: true,
    });

    await tx.rolePermission.createMany({
      data: permissions
        .filter((permission) => !permission.code.endsWith('_DELETE'))
        .map((permission) => ({
          permissionId: permission.id,
          roleId: admin.id,
        })),
      skipDuplicates: true,
    });

    await seedOperationalRoles(tx);

    // From here on the seed only fills in what is missing. This runs on every deploy, so it must
    // never undo what people do in the app: a record that already exists (even renamed,
    // deactivated or deleted) is left exactly as it is. Permissions and roles above still sync.

    const hospital = await tx.hospital.upsert({
      create: {
        address: 'Saket, New Delhi',
        billPrefix: 'MAX',
        city: 'New Delhi',
        gstApplicable: true,
        hospitalCode: 'MAX',
        hospitalName: 'Max Healthcare',
        isActive: true,
        state: 'Delhi',
      },
      update: {},
      where: {
        hospitalCode: 'MAX',
      },
    });

    const existingLocation = await tx.location.findFirst({
      where: {
        hospitalId: hospital.id,
        locationName: 'Max Saket',
      },
    });

    if (!existingLocation) {
      await tx.location.create({
        data: {
          address: 'Saket campus',
          area: 'Main Block',
          building: 'Hospital Tower',
          floor: 'Ground Floor',
          hospitalId: hospital.id,
          isActive: true,
          locationName: 'Max Saket',
        },
      });
    }

    const store = await tx.store.upsert({
      create: {
        address: 'Ground floor service corridor',
        hospitalId: hospital.id,
        isActive: true,
        storeCode: 'FNB-STORE-01',
        storeName: 'Main F&B Store',
        storeType: 'F&B',
      },
      update: {},
      where: {
        hospitalId_storeCode: {
          hospitalId: hospital.id,
          storeCode: 'FNB-STORE-01',
        },
      },
    });

    const kitchen = await tx.kitchen.upsert({
      create: {
        closingTime: '22:00',
        hospitalId: hospital.id,
        isActive: true,
        kitchenCode: 'MAIN-KITCHEN',
        kitchenName: 'Main Kitchen',
        openingTime: '06:00',
      },
      update: {},
      where: {
        hospitalId_kitchenCode: {
          hospitalId: hospital.id,
          kitchenCode: 'MAIN-KITCHEN',
        },
      },
    });

    const restaurant = await tx.restaurant.upsert({
      create: {
        address: 'Ground floor cafeteria',
        b2cQrEnabled: true,
        atTableDining: true,
        closingTime: '22:00',
        hospitalId: hospital.id,
        inRoomDiningEnabled: true,
        isActive: true,
        kitchenId: kitchen.id,
        onlineOrderingEnabled: true,
        openingTime: '07:00',
        restaurantCode: 'CAFETERIA',
        restaurantName: 'Main Cafeteria',
        storeId: store.id,
      },
      update: {},
      where: {
        hospitalId_restaurantCode: {
          hospitalId: hospital.id,
          restaurantCode: 'CAFETERIA',
        },
      },
    });

    await tx.restaurantKitchen.upsert({
      create: {
        isActive: true,
        kitchenId: kitchen.id,
        restaurantId: restaurant.id,
      },
      update: {},
      where: {
        restaurantId_kitchenId: {
          kitchenId: kitchen.id,
          restaurantId: restaurant.id,
        },
      },
    });

    await tx.counter.upsert({
      create: {
        counterCode: 'COUNTER-01',
        counterName: 'Cafeteria Counter 1',
        hospitalId: hospital.id,
        isActive: true,
        restaurantId: restaurant.id,
      },
      update: {},
      where: {
        restaurantId_counterCode: {
          counterCode: 'COUNTER-01',
          restaurantId: restaurant.id,
        },
      },
    });

    await Promise.all(
      defaultTimeSlots.map(([slotName, startTime, endTime, isAlwaysAvailable]) =>
        tx.timeSlot.upsert({
          create: {
            endTime,
            isActive: true,
            isAlwaysAvailable,
            slotName,
            startTime,
          },
          update: {},
          where: {
            slotName,
          },
        }),
      ),
    );

    const superAdminUser = await tx.user.upsert({
      create: {
        email: 'aahar@admin.local',
        employeeCode: 'SA001',
        hospitalId: hospital.id,
        mobile: '9999999999',
        name: 'Super Admin',
        status: UserStatus.ACTIVE,
      },
      // Create-only. Nothing is re-asserted on an existing account: not its mobile (unique, and
      // re-asserting it failed the deploy once another user held it), name, email or home
      // location, nor its status - disabling it (say after a compromise) survives the next deploy,
      // and the role grant below does not revive itself. The last-Super-Admin guard in
      // user-service stops anyone locking the platform out.
      update: {},
      where: {
        employeeCode: 'SA001',
      },
    });

    if (!superAdminUser.passwordHash) {
      if (INITIAL_SUPER_ADMIN_PASSWORD) {
        await tx.user.update({
          data: { passwordHash: await hashPassword(INITIAL_SUPER_ADMIN_PASSWORD) },
          where: { id: superAdminUser.id },
        });
      } else {
        // Not fatal: OTP sign-in still works, and `pnpm admin:password` can set it later.
        console.warn(
          'ADMIN_PASSWORD is not set, so the Super Admin (aahar@admin.local) has no password yet.',
        );
      }
    }

    await tx.userRole.upsert({
      create: {
        roleId: superAdmin.id,
        userId: superAdminUser.id,
      },
      update: {},
      where: {
        userId_roleId: {
          roleId: superAdmin.id,
          userId: superAdminUser.id,
        },
      },
    });
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
