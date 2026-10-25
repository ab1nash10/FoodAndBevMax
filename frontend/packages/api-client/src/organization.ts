import type { ListQuery } from './http';

export type OnlinePaymentOption = 'NONE' | 'PAYU' | 'RAZORPAY';
/** On the hospital's payroll, or supplied by an outsourcing agency. */
export type EmploymentType = 'ON_ROLL' | 'OUTSOURCED';

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
  /** The legal entity the location bills under. */
  legalEntityId: string | null;
  locationCode: string;
  longitude: string | null;
  onlinePaymentOption: OnlinePaymentOption;
  postalCode: string | null;
  state: string | null;
  title: string;
  updatedAt: string;
  visitingCardAddress: string | null;
}

/** A legal entity a location or restaurant bills under. */
export interface LegalEntity {
  createdAt: string;
  entityAddress: string;
  entityName: string;
  gstNumber: string;
  id: string;
  isActive: boolean;
  /** The site it bills for, e.g. "MSSH SKT"; one company can have several. */
  locationName: string | null;
  updatedAt: string;
}

export interface LegalEntityInput {
  entityAddress: string;
  entityName: string;
  locationName: string;
  /** The 15-character GSTIN; stored without spaces, in capitals. */
  gstNumber: string;
  isActive?: boolean;
}

export type LegalEntityListQuery = ListQuery;

/**
 * Title (or hospitalName), location code (or hospitalCode), city and state are required on
 * create; the display name defaults to the title. null clears an optional field.
 */
export interface HospitalInput {
  address?: string | null;
  area?: string | null;
  billPrefix?: string | null;
  city?: string;
  displayName?: string;
  gstApplicable?: boolean;
  hospitalCode?: string;
  hospitalName?: string;
  invoicePrefix?: string | null;
  ipAddress?: string | null;
  isActive?: boolean;
  latitude?: string | null;
  /** null removes the link. */
  legalEntityId?: string | null;
  locationCode?: string;
  longitude?: string | null;
  onlinePaymentOption?: OnlinePaymentOption;
  postalCode?: string | null;
  state?: string;
  title?: string;
  visitingCardAddress?: string | null;
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

export type ShiftMode = 'CASHIER' | 'FIXED';

/** A fixed shift, e.g. Morning 07:00–15:00; one ending before it starts runs past midnight. */
export interface ShiftTiming {
  endTime: string;
  name: string;
  startTime: string;
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
  ihcOnly: boolean;
  isIhcOnly: boolean;
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
  /** The legal entity the restaurant bills under. */
  legalEntityId: string | null;
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
  /** CASHIER: each cashier opens and closes their own shift; FIXED: shifts follow shiftTimings. */
  shiftMode: ShiftMode;
  shiftTimings: ShiftTiming[];
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

/** On an edit, null clears an optional text field; leaving it out keeps the saved value. */
export interface RestaurantInput {
  accountNumber?: string | null;
  address?: string | null;
  atTableDining?: boolean;
  b2cQrEnabled?: boolean;
  bankBranch?: string;
  bankName?: string;
  bankNameBranch?: string | null;
  closingTime?: string;
  coverImageUrl?: string;
  delivery?: boolean;
  email?: string | null;
  fssaiNumber?: string;
  fssaiNumbers?: string | null;
  gstNumber?: string | null;
  gstAddress?: string | null;
  homeDelivery?: boolean;
  hospitalId: string;
  ifscCode?: string | null;
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
  isIhcOnly?: boolean;
  isOffline?: boolean;
  isOnlineOrdersEnabled?: boolean;
  isOpen24x7?: boolean;
  isPosOrdersEnabled?: boolean;
  isRegisteredInGst?: boolean;
  isTakeawayEnabled?: boolean;
  isVegOnly?: boolean;
  kitchenId?: string;
  kitchenIds?: string[];
  /** null removes the link. */
  legalEntityId?: string | null;
  legalName?: string | null;
  locationId?: string;
  mobile?: string | null;
  normalDiscountApplicable?: boolean;
  offline?: boolean;
  onlineOrders?: boolean;
  onlineOrderingEnabled?: boolean;
  openingTime?: string;
  open24x7?: boolean;
  panNumber?: string | null;
  posOrders?: boolean;
  qrUnitName?: string;
  unitNameForQr?: string | null;
  restaurantCode?: string;
  restaurantName: string;
  staffDiscountApplicable?: boolean;
  shiftMode?: ShiftMode;
  shiftTimings?: ShiftTiming[];
  storeId?: string;
  sodexoMid?: string | null;
  sodexoTid?: string | null;
  sunBu?: string | null;
  sunT1?: string | null;
  sunT2?: string | null;
  takeaway?: boolean;
  thumbnailUrl?: string;
  upiId?: string | null;
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
  /** Null for employees recorded before the type was asked for. */
  employmentType: EmploymentType | null;
  id: string;
  isActive: boolean;
  mobile: string | null;
  updatedAt: string;
}

/** On an update, null clears an optional text field. */
export interface EmployeeInput {
  department?: string | null;
  designation?: string | null;
  eligibleForDiscount?: boolean;
  employeeCode: string;
  employeeName: string;
  /** Required on create; older employees may still have none. */
  employmentType?: EmploymentType;
  /** The location it belongs to; null shares it with every location. */
  hospitalId?: string | null;
  isActive?: boolean;
  mobile?: string | null;
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
