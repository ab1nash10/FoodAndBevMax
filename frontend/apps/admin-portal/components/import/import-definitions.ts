import type { ApiResponse, Employee, ImportRequest, ImportResult } from '@aahar/api-client';
import type { QueryClient } from '@tanstack/react-query';
import type { CsvColumn } from '@/components/csv-import-export';
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
  hint: 'Active or Inactive only. Blank: active when added, unchanged on an update.',
};

// The headers are the Export's, so an exported file can be edited and imported back.
export const itemImport: ImportDefinition = {
  columns: [
    {
      example: '',
      field: 'itemCode',
      header: 'Item code',
      hint: 'Blank adds a new item, which gets the next code. A code updates that item and must be an existing item’s code. Each code at most once in the file.',
    },
    {
      example: 'Masala Dosa',
      field: 'itemName',
      header: 'Item name',
      hint: 'Up to 255 characters, with at least one letter or number. Duplicate names are not allowed: no other item, and no other row in the file, may have the same name. Case, spaces and punctuation are ignored, so “Masala Dosa” and “masala-dosa” count as the same.',
      required: true,
    },
    {
      example: 'Veg',
      field: 'type',
      header: 'Food type',
      hint: 'Veg, Non-veg or Egg only.',
      required: true,
    },
    { example: '2106', field: 'hsnCode', header: 'HSN code', hint: 'Up to 50 characters.' },
    {
      example: '15',
      field: 'preparationTimeMinutes',
      header: 'Prep time (min)',
      hint: 'Whole minutes, 0 or more.',
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
      hint: 'Up to 100 characters. Updates the employee with this code, or adds one. Each code at most once in the file. A code that belonged to a deleted employee cannot be used again.',
      required: true,
    },
    {
      example: 'Ravi Kumar',
      field: 'employeeName',
      header: 'Employee name',
      hint: 'Up to 255 characters.',
      required: true,
    },
    {
      example: 'On-Role',
      field: 'employmentType',
      header: 'Employment type',
      hint: 'On-Role or Off-Role only.',
      required: true,
    },
    {
      example: 'Nursing',
      field: 'department',
      header: 'Department',
      hint: 'Up to 255 characters.',
    },
    {
      example: 'Staff Nurse',
      field: 'designation',
      header: 'Designation',
      hint: 'Up to 255 characters.',
    },
    { example: '9876543210', field: 'mobile', header: 'Mobile', hint: 'Up to 20 characters.' },
    {
      example: 'ravi.kumar@maxhealthcare.com',
      field: 'officialEmail',
      header: 'Official email',
      hint: 'A valid email address, up to 255 characters.',
    },
    { example: 'Male', field: 'gender', header: 'Gender', hint: 'Male or Female only.' },
    {
      example: '1990-04-12',
      field: 'birthDate',
      header: 'Birth date',
      hint: 'A real date, as YYYY-MM-DD or DD-MM-YYYY.',
    },
    {
      example: '2024-01-15',
      field: 'joiningDate',
      header: 'Joining date',
      hint: 'A real date, as YYYY-MM-DD or DD-MM-YYYY.',
    },
    {
      example: 'L2',
      field: 'employeeLevel',
      header: 'Employee level',
      hint: 'Up to 100 characters.',
    },
    {
      example: '',
      field: 'reportingManagerCode',
      header: 'Reporting manager code',
      hint: 'The Employee code of the employee they report to, who must already exist (not one this file adds). Not the employee themself, nor someone who reports to them.',
    },
    {
      example: '',
      field: 'locationCode',
      header: 'Location code',
      hint: 'Where they work: an active location you have access to. Blank: a new employee is shared by every location (Super Admin only); an existing one stays where it is.',
    },
    {
      example: 'Yes',
      field: 'eligibleForDiscount',
      header: 'Eligible for discount',
      hint: 'Yes or No only. Blank: yes when added.',
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

/** Each import column's value for an employee, in the words the import reads back. */
const employeeCells: Record<string, CsvColumn<Employee>['value']> = {
  birthDate: (employee) => employee.birthDate,
  department: (employee) => employee.department,
  designation: (employee) => employee.designation,
  eligibleForDiscount: (employee) => (employee.eligibleForDiscount ? 'Yes' : 'No'),
  employeeCode: (employee) => employee.employeeCode,
  employeeLevel: (employee) => employee.employeeLevel,
  employeeName: (employee) => employee.employeeName,
  employmentType: (employee) =>
    employee.employmentType && (employee.employmentType === 'ON_ROLL' ? 'On-Role' : 'Off-Role'),
  gender: (employee) => employee.gender && (employee.gender === 'MALE' ? 'Male' : 'Female'),
  isActive: (employee) => (employee.isActive ? 'Active' : 'Inactive'),
  joiningDate: (employee) => employee.joiningDate,
  locationCode: (employee) => employee.hospital?.hospitalCode,
  mobile: (employee) => employee.mobile,
  officialEmail: (employee) => employee.officialEmail,
  reportingManagerCode: (employee) => employee.reportingManager?.employeeCode,
};

/** The import's own columns, so an exported file can be edited and imported back. */
export const employeeExportColumns: Array<CsvColumn<Employee>> = employeeImport.columns.map(
  (column) => ({ header: column.header, value: employeeCells[column.field] ?? (() => '') }),
);

export const menuImport: ImportDefinition = {
  columns: [
    {
      example: 'RES0001',
      field: 'restaurantCode',
      header: 'Restaurant code',
      hint: 'An existing restaurant at a location you have access to.',
      required: true,
    },
    {
      example: '',
      field: 'locationCode',
      header: 'Location code',
      hint: 'Needed only when two of your locations use the same restaurant code.',
    },
    {
      example: 'ITM0001',
      field: 'itemCode',
      header: 'Item code',
      hint: 'An existing item’s code. The item must already be mapped to a kitchen or store at the restaurant’s location (Item Mapping). Each restaurant, item and category at most once in the file.',
      required: true,
    },
    {
      example: 'Snacks',
      field: 'category',
      header: 'Category',
      hint: "An existing category name. Needed when the item is mapped, or on the menu, under more than one; blank uses the item's only one.",
    },
    {
      example: 'KIT0001',
      field: 'kitchenCode',
      header: 'Kitchen code',
      hint: "The kitchen that makes it, at the restaurant's location. Fill this or Store code; both blank uses the item's only mapping at the location.",
    },
    {
      example: '',
      field: 'storeCode',
      header: 'Store code',
      hint: "The store that stocks it, at the restaurant's location.",
    },
    {
      example: 'Both',
      field: 'serveAt',
      header: 'Serve at',
      hint: 'Both, Room only or Counter only. Blank: both when added, unchanged on an update.',
    },
    {
      example: '40',
      field: 'price',
      header: 'Price',
      hint: 'Counter price: a number, 0 or more, up to 2 decimals. Required unless served in rooms only.',
    },
    {
      example: '60',
      field: 'roomPrice',
      header: 'In-room price',
      hint: 'A number, 0 or more, up to 2 decimals. Required unless served at the counter only.',
    },
    { example: '5', field: 'gstPercent', header: 'GST %', hint: '0, 5, 12 or 18 only.' },
    { example: 'No', field: 'isGstInclusive', header: 'GST inclusive', hint: 'Yes or No only.' },
    { example: 'No', field: 'isDiscountable', header: 'Discountable', hint: 'Yes or No only.' },
    {
      example: 'No',
      field: 'isFeatured',
      header: 'Featured',
      hint: 'Yes or No only: shown first on the kiosk.',
    },
    {
      example: '',
      field: 'subCode',
      header: 'Sub-Code',
      hint: 'A second code for the item, up to 50 characters.',
    },
    { example: 'Yes', field: 'isAvailable', header: 'Available', hint: 'Yes or No only.' },
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
