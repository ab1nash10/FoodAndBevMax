import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { APIRequestContext } from '@playwright/test';

export const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

/** A setting from the repo's .env (the ERP key and secret the local API checks). */
export function env(name: string): string {
  const line = readFileSync('../../../.env', 'utf8')
    .split(/\r?\n/)
    .find((text) => text.startsWith(`${name}=`));
  return (line?.slice(name.length + 1) ?? '').replace(/^["']|["']$/g, '');
}

/** Calls the organization API as the signed-in e2e user; returns the response's data. */
export async function api<T>(
  request: APIRequestContext,
  method: 'GET' | 'PATCH' | 'POST',
  path: string,
  data?: object,
): Promise<T> {
  const session = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  const { accessToken } = JSON.parse(session.origins[0]?.localStorage[0]?.value ?? '{}') as {
    accessToken: string;
  };
  const response = await request.fetch(`${organizationApi}${path}`, {
    data,
    headers: { authorization: `Bearer ${accessToken}` },
    method,
  });
  if (!response.ok()) throw new Error(`${method} ${path}: ${await response.text()}`);
  return ((await response.json()) as { data: T }).data;
}

export async function list<T>(request: APIRequestContext, path: string): Promise<T[]> {
  return (await api<{ items: T[] }>(request, 'GET', path)).items;
}

/** India time as the ERP signs it: dd/MM/yyyy/HH/mm. */
function erpTimestamp(): string {
  const ist = new Date(Date.now() + 330 * 60_000);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(ist.getUTCDate())}/${two(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()}/${two(ist.getUTCHours())}/${two(ist.getUTCMinutes())}`;
}

/** The ERP's sample values for the fields every row must carry that a test does not care about. */
const sample = {
  'Discount/Extra Charges': '0',
  'HSN No': '998313',
  MRP: '15',
  'Tax Rate': 'IGST@18%',
  'Total Value': '9.257',
  UOM: 'No.',
  'Unit Rate': '9.80',
  issued_by: 'M030634',
  purchase_order: '392851',
  requisition: '918590',
  supplier: 'CAGR0008',
};

/**
 * Sends rows to POST /erp/grns signed as the ERP does: SHA-512 of api_key|GRN|timestamp|token.
 * Every field is required; the sample fills in what a row leaves out.
 */
export async function sendAsErp(request: APIRequestContext, rows: object[]) {
  const timestamp = erpTimestamp();
  const key = env('ERP_API_KEY');
  const text = [key, 'GRN', timestamp, env('ERP_API_SECRET')].join('|');

  return request.post(`${organizationApi}/erp/grns`, {
    data: JSON.stringify(rows.map((row) => ({ ...sample, ...row }))),
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'x-signature': createHash('sha512').update(text).digest('hex'),
      'x-timestamp': timestamp,
    },
  });
}

export type Store = { hospitalId: string; id: string; isActive: boolean; storeName: string };
export type StoreItem = {
  isActive: boolean;
  item: { itemCode: string; itemName: string };
  itemId: string;
  storeId: string;
};
export type Hospital = { hospitalCode: string; hospitalName: string; id: string };

/** An item set up in some location's Main Store, with that store and location. */
export async function mainStoreItem(request: APIRequestContext) {
  const stores = await list<Store>(request, '/stores?isActive=true&limit=100');
  const storeItems = await list<StoreItem>(request, '/store-items?isActive=true&limit=100');
  const hospitals = await list<Hospital>(request, '/hospitals?isActive=true&limit=100');
  const mapped = storeItems.find((row) =>
    stores.some((store) => store.id === row.storeId && store.storeName === 'Main Store'),
  );
  if (!mapped) return null;
  const store = stores.find((row) => row.id === mapped.storeId)!;
  const hospital = hospitals.find((row) => row.id === store.hospitalId)!;
  return { hospital, mapped, store };
}
