import type { Hospital, Kitchen, LegalEntity, Store } from '@aahar/api-client';
import { describe, expect, test } from 'vitest';
import type { CsvCells } from '@/components/csv-import-export';
import {
  entityColumns,
  kitchenColumns,
  locationColumns,
  startEntityImport,
  startKitchenImport,
  startLocationImport,
  startStoreImport,
  storeColumns,
  type ImportApi,
} from './import-export';

const SAKET_ID = 'b9e16d28-5c46-4d93-8365-e06ea6b58c6e';
const smart = {
  createdAt: '',
  entityAddress: 'Saket, New Delhi',
  entityName: 'Max Smart Super Speciality Hospital',
  gstNumber: '07AADCM0815B1ZQ',
  id: 'entity-smart',
  isActive: true,
  locationName: 'MSSH SKT',
  updatedAt: '',
} satisfies LegalEntity;
const saket = {
  address: null,
  area: null,
  billPrefix: 'SKT',
  city: 'New Delhi',
  displayName: 'Max Saket',
  hospitalCode: 'SKT',
  hospitalName: 'Saket',
  id: SAKET_ID,
  invoicePrefix: 'SKT',
  ipAddress: null,
  isActive: true,
  latitude: null,
  legalEntityId: 'entity-smart',
  locationCode: 'SKT',
  longitude: null,
  onlinePaymentOption: 'RAZORPAY',
  payuClientId: null,
  payuClientSecret: null,
  payuMerchantId: null,
  postalCode: '110017',
  razorpayKeyId: 'rzp_live_skt',
  razorpayKeySecret: '••••cret',
  state: 'Delhi',
  title: 'Saket',
  visitingCardAddress: null,
} as unknown as Hospital;
const mainStore = {
  hospital: saket,
  hospitalId: SAKET_ID,
  id: 'store-1',
  isActive: true,
  storeCode: 'STR0001',
  storeName: 'Main Store',
} as unknown as Store;
const mainKitchen = {
  hospital: saket,
  hospitalId: SAKET_ID,
  id: 'kitchen-1',
  isActive: true,
  kitchenCode: 'KIT0001',
  kitchenName: 'Main Kitchen',
} as unknown as Kitchen;

/** A fake API holding one of each record; every save is kept, and returns what was sent. */
function fakeApi() {
  const saves: Array<[string, ...unknown[]]> = [];
  const page = <T>(items: T[]) =>
    Promise.resolve({ data: { items, meta: { limit: 100, page: 1, total: 1, totalPages: 1 } } });
  const saved = (name: string, ...args: unknown[]) => {
    saves.push([name, ...args]);
    return Promise.resolve({ data: { id: `new-${saves.length}`, ...(args.at(-1) as object) } });
  };
  const api = {
    createHospital: (body: unknown) => saved('createHospital', body),
    createKitchen: (body: unknown) => saved('createKitchen', body),
    createLegalEntity: (body: unknown) => saved('createLegalEntity', body),
    createStore: (body: unknown) => saved('createStore', body),
    listHospitals: () => page([saket]),
    listKitchens: () => page([mainKitchen]),
    listLegalEntities: () => page([smart]),
    listStores: () => page([mainStore]),
    updateHospital: (id: string, body: unknown) => saved('updateHospital', id, body),
    updateKitchen: (id: string, body: unknown) => saved('updateKitchen', id, body),
    updateLegalEntity: (id: string, body: unknown) => saved('updateLegalEntity', id, body),
    updateStore: (id: string, body: unknown) => saved('updateStore', id, body),
  } as unknown as ImportApi;

  return { api, saves };
}

/** A row as the exported file has it: the cell under each header. */
const rowOf =
  <T>(
    columns: Array<{ header: string; value: (row: T) => number | string | null | undefined }>,
    record: T,
  ) =>
  (changes: Record<string, string> = {}): CsvCells =>
  (header) =>
    changes[header] ??
    String(columns.find((column) => column.header === header)?.value(record) ?? '');

describe('locations', () => {
  const columns = locationColumns(new Map([[smart.id, smart]]));
  const row = rowOf(columns, saket);

  test('export names the entity and payment option as the form shows them', () => {
    expect(columns.map((column) => column.header)).toEqual([
      'Location code',
      'Title',
      'Display name',
      'Invoice prefix',
      'Address',
      'State',
      'City',
      'Postal code',
      'Latitude',
      'Longitude',
      'Area',
      'IP address',
      'Entity',
      'Online payment option',
      'Address for visiting card',
      'Status',
    ]);
    expect(row()('Entity')).toBe('MSSH SKT');
    expect(row()('Online payment option')).toBe('RazorPay');
  });

  test('a row with a known code updates it, keeping gateway keys; a new code adds one', async () => {
    const { api, saves } = fakeApi();
    const importRow = await startLocationImport(api);

    expect(await importRow(row({ City: 'new delhi', State: 'delhi', Title: 'Saket East' }))).toBe(
      'updated',
    );
    expect(
      await importRow(
        row({
          Entity: '',
          'Location code': 'vsl',
          'Online payment option': 'none',
          Title: 'Vaishali',
        }),
      ),
    ).toBe('created');

    const [, id, update] = saves[0] as [string, string, Record<string, unknown>];
    expect(id).toBe(SAKET_ID);
    expect(update).toMatchObject({
      city: 'New Delhi',
      legalEntityId: 'entity-smart',
      onlinePaymentOption: 'RAZORPAY',
      razorpayKeyId: 'rzp_live_skt',
      state: 'Delhi',
      title: 'Saket East',
    });
    // The masked secret is never sent back, so the saved one stays.
    expect(update).not.toHaveProperty('razorpayKeySecret');
    expect(saves[1]?.[1]).toMatchObject({
      legalEntityId: null,
      locationCode: 'VSL',
      onlinePaymentOption: 'NONE',
      title: 'Vaishali',
    });
  });

  test('a row is checked as the form checks it', async () => {
    const { api } = fakeApi();
    const importRow = await startLocationImport(api);
    const refused = (changes: Record<string, string>) => importRow(row(changes));

    await expect(refused({ 'Location code': '' })).rejects.toThrow('Location code is required.');
    await expect(refused({ Title: '' })).rejects.toThrow('Title is required.');
    await expect(refused({ State: 'Atlantis' })).rejects.toThrow(
      'State must be an Indian state or union territory, e.g. Delhi.',
    );
    await expect(refused({ City: 'Mumbai' })).rejects.toThrow('City Mumbai is not in Delhi.');
    await expect(refused({ 'Postal code': '1100' })).rejects.toThrow(
      'Postal code must be 6 digits.',
    );
    await expect(refused({ Entity: 'Nobody' })).rejects.toThrow('No entity is named Nobody.');
    await expect(refused({ 'Online payment option': 'Paytm' })).rejects.toThrow(
      'Online payment option must be None, PayU or RazorPay.',
    );
  });
});

describe('entities', () => {
  const row = rowOf(entityColumns, smart);

  test('GST number and location name find the entity; another pair adds one', async () => {
    const { api, saves } = fakeApi();
    const importRow = await startEntityImport(api);

    expect(
      await importRow(
        row({ 'Entity address': 'Press Enclave Road', 'GST number': '07aadcm0815b1zq' }),
      ),
    ).toBe('updated');
    expect(await importRow(row({ 'Location name': 'MSSH PPG' }))).toBe('created');
    // A second row for the pair just added updates it rather than adding a twin.
    expect(await importRow(row({ 'Location name': 'mssh ppg', Status: 'Inactive' }))).toBe(
      'updated',
    );

    expect(saves.map(([name]) => name)).toEqual([
      'updateLegalEntity',
      'createLegalEntity',
      'updateLegalEntity',
    ]);
    expect(saves[0]?.[2]).toEqual({
      entityAddress: 'Press Enclave Road',
      entityName: smart.entityName,
      gstNumber: '07AADCM0815B1ZQ',
      isActive: true,
      locationName: 'MSSH SKT',
    });
    expect(saves[2]?.[2]).toMatchObject({ isActive: false });
  });

  test('a GST number is needed to find or add an entity', async () => {
    const importRow = await startEntityImport(fakeApi().api);

    await expect(importRow(row({ 'GST number': '' }))).rejects.toThrow('GST number is required.');
  });
});

describe('stores and kitchens', () => {
  test('the code finds the store; blank adds one at the location given', async () => {
    const { api, saves } = fakeApi();
    const row = rowOf(storeColumns, mainStore);
    const importRow = await startStoreImport(api);

    expect(storeColumns.map((column) => column.header)).toEqual([
      'Store code',
      'Store name',
      'Location code',
      'Location',
      'Status',
    ]);
    expect(await importRow(row({ 'Store name': 'Central Store', Status: 'Inactive' }))).toBe(
      'updated',
    );
    expect(
      await importRow(
        row({ 'Location code': 'skt', 'Store code': '', 'Store name': 'Bakery Store' }),
      ),
    ).toBe('created');
    expect(saves).toEqual([
      ['updateStore', 'store-1', { isActive: false, storeName: 'Central Store' }],
      ['createStore', { hospitalId: SAKET_ID, isActive: true, storeName: 'Bakery Store' }],
    ]);
  });

  test('a store keeps its location; unknown codes and locations are refused', async () => {
    const row = rowOf(storeColumns, mainStore);
    const importRow = await startStoreImport(fakeApi().api);

    await expect(importRow(row({ 'Location code': 'VSL' }))).rejects.toThrow(
      'No location has code VSL.',
    );
    await expect(importRow(row({ 'Store code': 'STR0404' }))).rejects.toThrow(
      'No store has code STR0404. Leave Store code blank to add a store.',
    );
    await expect(importRow(row({ 'Store code': '', 'Location code': '' }))).rejects.toThrow(
      'Select a location.',
    );
    await expect(importRow(row({ 'Store name': ' ' }))).rejects.toThrow('Store name is required.');
  });

  test('kitchens import the same way', async () => {
    const { api, saves } = fakeApi();
    const row = rowOf(kitchenColumns, mainKitchen);
    const importRow = await startKitchenImport(api);

    expect(kitchenColumns.map((column) => column.header)).toEqual([
      'Kitchen code',
      'Kitchen name',
      'Location code',
      'Location',
      'Status',
    ]);
    expect(await importRow(row({ 'Kitchen name': 'Hot Kitchen' }))).toBe('updated');
    expect(saves).toEqual([
      ['updateKitchen', 'kitchen-1', { isActive: true, kitchenName: 'Hot Kitchen' }],
    ]);
  });
});

describe('import templates', () => {
  // The Excel template's Instructions sheet is these hints: every column a file fills says its rules.
  test.each([
    ['locations', locationColumns(undefined), ['Location code', 'Title', 'State', 'City']],
    ['entities', entityColumns, ['GST number', 'Location name', 'Entity name', 'Entity address']],
    ['stores', storeColumns, ['Store name']],
    ['kitchens', kitchenColumns, ['Kitchen name']],
  ] as const)('every %s column the import reads has its rules', (_, columns, required) => {
    const importable = columns.filter((column) => !column.readOnly);

    expect(importable.filter((column) => !column.hint).map((column) => column.header)).toEqual([]);
    expect(importable.filter((column) => column.required).map((column) => column.header)).toEqual(
      required,
    );
  });
});
