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
import { createApiClient, type ApiClientOptions, type ApiList, type ApiResponse } from './http';
import type {
  Grn,
  GrnInput,
  GrnListQuery,
  StockBalance,
  StockBalanceListQuery,
  StockLedger,
  StockLedgerListQuery,
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
