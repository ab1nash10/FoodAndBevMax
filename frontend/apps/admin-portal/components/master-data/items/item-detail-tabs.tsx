'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import type { Item, ItemType, RateType } from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { SavedViewTabs } from '@/components/ui-controls';
import { useAuth } from '@/components/auth-provider';
import { organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import { locationHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import {
  LoadingRows,
  foodTypeFormLabels,
  rupees,
  todayValue,
} from '@/components/master-data/items/shared';
import {
  formatDate,
  formatDateOnly,
  formatEnum,
  rateTypeValues,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';

// Card header tints: one of the concepts' tile colours, picked from the category id so a
// category always keeps the same colour. Dark mode keeps the portal's existing dark shades.
type ItemPanelTab = 'details' | 'mapping' | 'prices';

const itemTypeLongLabels: Record<ItemType, string> = {
  LIVE: 'Live (cooked to order)',
  MRP: 'MRP (packaged)',
  READYMADE: 'Readymade',
};

const rateTypeHints: Record<RateType, string> = {
  COUNTER: 'OPD & emergency counters',
  NORMAL: 'Walk-in guests',
  ROOM: 'In-room dining for patients',
  STAFF: 'Employees, with ID',
};

/** Prices, details and where the item is used, for the open item. */
export function ItemDetailTabs({ item }: Readonly<{ item: Item }>) {
  const { hasPermission } = useAuth();
  const { isAllLocations, scopedHospitalId } = useLocationContext();
  const [tab, setTab] = useState<ItemPanelTab>('prices');
  const scope = scopedHospitalId ?? 'all';
  const can = {
    kitchens: hasPermission('KITCHEN_ITEM_VIEW'),
    menus: hasPermission('RESTAURANT_MENU_VIEW'),
    prices: hasPermission('ITEM_PRICE_VIEW'),
    stores: hasPermission('STORE_ITEM_VIEW'),
  };
  const pricesQuery = useQuery({
    enabled: tab === 'prices' && can.prices,
    queryFn: async () =>
      (
        await organizationApi.listItemPrices({
          effectiveDate: todayValue(),
          hospitalId: scopedHospitalId,
          isActive: true,
          itemId: item.id,
          limit: 100,
        })
      ).data.items,
    queryKey: queryKeys.itemPricesItem(item.id, scope),
  });
  const mappingQuery = useQuery({
    enabled: tab === 'mapping',
    queryFn: async () => {
      const query = { hospitalId: scopedHospitalId, itemId: item.id, limit: 100 };
      const [stores, kitchens, menus] = await Promise.all([
        can.stores
          ? organizationApi.listStoreItems(query).then((response) => response.data.items)
          : [],
        can.kitchens
          ? organizationApi.listKitchenItems(query).then((response) => response.data.items)
          : [],
        can.menus
          ? organizationApi.listRestaurantMenus(query).then((response) => response.data.items)
          : [],
      ]);

      return [
        ...stores.map((mapping) => ({
          active: mapping.isActive,
          hospital: mapping.store.hospital.hospitalName,
          href: locationHref('STORE', mapping.store.storeCode || mapping.store.storeName),
          id: mapping.id,
          kind: 'STORE' as const,
          name: mapping.store.storeName,
          status: mapping.isActive ? 'Mapped' : 'Inactive',
        })),
        ...kitchens.map((mapping) => ({
          active: mapping.isActive,
          hospital: mapping.kitchen.hospital.hospitalName,
          href: locationHref('KITCHEN', mapping.kitchen.kitchenCode || mapping.kitchen.kitchenName),
          id: mapping.id,
          kind: 'KITCHEN' as const,
          name: mapping.kitchen.kitchenName,
          status: mapping.isActive ? 'Mapped' : 'Inactive',
        })),
        ...menus.map((menu) => ({
          active: menu.isActive && menu.isAvailable,
          hospital: menu.restaurant.hospital.hospitalName,
          href: locationHref(
            'RESTAURANT',
            menu.restaurant.restaurantCode || menu.restaurant.restaurantName,
          ),
          id: menu.id,
          kind: 'MENU' as const,
          name: [
            menu.restaurant.restaurantName,
            menu.timeSlots.map((slot) => slot.slotName).join(', '),
          ]
            .filter(Boolean)
            .join(' · '),
          status: !menu.isActive ? 'Inactive' : menu.isAvailable ? 'On menu' : 'Unavailable',
        })),
      ];
    },
    queryKey: queryKeys.itemMappings(item.id, scope, can),
  });
  const prices = [...(pricesQuery.data ?? [])].sort(
    (left, right) =>
      rateTypeValues.indexOf(left.rateType) - rateTypeValues.indexOf(right.rateType) ||
      Number(Boolean(left.restaurantId)) - Number(Boolean(right.restaurantId)),
  );
  const tabs: Array<{ label: string; value: ItemPanelTab }> = [
    { label: 'Prices', value: 'prices' },
    { label: 'Details', value: 'details' },
    { label: 'Mapping', value: 'mapping' },
  ];
  const mappingTags = {
    KITCHEN: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
    MENU: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
    STORE: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg',
  };

  return (
    <>
      <SavedViewTabs<ItemPanelTab>
        label="Item sections"
        onChange={setTab}
        value={tab}
        views={tabs}
      />

      {tab === 'prices' ? (
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {!can.prices ? (
            <p className="text-[13px] text-ds-muted">Your role can't view item prices.</p>
          ) : pricesQuery.isLoading ? (
            <LoadingRows />
          ) : prices.length === 0 ? (
            <p className="text-[13px] text-ds-muted">No price is in effect today.</p>
          ) : (
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="border-b border-ds-divider text-left text-[11.5px] text-ds-muted">
                  <th className="pb-1.5 font-semibold">Rate type</th>
                  <th className="w-[76px] pb-1.5 text-right font-semibold">Price</th>
                  <th className="w-[50px] pb-1.5 text-right font-semibold">GST</th>
                  <th className="w-[92px] pb-1.5 text-right font-semibold">From</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((price) => (
                  <tr className="align-top" key={price.id}>
                    <td className="py-1.5 pr-2">
                      <span className="block font-bold text-ds-text">
                        {formatEnum(price.rateType)}
                      </span>
                      <span className="block truncate text-[11.5px] text-ds-muted">
                        {price.restaurant
                          ? `${price.restaurant.restaurantName} override`
                          : isAllLocations
                            ? price.hospital.hospitalName
                            : rateTypeHints[price.rateType]}
                        {price.isTaxInclusive ? ' · tax inclusive' : ''}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-extrabold tabular-nums text-ds-text">
                      {rupees.format(price.price)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ds-text-3">
                      {price.gstPercent !== null ? `${price.gstPercent}%` : '—'}
                    </td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-ds-text-3">
                      {formatDateOnly(price.effectiveFrom)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {can.prices ? (
            <Button asChild className="h-[38px] text-[13px] text-ds-link" variant="outline">
              <Link href="/masters/item-prices">Edit prices</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === 'details' ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 px-[18px] py-3.5 text-[13px]">
          {[
            ['Item code', item.itemCode],
            ['Category', item.category.categoryName],
            ['Food type', foodTypeFormLabels[item.type]],
            ['Item type', itemTypeLongLabels[item.itemType]],
            [
              'Preparation',
              item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : '—',
            ],
            ['HSN code', item.hsnCode || '—'],
            ['Status', item.isActive ? 'Active' : 'Inactive'],
            ['Updated', formatDate(item.updatedAt)],
          ].map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-ds-muted">{label}</dt>
              <dd className="truncate font-bold text-ds-text">{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}

      {tab === 'mapping' ? (
        <div className="flex flex-col gap-2 px-[18px] py-3.5">
          {mappingQuery.isLoading ? (
            <LoadingRows />
          ) : (mappingQuery.data ?? []).length === 0 ? (
            <p className="text-[13px] text-ds-muted">
              Not mapped to any store, kitchen or restaurant menu
              {isAllLocations ? '' : ' at this location'} yet.
            </p>
          ) : (
            (mappingQuery.data ?? []).map((mapping) => (
              <div
                className="flex min-h-10 items-center gap-2.5 rounded-control border border-ds-border px-2.5 py-1.5"
                key={`${mapping.kind}-${mapping.id}`}
              >
                <span
                  className={cn(
                    'shrink-0 rounded-[5px] px-1.5 py-px text-[10.5px] font-bold uppercase tracking-[0.04em]',
                    mappingTags[mapping.kind],
                  )}
                >
                  {mapping.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <RecordLink
                    className="block truncate text-[13px] font-bold text-ds-text"
                    href={mapping.href}
                  >
                    {mapping.name}
                  </RecordLink>
                  {isAllLocations ? (
                    <span className="block truncate text-[11.5px] text-ds-muted">
                      {mapping.hospital}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-semibold',
                    mapping.active ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                  )}
                >
                  {mapping.status}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}
