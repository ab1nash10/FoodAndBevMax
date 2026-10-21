import type { LocationStockLevel } from '@aahar/api-client';

type DestinationType = 'COUNTER' | 'RESTAURANT';

/**
 * A New transfer link's source store, destination and lines:
 * `?hospital=…&from=<storeId>&to=<RESTAURANT|COUNTER>:<id>&items=<itemId>:<qty>,…`. Either end
 * may be left out for the person to choose.
 */
export interface TransferPrefill {
  destination?: { id: string; type: DestinationType };
  hospitalId: string;
  items: Array<{ itemId: string; qty: number }>;
  storeId?: string;
}

/**
 * What to send of an item running low at a restaurant or counter: enough for `coverDays` of its
 * usual 28-day issue, less what it holds, rounded up to a whole unit and never under one.
 */
export function suggestedTransferQty(
  level: Pick<LocationStockLevel, 'averageDailyIssue' | 'onHand'>,
  coverDays: number,
): number {
  return Math.max(1, Math.ceil(level.averageDailyIssue * coverDays - level.onHand));
}

export function transferPrefillHref(prefill: TransferPrefill): string {
  const params = new URLSearchParams({ hospital: prefill.hospitalId });

  if (prefill.storeId) params.set('from', prefill.storeId);
  if (prefill.destination)
    params.set('to', `${prefill.destination.type}:${prefill.destination.id}`);
  params.set('items', prefill.items.map((item) => `${item.itemId}:${item.qty}`).join(','));

  return `/inventory/transfers/new?${params.toString()}`;
}

/** New transfer from a store to these items' restaurant or counter (all at one), topped up. */
export function sendFromStoreHref(
  type: DestinationType,
  levels: LocationStockLevel[],
  coverDays: number,
): string {
  return transferPrefillHref({
    destination: { id: levels[0]?.locationId ?? '', type },
    hospitalId: levels[0]?.hospitalId ?? '',
    items: levels.map((level) => ({
      itemId: level.itemId,
      qty: suggestedTransferQty(level, coverDays),
    })),
  });
}

/** The prefill in a New transfer URL, or null when it names neither end. Bad lines are dropped. */
export function readTransferPrefill(params: URLSearchParams): TransferPrefill | null {
  const storeId = params.get('from') ?? undefined;
  const [type = '', id = ''] = (params.get('to') ?? '').split(':');
  const destination: TransferPrefill['destination'] =
    id && (type === 'COUNTER' || type === 'RESTAURANT') ? { id, type } : undefined;

  if (!storeId && !destination) {
    return null;
  }

  const items = (params.get('items') ?? '')
    .split(',')
    .map((entry) => {
      const [itemId = '', qty = ''] = entry.split(':');

      return { itemId: itemId.trim(), qty: Number(qty) };
    })
    .filter(
      (item, index, all) =>
        item.itemId &&
        Number.isFinite(item.qty) &&
        item.qty > 0 &&
        all.findIndex((other) => other.itemId === item.itemId) === index,
    );

  return {
    hospitalId: params.get('hospital') ?? '',
    items,
    ...(destination ? { destination } : {}),
    ...(storeId ? { storeId } : {}),
  };
}
