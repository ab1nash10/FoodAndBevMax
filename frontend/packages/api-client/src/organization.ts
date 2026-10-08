import type { ListQuery } from './http';

export type OnlinePaymentOption = 'NONE' | 'PAYU' | 'RAZORPAY';

export interface Hospital {
  address: string | null;
  area: string | null;
  billPrefix: string | null;
  city: string | null;
  createdAt: string;
  deletedAt: string | null;
  displayName: string;
  gstApplicable: boolean;
  hospitalCode: string;
  hospitalName: string;
  id: string;
  invoicePrefix: string | null;
  ipAddress: string | null;
  isActive: boolean;
  latitude: string | null;
  locationCode: string;
  longitude: string | null;
  onlinePaymentOption: OnlinePaymentOption;
  postalCode: string | null;
  state: string | null;
  title: string;
  updatedAt: string;
  visitingCardAddress: string | null;
}

export interface HospitalInput {
  address?: string;
  area?: string;
  billPrefix?: string;
  city?: string;
  displayName?: string;
  gstApplicable?: boolean;
  hospitalCode?: string;
  hospitalName?: string;
  invoicePrefix?: string;
  ipAddress?: string;
  isActive?: boolean;
  latitude?: string;
  locationCode?: string;
  longitude?: string;
  onlinePaymentOption?: OnlinePaymentOption;
  postalCode?: string;
  state?: string;
  title?: string;
  visitingCardAddress?: string;
}

export type HospitalSummary = Pick<Hospital, 'hospitalCode' | 'hospitalName' | 'id' | 'isActive'> &
  Partial<
    Pick<Hospital, 'city' | 'displayName' | 'locationCode' | 'postalCode' | 'state' | 'title'>
  >;

/** A master kept by one location, or shared by every location when hospitalId is null. */
export interface LocationOwned {
  hospital: HospitalSummary | null;
  hospitalId: string | null;
}

export interface HospitalListQuery extends ListQuery {
  city?: string;
  onlinePaymentOption?: OnlinePaymentOption;
  state?: string;
}

export interface Location {
  address: string | null;
  area: string | null;
  building: string | null;
  createdAt: string;
  deletedAt: string | null;
  floor: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  locationName: string;
  updatedAt: string;
}

export interface LocationInput {
  address?: string;
  area?: string;
  building?: string;
  floor?: string;
  hospitalId: string;
  isActive?: boolean;
  locationName: string;
}

export interface LocationListQuery extends ListQuery {
  area?: string;
  building?: string;
  floor?: string;
  hospitalId?: string;
}

export interface Store {
  address: string | null;
  createdAt: string;
  deletedAt: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  location: Pick<Location, 'id' | 'isActive' | 'locationName'> | null;
  locationId: string | null;
  storeCode: string;
  storeName: string;
  storeType: string | null;
  updatedAt: string;
}

export interface StoreInput {
  address?: string;
  hospitalId: string;
  isActive?: boolean;
  locationId?: string;
  storeCode?: string;
  storeName: string;
  storeType?: string;
}

export interface StoreListQuery extends ListQuery {
  hospitalId?: string;
  locationId?: string;
  storeType?: string;
}

export interface Kitchen {
  closingTime: string | null;
  createdAt: string;
  deletedAt: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  kitchenCode: string;
  kitchenName: string;
  location: Pick<Location, 'id' | 'isActive' | 'locationName'> | null;
  locationId: string | null;
  openingTime: string | null;
  updatedAt: string;
}

export interface KitchenInput {
  closingTime?: string;
  hospitalId: string;
  isActive?: boolean;
  kitchenCode?: string;
  kitchenName: string;
  locationId?: string;
  openingTime?: string;
}

export interface KitchenListQuery extends ListQuery {
  hospitalId?: string;
  locationId?: string;
}

export interface Restaurant {
  address: string | null;
  accountNumber: string | null;
  atTableDining: boolean;
  b2cQrEnabled: boolean;
  bankBranch: string | null;
  bankName: string | null;
  bankNameBranch: string | null;
  closingTime: string | null;
  coverImageUrl: string | null;
  createdAt: string;
  deletedAt: string | null;
  delivery: boolean;
  email: string | null;
  fssaiNumber: string | null;
  fssaiNumbers: string | null;
  gstNumber: string | null;
  gstAddress: string | null;
  homeDelivery: boolean;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  ifscCode: string | null;
  inCarDining: boolean;
  inRoomDining: boolean;
  inRoomDiningEnabled: boolean;
  inventory: boolean;
  isActive: boolean;
  isAtTableDiningEnabled: boolean;
  isDeliveryEnabled: boolean;
  isHomeDeliveryEnabled: boolean;
  isInCarDiningEnabled: boolean;
  isInRoomDiningEnabled: boolean;
  isInventoryEnabled: boolean;
  isOffline: boolean;
  isOnlineOrdersEnabled: boolean;
  isOpen24x7: boolean;
  isPosOrdersEnabled: boolean;
  isRegisteredInGst: boolean;
  isTakeawayEnabled: boolean;
  isVegOnly: boolean;
  kitchen: Pick<Kitchen, 'id' | 'isActive' | 'kitchenCode' | 'kitchenName'> | null;
  kitchenId: string | null;
  kitchenIds: string[];
  kitchens: Pick<Kitchen, 'id' | 'isActive' | 'kitchenCode' | 'kitchenName'>[];
  legalName: string | null;
  location: Pick<Location, 'id' | 'isActive' | 'locationName'> | null;
  locationId: string | null;
  mobile: string | null;
  normalDiscountApplicable: boolean;
  offline: boolean;
  onlineOrders: boolean;
  onlineOrderingEnabled: boolean;
  openingTime: string | null;
  open24x7: boolean;
  panNumber: string | null;
  posOrders: boolean;
  qrUnitName: string | null;
  unitNameForQr: string | null;
  restaurantCode: string;
  restaurantName: string;
  staffDiscountApplicable: boolean;
  store: Pick<Store, 'id' | 'isActive' | 'storeCode' | 'storeName'> | null;
  storeId: string | null;
  sodexoMid: string | null;
  sodexoTid: string | null;
  sunBu: string | null;
  sunT1: string | null;
  sunT2: string | null;
  takeaway: boolean;
  thumbnailUrl: string | null;
  updatedAt: string;
  upiId: string | null;
  vegOnly: boolean;
}

export interface RestaurantInput {
  accountNumber?: string;
  address?: string;
  atTableDining?: boolean;
  b2cQrEnabled?: boolean;
  bankBranch?: string;
  bankName?: string;
  bankNameBranch?: string;
  closingTime?: string;
  coverImageUrl?: string;
  delivery?: boolean;
  email?: string;
  fssaiNumber?: string;
  fssaiNumbers?: string;
  gstNumber?: string;
  gstAddress?: string;
  homeDelivery?: boolean;
  hospitalId: string;
  ifscCode?: string;
  inCarDining?: boolean;
  inRoomDining?: boolean;
  inRoomDiningEnabled?: boolean;
  inventory?: boolean;
  isActive?: boolean;
  isAtTableDiningEnabled?: boolean;
  isDeliveryEnabled?: boolean;
  isHomeDeliveryEnabled?: boolean;
  isInCarDiningEnabled?: boolean;
  isInRoomDiningEnabled?: boolean;
  isInventoryEnabled?: boolean;
  isOffline?: boolean;
  isOnlineOrdersEnabled?: boolean;
  isOpen24x7?: boolean;
  isPosOrdersEnabled?: boolean;
  isRegisteredInGst?: boolean;
  isTakeawayEnabled?: boolean;
  isVegOnly?: boolean;
  kitchenId?: string;
  kitchenIds?: string[];
  legalName?: string;
  locationId?: string;
  mobile?: string;
  normalDiscountApplicable?: boolean;
  offline?: boolean;
  onlineOrders?: boolean;
  onlineOrderingEnabled?: boolean;
  openingTime?: string;
  open24x7?: boolean;
  panNumber?: string;
  posOrders?: boolean;
  qrUnitName?: string;
  unitNameForQr?: string;
  restaurantCode?: string;
  restaurantName: string;
  staffDiscountApplicable?: boolean;
  storeId?: string;
  sodexoMid?: string;
  sodexoTid?: string;
  sunBu?: string;
  sunT1?: string;
  sunT2?: string;
  takeaway?: boolean;
  thumbnailUrl?: string;
  upiId?: string;
  vegOnly?: boolean;
}

export interface RestaurantListQuery extends ListQuery {
  hospitalId?: string;
  kitchenId?: string;
  locationId?: string;
  storeId?: string;
}

export interface Counter {
  counterCode: string;
  counterName: string;
  createdAt: string;
  deletedAt: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  paymentDeviceId: string | null;
  pineLabsDeviceId: string | null;
  posDeviceId: string | null;
  restaurant: Pick<Restaurant, 'id' | 'isActive' | 'restaurantCode' | 'restaurantName'>;
  restaurantId: string;
  updatedAt: string;
}

export interface CounterInput {
  counterCode: string;
  counterName: string;
  hospitalId: string;
  isActive?: boolean;
  paymentDeviceId?: string;
  pineLabsDeviceId?: string;
  posDeviceId?: string;
  restaurantId: string;
}

export interface CounterListQuery extends ListQuery {
  hospitalId?: string;
  restaurantId?: string;
}

export interface Employee extends LocationOwned {
  createdAt: string;
  deletedAt: string | null;
  department: string | null;
  designation: string | null;
  eligibleForDiscount: boolean;
  employeeCode: string;
  employeeName: string;
  id: string;
  isActive: boolean;
  mobile: string | null;
  updatedAt: string;
}

export interface EmployeeInput {
  department?: string;
  designation?: string;
  eligibleForDiscount?: boolean;
  employeeCode: string;
  employeeName: string;
  /** The location it belongs to; null shares it with every location. */
  hospitalId?: string | null;
  isActive?: boolean;
  mobile?: string;
}

export interface EmployeeListQuery extends ListQuery {
  eligibleForDiscount?: boolean;
  /** Shared records plus this location's. */
  hospitalId?: string;
}

export interface EmployeeValidation {
  department: string | null;
  designation: string | null;
  eligibleForDiscount: boolean;
  employeeCode: string;
  employeeId: string;
  employeeName: string;
  isActive: boolean;
  mobile: string | null;
}
