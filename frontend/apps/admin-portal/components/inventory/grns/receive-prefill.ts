/**
 * A Receive a delivery link's store and items: `?hospital=…&store=<storeId>&items=<itemId>,…`.
 * Quantities are left out on purpose: the person counts what actually arrived.
 */
export interface ReceivePrefill {
  hospitalId: string;
  itemIds: string[];
  storeId: string;
}

export function receivePrefillHref(prefill: ReceivePrefill): string {
  const params = new URLSearchParams({
    hospital: prefill.hospitalId,
    items: prefill.itemIds.join(','),
    store: prefill.storeId,
  });

  return `/inventory/grns/new?${params.toString()}`;
}

/** The prefill in a Receive a delivery URL, or null without a store. Repeats are dropped. */
export function readReceivePrefill(params: URLSearchParams): ReceivePrefill | null {
  const storeId = params.get('store');

  if (!storeId) {
    return null;
  }

  const itemIds = [
    ...new Set(
      (params.get('items') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  return { hospitalId: params.get('hospital') ?? '', itemIds, storeId };
}
