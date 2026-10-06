import type { ListQuery } from './http';
import type { HospitalSummary, Kitchen, Restaurant, Store } from './organization';

export type FoodType = 'VEG' | 'NON_VEG' | 'EGGETARIAN';

export type ItemType = 'MRP' | 'READYMADE' | 'LIVE';

export type RateType = 'COUNTER' | 'NORMAL' | 'ROOM' | 'STAFF';

export interface ItemCategory {
  categoryName: string;
  createdAt: string;
  deletedAt: string | null;
  id: string;
  isActive: boolean;
  updatedAt: string;
}

export interface ItemCategoryInput {
  categoryName: string;
  isActive?: boolean;
}

export type ItemCategoryListQuery = ListQuery;

export interface Item {
  category: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'>;
  categoryId: string;
  createdAt: string;
  deletedAt: string | null;
  hsnCode: string | null;
  id: string;
  isActive: boolean;
  itemCode: string;
  itemName: string;
  itemType: ItemType;
  preparationTimeMinutes: number | null;
  type: FoodType;
  updatedAt: string;
}

export interface ItemInput {
  categoryId: string;
  hsnCode?: string;
  isActive?: boolean;
  itemName: string;
  itemType: ItemType;
  preparationTimeMinutes?: number;
  type: FoodType;
}

export interface ItemListQuery extends ListQuery {
  categoryId?: string;
  itemType?: ItemType;
  type?: FoodType;
}

export interface ItemPrice {
  createdAt: string;
  deletedAt: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  gstPercent: number | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isTaxInclusive: boolean;
  item: Pick<Item, 'id' | 'isActive' | 'itemCode' | 'itemName' | 'itemType' | 'type'> & {
    category: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'>;
  };
  itemId: string;
  price: number;
  rateType: RateType;
  restaurant: Pick<Restaurant, 'id' | 'isActive' | 'restaurantCode' | 'restaurantName'> | null;
  restaurantId: string | null;
  updatedAt: string;
}

export interface ItemPriceInput {
  effectiveFrom: string;
  effectiveTo?: string | null;
  gstPercent?: number;
  hospitalId: string;
  isActive?: boolean;
  isTaxInclusive?: boolean;
  itemId: string;
  price: number;
  rateType: RateType;
  restaurantId?: string | null;
}

export interface ItemPriceListQuery extends ListQuery {
  effectiveDate?: string;
  hospitalId?: string;
  itemId?: string;
  itemType?: ItemType;
  rateType?: RateType;
  restaurantId?: string;
}

export interface ResolveItemPriceQuery {
  date?: string;
  hospitalId: string;
  itemId: string;
  rateType: RateType;
  restaurantId?: string;
}

export interface ResolvedItemPrice {
  itemPrice: ItemPrice | null;
  price: number | null;
  source: 'LOCATION' | 'MISSING' | 'RESTAURANT';
  status: 'FOUND' | 'PRICE_MISSING';
}

export interface TimeSlot {
  createdAt: string;
  deletedAt: string | null;
  endTime: string | null;
  id: string;
  isActive: boolean;
  isAlwaysAvailable: boolean;
  slotName: string;
  startTime: string | null;
  updatedAt: string;
}

export interface TimeSlotInput {
  endTime?: string;
  isActive?: boolean;
  isAlwaysAvailable?: boolean;
  slotName: string;
  startTime?: string;
}

export interface TimeSlotListQuery extends ListQuery {
  isAlwaysAvailable?: boolean;
}

export type ItemSummary = Pick<
  Item,
  'id' | 'isActive' | 'itemCode' | 'itemName' | 'itemType' | 'type'
> & {
  category?: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'>;
};

export interface StoreItem {
  createdAt: string;
  deletedAt: string | null;
  id: string;
  isActive: boolean;
  item: ItemSummary;
  itemId: string;
  store: Pick<Store, 'id' | 'isActive' | 'storeCode' | 'storeName'> & {
    hospital: HospitalSummary;
  };
  storeId: string;
  updatedAt: string;
}

export interface StoreItemInput {
  isActive?: boolean;
  itemId: string;
  storeId: string;
}

export interface StoreItemListQuery extends ListQuery {
  hospitalId?: string;
  itemId?: string;
  storeId?: string;
}

export interface KitchenItem {
  createdAt: string;
  deletedAt: string | null;
  id: string;
  isActive: boolean;
  item: ItemSummary;
  itemId: string;
  kitchen: Pick<Kitchen, 'id' | 'isActive' | 'kitchenCode' | 'kitchenName'> & {
    hospital: HospitalSummary;
  };
  kitchenId: string;
  updatedAt: string;
}

export interface KitchenItemInput {
  isActive?: boolean;
  itemId: string;
  kitchenId: string;
}

export interface KitchenItemListQuery extends ListQuery {
  hospitalId?: string;
  itemId?: string;
  kitchenId?: string;
}

export type RestaurantMenuDayOfWeek =
  'FRIDAY' | 'MONDAY' | 'SATURDAY' | 'SUNDAY' | 'THURSDAY' | 'TUESDAY' | 'WEDNESDAY';

export type RestaurantMenuPositionType = 'AFTER_ITEM' | 'BEFORE_ITEM' | 'FIRST' | 'LAST';

export interface RestaurantMenu {
  createdAt: string;
  daysOfWeek: RestaurantMenuDayOfWeek[];
  deletedAt: string | null;
  displayOrder: number;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isAvailable: boolean;
  item: ItemSummary;
  itemId: string;
  restaurant: Pick<Restaurant, 'id' | 'isActive' | 'restaurantCode' | 'restaurantName'> & {
    hospital: HospitalSummary;
  };
  restaurantId: string;
  timeSlotIds: string[];
  timeSlots: Array<
    Pick<TimeSlot, 'endTime' | 'id' | 'isActive' | 'isAlwaysAvailable' | 'slotName' | 'startTime'>
  >;
  updatedAt: string;
}

export interface RestaurantMenuInput {
  daysOfWeek?: RestaurantMenuDayOfWeek[];
  isActive?: boolean;
  isAvailable?: boolean;
  itemId: string;
  positionType?: RestaurantMenuPositionType;
  referenceMenuId?: string;
  restaurantId: string;
  timeSlotIds?: string[];
}

export interface RestaurantMenuListQuery extends ListQuery {
  dayOfWeek?: RestaurantMenuDayOfWeek;
  hospitalId?: string;
  isAvailable?: boolean;
  itemId?: string;
  itemType?: ItemType;
  restaurantId?: string;
  timeSlotId?: string;
}
