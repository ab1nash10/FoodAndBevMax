import type {
  Item,
  ItemCategory,
  ItemCategoryInput,
  ItemCategoryListQuery,
  ItemInput,
  ItemListQuery,
  ItemPrice,
  ItemPriceInput,
  ItemPriceListQuery,
  KitchenItem,
  KitchenItemInput,
  KitchenItemListQuery,
  ResolveItemPriceQuery,
  ResolvedItemPrice,
  RestaurantMenu,
  RestaurantMenuInput,
  RestaurantMenuListQuery,
  StoreItem,
  StoreItemInput,
  StoreItemListQuery,
  TimeSlot,
  TimeSlotInput,
  TimeSlotListQuery,
} from './catalog';
import type {
  DashboardNavCounts,
  DashboardRecords,
  DashboardRecordsQuery,
  DashboardSetup,
  LocationNames,
} from './dashboard';
import type {
  BoardFeed,
  OrderStatus,
  PosBill,
  PosBillInput,
  KioskMenu,
  KioskOrder,
  KioskOrderInput,
  KioskOrderToBill,
  KioskOrderWaiting,
  PosBillListQuery,
  PosBillSummary,
  PosChannel,
  PosCounter,
  PosDaySummary,
  PosShift,
  OnlinePayment,
  OnlinePaymentInput,
  OnlinePaymentProvider,
  PosMenu,
  PosEmployee,
  PosStockSummary,
  EmployeeDiscount,
  EmployeeDiscountInput,
  EmployeeDiscountListQuery,
  StaffDiscountInput,
  StaffDiscountSettings,
  RestaurantOrder,
} from './orders';
import {
  createApiClient,
  type ApiClientOptions,
  type ApiList,
  type ApiResponse,
  type ImportRequest,
  type ImportResult,
} from './http';
import type {
  Grn,
  GrnInput,
  GrnListQuery,
  LocationStockLevels,
  LocationStockLevelsQuery,
  StockBalance,
  StockDiscardInput,
  StockBalanceListQuery,
  StockLedger,
  StockLedgerListQuery,
  StoreStockLevels,
  StoreStockLevelsQuery,
  StoreStockMovementDay,
  StoreStockMovementsQuery,
  StoreStockSummary,
  Transfer,
  TransferAcknowledgement,
  TransferAcknowledgementInput,
  TransferAcknowledgementListQuery,
  TransferInput,
  TransferListQuery,
} from './inventory';
import type {
  KitchenProduction,
  KitchenProductionInput,
  KitchenProductionListQuery,
} from './kitchen';
import type {
  Counter,
  CounterInput,
  CounterListQuery,
  Employee,
  EmployeeInput,
  EmployeeListQuery,
  EmployeeValidation,
  Hospital,
  HospitalInput,
  LegalEntity,
  LegalEntityInput,
  LegalEntityListQuery,
  HospitalListQuery,
  Kitchen,
  KitchenInput,
  KitchenListQuery,
  Location,
  LocationInput,
  LocationListQuery,
  Restaurant,
  RestaurantInput,
  RestaurantListQuery,
  Store,
  StoreInput,
  StoreListQuery,
} from './organization';
import type {
  PaymentMachine,
  PaymentMachineInput,
  PaymentMachineListQuery,
  PosDevice,
  PosDeviceInput,
  PosDeviceListQuery,
} from './pos';

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
    createLegalEntity(body: LegalEntityInput) {
      return client.request<ApiResponse<LegalEntity>>('/legal-entities', { body, method: 'POST' });
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
    deleteLegalEntity(id: string) {
      return client.request<ApiResponse<{ id: string }>>(`/legal-entities/${id}`, {
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
    getDashboardRecords(query: DashboardRecordsQuery) {
      return client.request<ApiResponse<DashboardRecords>>('/dashboard/records', { query });
    },
    getDashboardSetup(query?: { hospitalId?: string }) {
      return client.request<ApiResponse<DashboardSetup>>('/dashboard/setup', { query });
    },
    /** The nav badges' three counts in one request. */
    getDashboardNavCounts(query?: { hospitalId?: string }) {
      return client.request<ApiResponse<DashboardNavCounts>>('/dashboard/nav-counts', { query });
    },
    /** Every active store, kitchen, restaurant and counter: id, name and code only. */
    getLocationNames() {
      return client.request<ApiResponse<LocationNames>>('/dashboard/location-names');
    },
    /** Public: the TV pickup board's feed, with the restaurant's board secret. */
    getBoardFeed(restaurantId: string, token: string) {
      // A query parameter, not a header: a custom header would need a CORS preflight.
      return client.request<ApiResponse<BoardFeed>>(`/order-board/${restaurantId}`, {
        query: { token },
      });
    },
    /** Public: the self-service kiosk's menu, with the restaurant's board secret. */
    getKioskMenu(restaurantId: string, token: string) {
      return client.request<ApiResponse<KioskMenu>>(`/kiosk/${restaurantId}/menu`, {
        query: { token },
      });
    },
    /** Public: a staff member's discount at the kiosk, by their registered mobile. */
    getKioskStaffDiscount(restaurantId: string, token: string, mobile: string) {
      return client.request<ApiResponse<{ discountPercent: number }>>(
        `/kiosk/${restaurantId}/staff`,
        { query: { mobile, token } },
      );
    },
    /** Public: places a kiosk order, paid at a counter. */
    createKioskOrder(restaurantId: string, token: string, body: KioskOrderInput) {
      return client.request<ApiResponse<KioskOrder>>(`/kiosk/${restaurantId}/orders`, {
        body,
        method: 'POST',
        query: { token },
      });
    },
    /** Kiosk orders waiting to be paid at this counter's restaurant, oldest first. */
    listWaitingKioskOrders(counterId: string) {
      return client.request<ApiResponse<KioskOrderWaiting[]>>('/pos/kiosk-orders', {
        query: { counterId },
      });
    },
    /** Today's kiosk order by its number, to load into this counter's till. */
    getKioskOrderToBill(counterId: string, number: number) {
      return client.request<ApiResponse<KioskOrderToBill>>(`/pos/kiosk-orders/${number}`, {
        query: { counterId },
      });
    },
    /** The restaurant's TV board secret, made on first use; regenerate turns the old link off. */
    getRestaurantBoardLink(restaurantId: string, regenerate = false) {
      return client.request<ApiResponse<{ boardToken: string }>>(
        `/restaurants/${restaurantId}/board-link`,
        { body: { regenerate }, method: 'POST' },
      );
    },
    /** The restaurant's order key for kiosks, QR ordering and other apps; shown once. */
    issueRestaurantOrderKey(restaurantId: string) {
      return client.request<ApiResponse<{ apiKey: string }>>(
        `/restaurants/${restaurantId}/order-key`,
        { method: 'POST' },
      );
    },
    /** A new key for the POS to send orders with; shown once, the old key stops working. */
    issuePosDeviceKey(posDeviceId: string) {
      return client.request<ApiResponse<{ apiKey: string }>>(
        `/pos-devices/${posDeviceId}/api-key`,
        {
          method: 'POST',
        },
      );
    },
    /** Counters the signed-in user may bill at. */
    /** With till, only those of the till this computer is (404 when it is mapped to no POS). */
    listPosCounters(till = false) {
      return client.request<ApiResponse<PosCounter[]>>('/pos/counters', {
        query: till ? { till: 'true' } : undefined,
      });
    },
    /** This computer as the server sees it: address, DNS name, and the registered till it is. */
    posWhoAmI() {
      return client.request<
        ApiResponse<{
          /** Whether the signed-in user is assigned to the location of the till's restaurants. */
          allowed: boolean;
          hostname: string | null;
          ip: string | null;
          restaurants: string[];
          till: string | null;
        }>
      >('/pos/whoami');
    },
    getPosMenu(counterId: string, channel: PosChannel) {
      return client.request<ApiResponse<PosMenu>>('/pos/menu', { query: { channel, counterId } });
    },
    setPosMenuAvailability(menuId: string, isAvailable: boolean) {
      return client.request<ApiResponse<{ id: string; isAvailable: boolean }>>(
        `/pos/menu/${menuId}/availability`,
        { body: { isAvailable }, method: 'PATCH' },
      );
    },
    /** Bills an order; sending the same clientOrderId again returns the same bill. */
    createPosBill(body: PosBillInput) {
      return client.request<ApiResponse<PosBill>>('/pos/orders', { body, method: 'POST' });
    },
    listPosBills(query?: PosBillListQuery) {
      return client.request<ApiResponse<ApiList<PosBillSummary>>>('/pos/orders', { query });
    },
    getPosBill(id: string) {
      return client.request<ApiResponse<PosBill>>(`/pos/orders/${id}`);
    },
    /** The online UPI providers set up on the server, in the order to offer them. */
    listOnlinePaymentProviders() {
      return client.request<ApiResponse<OnlinePaymentProvider[]>>('/pos/online-payments/providers');
    },
    /** The counter's Pine Labs card machine, or null: cards go to it as provider PINELABS. */
    getCardMachine(counterId: string) {
      return client.request<ApiResponse<{ name: string } | null>>(
        `/pos/online-payments/card-machine/${counterId}`,
      );
    },
    startOnlinePayment(body: OnlinePaymentInput) {
      return client.request<ApiResponse<OnlinePayment>>('/pos/online-payments', {
        body,
        method: 'POST',
      });
    },
    /** Asks the provider while pending; PAID means the till can bill with it. */
    checkOnlinePayment(id: string) {
      return client.request<ApiResponse<OnlinePayment>>(`/pos/online-payments/${id}`);
    },
    cancelOnlinePayment(id: string) {
      return client.request<ApiResponse<OnlinePayment>>(`/pos/online-payments/${id}/cancel`, {
        body: {},
        method: 'POST',
      });
    },
    cancelPosBill(id: string, reason: string) {
      return client.request<ApiResponse<PosBill>>(`/pos/orders/${id}/cancel`, {
        body: { reason },
        method: 'PATCH',
      });
    },
    lookupPosEmployee(counterId: string, code: string) {
      return client.request<ApiResponse<PosEmployee>>('/pos/employee', {
        query: { code, counterId },
      });
    },
    listEmployeeDiscounts(query?: EmployeeDiscountListQuery) {
      return client.request<ApiResponse<ApiList<EmployeeDiscount>>>('/employee-discounts', {
        query,
      });
    },
    createEmployeeDiscount(body: EmployeeDiscountInput) {
      return client.request<ApiResponse<EmployeeDiscount>>('/employee-discounts', {
        body,
        method: 'POST',
      });
    },
    /** Edit a rule, or archive (archived: true) / restore it. */
    updateEmployeeDiscount(
      id: string,
      body: Partial<EmployeeDiscountInput> & { archived?: boolean },
    ) {
      return client.request<ApiResponse<EmployeeDiscount>>(`/employee-discounts/${id}`, {
        body,
        method: 'PUT',
      });
    },
    getStaffDiscounts(restaurantId: string) {
      return client.request<ApiResponse<StaffDiscountSettings>>(
        `/pos/staff-discounts/${restaurantId}`,
      );
    },
    setStaffDiscounts(restaurantId: string, body: StaffDiscountInput) {
      return client.request<ApiResponse<StaffDiscountSettings>>(
        `/pos/staff-discounts/${restaurantId}`,
        { body, method: 'PUT' },
      );
    },
    getPosStockSummary(counterId: string, date?: string) {
      return client.request<ApiResponse<PosStockSummary>>('/pos/stock-summary', {
        query: { counterId, date },
      });
    },
    /** Opens a shift at a counter with the cash in the till; it takes on a waiting handover. */
    openPosShift(counterId: string, openingCash: number) {
      return client.request<ApiResponse<PosShift>>('/pos/shifts', {
        body: { counterId, openingCash },
        method: 'POST',
      });
    },
    /** Ends a shift with the cash counted: closes it, or hands it over to the next cashier. */
    endPosShift(id: string, body: { countedCash: number; handover: boolean; note?: string }) {
      return client.request<ApiResponse<PosShift>>(`/pos/shifts/${id}/end`, {
        body,
        method: 'PATCH',
      });
    },
    closePosDay(counterId: string, date?: string) {
      return client.request<
        ApiResponse<{ businessDate: string; closedAt: string; closedByName: string | null }>
      >('/pos/day-closes', { body: { counterId, date }, method: 'POST' });
    },
    getPosDaySummary(counterId: string, date?: string) {
      return client.request<ApiResponse<PosDaySummary>>('/pos/summary', {
        query: { counterId, date },
      });
    },
    listRestaurantOrders(restaurantId: string) {
      return client.request<ApiResponse<RestaurantOrder[]>>('/restaurant-orders', {
        query: { restaurantId },
      });
    },
    setRestaurantOrderStatus(id: string, status: OrderStatus) {
      return client.request<ApiResponse<RestaurantOrder>>(`/restaurant-orders/${id}/status`, {
        body: { status },
        method: 'PATCH',
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
    listLegalEntities(query?: LegalEntityListQuery) {
      return client.request<ApiResponse<ApiList<LegalEntity>>>('/legal-entities', { query });
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
    listStoreStockLevels(query?: StoreStockLevelsQuery) {
      return client.request<ApiResponse<StoreStockLevels>>('/store-stock/levels', { query });
    },
    listStoreStockMovements(query?: StoreStockMovementsQuery) {
      return client.request<ApiResponse<{ days: StoreStockMovementDay[] }>>(
        '/store-stock/movements',
        { query },
      );
    },
    listCounterStock(query?: StockBalanceListQuery) {
      return client.request<ApiResponse<ApiList<StockBalance>>>('/counter-stock', { query });
    },
    listCounterStockLedgers(query?: StockLedgerListQuery) {
      return client.request<ApiResponse<ApiList<StockLedger>>>('/counter-stock-ledgers', { query });
    },
    listCounterStockLevels(query?: LocationStockLevelsQuery) {
      return client.request<ApiResponse<LocationStockLevels>>('/counter-stock/levels', { query });
    },
    listRestaurantStock(query?: StockBalanceListQuery) {
      return client.request<ApiResponse<ApiList<StockBalance>>>('/restaurant-stock', { query });
    },
    listRestaurantStockLevels(query?: LocationStockLevelsQuery) {
      return client.request<ApiResponse<LocationStockLevels>>('/restaurant-stock/levels', {
        query,
      });
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
    updateLegalEntity(id: string, body: Partial<LegalEntityInput>) {
      return client.request<ApiResponse<LegalEntity>>(`/legal-entities/${id}`, {
        body,
        method: 'PUT',
      });
    },
    /** Throws part or all of one batch away (expired, damaged…), where it is held. */
    discardStock(body: StockDiscardInput) {
      return client.request<
        ApiResponse<{ availableQty: number; ledgerId: string; stockBalanceId: string }>
      >('/stock-discards', { body, method: 'POST' });
    },
    /** Every category id, first to last: their order on menus, the till and the kiosk. */
    reorderItemCategories(ids: string[]) {
      return client.request<ApiResponse<{ ids: string[] }>>('/item-categories/order', {
        body: { ids },
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
    importEmployees(body: ImportRequest) {
      return client.request<ApiResponse<ImportResult>>('/employees/import', {
        body,
        method: 'POST',
      });
    },
    importItems(body: ImportRequest) {
      return client.request<ApiResponse<ImportResult>>('/items/import', { body, method: 'POST' });
    },
    importRestaurantMenus(body: ImportRequest) {
      return client.request<ApiResponse<ImportResult>>('/restaurant-menus/import', {
        body,
        method: 'POST',
      });
    },
  };
}
