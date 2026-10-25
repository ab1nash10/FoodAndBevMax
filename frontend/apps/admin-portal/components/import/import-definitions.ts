import type { ApiResponse, ImportRequest, ImportResult } from '@aahar/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { organizationApi } from '@/lib/api';
import type { ImportColumn } from '@/lib/import-file';
import { invalidateEmployeeQueries, invalidateItemQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';

export interface ImportDefinition {
  columns: ImportColumn[];
  /** Template file name, without the extension. */
  filename: string;
  /** How a row finds the record it updates. */
  matching: string;
  /** Plural, lower case, e.g. "items". */
  noun: string;
  /** Either lets a user import: the server checks each row against the one it needs. */
  permissions: [create: string, update: string];
  refresh: (queryClient: QueryClient) => void;
  send: (body: ImportRequest) => Promise<ApiResponse<ImportResult>>;
}

const status: ImportColumn = {
  example: 'Active',
  field: 'isActive',
  header: 'Status',
  hint: 'Active or Inactive. Blank: active when added, unchanged on an update.',
};

// The headers are the Export's, so an exported file can be edited and imported back.
export const itemImport: ImportDefinition = {
  columns: [
    {
      example: '',
      field: 'itemCode',
      header: 'Item code',
      hint: 'Blank adds a new item (it gets the next code); a code updates that item.',
    },
    {
      example: 'Masala Dosa',
      field: 'itemName',
      header: 'Item name',
      hint: 'Unique across the catalogue.',
      required: true,
    },
    {
      example: 'Veg',
      field: 'type',
      header: 'Food type',
      hint: 'Veg, Non-veg or Egg.',
      required: true,
    },
    { example: '2106', field: 'hsnCode', header: 'HSN code', hint: 'Optional.' },
    {
      example: '15',
      field: 'preparationTimeMinutes',
      header: 'Prep time (min)',
      hint: 'Whole minutes. Optional.',
    },
    status,
  ],
  filename: 'items-import-template',
  matching: 'A row with an Item code updates that item; a row without one adds an item.',
  noun: 'items',
  permissions: ['ITEM_CREATE', 'ITEM_UPDATE'],
  refresh: invalidateItemQueries,
  send: (body) => organizationApi.importItems(body),
};

export const employeeImport: ImportDefinition = {
  columns: [
    {
      example: 'EMP1001',
      field: 'employeeCode',
      header: 'Employee code',
      hint: 'Updates the employee with this code, or adds one.',
      required: true,
    },
    {
      example: 'Ravi Kumar',
      field: 'employeeName',
      header: 'Employee name',
      hint: '',
      required: true,
    },
    {
      example: 'On roll',
      field: 'employmentType',
      header: 'Employment type',
      hint: 'On roll or Outsourced.',
      required: true,
    },
    { example: 'Nursing', field: 'department', header: 'Department', hint: 'Optional.' },
    { example: 'Staff Nurse', field: 'designation', header: 'Designation', hint: 'Optional.' },
    { example: '9876543210', field: 'mobile', header: 'Mobile', hint: 'Optional.' },
    {
      example: '',
      field: 'locationCode',
      header: 'Location code',
      hint: 'Where they work. Blank: a new employee is shared by every location (Super Admin only); an existing one stays where it is.',
    },
    {
      example: 'Yes',
      field: 'eligibleForDiscount',
      header: 'Eligible for discount',
      hint: 'Yes or No. Blank: yes when added.',
    },
    status,
  ],
  filename: 'employees-import-template',
  matching: 'A row updates the employee with its Employee code, or adds one.',
  noun: 'employees',
  permissions: ['EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE'],
  refresh: invalidateEmployeeQueries,
  send: (body) => organizationApi.importEmployees(body),
};

export const menuImport: ImportDefinition = {
  columns: [
    {
      example: 'RES0001',
      field: 'restaurantCode',
      header: 'Restaurant code',
      hint: '',
      required: true,
    },
    {
      example: '',
      field: 'locationCode',
      header: 'Location code',
      hint: 'Only when two of your locations use the same restaurant code.',
    },
    { example: 'ITM0001', field: 'itemCode', header: 'Item code', hint: '', required: true },
    {
      example: 'Snacks',
      field: 'category',
      header: 'Category',
      hint: "Needed when the item is mapped, or on the menu, under more than one; blank uses the item's only one.",
    },
    {
      example: 'KIT0001',
      field: 'kitchenCode',
      header: 'Kitchen code',
      hint: "The kitchen that makes it. Fill this or Store code; both blank uses the item's only mapping at the location.",
    },
    { example: '', field: 'storeCode', header: 'Store code', hint: 'The store that stocks it.' },
    {
      example: 'Both',
      field: 'serveAt',
      header: 'Serve at',
      hint: 'Both, Room only or Counter only. Blank: both when added.',
    },
    {
      example: '40',
      field: 'price',
      header: 'Price',
      hint: 'Counter price, required unless served in rooms only.',
    },
    {
      example: '60',
      field: 'roomPrice',
      header: 'In-room price',
      hint: 'Required unless served at the counter only.',
    },
    { example: '5', field: 'gstPercent', header: 'GST %', hint: '0, 5, 12 or 18.' },
    { example: 'No', field: 'isGstInclusive', header: 'GST inclusive', hint: 'Yes or No.' },
    { example: 'No', field: 'isDiscountable', header: 'Discountable', hint: 'Yes or No.' },
    {
      example: 'No',
      field: 'isFeatured',
      header: 'Featured',
      hint: 'Yes or No: shown first on the kiosk.',
    },
    { example: '', field: 'subCode', header: 'Sub-Code', hint: 'A second code for the item.' },
    { example: 'Yes', field: 'isAvailable', header: 'Available', hint: 'Yes or No.' },
    status,
  ],
  filename: 'menu-prices-import-template',
  matching:
    "A row updates the restaurant's menu entry for the item (under its Category), or adds the item to the menu. Blank cells keep an entry's values.",
  noun: 'menu items',
  permissions: ['RESTAURANT_MENU_CREATE', 'RESTAURANT_MENU_UPDATE'],
  refresh: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenus() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenuReferenceOptions() });
  },
  send: (body) => organizationApi.importRestaurantMenus(body),
};
