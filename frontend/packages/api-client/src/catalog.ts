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
  /** Null on an update clears it. */
  hsnCode?: string | null;
  isActive?: boolean;
  itemName: string;
  /** Null on an update clears it. */
  preparationTimeMinutes?: number | null;
  type: FoodType;
}

export interface ItemListQuery extends ListQuery {
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
>;

export interface StoreItem {
  /** This mapping's own category; the item's other mappings keep theirs. */
  category: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'> | null;
  categoryId: string | null;
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
  /** This mapping's category: required when creating; on an edit it changes only this one. */
  categoryId: string;
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
  /** This mapping's own category; the item's other mappings keep theirs. */
  category: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'> | null;
  categoryId: string | null;
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
  /** This mapping's category: required when creating; on an edit it changes only this one. */
  categoryId: string;
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
  /** This menu item's own category; the item's other menus and mappings keep theirs. */
  category: Pick<ItemCategory, 'categoryName' | 'id' | 'isActive'> | null;
  categoryId: string | null;
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
  /** Where it comes from, with kitchen: the store that stocks it (a packaged item). */
  store: Pick<Store, 'id' | 'isActive' | 'storeCode' | 'storeName'> | null;
  storeId: string | null;
  updatedAt: string;
}

export interface RestaurantMenuInput {
  /** This menu item's category: required when creating; on an edit it changes only this one. */
  categoryId: string;
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
  /** The store it comes from (packaged); set this or kitchenId. */
  storeId?: string | null;
}

export interface RestaurantMenuListQuery extends ListQuery {
  dayOfWeek?: RestaurantMenuDayOfWeek;
  hospitalId?: string;
  isAvailable?: boolean;
  itemId?: string;
  itemType?: ItemType;
  restaurantId?: string;
}
