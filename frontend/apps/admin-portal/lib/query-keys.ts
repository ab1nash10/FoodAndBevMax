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
  inventoryAllKitchens: key('inventory-all-kitchens'),
  inventoryAllRestaurants: key('inventory-all-restaurants'),
  inventoryAllStores: key('inventory-all-stores'),
  inventoryHospitals: key('inventory-hospitals'),
  inventoryItems: key('inventory-items'),
  inventoryKitchens: key('inventory-kitchens'),
  inventoryRestaurants: key('inventory-restaurants'),
  inventoryStoreItems: key('inventory-store-items'),
  inventoryStores: key('inventory-stores'),
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
  kitchenHospitals: key('kitchen-hospitals'),
  kitchenKitchens: key('kitchen-kitchens'),
  kitchenProductionItems: key('kitchen-production-items'),
  kitchenProductions: key('kitchen-productions'),
  kitchenProductionsToday: key('kitchen-productions', 'today'),
  kitchenStock: key('kitchen-stock'),
  kitchenStockItems: key('kitchen-stock-items'),
  kitchenStockLedgers: key('kitchen-stock-ledgers'),

  // Organization: locations, stores, kitchens, restaurants, counters
  counters: key('counters'),
  hospital: key('hospital'),
  hospitalLocations: key('hospital-locations'),
  hospitalOptions: key('hospital-options'),
  hospitals: key('hospitals'),
  kitchenOptions: key('kitchen-options'),
  kitchens: key('kitchens'),
  locationOptions: key('location-options'),
  locationPicker: key('location-picker'),
  locations: key('locations'),
  restaurant: key('restaurant'),
  restaurantOptions: key('restaurant-options'),
  restaurants: key('restaurants'),
  storeOptions: key('store-options'),
  stores: key('stores'),

  // Catalog: items, prices, time slots, mappings and menus
  employees: key('employees'),
  itemCategories: key('item-categories'),
  itemCategoryOptions: key('item-category-options'),
  itemMappings: key('item-mappings'),
  itemOptions: key('item-options'),
  items: key('items'),
  mappingHospitalOptions: key('mapping-hospital-options'),
  restaurantMenuReferenceOptions: key('restaurant-menu-reference-options'),
  restaurantMenus: key('restaurant-menus'),

  // POS
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

  // Shell: dashboard, notifications, search, location context
  commandPaletteSearch: key('command-palette', 'search'),
  dashboard: key('dashboard'),
  dashboardActivity: key('dashboard', 'activity'),
  dashboardExpiring: key('dashboard', 'expiring'),
  dashboardNavCounts: key('dashboard', 'nav-counts'),
  dashboardQueue: key('dashboard', 'queue'),
  dashboardSetup: key('dashboard', 'setup'),
  dashboardStats: key('dashboard', 'stats'),
  globalLocationContextActiveLocations: key('global-location-context', 'active-locations'),
  notifications: key('notifications'),
  notificationsList: key('notifications', 'list'),
  notificationsUnreadCount: key('notifications', 'unread-count'),
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
  queryKeys.locationOptions(),
  queryKeys.paymentMachinePosDeviceOptions(),
  queryKeys.restaurantMenuReferenceOptions(),
  queryKeys.restaurantOptions(),
  queryKeys.storeOptions(),
];

// Stale after 15 seconds: queues of work waiting on someone.
export const liveQueueKeys = [queryKeys.dashboardQueue(), queryKeys.transfersViewCounts()];
