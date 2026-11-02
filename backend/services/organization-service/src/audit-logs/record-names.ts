import type { PrismaService } from '../common/prisma/prisma.service';

type Row = Record<string, unknown> & { id: string };
type Lookup = { label: (row: Row) => unknown; model: string; select: Record<string, unknown> };

const item = { item: { select: { itemName: true } } };
const itemName = (row: Row) => (row.item as { itemName?: string } | null)?.itemName;

/** How to name a record of each audited table; tables left out show their id. */
const lookups: Record<string, Lookup> = {
  counter_shifts: { label: (row) => row.name, model: 'counterShift', select: { name: true } },
  counters: { label: (row) => row.counterName, model: 'counter', select: { counterName: true } },
  employee_discounts: {
    label: (row) => row.name,
    model: 'employeeDiscount',
    select: { name: true },
  },
  employees: {
    label: (row) => row.employeeName,
    model: 'employee',
    select: { employeeName: true },
  },
  erp_postings: {
    label: (row) => (row.businessDate as Date | undefined)?.toISOString().slice(0, 10),
    model: 'erpPosting',
    select: { businessDate: true },
  },
  grns: { label: (row) => row.grnNumber, model: 'grn', select: { grnNumber: true } },
  hospitals: {
    label: (row) => `${String(row.hospitalCode)} - ${String(row.hospitalName)}`,
    model: 'hospital',
    select: { hospitalCode: true, hospitalName: true },
  },
  item_categories: {
    label: (row) => row.categoryName,
    model: 'itemCategory',
    select: { categoryName: true },
  },
  item_prices: { label: itemName, model: 'itemPrice', select: item },
  items: { label: (row) => row.itemName, model: 'item', select: { itemName: true } },
  kitchen_items: { label: itemName, model: 'kitchenItem', select: item },
  kitchen_productions: {
    label: (row) => row.productionNumber,
    model: 'kitchenProduction',
    select: { productionNumber: true },
  },
  kitchens: { label: (row) => row.kitchenName, model: 'kitchen', select: { kitchenName: true } },
  kiosk_orders: {
    label: (row) => `#${String(row.number)}`,
    model: 'kioskOrder',
    select: { number: true },
  },
  legal_entities: {
    label: (row) => row.entityName,
    model: 'legalEntity',
    select: { entityName: true },
  },
  locations: {
    label: (row) => row.locationName,
    model: 'location',
    select: { locationName: true },
  },
  payment_machines: { label: (row) => row.name, model: 'paymentMachine', select: { name: true } },
  pos_devices: { label: (row) => row.name, model: 'posDevice', select: { name: true } },
  restaurant_menus: { label: itemName, model: 'restaurantMenu', select: item },
  restaurant_orders: {
    label: (row) => row.billNumber ?? row.orderNumber,
    model: 'restaurantOrder',
    select: { billNumber: true, orderNumber: true },
  },
  restaurants: {
    label: (row) => row.restaurantName,
    model: 'restaurant',
    select: { restaurantName: true },
  },
  roles: { label: (row) => row.name, model: 'role', select: { name: true } },
  stock_balances: { label: itemName, model: 'stockBalance', select: item },
  store_items: { label: itemName, model: 'storeItem', select: item },
  stores: { label: (row) => row.storeName, model: 'store', select: { storeName: true } },
  time_slots: { label: (row) => row.slotName, model: 'timeSlot', select: { slotName: true } },
  transfers: {
    label: (row) => row.transferNumber,
    model: 'transfer',
    select: { transferNumber: true },
  },
  users: { label: (row) => row.name, model: 'user', select: { name: true } },
};

/**
 * The display name of each audited record on a page, as "entityName:entityId" → name: one query
 * per record type on the page. Deleted records keep their name (soft deletes).
 */
export async function recordNames(
  prisma: PrismaService,
  rows: Array<{ entityId: string; entityName: string }>,
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!lookups[row.entityName]) continue;
    idsByType.set(row.entityName, (idsByType.get(row.entityName) ?? new Set()).add(row.entityId));
  }

  const names = new Map<string, string>();
  const delegates = prisma as unknown as Record<
    string,
    { findMany(args: unknown): Promise<Row[]> }
  >;

  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const lookup = lookups[type]!;
      const found = await delegates[lookup.model]!.findMany({
        select: { id: true, ...lookup.select },
        where: { id: { in: [...ids] } },
      });

      for (const record of found) {
        const label = lookup.label(record);
        if (typeof label === 'string' && label.trim()) names.set(`${type}:${record.id}`, label);
      }
    }),
  );

  return names;
}
