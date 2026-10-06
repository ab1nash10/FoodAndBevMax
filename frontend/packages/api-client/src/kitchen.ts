import type { ItemSummary } from './catalog';
import type { ListQuery } from './http';
import type { HospitalSummary, Kitchen } from './organization';
import type { UserSummary } from './users';

export type KitchenProductionStatus = 'CANCELLED' | 'DRAFT' | 'POSTED';

export interface KitchenProductionLine {
  acceptedQty: number;
  createdAt: string;
  deletedAt: string | null;
  id: string;
  item: ItemSummary;
  itemId: string;
  producedQty: number;
  productionId: string;
  remarks: string | null;
  updatedAt: string;
  wastageQty: number;
}

export interface KitchenProduction {
  businessDate: string;
  chef: UserSummary | null;
  chefUserId: string | null;
  createdAt: string;
  deletedAt: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  kitchen: Pick<Kitchen, 'hospitalId' | 'id' | 'isActive' | 'kitchenCode' | 'kitchenName'>;
  kitchenId: string;
  lines: KitchenProductionLine[];
  productionDate: string;
  productionNumber: string;
  remarks: string | null;
  status: KitchenProductionStatus;
  updatedAt: string;
}

export interface KitchenProductionLineInput {
  acceptedQty?: number;
  itemId: string;
  producedQty: number;
  remarks?: string;
  wastageQty?: number;
}

export interface KitchenProductionInput {
  businessDate: string;
  chefUserId?: string;
  hospitalId: string;
  items: KitchenProductionLineInput[];
  kitchenId: string;
  productionDate: string;
  remarks?: string;
}

export interface KitchenProductionListQuery extends ListQuery {
  chefUserId?: string;
  fromDate?: string;
  hospitalId?: string;
  kitchenId?: string;
  status?: KitchenProductionStatus;
  toDate?: string;
}
