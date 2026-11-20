'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, PackageMinus } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { TransferInput } from '@aahar/api-client';
import { AppPageHeader, tableStyles } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Input, Panel, RequiredMark, Select } from '@/components/ui';
import { HospitalSelect, QueryState } from '@/components/inventory/shared/components';
import {
  formatDateOnly,
  formatQuantity,
  plural,
  toDateOnlyValue,
  useHospitals,
  useRestaurants,
  useStores,
} from '@/components/inventory/shared/utils';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateTransferQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

/**
 * A restaurant sends MRP stock back to its location's Main Store (at shift end, day end or any
 * time): a cart of batches and quantities, sent as a restaurant → store transfer and dispatched at
 * once, which takes the stock off the restaurant. The store then counts it in.
 */
export function ReturnToStorePageClient() {
  const { scopedHospitalId } = useLocationContext();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // The POS and Restaurant Stock links name the restaurant.
  const [restaurantId, setRestaurantId] = useUrlParam('restaurant');
  const [pickedHospitalId, setPickedHospitalId] = useState('');
  const hospitalId = scopedHospitalId ?? pickedHospitalId;
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const hospitalsQuery = useHospitals();
  const restaurantsQuery = useRestaurants(hospitalId);
  const storesQuery = useStores(hospitalId);
  const stores = storesQuery.data ?? [];
  const store =
    stores.find((candidate) => candidate.storeName.trim().toLowerCase() === 'main store') ??
    (stores.length === 1 ? stores[0] : undefined);
  const restaurantName =
    restaurantsQuery.data?.find((restaurant) => restaurant.id === restaurantId)?.restaurantName ??
    'the restaurant';
  // ponytail: first 100 batches, oldest expiry first; page it if a restaurant ever holds more.
  const stockQuery = useQuery({
    enabled: Boolean(restaurantId),
    queryFn: async () =>
      (
        await organizationApi.listRestaurantStock({
          itemType: 'MRP',
          limit: 100,
          locationId: restaurantId,
          sortBy: 'expiryDate',
          sortOrder: 'asc',
        })
      ).data.items.filter((stock) => stock.availableQty > 0),
    queryKey: queryKeys.restaurantStock('return', restaurantId),
  });
  const rows = (stockQuery.data ?? []).map((stock) => {
    const raw = quantities[stock.id] ?? '';
    const qty = Number(raw);
    const error =
      raw === ''
        ? null
        : !Number.isFinite(qty) || qty <= 0
          ? 'Enter a quantity above 0, or clear the box.'
          : qty > stock.availableQty + 0.0005
            ? `Only ${formatQuantity(stock.availableQty)} of this batch at ${restaurantName}.`
            : null;

    return { error, qty, raw, stock };
  });
  const cart = rows.filter((row) => row.raw !== '');
  const cartTotal = Number(cart.reduce((total, row) => total + (row.qty || 0), 0).toFixed(3));
  const hasErrors = cart.some((row) => row.error);

  const returnMutation = useMutation({
    mutationFn: async (body: TransferInput) => {
      const created = (await organizationApi.createTransfer(body)).data;

      try {
        return {
          dispatchError: null,
          transfer: (await organizationApi.dispatchTransfer(created.id)).data,
        };
      } catch (error) {
        return { dispatchError: error, transfer: created };
      }
    },
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Return was not sent',
        variant: 'error',
      });
    },
    onSuccess({ dispatchError, transfer }) {
      invalidateTransferQueries(queryClient);
      // Either way a transfer exists now, so the same cart must not be sent twice.
      setQuantities({});

      if (dispatchError) {
        showToast({
          action: {
            href: recordHref('/inventory/transfers', { id: transfer.id }),
            label: `View ${transfer.transferNumber}`,
          },
          description: `${transfer.transferNumber} is saved as a draft and the stock is still at the restaurant. ${getApiErrorMessage(dispatchError)}`,
          title: 'Saved, but not sent',
          variant: 'error',
        });
      } else {
        showToast({
          description: `${transfer.transferNumber} · the store counts it in next.`,
          recordId: transfer.id,
          title: 'Returned to the store',
          variant: 'success',
        });
      }
    },
  });

  function chooseRestaurant(id: string) {
    setRestaurantId(id);
    setQuantities({});
  }

  function submit() {
    if (!store || cart.length === 0 || hasErrors) return;

    returnMutation.mutate({
      destinationId: store.id,
      destinationType: 'STORE',
      hospitalId,
      items: cart.map(({ qty, stock }) => ({
        batchNumber: stock.batchNumber ?? '',
        expiryDate: toDateOnlyValue(stock.expiryDate),
        itemId: stock.itemId,
        sentQty: qty,
      })),
      sourceId: restaurantId,
      sourceType: 'RESTAURANT',
      transferDate: new Date().toISOString(),
    });
  }

  const isBusy = returnMutation.isPending;
  const fieldLabel =
    'flex min-w-[220px] flex-1 flex-col gap-1.5 text-[12.5px] font-bold text-ds-text-2';

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="Send MRP stock back to the store, at shift end, day end or any time. The store counts it in; anything it does not find comes back to the restaurant's stock."
        title="Return to Store"
      />

      <Panel className="flex flex-wrap gap-3.5 p-[18px]">
        {scopedHospitalId ? null : (
          <label className={fieldLabel}>
            <span>
              Location
              <RequiredMark />
            </span>
            <HospitalSelect
              disabled={isBusy}
              hospitals={hospitalsQuery.data ?? []}
              onChange={(value) => {
                setPickedHospitalId(value);
                chooseRestaurant('');
              }}
              value={pickedHospitalId}
            />
          </label>
        )}
        <label className={fieldLabel}>
          <span>
            Restaurant
            <RequiredMark />
          </span>
          <Select
            disabled={!hospitalId || isBusy}
            onChange={(event) => chooseRestaurant(event.target.value)}
            value={restaurantId}
          >
            <option value="">{hospitalId ? 'Select restaurant' : 'Choose a location first'}</option>
            {(restaurantsQuery.data ?? []).map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </Select>
        </label>
      </Panel>

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-label={`Stock at ${restaurantName}`}
          className="min-w-0 flex-[2_1_560px] overflow-hidden"
          role="region"
        >
          {restaurantId ? (
            <div className="overflow-x-auto">
              <table className={cn(tableStyles.table, 'min-w-[620px]')}>
                <thead className={tableStyles.head}>
                  <tr>
                    <th className={tableStyles.th}>Item</th>
                    <th className={tableStyles.th}>Batch</th>
                    <th className={tableStyles.th}>Expiry</th>
                    <th className={cn(tableStyles.th, 'text-right')}>Available</th>
                    <th className={cn(tableStyles.th, 'w-[140px]')}>Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? (
                    rows.map(({ error, raw, stock }) => (
                      <Fragment key={stock.id}>
                        <tr className="border-t border-ds-divider">
                          <td className={tableStyles.td}>
                            <span className={cn('block truncate', tableStyles.title)}>
                              {stock.item.itemName}
                            </span>
                            <span className={tableStyles.code}>{stock.item.itemCode}</span>
                          </td>
                          <td className={cn(tableStyles.td, 'font-mono text-[12.5px]')}>
                            {stock.batchNumber ?? '—'}
                          </td>
                          <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                            {formatDateOnly(stock.expiryDate)}
                          </td>
                          <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                            {formatQuantity(stock.availableQty)}
                          </td>
                          <td className={tableStyles.td}>
                            <Input
                              aria-describedby={error ? `return-error-${stock.id}` : undefined}
                              aria-invalid={error ? true : undefined}
                              aria-label={`Return quantity of ${stock.item.itemName}, batch ${stock.batchNumber ?? 'none'}`}
                              className={cn(
                                'h-9 font-mono font-bold',
                                error && 'border-ds-status-bad-fg',
                              )}
                              disabled={isBusy}
                              inputMode="decimal"
                              min="0"
                              onChange={(event) =>
                                setQuantities((current) => ({
                                  ...current,
                                  [stock.id]: event.target.value,
                                }))
                              }
                              placeholder="0"
                              step="any"
                              type="number"
                              value={raw}
                            />
                          </td>
                        </tr>
                        {error ? (
                          <tr>
                            <td className="px-4 pb-2.5 pl-6" colSpan={5}>
                              <span
                                className="flex items-center gap-1.5 text-xs font-bold text-ds-status-bad-fg"
                                id={`return-error-${stock.id}`}
                                role="alert"
                              >
                                <AlertTriangle
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 shrink-0"
                                  strokeWidth={2}
                                />
                                {error}
                              </span>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))
                  ) : (
                    <QueryState
                      atLocation={false}
                      colSpan={5}
                      error={stockQuery.error}
                      hint="Only MRP stock (sold as is) goes back to the store, and this restaurant holds none."
                      isError={stockQuery.isError}
                      isLoading={stockQuery.isLoading}
                      label="MRP stock"
                    />
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-[18px] py-10 text-center text-[13px] text-ds-muted">
              Choose the restaurant to see the stock it can send back.
            </p>
          )}
        </Panel>

        <Panel
          aria-labelledby="return-cart"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[18px]"
          role="region"
        >
          <h2 className="text-[15px] font-extrabold text-ds-text" id="return-cart">
            To return
          </h2>
          {cart.length > 0 ? (
            <ul className="divide-y divide-ds-divider rounded-tile border border-ds-border">
              {cart.map(({ error, raw, stock }) => (
                <li className="flex items-start gap-3 px-3 py-2.5 text-[13px]" key={stock.id}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold text-ds-text">{stock.item.itemName}</span>
                    <span className="font-mono text-[11.5px] text-ds-muted">
                      {stock.batchNumber ?? '—'} · exp {formatDateOnly(stock.expiryDate)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-mono font-bold',
                      error ? 'text-ds-status-bad-fg' : 'text-ds-text',
                    )}
                  >
                    {raw}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ds-muted">
              Enter a quantity against each batch you are sending back.
            </p>
          )}
          {cart.length > 0 ? (
            <p className="flex justify-between text-[12.5px] font-semibold text-ds-text-2">
              <span>{plural(cart.length, 'batch', 'batches')}</span>
              <span className="font-mono">{formatQuantity(cartTotal)} in all</span>
            </p>
          ) : null}
          {hospitalId && (storesQuery.isError || (storesQuery.data && !store)) ? (
            <p className="rounded-control bg-ds-status-bad-bg p-3 text-[12.5px] font-semibold text-ds-status-bad-fg">
              {storesQuery.isError
                ? `The store could not be loaded: ${getApiErrorMessage(storesQuery.error)}`
                : 'This location has no Main Store to return stock to.'}
            </p>
          ) : null}
          <Button
            disabled={isBusy || !store || cart.length === 0 || hasErrors}
            onClick={submit}
            type="button"
          >
            {isBusy ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <PackageMinus aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            )}
            Return to {store?.storeName ?? 'store'}
          </Button>
          <p className="text-xs text-ds-muted">
            The stock leaves {restaurantName} as soon as you send it.
          </p>
        </Panel>
      </div>
    </section>
  );
}
