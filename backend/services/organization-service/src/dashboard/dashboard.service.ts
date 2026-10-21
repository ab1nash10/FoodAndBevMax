import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ListEmployeesQueryDto } from '../employees/dto/list-employees-query.dto';
import { EmployeesService } from '../employees/employees.service';
import { ListGrnsQueryDto } from '../grns/dto/list-grns-query.dto';
import { GrnsService } from '../grns/grns.service';
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
import { DashboardRecordsQueryDto, DashboardSetupQueryDto } from './dto/dashboard-query.dto';

/** ponytail: one read of up to 5,000 records per source; aggregate in SQL if a period outgrows it. */
export const DASHBOARD_RECORDS_CAP = 5000;

type TransferRow = Awaited<ReturnType<TransfersService['list']>>['items'][number];
type ProductionRow = Awaited<ReturnType<KitchenProductionsService['list']>>['items'][number];
type GrnRow = Awaited<ReturnType<GrnsService['list']>>['items'][number];

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

const toGrn = (grn: GrnRow) => ({
  lines: grn.lines.map((line) => ({
    acceptedQty: line.acceptedQty,
    rejectedQty: line.rejectedQty,
  })),
  receivedDate: grn.receivedDate,
  status: grn.status,
  vendorName: grn.vendorName,
});

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
  constructor(
    private readonly employees: EmployeesService,
    private readonly grns: GrnsService,
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
  ) {}

  /** Transfers, posted productions and posted GRNs from `fromDate`, newest first. */
  async records(query: DashboardRecordsQueryDto, permissions: readonly string[]) {
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
            plainToInstance(ListGrnsQueryDto, {
              ...period,
              sortBy: 'receivedDate',
              status: 'POSTED_TO_STOCK',
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

  /** The setup checklist's totals and its first posted GRN and acknowledged transfer. */
  async setup(query: DashboardSetupQueryDto, permissions: readonly string[]) {
    const can = (...any: string[]) => any.some((permission) => permissions.includes(permission));
    const { hospitalId } = query;
    // limit 0: each total is one count, without loading a row and its related records.
    const one = { limit: 0, page: 1 };
    const here = { ...one, hospitalId };
    const total = async (
      allowed: boolean,
      list: () => Promise<{ meta: { total: number } }>,
    ): Promise<number | undefined> => (allowed ? (await list()).meta.total : undefined);
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
            .list(plainToInstance(ListGrnsQueryDto, { ...first, status: 'POSTED_TO_STOCK' }))
            .then((page) => page.items[0] ?? null)
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
}
