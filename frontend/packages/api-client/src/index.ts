type QueryValue = boolean | number | string | null | undefined;

export type QueryParams = object;

export interface ApiResponse<TData = unknown> {
  data: TData;
  message?: string;
  success: boolean;
}

export interface ApiListMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface ApiList<TItem> {
  items: TItem[];
  meta: ApiListMeta;
}

export interface ApiErrorBody {
  errors?: unknown[];
  message?: string;
  requestId?: string;
  success?: false;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  onUnauthorized?: () => Promise<void> | void;
  refreshAccessToken?: () => Promise<string | null | undefined>;
  timeoutMs?: number;
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null;
  query?: QueryParams;
  skipAuthRefresh?: boolean;
  timeoutMs?: number;
}

export interface ApiClient {
  request<TResponse>(path: string, init?: ApiRequestInit): Promise<TResponse>;
}

export class ApiClientError extends Error {
  readonly category: string;
  readonly errors?: unknown[];
  readonly payload?: unknown;
  readonly requestId?: string;
  readonly status: number;

  constructor(
    status: number,
    message: string,
    payload?: unknown,
    errors?: unknown[],
    requestId?: string,
    category = 'UNKNOWN_ERROR',
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.category = category;
    this.errors = errors;
    this.payload = payload;
    this.requestId = requestId;
    this.status = status;
  }
}

export type SortOrder = 'asc' | 'desc';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SendOtpRequest {
  email?: string;
  mobile?: string;
}

export interface VerifyOtpRequest extends SendOtpRequest {
  otp: string;
}

export interface EmailPasswordLoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ListQuery {
  isActive?: boolean;
  limit?: number;
  page?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export type UserStatus = 'ACTIVE' | 'DISABLED';

export type LocationScope = 'ALL' | 'MULTI' | 'SINGLE';

export interface AccessRole {
  description: string | null;
  id: string;
  /** ALL = every location, MULTI = the assigned locations, SINGLE = exactly one. */
  locationScope: LocationScope;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface AccessUser {
  avatarUrl: string | null;
  createdAt: string;
  designation: string | null;
  email: string | null;
  employeeCode: string;
  hospitals: Array<{ id: string; name: string }>;
  id: string;
  locationScope: LocationScope | null;
  mobile: string;
  name: string;
  roles: AccessRole[];
  status: UserStatus;
  updatedAt: string;
}

export interface AccessUserInput {
  avatarUrl?: string;
  designation?: string;
  email?: string;
  employeeCode: string;
  /** Locations this user may operate in; count must match the role's locationScope. */
  hospitalIds?: string[];
  mobile: string;
  name: string;
  /** Required on create; omit on update to keep the existing password. */
  password?: string;
  roleId: string;
  status?: UserStatus;
}

export interface AppNotification {
  body: string | null;
  category: string;
  createdAt: string;
  entityId: string | null;
  entityName: string | null;
  id: string;
  isRead: boolean;
  link: string | null;
  readAt: string | null;
  title: string;
}

export interface NotificationList {
  items: AppNotification[];
  meta: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

export interface NotificationListQuery {
  limit?: number;
  page?: number;
  unreadOnly?: boolean;
}

export interface UnreadCount {
  unreadCount: number;
}

export interface AccessUserListQuery extends ListQuery {
  roleId?: string;
  status?: UserStatus;
}

export interface AccessPermission {
  action: string;
  code: string;
  description: string | null;
  id: string;
  module: string;
}

export interface UserPermissions {
  effectivePermissionIds: string[];
  permissions: AccessPermission[];
}

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

export type PrimaryUpiProvider =
  | 'BHARATPE'
  | 'GOOGLE_PAY'
  | 'OTHER'
  | 'PHONEPE'
  | 'UPI_BHARAT_QR'
  | 'UPI_PAYTM'
  | 'UPI_SALE';

export interface PosDeviceRestaurantSummary {
  id: string;
  isActive: boolean;
  restaurantCode: string;
  restaurantName: string;
}

export interface PosDevice {
  code: string;
  createdAt: string;
  deletedAt: string | null;
  entity: string | null;
  hostName: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isInvoicePrintEnabled: boolean;
  isKotPrintEnabled: boolean;
  name: string;
  restaurantIds: string[];
  restaurants: PosDeviceRestaurantSummary[];
  updatedAt: string;
}

export interface PosDeviceInput {
  code: string;
  entity?: string;
  hospitalId: string;
  hostName?: string;
  isActive?: boolean;
  isInvoicePrintEnabled?: boolean;
  isKotPrintEnabled?: boolean;
  name: string;
  restaurantIds?: string[];
}

export interface PosDeviceListQuery extends ListQuery {
  hospitalId?: string;
  hostName?: string;
  restaurantId?: string;
}

export interface PaymentMachine {
  createdAt: string;
  deletedAt: string | null;
  hasPinelabSecurityToken: boolean;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  pinelabImei: string | null;
  pinelabMerchantId: string | null;
  pinelabMerchantStorePosCode: string | null;
  pinelabSecurityToken: string | null;
  posDevice: Pick<PosDevice, 'code' | 'id' | 'isActive' | 'name'>;
  posDeviceId: string;
  primaryUpi: PrimaryUpiProvider | null;
  serialNumber: string | null;
  updatedAt: string;
}

export interface PaymentMachineInput {
  hospitalId: string;
  isActive?: boolean;
  isDefault?: boolean;
  name: string;
  pinelabImei?: string;
  pinelabMerchantId?: string;
  pinelabMerchantStorePosCode?: string;
  pinelabSecurityToken?: string;
  posDeviceId: string;
  primaryUpi?: PrimaryUpiProvider;
  serialNumber?: string;
}

export interface PaymentMachineListQuery extends ListQuery {
  hospitalId?: string;
  isDefault?: boolean;
  posDeviceId?: string;
  primaryUpi?: PrimaryUpiProvider;
}

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

export interface Employee {
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
  isActive?: boolean;
  mobile?: string;
}

export interface EmployeeListQuery extends ListQuery {
  eligibleForDiscount?: boolean;
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
  | 'FRIDAY'
  | 'MONDAY'
  | 'SATURDAY'
  | 'SUNDAY'
  | 'THURSDAY'
  | 'TUESDAY'
  | 'WEDNESDAY';

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

export type GrnStatus =
  | 'ACCEPTED'
  | 'CANCELLED'
  | 'DRAFT'
  | 'PARTIALLY_ACCEPTED'
  | 'POSTED_TO_STOCK'
  | 'REJECTED'
  | 'UNDER_VERIFICATION';

export type InventoryLocationType = 'COUNTER' | 'KITCHEN' | 'RESTAURANT' | 'STORE';
export type StockReferenceType =
  | 'GRN'
  | 'KITCHEN_PRODUCTION'
  | 'TRANSFER'
  | 'TRANSFER_ACKNOWLEDGEMENT';
export type StockTransactionType =
  | 'GRN_IN'
  | 'KITCHEN_PRODUCTION_IN'
  | 'KITCHEN_TRANSFER_OUT'
  | 'RESTAURANT_TRANSFER_IN'
  | 'RESTAURANT_RECEIVE_IN'
  | 'STORE_TO_RESTAURANT_OUT'
  | 'TRANSFER_REJECTED_RETURN_IN';
export type StockBalanceStatus =
  | 'AVAILABLE'
  | 'EXPIRED'
  | 'LOW_STOCK'
  | 'NEAR_EXPIRY'
  | 'OUT_OF_STOCK';
export type TransferStatus = 'ACKNOWLEDGED' | 'CANCELLED' | 'DRAFT' | 'PENDING_ACKNOWLEDGEMENT';
export type TransferAcknowledgementStatus = 'ACCEPTED_FULL' | 'ACCEPTED_PARTIAL' | 'REJECTED_FULL';
export type KitchenProductionStatus = 'CANCELLED' | 'DRAFT' | 'POSTED';

export interface GrnBatch {
  acceptedQty: number;
  batchNumber: string;
  createdAt: string;
  expiryDate: string;
  grnLineId: string;
  id: string;
  itemId: string;
  manufacturingDate: string | null;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason: string | null;
  updatedAt: string;
}

export interface GrnLine {
  acceptedQty: number;
  batches: GrnBatch[];
  createdAt: string;
  grnId: string;
  id: string;
  item: ItemSummary;
  itemId: string;
  orderedQty: number | null;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason: string | null;
  remarks: string | null;
  updatedAt: string;
}

export interface Grn {
  createdAt: string;
  deletedAt: string | null;
  grnNumber: string;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  invoiceNumber: string | null;
  lines: GrnLine[];
  poNumber: string | null;
  receivedBy: string;
  receivedDate: string;
  remarks: string | null;
  status: GrnStatus;
  store: Pick<Store, 'hospitalId' | 'id' | 'isActive' | 'storeCode' | 'storeName'>;
  storeId: string;
  updatedAt: string;
  vendorName: string | null;
}

export interface GrnBatchInput {
  acceptedQty: number;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate?: string;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
}

export interface GrnLineInput {
  acceptedQty: number;
  batches: GrnBatchInput[];
  itemId: string;
  orderedQty?: number;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
}

export interface GrnInput {
  hospitalId: string;
  invoiceNumber?: string;
  items: GrnLineInput[];
  poNumber?: string;
  receivedBy: string;
  receivedDate: string;
  remarks?: string;
  storeId: string;
  vendorName?: string;
}

export interface GrnListQuery extends ListQuery {
  fromDate?: string;
  hospitalId?: string;
  status?: GrnStatus;
  storeId?: string;
  toDate?: string;
}

export interface StockLocationSummary {
  code: string | null;
  id: string;
  name: string;
  type: InventoryLocationType;
}

export interface StockBalance {
  availableQty: number;
  batchNumber: string | null;
  businessDate: string | null;
  createdAt: string;
  deletedAt: string | null;
  expiryDate: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  item: ItemSummary;
  itemId: string;
  itemType: ItemType;
  lastUpdatedOn: string;
  location: StockLocationSummary;
  locationId: string;
  locationType: InventoryLocationType;
  reservedQty: number;
  status: StockBalanceStatus;
  updatedAt: string;
}

export interface StoreStockBatchSummary {
  availableQty: number;
  batchNumber: string | null;
  expiryDate: string | null;
  reservedQty: number;
  status: StockBalanceStatus;
  stockBalanceId: string;
}

export interface StoreStockSummary {
  batchCount: number;
  batches: StoreStockBatchSummary[];
  categoryName: string | null;
  hospitalId: string;
  itemCode: string;
  itemId: string;
  itemName: string;
  itemType: ItemType;
  lastUpdatedOn: string;
  nearestExpiryDate: string | null;
  status: StockBalanceStatus;
  storeCode: string | null;
  storeId: string;
  storeName: string;
  totalAvailableQty: number;
  totalReservedQty: number;
}

export interface UserSummary {
  email: string | null;
  employeeCode: string | null;
  id: string;
  mobile: string | null;
  name: string;
  status: string;
}

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

export interface StockLedger {
  balanceAfter: number;
  batchNumber: string | null;
  businessDate: string;
  createdAt: string;
  deletedAt: string | null;
  expiryDate: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  item: ItemSummary;
  itemId: string;
  itemType: ItemType;
  location: StockLocationSummary;
  locationId: string;
  locationType: InventoryLocationType;
  qtyIn: number;
  qtyOut: number;
  referenceId: string | null;
  referenceType: StockReferenceType | null;
  remarks: string | null;
  transactionDateTime: string;
  transactionType: StockTransactionType;
  updatedAt: string;
}

export interface StockBalanceListQuery extends ListQuery {
  batchNumber?: string;
  businessDate?: string;
  expiryDate?: string;
  hospitalId?: string;
  itemId?: string;
  itemType?: ItemType;
  locationId?: string;
  locationType?: InventoryLocationType;
  status?: StockBalanceStatus;
}

export interface StockLedgerListQuery extends ListQuery {
  batchNumber?: string;
  businessDate?: string;
  expiryDate?: string;
  fromDate?: string;
  hospitalId?: string;
  itemId?: string;
  itemType?: ItemType;
  locationId?: string;
  locationType?: InventoryLocationType;
  referenceType?: StockReferenceType;
  toDate?: string;
  transactionType?: StockTransactionType;
}

export interface TransferLine {
  acceptedQty: number;
  batchNumber: string | null;
  createdAt: string;
  expiryDate: string | null;
  id: string;
  item: ItemSummary;
  itemId: string;
  rejectedQty: number;
  rejectionReason: string | null;
  remarks: string | null;
  sentQty: number;
  transferId: string;
  updatedAt: string;
}

export interface Transfer {
  businessDate: string;
  createdAt: string;
  deletedAt: string | null;
  destinationId: string;
  destinationType: InventoryLocationType;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  lines: TransferLine[];
  remarks: string | null;
  sourceId: string;
  sourceType: InventoryLocationType;
  status: TransferStatus;
  transferDate: string;
  transferNumber: string;
  updatedAt: string;
}

export interface TransferLineInput {
  batchNumber?: string;
  expiryDate?: string;
  itemId: string;
  remarks?: string;
  sentQty: number;
}

export interface TransferInput {
  businessDate?: string;
  destinationId: string;
  destinationType: InventoryLocationType;
  hospitalId: string;
  items: TransferLineInput[];
  remarks?: string;
  sourceId: string;
  sourceType: InventoryLocationType;
  transferDate: string;
}

export interface TransferListQuery extends ListQuery {
  destinationId?: string;
  destinationType?: InventoryLocationType;
  fromDate?: string;
  hospitalId?: string;
  sourceId?: string;
  sourceType?: InventoryLocationType;
  status?: TransferStatus;
  toDate?: string;
}

export interface TransferAcknowledgementLine {
  acceptedQty: number;
  batchNumber: string | null;
  createdAt: string;
  expiryDate: string | null;
  id: string;
  item: ItemSummary;
  itemId: string;
  rejectedQty: number;
  rejectionReason: string | null;
  remarks: string | null;
  sentQty: number;
  transferLineId: string;
  updatedAt: string;
}

export interface TransferAcknowledgement {
  acknowledgementDate: string;
  createdAt: string;
  deletedAt: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  lines: TransferAcknowledgementLine[];
  remarks: string | null;
  status: TransferAcknowledgementStatus;
  transfer: Pick<
    Transfer,
    | 'businessDate'
    | 'destinationId'
    | 'destinationType'
    | 'id'
    | 'sourceId'
    | 'sourceType'
    | 'status'
    | 'transferDate'
    | 'transferNumber'
  >;
  transferId: string;
  updatedAt: string;
}

export interface TransferAcknowledgementLineInput {
  acceptedQty: number;
  batchNumber?: string;
  expiryDate?: string;
  itemId?: string;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
  sentQty?: number;
  transferLineId: string;
}

export interface TransferAcknowledgementInput {
  items: TransferAcknowledgementLineInput[];
  remarks?: string;
  transferId: string;
}

export interface TransferAcknowledgementListQuery extends ListQuery {
  fromDate?: string;
  hospitalId?: string;
  status?: TransferAcknowledgementStatus;
  toDate?: string;
  transferId?: string;
}

function appendQuery(path: string, query?: QueryParams): string {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    const queryValue = value as QueryValue;

    if (queryValue !== undefined && queryValue !== null && queryValue !== '') {
      params.set(key, String(queryValue));
    }
  });

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

function getErrorBody(payload: unknown): ApiErrorBody | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  return payload;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isLikelyTechnicalMessage(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return [
    'failed to fetch',
    'internal server error',
    'jwt expired',
    'jwt malformed',
    'invalid token',
    'prisma',
    'nestjs',
    'stack',
    'exception',
  ].some((technicalText) => normalizedMessage.includes(technicalText));
}

function messageWithRequestId(message: string, requestId?: string): string {
  return requestId ? `${message} Request ID: ${requestId}` : message;
}

function getErrorCategory(status: number): string {
  if (status === 0) {
    return 'NETWORK_ERROR';
  }

  if (status === 400) {
    return 'VALIDATION_ERROR';
  }

  if (status === 401) {
    return 'AUTHENTICATION_ERROR';
  }

  if (status === 403) {
    return 'AUTHORIZATION_ERROR';
  }

  if (status === 404) {
    return 'NOT_FOUND_ERROR';
  }

  if (status === 409) {
    return 'DUPLICATE_ERROR';
  }

  if (status === 422) {
    return 'BUSINESS_RULE_ERROR';
  }

  if (status === 429) {
    return 'RATE_LIMIT_ERROR';
  }

  if (status >= 500) {
    return 'SERVER_ERROR';
  }

  return 'UNKNOWN_ERROR';
}

function friendlyErrorMessage(status: number, message?: string, requestId?: string): string {
  const backendMessage = message?.trim();
  const canUseBackendMessage = backendMessage && !isLikelyTechnicalMessage(backendMessage);

  if (status === 0) {
    return 'Unable to connect to AAHAR services. Please check your network and try again.';
  }

  if (status === 400) {
    return canUseBackendMessage
      ? backendMessage
      : 'Unable to save. Please check the required fields.';
  }

  if (status === 401) {
    return canUseBackendMessage ? backendMessage : 'Your session has expired. Please login again.';
  }

  if (status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (status === 404) {
    return canUseBackendMessage ? backendMessage : 'The requested record was not found.';
  }

  if (status === 409) {
    return canUseBackendMessage ? backendMessage : 'This record already exists.';
  }

  if (status === 422) {
    return canUseBackendMessage
      ? backendMessage
      : 'This action cannot be completed because it violates a business rule.';
  }

  if (status === 429) {
    return 'Too many attempts. Please try again after some time.';
  }

  if (status >= 500) {
    return messageWithRequestId(
      'Something went wrong. Please try again. If the issue continues, contact support.',
      requestId,
    );
  }

  return canUseBackendMessage ? backendMessage : 'Something went wrong. Please try again.';
}

function isJsonBody(body: unknown): body is Record<string, unknown> | unknown[] {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isUrlSearchParams =
    typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  const isArrayBuffer = body instanceof ArrayBuffer;

  return !isFormData && !isUrlSearchParams && !isBlob && !isArrayBuffer;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createApiClient({
  baseUrl,
  fetcher = fetch,
  getAccessToken,
  onUnauthorized,
  refreshAccessToken,
  timeoutMs = 20_000,
}: ApiClientOptions): ApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    async request<TResponse>(path: string, init: ApiRequestInit = {}) {
      const {
        body,
        headers: initHeaders,
        query,
        skipAuthRefresh,
        timeoutMs: requestTimeoutMs,
        ...requestInit
      } = init;
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const requestPath = appendQuery(normalizedPath, query);
      const url = `${normalizedBaseUrl}${requestPath}`;

      const buildRequest = (accessToken?: string | null): RequestInit => {
        const headers = new Headers(initHeaders);
        const token = accessToken ?? getAccessToken?.();
        let requestBody: BodyInit | null | undefined;

        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        if (isJsonBody(body)) {
          requestBody = JSON.stringify(body);

          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
        } else {
          requestBody = body as BodyInit | null | undefined;
        }

        return {
          ...requestInit,
          body: requestBody,
          headers,
        };
      };

      const execute = async (accessToken?: string | null) => {
        const controller =
          typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        const timeout = requestTimeoutMs ?? timeoutMs;
        const timeoutId = controller
          ? globalThis.setTimeout(() => controller.abort(), timeout)
          : undefined;

        try {
          return await fetcher(url, {
            ...buildRequest(accessToken),
            signal: controller?.signal ?? requestInit.signal,
          });
        } catch (error) {
          if (isAbortError(error)) {
            throw new ApiClientError(
              0,
              'Unable to connect to AAHAR services. Please check your network and try again.',
              undefined,
              undefined,
              undefined,
              'NETWORK_ERROR',
            );
          }

          throw new ApiClientError(
            0,
            'Unable to connect to AAHAR services. Please check your network and try again.',
            error,
            undefined,
            undefined,
            'NETWORK_ERROR',
          );
        } finally {
          if (timeoutId) {
            globalThis.clearTimeout(timeoutId);
          }
        }
      };

      let response = await execute();
      let payload = await readPayload(response);

      if (response.status === 401 && refreshAccessToken && !skipAuthRefresh) {
        let refreshedAccessToken: string | null | undefined;

        try {
          refreshedAccessToken = await refreshAccessToken();
        } catch (error) {
          // Only a rejected refresh ends the session. A network blip or a 5xx used to sign the
          // user out too, discarding whatever form they were filling in.
          if (
            !(error instanceof ApiClientError) ||
            (error.status !== 401 && error.status !== 403)
          ) {
            throw error;
          }
        }

        if (refreshedAccessToken) {
          response = await execute(refreshedAccessToken);
          payload = await readPayload(response);
        }

        if (response.status === 401) {
          await onUnauthorized?.();
        }
      }

      if (!response.ok) {
        const errorBody = getErrorBody(payload);
        const requestId =
          errorBody?.requestId ??
          response.headers.get('x-request-id') ??
          response.headers.get('x-correlation-id') ??
          undefined;
        const message = friendlyErrorMessage(response.status, errorBody?.message, requestId);

        throw new ApiClientError(
          response.status,
          message,
          payload,
          errorBody?.errors,
          requestId,
          getErrorCategory(response.status),
        );
      }

      return payload as TResponse;
    },
  };
}

export function createAuthApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    logout(body: LogoutRequest) {
      return client.request<ApiResponse<{ loggedOut: boolean }>>('/auth/logout', {
        body,
        method: 'POST',
      });
    },
    loginWithPassword(body: EmailPasswordLoginRequest) {
      return client.request<ApiResponse<AuthTokens>>('/auth/login-with-password', {
        body,
        method: 'POST',
      });
    },
    refresh(body: RefreshTokenRequest) {
      return client.request<ApiResponse<AuthTokens>>('/auth/refresh', {
        body,
        method: 'POST',
      });
    },
    sendOtp(body: SendOtpRequest) {
      return client.request<ApiResponse<{ channel: 'email' | 'mobile' }>>('/auth/send-otp', {
        body,
        method: 'POST',
      });
    },
    verifyOtp(body: VerifyOtpRequest) {
      return client.request<ApiResponse<AuthTokens>>('/auth/verify-otp', {
        body,
        method: 'POST',
      });
    },
  };
}

export function createUserApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    listNotifications(query?: NotificationListQuery) {
      return client.request<ApiResponse<NotificationList>>('/notifications', { query });
    },
    getUnreadNotificationCount() {
      return client.request<ApiResponse<UnreadCount>>('/notifications/unread-count');
    },
    markNotificationRead(id: string, isRead = true) {
      return client.request<ApiResponse<UnreadCount>>(`/notifications/${id}/read`, {
        body: { isRead },
        method: 'PATCH',
      });
    },
    markAllNotificationsRead() {
      return client.request<ApiResponse<UnreadCount>>('/notifications/read-all', {
        method: 'POST',
      });
    },
    assignUserLocations(body: { hospitalIds: string[]; userIds: string[] }) {
      return client.request<
        ApiResponse<{ updated: Array<{ id: string; name: string }>; updatedCount: number }>
      >('/users/locations', { body, method: 'POST' });
    },
    createUser(body: AccessUserInput) {
      return client.request<ApiResponse<AccessUser>>('/users', { body, method: 'POST' });
    },
    getUserPermissions(id: string) {
      return client.request<ApiResponse<UserPermissions>>(`/users/${id}/permissions`);
    },
    listRoles(query?: ListQuery) {
      return client.request<ApiResponse<ApiList<AccessRole>>>('/roles', { query });
    },
    listUsers(query?: AccessUserListQuery) {
      return client.request<ApiResponse<ApiList<AccessUser>>>('/users', { query });
    },
    replaceUserPermissions(id: string, permissionIds: string[]) {
      return client.request<ApiResponse<UserPermissions>>(`/users/${id}/permissions`, {
        body: { permissionIds },
        method: 'PUT',
      });
    },
    updateUser(id: string, body: Partial<AccessUserInput>) {
      return client.request<ApiResponse<AccessUser>>(`/users/${id}`, { body, method: 'PUT' });
    },
  };
}

export function createOrganizationApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    createCounter(body: CounterInput) {
      return client.request<ApiResponse<Counter>>('/counters', {
        body,
        method: 'POST',
      });
    },
    createPaymentMachine(body: PaymentMachineInput) {
      return client.request<ApiResponse<PaymentMachine>>('/payment-machines', {
        body,
        method: 'POST',
      });
    },
    createPosDevice(body: PosDeviceInput) {
      return client.request<ApiResponse<PosDevice>>('/pos-devices', {
        body,
        method: 'POST',
      });
    },
    createEmployee(body: EmployeeInput) {
      return client.request<ApiResponse<Employee>>('/employees', {
        body,
        method: 'POST',
      });
    },
    createGrn(body: GrnInput) {
      return client.request<ApiResponse<Grn>>('/grns', {
        body,
        method: 'POST',
      });
    },
    createHospital(body: HospitalInput) {
      return client.request<ApiResponse<Hospital>>('/hospitals', {
        body,
        method: 'POST',
      });
    },
    createItem(body: ItemInput) {
      return client.request<ApiResponse<Item>>('/items', {
        body,
        method: 'POST',
      });
    },
    createItemCategory(body: ItemCategoryInput) {
      return client.request<ApiResponse<ItemCategory>>('/item-categories', {
        body,
        method: 'POST',
      });
    },
    createItemPrice(body: ItemPriceInput) {
      return client.request<ApiResponse<ItemPrice>>('/item-prices', {
        body,
        method: 'POST',
      });
    },
    createKitchenItem(body: KitchenItemInput) {
      return client.request<ApiResponse<KitchenItem>>('/kitchen-items', {
        body,
        method: 'POST',
      });
    },
    createKitchen(body: KitchenInput) {
      return client.request<ApiResponse<Kitchen>>('/kitchens', {
        body,
        method: 'POST',
      });
    },
    createKitchenProduction(body: KitchenProductionInput) {
      return client.request<ApiResponse<KitchenProduction>>('/kitchen-productions', {
        body,
        method: 'POST',
      });
    },
    createLocation(body: LocationInput) {
      return client.request<ApiResponse<Location>>('/locations', {
        body,
        method: 'POST',
      });
    },
    createRestaurant(body: RestaurantInput) {
      return client.request<ApiResponse<Restaurant>>('/restaurants', {
        body,
        method: 'POST',
      });
    },
    createRestaurantMenu(body: RestaurantMenuInput) {
      return client.request<ApiResponse<RestaurantMenu>>('/restaurant-menus', {
        body,
        method: 'POST',
      });
    },
    createStore(body: StoreInput) {
      return client.request<ApiResponse<Store>>('/stores', {
        body,
        method: 'POST',
      });
    },
    createStoreItem(body: StoreItemInput) {
      return client.request<ApiResponse<StoreItem>>('/store-items', {
        body,
        method: 'POST',
      });
    },
    createTimeSlot(body: TimeSlotInput) {
      return client.request<ApiResponse<TimeSlot>>('/time-slots', {
        body,
        method: 'POST',
      });
    },
    createTransfer(body: TransferInput) {
      return client.request<ApiResponse<Transfer>>('/transfers', {
        body,
        method: 'POST',
      });
    },
    createTransferAcknowledgement(body: TransferAcknowledgementInput) {
      return client.request<ApiResponse<TransferAcknowledgement>>('/transfer-acknowledgements', {
        body,
        method: 'POST',
      });
    },
    deleteCounter(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/counters/${id}`, { method: 'DELETE' });
    },
    deletePaymentMachine(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/payment-machines/${id}`, {
        method: 'DELETE',
      });
    },
    deletePosDevice(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/pos-devices/${id}`, {
        method: 'DELETE',
      });
    },
    deleteEmployee(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/employees/${id}`, {
        method: 'DELETE',
      });
    },
    deleteGrn(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/grns/${id}`, { method: 'DELETE' });
    },
    deleteHospital(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/hospitals/${id}`, { method: 'DELETE' });
    },
    deleteItem(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/items/${id}`, { method: 'DELETE' });
    },
    deleteItemCategory(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/item-categories/${id}`, {
        method: 'DELETE',
      });
    },
    deleteItemPrice(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/item-prices/${id}`, {
        method: 'DELETE',
      });
    },
    deleteKitchenItem(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/kitchen-items/${id}`, {
        method: 'DELETE',
      });
    },
    deleteKitchen(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/kitchens/${id}`, { method: 'DELETE' });
    },
    deleteKitchenProduction(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/kitchen-productions/${id}`, {
        method: 'DELETE',
      });
    },
    deleteLocation(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/locations/${id}`, { method: 'DELETE' });
    },
    deleteRestaurant(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/restaurants/${id}`, {
        method: 'DELETE',
      });
    },
    deleteRestaurantMenu(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/restaurant-menus/${id}`, {
        method: 'DELETE',
      });
    },
    deleteStore(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/stores/${id}`, { method: 'DELETE' });
    },
    deleteStoreItem(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/store-items/${id}`, {
        method: 'DELETE',
      });
    },
    deleteTimeSlot(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/time-slots/${id}`, {
        method: 'DELETE',
      });
    },
    getCounter(id: string) {
      return client.request<ApiResponse<Counter>>(`/counters/${id}`);
    },
    getPaymentMachine(id: string) {
      return client.request<ApiResponse<PaymentMachine>>(`/payment-machines/${id}`);
    },
    getPosDevice(id: string) {
      return client.request<ApiResponse<PosDevice>>(`/pos-devices/${id}`);
    },
    getEmployee(id: string) {
      return client.request<ApiResponse<Employee>>(`/employees/${id}`);
    },
    getGrn(id: string) {
      return client.request<ApiResponse<Grn>>(`/grns/${id}`);
    },
    getHospital(id: string) {
      return client.request<ApiResponse<Hospital>>(`/hospitals/${id}`);
    },
    getItem(id: string) {
      return client.request<ApiResponse<Item>>(`/items/${id}`);
    },
    getItemCategory(id: string) {
      return client.request<ApiResponse<ItemCategory>>(`/item-categories/${id}`);
    },
    getItemPrice(id: string) {
      return client.request<ApiResponse<ItemPrice>>(`/item-prices/${id}`);
    },
    getKitchenItem(id: string) {
      return client.request<ApiResponse<KitchenItem>>(`/kitchen-items/${id}`);
    },
    getKitchen(id: string) {
      return client.request<ApiResponse<Kitchen>>(`/kitchens/${id}`);
    },
    getKitchenProduction(id: string) {
      return client.request<ApiResponse<KitchenProduction>>(`/kitchen-productions/${id}`);
    },
    getLocation(id: string) {
      return client.request<ApiResponse<Location>>(`/locations/${id}`);
    },
    getRestaurant(id: string) {
      return client.request<ApiResponse<Restaurant>>(`/restaurants/${id}`);
    },
    getRestaurantMenu(id: string) {
      return client.request<ApiResponse<RestaurantMenu>>(`/restaurant-menus/${id}`);
    },
    getStore(id: string) {
      return client.request<ApiResponse<Store>>(`/stores/${id}`);
    },
    getStoreItem(id: string) {
      return client.request<ApiResponse<StoreItem>>(`/store-items/${id}`);
    },
    getTimeSlot(id: string) {
      return client.request<ApiResponse<TimeSlot>>(`/time-slots/${id}`);
    },
    getTransfer(id: string) {
      return client.request<ApiResponse<Transfer>>(`/transfers/${id}`);
    },
    getTransferAcknowledgement(id: string) {
      return client.request<ApiResponse<TransferAcknowledgement>>(
        `/transfer-acknowledgements/${id}`,
      );
    },
    listCounters(query?: CounterListQuery) {
      return client.request<ApiResponse<ApiList<Counter>>>('/counters', { query });
    },
    listPaymentMachines(query?: PaymentMachineListQuery) {
      return client.request<ApiResponse<ApiList<PaymentMachine>>>('/payment-machines', { query });
    },
    listPosDevices(query?: PosDeviceListQuery) {
      return client.request<ApiResponse<ApiList<PosDevice>>>('/pos-devices', { query });
    },
    listEmployees(query?: EmployeeListQuery) {
      return client.request<ApiResponse<ApiList<Employee>>>('/employees', { query });
    },
    listGrns(query?: GrnListQuery) {
      return client.request<ApiResponse<ApiList<Grn>>>('/grns', { query });
    },
    listHospitals(query?: HospitalListQuery) {
      return client.request<ApiResponse<ApiList<Hospital>>>('/hospitals', { query });
    },
    listItemCategories(query?: ItemCategoryListQuery) {
      return client.request<ApiResponse<ApiList<ItemCategory>>>('/item-categories', { query });
    },
    listItems(query?: ItemListQuery) {
      return client.request<ApiResponse<ApiList<Item>>>('/items', { query });
    },
    listItemPrices(query?: ItemPriceListQuery) {
      return client.request<ApiResponse<ApiList<ItemPrice>>>('/item-prices', { query });
    },
    listKitchenItems(query?: KitchenItemListQuery) {
      return client.request<ApiResponse<ApiList<KitchenItem>>>('/kitchen-items', { query });
    },
    listKitchens(query?: KitchenListQuery) {
      return client.request<ApiResponse<ApiList<Kitchen>>>('/kitchens', { query });
    },
    listKitchenProductions(query?: KitchenProductionListQuery) {
      return client.request<ApiResponse<ApiList<KitchenProduction>>>('/kitchen-productions', {
        query,
      });
    },
    listKitchenStock(query?: StockBalanceListQuery) {
      return client.request<ApiResponse<ApiList<StockBalance>>>('/kitchen-stock', { query });
    },
    listKitchenStockLedgers(query?: StockLedgerListQuery) {
      return client.request<ApiResponse<ApiList<StockLedger>>>('/kitchen-stock-ledgers', {
        query,
      });
    },
    listLocations(query?: LocationListQuery) {
      return client.request<ApiResponse<ApiList<Location>>>('/locations', { query });
    },
    listRestaurants(query?: RestaurantListQuery) {
      return client.request<ApiResponse<ApiList<Restaurant>>>('/restaurants', { query });
    },
    listRestaurantMenus(query?: RestaurantMenuListQuery) {
      return client.request<ApiResponse<ApiList<RestaurantMenu>>>('/restaurant-menus', { query });
    },
    listStockBalances(query?: StockBalanceListQuery) {
      return client.request<ApiResponse<ApiList<StockBalance>>>('/stock-balances', { query });
    },
    listStockLedgers(query?: StockLedgerListQuery) {
      return client.request<ApiResponse<ApiList<StockLedger>>>('/stock-ledgers', { query });
    },
    listStoreStockSummaries(query?: StockBalanceListQuery) {
      return client.request<ApiResponse<ApiList<StoreStockSummary>>>('/store-stock/summary', {
        query,
      });
    },
    listRestaurantStock(query?: StockBalanceListQuery) {
      return client.request<ApiResponse<ApiList<StockBalance>>>('/restaurant-stock', { query });
    },
    listRestaurantStockLedgers(query?: StockLedgerListQuery) {
      return client.request<ApiResponse<ApiList<StockLedger>>>('/restaurant-stock-ledgers', {
        query,
      });
    },
    listStoreItems(query?: StoreItemListQuery) {
      return client.request<ApiResponse<ApiList<StoreItem>>>('/store-items', { query });
    },
    listStores(query?: StoreListQuery) {
      return client.request<ApiResponse<ApiList<Store>>>('/stores', { query });
    },
    listTimeSlots(query?: TimeSlotListQuery) {
      return client.request<ApiResponse<ApiList<TimeSlot>>>('/time-slots', { query });
    },
    listTransfers(query?: TransferListQuery) {
      return client.request<ApiResponse<ApiList<Transfer>>>('/transfers', { query });
    },
    listTransferAcknowledgements(query?: TransferAcknowledgementListQuery) {
      return client.request<ApiResponse<ApiList<TransferAcknowledgement>>>(
        '/transfer-acknowledgements',
        { query },
      );
    },
    updateCounter(id: string, body: Partial<CounterInput>) {
      return client.request<ApiResponse<Counter>>(`/counters/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updatePaymentMachine(id: string, body: Partial<PaymentMachineInput>) {
      return client.request<ApiResponse<PaymentMachine>>(`/payment-machines/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updatePosDevice(id: string, body: Partial<PosDeviceInput>) {
      return client.request<ApiResponse<PosDevice>>(`/pos-devices/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateEmployee(id: string, body: Partial<EmployeeInput>) {
      return client.request<ApiResponse<Employee>>(`/employees/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateGrn(id: string, body: Partial<GrnInput>) {
      return client.request<ApiResponse<Grn>>(`/grns/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateHospital(id: string, body: Partial<HospitalInput>) {
      return client.request<ApiResponse<Hospital>>(`/hospitals/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateItem(id: string, body: Partial<ItemInput>) {
      return client.request<ApiResponse<Item>>(`/items/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateItemCategory(id: string, body: Partial<ItemCategoryInput>) {
      return client.request<ApiResponse<ItemCategory>>(`/item-categories/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateItemPrice(id: string, body: Partial<ItemPriceInput>) {
      return client.request<ApiResponse<ItemPrice>>(`/item-prices/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateKitchenItem(id: string, body: Partial<KitchenItemInput>) {
      return client.request<ApiResponse<KitchenItem>>(`/kitchen-items/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateKitchen(id: string, body: Partial<KitchenInput>) {
      return client.request<ApiResponse<Kitchen>>(`/kitchens/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateKitchenProduction(id: string, body: Partial<KitchenProductionInput>) {
      return client.request<ApiResponse<KitchenProduction>>(`/kitchen-productions/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateLocation(id: string, body: Partial<LocationInput>) {
      return client.request<ApiResponse<Location>>(`/locations/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateRestaurant(id: string, body: Partial<RestaurantInput>) {
      return client.request<ApiResponse<Restaurant>>(`/restaurants/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateRestaurantMenu(id: string, body: Partial<RestaurantMenuInput>) {
      return client.request<ApiResponse<RestaurantMenu>>(`/restaurant-menus/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateStore(id: string, body: Partial<StoreInput>) {
      return client.request<ApiResponse<Store>>(`/stores/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateStoreItem(id: string, body: Partial<StoreItemInput>) {
      return client.request<ApiResponse<StoreItem>>(`/store-items/${id}`, {
        body,
        method: 'PUT',
      });
    },
    updateTimeSlot(id: string, body: Partial<TimeSlotInput>) {
      return client.request<ApiResponse<TimeSlot>>(`/time-slots/${id}`, {
        body,
        method: 'PUT',
      });
    },
    cancelGrn(id: string) {
      return client.request<ApiResponse<Grn>>(`/grns/${id}/cancel`, {
        method: 'PATCH',
      });
    },
    cancelKitchenProduction(id: string) {
      return client.request<ApiResponse<KitchenProduction>>(`/kitchen-productions/${id}/cancel`, {
        method: 'PATCH',
      });
    },
    cancelTransfer(id: string) {
      return client.request<ApiResponse<Transfer>>(`/transfers/${id}/cancel`, {
        method: 'PATCH',
      });
    },
    dispatchTransfer(id: string) {
      return client.request<ApiResponse<Transfer>>(`/transfers/${id}/dispatch`, {
        method: 'PATCH',
      });
    },
    postGrnToStock(id: string) {
      return client.request<ApiResponse<Grn>>(`/grns/${id}/post-to-stock`, {
        method: 'PATCH',
      });
    },
    postKitchenProduction(id: string) {
      return client.request<ApiResponse<KitchenProduction>>(`/kitchen-productions/${id}/post`, {
        method: 'PATCH',
      });
    },
    resolveItemPrice(query: ResolveItemPriceQuery) {
      return client.request<ApiResponse<ResolvedItemPrice>>('/item-prices/resolve', { query });
    },
    validateEmployee(employeeCode: string) {
      return client.request<ApiResponse<EmployeeValidation>>(
        `/employees/validate/${encodeURIComponent(employeeCode)}`,
      );
    },
  };
}
