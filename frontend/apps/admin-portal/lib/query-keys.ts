// Every React Query key the portal uses, by domain. A key is its fixed prefix followed by what
// varies (filters, ids, scope). Called with no arguments, a builder gives the bare prefix, and
// invalidating that matches every query under it, exactly as the literal arrays did.
const key =
  <const P extends readonly string[]>(...prefix: P) =>
  <const A extends readonly unknown[]>(...args: A) =>
    [...prefix, ...args] as const;

export const queryKeys = {
  // Inventory: GRNs, stock and transfers
  grns: key('grns'),
  inventoryStoreItems: key('inventory-store-items'),
  restaurantStock: key('restaurant-stock'),
  stockBalances: key('stock-balances'),
  stockLedgers: key('stock-ledgers'),
  transferAcknowledgements: key('transfer-acknowledgements'),
  transferKitchenStock: key('transfer-kitchen-stock'),
  transferStoreStock: key('transfer-store-stock'),
  transfers: key('transfers'),
  transfersRecentToRestaurant: key('transfers', 'recent-to-restaurant'),
  transfersViewCounts: key('transfers', 'view-counts'),

  // Kitchen
  kitchenProductionItems: key('kitchen-production-items'),
  kitchenProductions: key('kitchen-productions'),
  kitchenProductionsToday: key('kitchen-productions', 'today'),
  kitchenStock: key('kitchen-stock'),
  kitchenStockLedgers: key('kitchen-stock-ledgers'),

  // Organization: locations, stores, kitchens, restaurants, counters
  counters: key('counters'),
  hospital: key('hospital'),
  hospitalOptions: key('hospital-options'),
  hospitals: key('hospitals'),
  kitchenOptions: key('kitchen-options'),
  kitchens: key('kitchens'),
  legalEntities: key('legal-entities'),
  legalEntityOptions: key('legal-entity-options'),
  locationOptions: key('location-options'),
  locationPicker: key('location-picker'),
  locations: key('locations'),
  restaurant: key('restaurant'),
  restaurantOptions: key('restaurant-options'),
  orderBoard: key('order-board'),
  kioskMenu: key('kiosk-menu'),
  kioskOrderToBill: key('kiosk-order-to-bill'),
  restaurantBoardLink: key('restaurant-board-link'),
  restaurantOrders: key('restaurant-orders'),
  restaurants: key('restaurants'),
  staffDiscounts: key('staff-discounts'),
  storeOptions: key('store-options'),
  stores: key('stores'),

  // Catalog: items, prices, time slots, mappings and menus
  employeeDiscounts: key('employee-discounts'),
  employees: key('employees'),
  itemCategories: key('item-categories'),
  itemCategoryOptions: key('item-category-options'),
  timeSlots: key('time-slots'),
  itemMappings: key('item-mappings'),
  itemOptions: key('item-options'),
  items: key('items'),
  mappingHospitalOptions: key('mapping-hospital-options'),
  restaurantMenuReferenceOptions: key('restaurant-menu-reference-options'),
  restaurantMenus: key('restaurant-menus'),

  // POS
  counterStock: key('counter-stock'),
  posBill: key('pos-bill'),
  posBills: key('pos-bills'),
  posCounters: key('pos-counters'),
  posWhoAmI: key('pos-whoami'),
  posPaymentProviders: key('pos-payment-providers'),
  reports: key('reports'),
  posEmployee: key('pos-employee'),
  posMenu: key('pos-menu'),
  posSummary: key('pos-summary'),
  paymentMachinePosDeviceOptions: key('payment-machine-pos-device-options'),
  paymentMachines: key('payment-machines'),
  posDevices: key('pos-devices'),
  posLocationOptions: key('pos-location-options'),
  posRestaurantOptions: key('pos-restaurant-options'),

  // Access
  accessHospitals: key('access-hospitals'),
  accessRoles: key('access-roles'),
  accessUsers: key('access-users'),
  userPermissions: key('user-permissions'),

  // Shell: dashboard, search, location context
  commandPaletteSearch: key('command-palette', 'search'),
  dashboard: key('dashboard'),
  dashboardActivity: key('dashboard', 'activity'),
  dashboardExpiring: key('dashboard', 'expiring'),
  dashboardNavCounts: key('dashboard', 'nav-counts'),
  // Every active store, kitchen, restaurant and counter's name (components/inventory/use-locations.ts).
  locationNames: key('location-names'),
  dashboardQueue: key('dashboard', 'queue'),
  dashboardSetup: key('dashboard', 'setup'),
  dashboardStats: key('dashboard', 'stats'),
  globalLocationContextActiveLocations: key('global-location-context', 'active-locations'),
};

// Fresh for 5 minutes: master data lists that every write to them invalidates (the entity's own
// screen, or lib/query-invalidation.ts), so a save never shows a stale list. The inventory and
// kitchen screens' own location and item lists are left out: nothing invalidates them when the
// masters change, so they keep the 30 s default.
export const masterDataKeys = [
  queryKeys.hospitalOptions(),
  queryKeys.itemCategoryOptions(),
  queryKeys.itemOptions(),
  queryKeys.kitchenOptions(),
  queryKeys.legalEntityOptions(),
  queryKeys.locationOptions(),
  queryKeys.paymentMachinePosDeviceOptions(),
  queryKeys.restaurantMenuReferenceOptions(),
  queryKeys.restaurantOptions(),
  queryKeys.storeOptions(),
];

// Stale after 15 seconds: queues of work waiting on someone.
export const liveQueueKeys = [queryKeys.dashboardQueue(), queryKeys.transfersViewCounts()];
