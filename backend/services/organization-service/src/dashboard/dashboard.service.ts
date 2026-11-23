import { getAllowedHospitalIds } from '@aahar/auth';
import { Injectable } from '@nestjs/common';
import { CounterShiftStatus, OrderSource, OrderStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { ShortCache } from '../common/short-cache';
import { ListEmployeesQueryDto } from '../employees/dto/list-employees-query.dto';
import { EmployeesService } from '../employees/employees.service';
import { ListGrnEntriesQueryDto } from '../erp-grns/dto/erp-grn.dto';
import { ErpGrnsService } from '../erp-grns/erp-grns.service';
import { ListHospitalsQueryDto } from '../hospitals/dto/list-hospitals-query.dto';
import { HospitalsService } from '../hospitals/hospitals.service';
import { ListItemsQueryDto } from '../items/dto/list-items-query.dto';
import { ItemsService } from '../items/items.service';
import { ListKitchenItemsQueryDto } from '../kitchen-items/dto/list-kitchen-items-query.dto';
import { KitchenItemsService } from '../kitchen-items/kitchen-items.service';
import { ListKitchenProductionsQueryDto } from '../kitchen-productions/dto/list-kitchen-productions-query.dto';
import { KitchenProductionsService } from '../kitchen-productions/kitchen-productions.service';
import { ListKitchensQueryDto } from '../kitchens/dto/list-kitchens-query.dto';
import { KitchensService } from '../kitchens/kitchens.service';
import { ListRestaurantMenusQueryDto } from '../restaurant-menus/dto/list-restaurant-menus-query.dto';
import { RestaurantMenusService } from '../restaurant-menus/restaurant-menus.service';
import { ListRestaurantsQueryDto } from '../restaurants/dto/list-restaurants-query.dto';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ListStoreItemsQueryDto } from '../store-items/dto/list-store-items-query.dto';
import { StoreItemsService } from '../store-items/store-items.service';
import { ListStoresQueryDto } from '../stores/dto/list-stores-query.dto';
import { StoresService } from '../stores/stores.service';
import { ListTransfersQueryDto } from '../transfers/dto/list-transfers-query.dto';
import { TransfersService } from '../transfers/transfers.service';
import { toDateOnly, toNumber } from '../common/values';
import { userNames } from '../pos/shifts';
import {
  DashboardRecordsQueryDto,
  DashboardServiceQueryDto,
  DashboardSetupQueryDto,
} from './dto/dashboard-query.dto';
import {
  channelMix,
  compareDay,
  counterRows,
  istDay,
  itemSummary,
  salesByHour,
  totalsOf,
  whereServed,
  type DayBill,
} from './service-day';

/** ponytail: one read of up to 5,000 records per source; aggregate in SQL if a period outgrows it. */
export const DASHBOARD_RECORDS_CAP = 5000;

/** ponytail: two days' counter bills read whole (slim rows); group by in SQL if a day outgrows it. */
export const SERVICE_BILLS_CAP = 20_000;

/** The kitchen's lanes, in the order an order moves through them. */
const KITCHEN_LANES = [
  OrderStatus.PLACED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COLLECTED,
] as const;

const IST_OFFSET_MS = 330 * 60_000;

/** ponytail: names only, so 1,000 per kind is light; page through if a group outgrows it. */
export const LOCATION_NAMES_CAP = 1000;

/** A list's total when the user may see the list (a count only: limit 0), else undefined. */
async function totalIf(
  allowed: boolean,
  list: () => Promise<{ meta: { total: number } }>,
): Promise<number | undefined> {
  return allowed ? (await list()).meta.total : undefined;
}

type TransferRow = Awaited<ReturnType<TransfersService['list']>>['items'][number];
type ProductionRow = Awaited<ReturnType<KitchenProductionsService['list']>>['items'][number];
type GrnRow = Awaited<ReturnType<ErpGrnsService['list']>>['items'][number];

// Only the fields the dashboard's numbers read (portal lib/dashboard-stats.ts), taken from the
// list endpoints' own responses so the values are the same ones the lists return.
const toTransfer = (transfer: TransferRow) => ({
  createdAt: transfer.createdAt,
  hospital: transfer.hospital,
  hospitalId: transfer.hospitalId,
  id: transfer.id,
  lines: transfer.lines.map((line) => ({
    acceptedQty: line.acceptedQty,
    item: { itemName: line.item.itemName },
    itemId: line.itemId,
    rejectedQty: line.rejectedQty,
    rejectionReason: line.rejectionReason,
  })),
  status: transfer.status,
  transferDate: transfer.transferDate,
  updatedAt: transfer.updatedAt,
});

const toProduction = (production: ProductionRow) => ({
  hospital: production.hospital,
  hospitalId: production.hospitalId,
  id: production.id,
  kitchen: { kitchenName: production.kitchen.kitchenName },
  kitchenId: production.kitchenId,
  lines: production.lines.map((line) => ({
    item: { itemName: line.item.itemName },
    producedQty: line.producedQty,
    wastageQty: line.wastageQty,
  })),
  productionDate: production.productionDate,
  status: production.status,
});

// An ERP GRN in the shape the dashboard read delivery GRNs in (Deliveries were removed): the
// vendor is the ERP's supplier code, as the ERP sends no vendor name.
const toGrn = (grn: GrnRow) => ({
  grnNumber: grn.grn_No,
  lines: grn.rows.map((row) => ({
    acceptedQty: row.accepted_qty,
    rejectedQty: row.rejected_qty,
  })),
  receivedDate: grn.received_at,
  status: grn.status,
  vendorName: grn.rows[0]?.supplier ?? null,
});

/**
 * Whom an answer may be shared with: the same location reach (the Prisma scope narrows every
 * read to it), the same permissions and the same filters.
 */
function shareKey(permissions: readonly string[], filters: Record<string, string | undefined>) {
  const scope = getAllowedHospitalIds();

  return JSON.stringify([
    scope === undefined ? 'unscoped' : scope,
    [...permissions].sort(),
    filters,
  ]);
}

function slim<T, R>(page: { items: T[]; meta: { total: number } }, toRow: (row: T) => R) {
  return { items: page.items.map(toRow), truncated: page.meta.total > page.items.length };
}

/**
 * The dashboard's data in two requests instead of up to forty. Each part runs the list
 * endpoint's own service method (same filters, location scope and order) and is left out when
 * the user lacks that list's view permission, as the list endpoint would refuse it.
 */
@Injectable()
export class DashboardService {
  // Every admin's dashboard asks the same: under load (scripts/loadtest) these were the slowest
  // calls, so one answer is shared per scope. A new record shows within these times; the period
  // records go stale faster than the setup totals.
  private readonly navCountsCache = new ShortCache(15_000);
  private readonly recordsCache = new ShortCache(30_000);
  private readonly setupCache = new ShortCache(60_000);
  // The service day moves with every bill: shared for 15 s, like the nav counts.
  private readonly serviceCache = new ShortCache(15_000);

  constructor(
    private readonly employees: EmployeesService,
    private readonly grns: ErpGrnsService,
    private readonly hospitals: HospitalsService,
    private readonly items: ItemsService,
    private readonly kitchenItems: KitchenItemsService,
    private readonly kitchens: KitchensService,
    private readonly menus: RestaurantMenusService,
    private readonly productions: KitchenProductionsService,
    private readonly restaurants: RestaurantsService,
    private readonly storeItems: StoreItemsService,
    private readonly stores: StoresService,
    private readonly transfers: TransfersService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The nav badges' three counts in one request instead of three: transfers waiting for
   * acknowledgement, ERP GRNs with a return still waiting and draft productions, each the total
   * its own list endpoint gives for the same filters, and only when the user may view that list.
   */
  navCounts(query: DashboardSetupQueryDto, permissions: readonly string[]) {
    // Every signed-in tab asks each minute (10% of all requests with 2,000 users): shared 15 s.
    return this.navCountsCache.get(shareKey(permissions, { hospitalId: query.hospitalId }), () =>
      this.loadNavCounts(query, permissions),
    );
  }

  private async loadNavCounts(query: DashboardSetupQueryDto, permissions: readonly string[]) {
    const can = (...any: string[]) => any.some((permission) => permissions.includes(permission));
    const here = { hospitalId: query.hospitalId, limit: 0, page: 1 };
    const [transfers, grns, productions] = await Promise.all([
      totalIf(can('TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW'), () =>
        this.transfers.list(
          plainToInstance(ListTransfersQueryDto, { ...here, status: 'PENDING_ACKNOWLEDGEMENT' }),
        ),
      ),
      totalIf(can('GRN_VIEW'), () =>
        this.grns.list(plainToInstance(ListGrnEntriesQueryDto, { ...here, status: 'PENDING' })),
      ),
      totalIf(can('KITCHEN_PRODUCTION_VIEW'), () =>
        this.productions.list(
          plainToInstance(ListKitchenProductionsQueryDto, { ...here, status: 'DRAFT' }),
        ),
      ),
    ]);

    return { grns, productions, transfers };
  }

  /**
   * Every active store, kitchen, restaurant and counter the user may list, with only what the
   * portal needs to turn a location id into a name or a link: one light request instead of four
   * full lists. Each kind needs its list's view permission and matches that list's filters
   * (active, not deleted, its location not deleted); reads are narrowed to the user's locations
   * by the Prisma scope extension, as the lists are.
   */
  async locationNames(permissions: readonly string[]) {
    const can = (permission: string) => permissions.includes(permission);
    const live = { deletedAt: null, hospital: { deletedAt: null }, isActive: true };
    const [stores, kitchens, restaurants, counters] = await Promise.all([
      can('STORE_VIEW')
        ? this.prisma.store.findMany({
            orderBy: { storeName: 'asc' },
            select: { hospitalId: true, id: true, storeCode: true, storeName: true },
            take: LOCATION_NAMES_CAP,
            where: live,
          })
        : undefined,
      can('KITCHEN_VIEW')
        ? this.prisma.kitchen.findMany({
            orderBy: { kitchenName: 'asc' },
            select: { hospitalId: true, id: true, kitchenCode: true, kitchenName: true },
            take: LOCATION_NAMES_CAP,
            where: live,
          })
        : undefined,
      can('RESTAURANT_VIEW')
        ? this.prisma.restaurant.findMany({
            orderBy: { restaurantName: 'asc' },
            select: { hospitalId: true, id: true, restaurantCode: true, restaurantName: true },
            take: LOCATION_NAMES_CAP,
            where: live,
          })
        : undefined,
      can('COUNTER_VIEW')
        ? this.prisma.counter.findMany({
            orderBy: { counterName: 'asc' },
            select: {
              counterName: true,
              hospitalId: true,
              id: true,
              restaurant: { select: { restaurantName: true } },
            },
            take: LOCATION_NAMES_CAP,
            where: { ...live, restaurant: { deletedAt: null } },
          })
        : undefined,
    ]);

    return { counters, kitchens, restaurants, stores };
  }

  /** Transfers, posted productions and ERP GRNs received from `fromDate`, newest first. */
  records(query: DashboardRecordsQueryDto, permissions: readonly string[]) {
    const filters = { fromDate: query.fromDate, hospitalId: query.hospitalId };

    return this.recordsCache.get(shareKey(permissions, filters), () =>
      this.loadRecords(query, permissions),
    );
  }

  private async loadRecords(query: DashboardRecordsQueryDto, permissions: readonly string[]) {
    const can = (...any: string[]) => any.some((permission) => permissions.includes(permission));
    const period = {
      fromDate: query.fromDate,
      hospitalId: query.hospitalId,
      limit: DASHBOARD_RECORDS_CAP,
      page: 1,
      sortOrder: 'desc',
    };
    const [transfers, productions, grns] = await Promise.all([
      can('TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW')
        ? this.transfers.list(
            plainToInstance(ListTransfersQueryDto, { ...period, sortBy: 'transferDate' }),
          )
        : undefined,
      can('KITCHEN_PRODUCTION_VIEW')
        ? this.productions.list(
            plainToInstance(ListKitchenProductionsQueryDto, {
              ...period,
              sortBy: 'productionDate',
              status: 'POSTED',
            }),
          )
        : undefined,
      can('GRN_VIEW')
        ? this.grns.list(
            plainToInstance(ListGrnEntriesQueryDto, {
              hospitalId: query.hospitalId,
              limit: DASHBOARD_RECORDS_CAP,
              page: 1,
              receivedFrom: query.fromDate,
            }),
          )
        : undefined,
    ]);

    return {
      grns: grns && slim(grns, toGrn),
      productions: productions && slim(productions, toProduction),
      transfers: transfers && slim(transfers, toTransfer),
    };
  }

  /** The master-data totals and the first ERP GRN received and acknowledged transfer. */
  setup(query: DashboardSetupQueryDto, permissions: readonly string[]) {
    return this.setupCache.get(shareKey(permissions, { hospitalId: query.hospitalId }), () =>
      this.loadSetup(query, permissions),
    );
  }

  private async loadSetup(query: DashboardSetupQueryDto, permissions: readonly string[]) {
    const can = (...any: string[]) => any.some((permission) => permissions.includes(permission));
    const { hospitalId } = query;
    // limit 0: each total is one count, without loading a row and its related records.
    const one = { limit: 0, page: 1 };
    const here = { ...one, hospitalId };
    const total = totalIf;
    const first = { hospitalId, limit: 1, page: 1, sortBy: 'createdAt', sortOrder: 'asc' };

    const [
      employees,
      hospitals,
      items,
      kitchens,
      restaurants,
      stores,
      kitchenItems,
      menus,
      storeItems,
      firstGrn,
      firstTransfer,
    ] = await Promise.all([
      total(can('EMPLOYEE_VIEW'), () =>
        this.employees.list(plainToInstance(ListEmployeesQueryDto, here)),
      ),
      // Locations and items are counted across every location, as the Master data card shows.
      total(can('HOSPITAL_VIEW'), () =>
        this.hospitals.list(plainToInstance(ListHospitalsQueryDto, one)),
      ),
      total(can('ITEM_VIEW'), () => this.items.list(plainToInstance(ListItemsQueryDto, one))),
      total(can('KITCHEN_VIEW'), () =>
        this.kitchens.list(plainToInstance(ListKitchensQueryDto, here)),
      ),
      total(can('RESTAURANT_VIEW'), () =>
        this.restaurants.list(plainToInstance(ListRestaurantsQueryDto, here)),
      ),
      total(can('STORE_VIEW'), () => this.stores.list(plainToInstance(ListStoresQueryDto, here))),
      total(can('KITCHEN_ITEM_VIEW'), () =>
        this.kitchenItems.list(plainToInstance(ListKitchenItemsQueryDto, here)),
      ),
      total(can('RESTAURANT_MENU_VIEW'), () =>
        this.menus.list(plainToInstance(ListRestaurantMenusQueryDto, here)),
      ),
      total(can('STORE_ITEM_VIEW'), () =>
        this.storeItems.list(plainToInstance(ListStoreItemsQueryDto, here)),
      ),
      can('GRN_VIEW')
        ? this.grns
            .list(
              plainToInstance(ListGrnEntriesQueryDto, {
                hospitalId,
                limit: 1,
                page: 1,
                sortOrder: 'asc',
              }),
            )
            .then((page) => (page.items[0] ? toGrn(page.items[0]) : null))
        : undefined,
      can('TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW')
        ? this.transfers
            .list(plainToInstance(ListTransfersQueryDto, { ...first, status: 'ACKNOWLEDGED' }))
            .then((page) => page.items[0] ?? null)
        : undefined,
    ]);

    return {
      counts: {
        employees,
        hospitals,
        items,
        kitchenItems,
        kitchens,
        menus,
        restaurants,
        storeItems,
        stores,
      },
      firstGrn,
      firstTransfer,
    };
  }

  /**
   * A day's service (India time; today when no date is given): sales by hour and by channel
   * beside the same weekday last week, each counter's open shift and takings, and the kitchen's
   * queue. Sales need ORDER_REPORT_VIEW or POS_ORDER_VIEW and the queue ORDER_VIEW.
   */
  serviceDay(query: DashboardServiceQueryDto, permissions: readonly string[]) {
    return this.serviceCache.get(
      shareKey(permissions, {
        compare: query.compare,
        date: query.date,
        hospitalId: query.hospitalId,
      }),
      () => this.loadServiceDay(query, permissions),
    );
  }

  private async loadServiceDay(query: DashboardServiceQueryDto, permissions: readonly string[]) {
    const can = (permission: string) => permissions.includes(permission);
    const day = query.date ?? istDay(new Date());
    const [sales, kitchen] = await Promise.all([
      // Like the old per-counter takings row: either report or POS bill viewers.
      can('ORDER_REPORT_VIEW') || can('POS_ORDER_VIEW')
        ? this.loadSales(day, compareDay(day, query.compare ?? 'week'), query.hospitalId)
        : undefined,
      can('ORDER_VIEW') ? this.loadKitchenQueue(day, query.hospitalId) : undefined,
    ]);

    return { date: day, kitchen, sales };
  }

  private async loadSales(day: string, comparedDay: string, hospitalId: string | undefined) {
    const here = hospitalId ? { hospitalId } : {};
    const rows = await this.prisma.restaurantOrder.findMany({
      select: {
        businessDate: true,
        channel: true,
        counterId: true,
        grandTotal: true,
        id: true,
        placedAt: true,
        qrOrder: { select: { source: true } },
        shiftId: true,
      },
      take: SERVICE_BILLS_CAP,
      where: {
        ...here,
        businessDate: { in: [toDateOnly(day), toDateOnly(comparedDay)] },
        cancelledAt: null,
        isComplimentary: false,
        source: OrderSource.COUNTER,
        status: { not: OrderStatus.CANCELLED },
      },
    });
    const dayOf = (row: (typeof rows)[number]) => row.businessDate?.toISOString().slice(0, 10);
    const todayRows = rows.filter((row) => dayOf(row) === day);
    const kioskBilled = new Set(
      todayRows.length
        ? (
            await this.prisma.kioskOrder.findMany({
              select: { billedOrderId: true },
              where: { billedOrderId: { in: todayRows.map((row) => row.id) } },
            })
          ).map((order) => order.billedOrderId)
        : [],
    );
    const toBill = (row: (typeof rows)[number]): DayBill => ({
      at: row.placedAt,
      channel: row.channel,
      counterId: row.counterId,
      grandTotal: row.grandTotal === null ? 0 : toNumber(row.grandTotal),
      kiosk: kioskBilled.has(row.id) || row.qrOrder?.source === 'KIOSK',
      qr: row.qrOrder?.source === 'QR',
      shiftId: row.shiftId,
    });
    const today = todayRows.map(toBill);
    const compared = rows.filter((row) => dayOf(row) === comparedDay).map(toBill);
    const shifts = await this.prisma.counterShift.findMany({
      orderBy: { openedAt: 'asc' },
      select: {
        counter: {
          select: { counterName: true, restaurant: { select: { restaurantName: true } } },
        },
        counterId: true,
        id: true,
        openedAt: true,
        openedBy: true,
      },
      where: { ...here, status: CounterShiftStatus.OPEN },
    });
    const cashiers = await userNames(
      this.prisma,
      shifts.map((shift) => shift.openedBy),
    );
    const openCounters = new Set(shifts.map((shift) => shift.counterId));
    const closedIds = [
      ...new Set(
        today
          .map((bill) => bill.counterId)
          .filter((id): id is string => Boolean(id) && !openCounters.has(id as string)),
      ),
    ];
    const closed = closedIds.length
      ? await this.prisma.counter.findMany({
          select: { counterName: true, id: true, restaurant: { select: { restaurantName: true } } },
          where: { id: { in: closedIds } },
        })
      : [];

    return {
      byHour: salesByHour(today, compared),
      channels: channelMix(today),
      counters: counterRows(
        today,
        shifts.map((shift) => ({
          cashier: cashiers.get(shift.openedBy) ?? null,
          counterId: shift.counterId,
          counterName: shift.counter.counterName,
          id: shift.id,
          openedAt: shift.openedAt,
          restaurantName: shift.counter.restaurant.restaurantName,
        })),
        new Map(
          closed.map((counter) => [
            counter.id,
            { counterName: counter.counterName, restaurantName: counter.restaurant.restaurantName },
          ]),
        ),
      ),
      compare: totalsOf(compared),
      compareDate: comparedDay,
      today: totalsOf(today),
      truncated: rows.length >= SERVICE_BILLS_CAP,
    };
  }

  /** The day's orders in each kitchen lane, with the two latest in each. */
  private async loadKitchenQueue(day: string, hospitalId: string | undefined) {
    const where = {
      ...(hospitalId ? { hospitalId } : {}),
      // The day itself, India time: from its midnight to the next.
      placedAt: {
        gte: new Date(toDateOnly(day).getTime() - IST_OFFSET_MS),
        lt: new Date(toDateOnly(day).getTime() - IST_OFFSET_MS + 86_400_000),
      },
    };
    const [counts, latest] = await Promise.all([
      this.prisma.restaurantOrder.groupBy({
        _count: { _all: true },
        by: ['status'],
        where: { ...where, status: { in: [...KITCHEN_LANES] } },
      }),
      Promise.all(
        KITCHEN_LANES.map((status) =>
          this.prisma.restaurantOrder.findMany({
            orderBy: { placedAt: 'desc' },
            select: {
              bedNumber: true,
              billNumber: true,
              counter: { select: { counterName: true } },
              deliveredAt: true,
              id: true,
              items: true,
              orderNumber: true,
              placedAt: true,
              readyAt: true,
              roomNumber: true,
              tableName: true,
            },
            take: 2,
            where: { ...where, status },
          }),
        ),
      ),
    ]);

    return {
      lanes: KITCHEN_LANES.map((status, index) => ({
        count: counts.find((row) => row.status === status)?._count._all ?? 0,
        orders: (latest[index] ?? []).map((order) => ({
          at: (order.deliveredAt ?? order.readyAt ?? order.placedAt).toISOString(),
          id: order.id,
          items: itemSummary(order.items),
          number: order.billNumber ?? order.orderNumber,
          where: whereServed(order),
        })),
        status,
      })),
    };
  }
}
