'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, StatStrip, type Stat } from '@/components/design-system';
import { KitchenItemsPageClient } from '@/components/mapping-foundation/kitchen-items/kitchen-items-page';
import { StoreItemsPageClient } from '@/components/mapping-foundation/store-items/store-items-page';
import { useLocationContext } from '@/components/location-context';
import { SavedViewTabs } from '@/components/ui-controls';
import { organizationApi } from '@/lib/api';
import { setUrlParams, useUrlParam } from '@/lib/use-url-state';

type MappingTarget = 'kitchen' | 'store';

const targets: Array<{ label: string; permission: string; tab: string; value: MappingTarget }> = [
  { label: 'Store', permission: 'STORE_ITEM_VIEW', tab: 'Store items', value: 'store' },
  { label: 'Kitchen', permission: 'KITCHEN_ITEM_VIEW', tab: 'Kitchen items', value: 'kitchen' },
];

/**
 * One side's counts, all and inactive, at the location picked in the top bar. Keyed under the
 * side's list key, so every save and switch there refreshes them too.
 */
function useMappingCounts(target: MappingTarget, hospitalId: string | undefined, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const count = async (isActive?: boolean) => {
        const query = { hospitalId, isActive, limit: 0 };
        const response =
          target === 'store'
            ? await organizationApi.listStoreItems(query)
            : await organizationApi.listKitchenItems(query);

        return response.data.meta.total;
      };
      const [all, inactive] = await Promise.all([count(), count(false)]);

      return { all, inactive };
    },
    queryKey: [target === 'store' ? 'store-items' : 'kitchen-items', 'stats', hospitalId ?? ''],
  });
}

/**
 * Store and kitchen item mapping in one panel: the Store / Kitchen switch above the form and
 * the tabs above the list choose the same thing (?tab=store|kitchen), so editing a row always
 * opens it in the matching form. Each side works exactly as its own screen did.
 */
export function ItemMappingPageClient() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const allowed = targets.filter((target) => hasPermission(target.permission));
  const [tab] = useUrlParam<MappingTarget>('tab', allowed[0]?.value ?? 'store', [
    'store',
    'kitchen',
  ]);
  const [status] = useUrlParam('status');
  const mode = allowed.some((target) => target.value === tab)
    ? tab
    : (allowed[0]?.value ?? 'store');
  const canSee = (target: MappingTarget) => allowed.some((shown) => shown.value === target);
  const storeCounts = useMappingCounts('store', scopedHospitalId, canSee('store')).data;
  const kitchenCounts = useMappingCounts('kitchen', scopedHospitalId, canSee('kitchen')).data;

  // A switch starts the other side clean: its own search, status and page.
  const choose = (next: MappingTarget) => {
    if (next !== mode) setUrlParams({ page: null, q: null, status: null, tab: next });
  };
  /** A stat's side, all of it or only its inactive mappings. */
  const show = (next: MappingTarget, inactive: boolean) => {
    setUrlParams({
      page: null,
      ...(next === mode ? {} : { q: null }),
      status: inactive ? 'inactive' : null,
      tab: next,
    });
  };
  const listTabs =
    allowed.length > 1 ? (
      <SavedViewTabs<MappingTarget>
        label="Mappings"
        onChange={choose}
        value={mode}
        views={allowed.map(({ tab: label, value }) => ({ label, value }))}
      />
    ) : undefined;

  const stats: Stat[] = [];

  if (canSee('store')) {
    stats.push({
      active: mode === 'store' && status !== 'inactive',
      label: 'Store mappings',
      onSelect: () => show('store', false),
      share: storeCounts?.all ? 1 : undefined,
      value: storeCounts?.all ?? '–',
    });
  }

  if (canSee('kitchen')) {
    stats.push({
      active: mode === 'kitchen' && status !== 'inactive',
      label: 'Kitchen mappings',
      onSelect: () => show('kitchen', false),
      share: kitchenCounts?.all ? 1 : undefined,
      value: kitchenCounts?.all ?? '–',
    });
  }

  if (canSee('store')) {
    stats.push({
      active: mode === 'store' && status === 'inactive',
      label: 'Inactive · stores',
      onSelect: () => show('store', true),
      share: storeCounts?.all ? storeCounts.inactive / storeCounts.all : undefined,
      tone: 'pending',
      value: storeCounts?.inactive ?? '–',
    });
  }

  if (canSee('kitchen')) {
    stats.push({
      active: mode === 'kitchen' && status === 'inactive',
      label: 'Inactive · kitchens',
      onSelect: () => show('kitchen', true),
      share: kitchenCounts?.all ? kitchenCounts.inactive / kitchenCounts.all : undefined,
      tone: 'pending',
      value: kitchenCounts?.inactive ?? '–',
    });
  }

  const total =
    (canSee('store') && !storeCounts) || (canSee('kitchen') && !kitchenCounts)
      ? undefined
      : (storeCounts?.all ?? 0) + (kitchenCounts?.all ?? 0);

  return (
    <section className="space-y-4">
      <AppPageHeader
        count={total}
        description="Choose where each item is used: in stores (packaged, sold as it comes) or kitchens (made there), with its category."
        title="Item Locations"
      />
      {stats.length ? <StatStrip label="Item mappings at a glance" stats={stats} /> : null}
      {mode === 'store' ? (
        <StoreItemsPageClient embedded key="store" listTabs={listTabs} />
      ) : (
        <KitchenItemsPageClient embedded key="kitchen" listTabs={listTabs} />
      )}
    </section>
  );
}
