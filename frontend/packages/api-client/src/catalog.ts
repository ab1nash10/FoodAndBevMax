import type { ListQuery } from './http';
import type { HospitalSummary, Kitchen, LocationOwned, Restaurant, Store } from './organization';

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
  /** Set on the Item Mapping screens; null until the item is first mapped. */
  category: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'> | null;
  categoryId: string | null;
  createdAt: string;
  deletedAt: string | null;
  hsnCode: string | null;
  id: string;
  isActive: boolean;
  itemCode: string;
  itemName: string;
  /** MRP once mapped to a store, READYMADE once mapped to a kitchen; null until then. */
  itemType: ItemType | null;
  preparationTimeMinutes: number | null;
  type: FoodType;
  updatedAt: string;
}

export interface ItemInput {
  hsnCode?: string;
  isActive?: boolean;
  itemName: string;
  preparationTimeMinutes?: number;
  type: FoodType;
}

export interface ItemListQuery extends ListQuery {
  categoryId?: string;
  /** With itemType: also items not mapped yet, for the mapping screens. */
  includeUnmapped?: boolean;
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

export interface TimeSlot extends LocationOwned {
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
  /** The location it belongs to; null shares it with every location. */
  hospitalId?: string | null;
  isActive?: boolean;
  isAlwaysAvailable?: boolean;
  slotName: string;
  startTime?: string;
}

export interface TimeSlotListQuery extends ListQuery {
  /** Shared records plus this location's. */
  hospitalId?: string;
  isAlwaysAvailable?: boolean;
}

export type ItemSummary = Pick<
  Item,
  'id' | 'isActive' | 'itemCode' | 'itemName' | 'itemType' | 'type'
> & {
  category?: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'> | null;
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
  /** The item's category: required the first time the item is mapped, optional later. */
  categoryId?: string;
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
  /** The item's category: required the first time the item is mapped, optional later. */
  categoryId?: string;
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

/** Where a menu item is sold: everywhere, only in-room dining, or only at the counter. */
export type MenuServeAt = 'BOTH' | 'COUNTER' | 'ROOM';

export interface RestaurantMenu {
  /** Auto-generated when the item is added to the menu, e.g. RMI0001; never changes. */
  menuItemCode: string;
  accompaniments: string | null;
  addOn: string | null;
  /** On sale from / until, HH:mm; both null means all day. */
  availableFrom: string | null;
  availableTo: string | null;
  createdAt: string;
  daysOfWeek: RestaurantMenuDayOfWeek[];
  deletedAt: string | null;
  displayOrder: number;
  gstPercent: number;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isAvailable: boolean;
  isDiscountable: boolean;
  isGstInclusive: boolean;
  item: ItemSummary;
  itemId: string;
  kitchen: Pick<Kitchen, 'id' | 'isActive' | 'kitchenCode' | 'kitchenName'> | null;
  kitchenId: string | null;
  preparationTimeMinutes: number | null;
  price: number | null;
  restaurant: Pick<Restaurant, 'id' | 'isActive' | 'restaurantCode' | 'restaurantName'> & {
    hospital: HospitalSummary;
  };
  restaurantId: string;
  roomPrice: number | null;
  serveAt: MenuServeAt;
  serves: number | null;
  updatedAt: string;
}

export interface RestaurantMenuInput {
  accompaniments?: string | null;
  addOn?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  daysOfWeek?: RestaurantMenuDayOfWeek[];
  gstPercent?: number;
  isActive?: boolean;
  isAvailable?: boolean;
  isDiscountable?: boolean;
  isGstInclusive?: boolean;
  itemId: string;
  kitchenId?: string | null;
  positionType?: RestaurantMenuPositionType;
  preparationTimeMinutes?: number | null;
  price?: number | null;
  referenceMenuId?: string;
  restaurantId: string;
  roomPrice?: number | null;
  serveAt?: MenuServeAt;
  serves?: number | null;
}

export interface RestaurantMenuListQuery extends ListQuery {
  dayOfWeek?: RestaurantMenuDayOfWeek;
  hospitalId?: string;
  isAvailable?: boolean;
  itemId?: string;
  itemType?: ItemType;
  restaurantId?: string;
}
