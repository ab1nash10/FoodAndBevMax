import type {
  ApiList,
  ApiResponse,
  Hospital,
  HospitalSummary,
  Kitchen,
  LegalEntity,
  Store,
} from '@aahar/api-client';
import type { ZodType } from 'zod';
import {
  activeStatus,
  fetchAllPages,
  nameKey,
  type CsvColumn,
  type CsvRowImporter,
} from '@/components/csv-import-export';
import {
  getLocationCode,
  onlinePaymentOptions,
  toHospitalFormDefaults,
  toHospitalInput,
} from '@/components/organization/shared/locations';
import {
  hospitalSchema,
  kitchenSchema,
  storeSchema,
} from '@/components/organization/shared/schemas';
import type { organizationApi } from '@/lib/api';
import { getCitiesForState, INDIAN_STATES } from '@/lib/india-locations';

// Export and Import for the organisation masters. Export writes the columns below; Import reads
// the same file back, row by row through the normal API, so every check the form makes applies.

export type ImportApi = Pick<
  typeof organizationApi,
  | 'createHospital'
  | 'createKitchen'
  | 'createLegalEntity'
  | 'createStore'
  | 'listHospitals'
  | 'listKitchens'
  | 'listLegalEntities'
  | 'listStores'
  | 'updateHospital'
  | 'updateKitchen'
  | 'updateLegalEntity'
  | 'updateStore'
>;

const statusOf = (record: { isActive: boolean }) => (record.isActive ? 'Active' : 'Inactive');

const statusColumn = {
  example: 'Active',
  header: 'Status',
  hint: 'Active or Inactive only. Blank: active when added, unchanged on an update.',
  value: statusOf,
};

/** How an entity is named on screen: its site ("MSSH SKT"), else the company. */
const entityLabel = (entity: LegalEntity) => entity.locationName || entity.entityName;

/** The form's own schema on a row; its first problem is the row's error, worded as the form's. */
function checked<T>(schema: ZodType<T>, values: unknown): T {
  const result = schema.safeParse(values);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'This row is not valid.');
  }

  return result.data;
}

const allLocations = (api: ImportApi) =>
  fetchAllPages((page) => api.listHospitals({ limit: 100, page }));

// Locations -------------------------------------------------------------------------------------

export function locationColumns(
  entities: Map<string, LegalEntity> | undefined,
): Array<CsvColumn<Hospital>> {
  return [
    {
      example: 'SKT',
      header: 'Location code',
      hint: 'Up to 50 characters. An existing location’s code updates it; a new code adds a location. No two locations may share a code.',
      required: true,
      value: getLocationCode,
    },
    {
      example: 'Max Super Speciality Hospital, Saket',
      header: 'Title',
      hint: 'Up to 255 characters.',
      required: true,
      value: (location) => location.title,
    },
    {
      example: 'Max Saket',
      header: 'Display name',
      hint: 'Up to 255 characters. Blank: the Title is shown.',
      value: (location) => location.displayName,
    },
    {
      example: 'SKT',
      header: 'Invoice prefix',
      hint: 'Up to 50 characters. No two locations may share an invoice prefix.',
      value: (location) => location.invoicePrefix,
    },
    {
      header: 'Address',
      hint: 'Up to 500 characters.',
      value: (location) => location.address,
    },
    {
      example: 'Delhi',
      header: 'State',
      hint: 'An Indian state or union territory, named as in the location form.',
      required: true,
      value: (location) => location.state,
    },
    {
      example: 'New Delhi',
      header: 'City',
      hint: 'A city of that state, named as in the location form’s list.',
      required: true,
      value: (location) => location.city,
    },
    {
      example: '110017',
      header: 'Postal code',
      hint: '6 digits.',
      value: (location) => location.postalCode,
    },
    {
      header: 'Latitude',
      hint: 'Up to 50 characters.',
      value: (location) => location.latitude,
    },
    {
      header: 'Longitude',
      hint: 'Up to 50 characters.',
      value: (location) => location.longitude,
    },
    { header: 'Area', hint: 'Up to 50 characters.', value: (location) => location.area },
    {
      header: 'IP address',
      hint: 'A valid IPv4 or IPv6 address.',
      value: (location) => location.ipAddress,
    },
    {
      example: 'MSSH SKT',
      header: 'Entity',
      hint: 'An active entity, by its Location name (or its Entity name when it has none). That name must belong to one entity only. Blank: not linked to an entity.',
      value: (location) => {
        const entity = location.legalEntityId ? entities?.get(location.legalEntityId) : undefined;

        return entity ? entityLabel(entity) : '';
      },
    },
    {
      example: 'None',
      header: 'Online payment option',
      hint: 'None, PayU or RazorPay only. Blank: None when added, unchanged on an update.',
      value: (location) =>
        onlinePaymentOptions.find((option) => option.value === location.onlinePaymentOption)?.label,
    },
    {
      header: 'Address for visiting card',
      hint: 'Up to 500 characters.',
      value: (location) => location.visitingCardAddress,
    },
    statusColumn,
  ];
}

export const locationMatching =
  'A row with an existing Location code updates that location; a new code adds one. On an update a blank cell clears that field, as emptying it on the form does; payment gateway keys are not in the file and stay as they are.';

/**
 * A row with a location's code updates that location; a new code adds one. A blank cell clears
 * that field, as an emptied box on the form does. Gateway keys are not in the file: a location
 * keeps its own.
 */
export async function startLocationImport(api: ImportApi): Promise<CsvRowImporter> {
  const [locations, entities] = await Promise.all([
    allLocations(api),
    fetchAllPages((page) => api.listLegalEntities({ limit: 100, page })),
  ]);
  const byCode = new Map(
    locations.map((location) => [getLocationCode(location).toUpperCase(), location]),
  );

  return async (cells) => {
    const code = cells('Location code').toUpperCase();

    if (!code) {
      throw new Error('Location code is required.');
    }

    const match = byCode.get(code);
    // The form picks state and city from lists, so the file must use one of their names.
    const stateCell = cells('State');
    const state = INDIAN_STATES.find((option) => nameKey(option) === nameKey(stateCell));

    if (stateCell && !state) {
      throw new Error('State must be an Indian state or union territory, e.g. Delhi.');
    }

    const cityCell = cells('City');
    const cities = getCitiesForState(state);
    const city = cities.length
      ? cities.find((option) => nameKey(option) === nameKey(cityCell))
      : cityCell;

    if (cityCell && !city) {
      throw new Error(`City ${cityCell} is not in ${state}.`);
    }

    const entityCell = cells('Entity');
    const named = entities.filter((entity) => nameKey(entityLabel(entity)) === nameKey(entityCell));

    if (entityCell && named.length === 0) {
      throw new Error(`No entity is named ${entityCell}.`);
    }

    if (named.length > 1) {
      throw new Error(`Several entities are named ${entityCell}; give each its own location name.`);
    }

    const paymentCell = cells('Online payment option');
    const payment = onlinePaymentOptions.find(
      (option) => nameKey(option.label) === nameKey(paymentCell),
    );

    if (paymentCell && !payment) {
      throw new Error('Online payment option must be None, PayU or RazorPay.');
    }

    const input = toHospitalInput(
      checked(hospitalSchema, {
        ...toHospitalFormDefaults(match),
        address: cells('Address'),
        area: cells('Area'),
        city: city ?? '',
        displayName: cells('Display name'),
        invoicePrefix: cells('Invoice prefix'),
        ipAddress: cells('IP address'),
        isActive: activeStatus(cells('Status'), match?.isActive ?? true),
        latitude: cells('Latitude'),
        legalEntityId: named[0]?.id ?? '',
        locationCode: code,
        longitude: cells('Longitude'),
        onlinePaymentOption: payment?.value ?? match?.onlinePaymentOption ?? 'NONE',
        postalCode: cells('Postal code'),
        state: state ?? '',
        title: cells('Title'),
        visitingCardAddress: cells('Address for visiting card'),
      }),
    );

    if (match) {
      await api.updateHospital(match.id, input);

      return 'updated';
    }

    const { data } = await api.createHospital(input);

    // A second row with this code updates the location just added.
    byCode.set(code, data);

    return 'created';
  };
}

// Entities --------------------------------------------------------------------------------------

export const entityColumns: Array<CsvColumn<LegalEntity>> = [
  {
    example: '07AADCM0815B1ZQ',
    header: 'GST number',
    hint: 'A valid 15-character GSTIN, e.g. 07AADCM0815B1ZQ. Spaces are ignored.',
    required: true,
    value: (entity) => entity.gstNumber,
  },
  {
    example: 'MSSH SKT',
    header: 'Location name',
    hint: 'The site the entity bills for. Up to 100 characters.',
    required: true,
    value: (entity) => entity.locationName,
  },
  {
    example: 'MAX HEALTHCARE INSTITUTE LIMITED',
    header: 'Entity name',
    hint: 'Up to 255 characters.',
    required: true,
    value: (entity) => entity.entityName,
  },
  {
    example: 'N 110, Panchsheel Park, New Delhi- 110017',
    header: 'Entity address',
    hint: 'Up to 500 characters. No two entities may have the same GST number and address.',
    required: true,
    value: (entity) => entity.entityAddress,
  },
  statusColumn,
];

export const entityMatching =
  'An entity is found by its GST number and Location name together: a row with an existing pair updates that entity; any other pair adds one. One GST number may bill for several sites.';

/**
 * An entity has no code, so its GST number and location name find it: one company (one GSTIN)
 * can bill for several sites. Any other pair adds an entity.
 */
export async function startEntityImport(api: ImportApi): Promise<CsvRowImporter> {
  const existing = await fetchAllPages((page) => api.listLegalEntities({ limit: 100, page }));
  const keyOf = (gstNumber: string, locationName: string | null) =>
    `${gstNumber}|${nameKey(locationName ?? '')}`;
  const byKey = new Map(
    existing.map((entity) => [keyOf(entity.gstNumber, entity.locationName), entity]),
  );

  return async (cells) => {
    // Stored without spaces, in capitals, as the server keeps it.
    const gstNumber = cells('GST number').replace(/\s+/g, '').toUpperCase();

    if (!gstNumber) {
      throw new Error('GST number is required.');
    }

    const locationName = cells('Location name');
    const key = keyOf(gstNumber, locationName);
    const match = byKey.get(key);
    const body = {
      entityAddress: cells('Entity address'),
      entityName: cells('Entity name'),
      gstNumber,
      isActive: activeStatus(cells('Status'), match?.isActive ?? true),
      locationName,
    };

    if (match) {
      await api.updateLegalEntity(match.id, body);

      return 'updated';
    }

    const { data } = await api.createLegalEntity(body);

    byKey.set(key, data);

    return 'created';
  };
}

// Stores and kitchens ---------------------------------------------------------------------------

function siteColumns<T extends { hospital: HospitalSummary; isActive: boolean }>(
  noun: 'Kitchen' | 'Store',
  codeOf: (site: T) => string,
  nameOf: (site: T) => string,
): Array<CsvColumn<T>> {
  return [
    {
      header: `${noun} code`,
      hint: `Blank adds a new ${noun.toLowerCase()}, which gets the next code. A code updates that ${noun.toLowerCase()} and must be an existing ${noun.toLowerCase()}’s code.`,
      value: codeOf,
    },
    {
      example: noun === 'Store' ? 'Main Store' : 'Main Kitchen',
      header: `${noun} name`,
      hint: 'Up to 150 characters.',
      required: true,
      value: nameOf,
    },
    {
      example: 'SKT',
      header: 'Location code',
      hint: `An existing location’s code. Required when adding a ${noun.toLowerCase()}. A ${noun.toLowerCase()} stays at its location: on an update, leave it blank or give its own location.`,
      value: (site) => site.hospital.hospitalCode,
    },
    {
      header: 'Location',
      readOnly: true,
      value: (site) => site.hospital.displayName || site.hospital.hospitalName,
    },
    statusColumn,
  ];
}

export const siteMatching = (noun: 'kitchen' | 'store') =>
  `A row with a ${noun === 'store' ? 'Store' : 'Kitchen'} code updates that ${noun}'s name and status; a blank code adds a ${noun} at the row's Location code.`;

/**
 * A row with a code updates that store or kitchen (name and status: it stays at its location);
 * a blank code adds one at the row's location, and it gets the next code.
 */
async function startSiteImport<T extends { hospitalId: string; id: string; isActive: boolean }>(
  api: ImportApi,
  noun: 'kitchen' | 'store',
  site: {
    codeOf: (record: T) => string;
    list: (page: number) => Promise<ApiResponse<ApiList<T>>>;
    /** Checks the row with the form's schema, then saves it. */
    save: (
      match: T | undefined,
      row: { hospitalId: string; isActive: boolean; name: string },
    ) => Promise<unknown>;
  },
): Promise<CsvRowImporter> {
  const Noun = noun === 'store' ? 'Store' : 'Kitchen';
  const [records, locations] = await Promise.all([fetchAllPages(site.list), allLocations(api)]);
  const byCode = new Map(records.map((record) => [site.codeOf(record).toUpperCase(), record]));
  const locationByCode = new Map(
    locations.map((location) => [getLocationCode(location).toUpperCase(), location]),
  );

  return async (cells) => {
    const code = cells(`${Noun} code`).toUpperCase();
    const match = code ? byCode.get(code) : undefined;

    if (code && !match) {
      throw new Error(`No ${noun} has code ${code}. Leave ${Noun} code blank to add a ${noun}.`);
    }

    const locationCode = cells('Location code').toUpperCase();
    const location = locationCode ? locationByCode.get(locationCode) : undefined;

    if (locationCode && !location) {
      throw new Error(`No location has code ${locationCode}.`);
    }

    if (match && location && location.id !== match.hospitalId) {
      throw new Error(`A ${noun} stays at its location; ${code} can't move to ${locationCode}.`);
    }

    await site.save(match, {
      hospitalId: match?.hospitalId ?? location?.id ?? '',
      isActive: activeStatus(cells('Status'), match?.isActive ?? true),
      name: cells(`${Noun} name`),
    });

    return match ? 'updated' : 'created';
  };
}

export const storeColumns = siteColumns<Store>(
  'Store',
  (store) => store.storeCode,
  (store) => store.storeName,
);

export const kitchenColumns = siteColumns<Kitchen>(
  'Kitchen',
  (kitchen) => kitchen.kitchenCode,
  (kitchen) => kitchen.kitchenName,
);

export const startStoreImport = (api: ImportApi) =>
  startSiteImport<Store>(api, 'store', {
    codeOf: (store) => store.storeCode,
    list: (page) => api.listStores({ limit: 100, page }),
    save: (match, row) => {
      const body = checked(storeSchema, { ...row, storeName: row.name });

      return match
        ? api.updateStore(match.id, { isActive: body.isActive, storeName: body.storeName })
        : api.createStore(body);
    },
  });

export const startKitchenImport = (api: ImportApi) =>
  startSiteImport<Kitchen>(api, 'kitchen', {
    codeOf: (kitchen) => kitchen.kitchenCode,
    list: (page) => api.listKitchens({ limit: 100, page }),
    save: (match, row) => {
      const body = checked(kitchenSchema, { ...row, kitchenName: row.name });

      return match
        ? api.updateKitchen(match.id, { isActive: body.isActive, kitchenName: body.kitchenName })
        : api.createKitchen(body);
    },
  });
