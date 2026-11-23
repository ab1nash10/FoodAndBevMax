'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader } from '@/components/design-system';
import { KitchenItemsPageClient } from '@/components/mapping-foundation/kitchen-items/kitchen-items-page';
import { StoreItemsPageClient } from '@/components/mapping-foundation/store-items/store-items-page';
import { useLocationContext } from '@/components/location-context';
import { SavedViewTabs } from '@/components/ui-controls';
import { organizationApi } from '@/lib/api';
import { setUrlParams, useUrlParam } from '@/lib/use-url-state';

type MappingTarget = 'kitchen' | 'store';

/** One side's list filters, cleared when switching to the other side. */
const otherSideClean = { kitchen: null, location: null, store: null, type: null };

const targets: Array<{
  create: string;
  permission: string;
  tab: string;
  value: MappingTarget;
}> = [
  {
    create: 'STORE_ITEM_CREATE',
    permission: 'STORE_ITEM_VIEW',
    tab: 'Store items',
    value: 'store',
  },
  {
    create: 'KITCHEN_ITEM_CREATE',
    permission: 'KITCHEN_ITEM_VIEW',
    tab: 'Kitchen items',
    value: 'kitchen',
  },
];

/**
 * One side's total at the location picked in the top bar, for the header. Keyed under the side's
 * list key, so every save and switch there refreshes it too.
 */
function useMappingTotal(target: MappingTarget, hospitalId: string | undefined, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const query = { hospitalId, limit: 0 };
      const response =
        target === 'store'
          ? await organizationApi.listStoreItems(query)
          : await organizationApi.listKitchenItems(query);

      return response.data.meta.total;
    },
    queryKey: [target === 'store' ? 'store-items' : 'kitchen-items', 'total', hospitalId ?? ''],
  });
}

/**
 * Store and kitchen item mapping, laid out as Rooms & tables: the side's list card with the
 * Store / Kitchen tabs (?tab=store|kitchen) above the search.
 * Each side works exactly as its own screen did; Map item in the header opens the side's form.
 */
export function ItemMappingPageClient() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const allowed = targets.filter((target) => hasPermission(target.permission));
  const [tab] = useUrlParam<MappingTarget>('tab', allowed[0]?.value ?? 'store', [
    'store',
    'kitchen',
  ]);
  const [creating, setCreating] = useState(false);
  const side = allowed.find((target) => target.value === tab) ?? allowed[0];
  const mode = side?.value ?? 'store';
  const total = useMappingTotal(mode, scopedHospitalId, Boolean(side)).data;

  // A switch starts the other side clean: its own search, status and page.
  const choose = (next: MappingTarget) => {
    if (next !== mode)
      setUrlParams({ ...otherSideClean, page: null, q: null, status: null, tab: next });
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

  return (
    <section className="space-y-5">
      <AppPageHeader
        action={
          side && hasPermission(side.create) ? (
            <Button onClick={() => setCreating(true)} type="button">
              <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              Map item
            </Button>
          ) : undefined
        }
        count={total}
        description="Choose where each item is used: in stores (packaged, sold as it comes) or kitchens (made there), with its category."
        title="Item locations"
      />
      {mode === 'store' ? (
        <StoreItemsPageClient
          creating={creating}
          embedded
          key="store"
          listTabs={listTabs}
          onCreatingChange={setCreating}
        />
      ) : (
        <KitchenItemsPageClient
          creating={creating}
          embedded
          key="kitchen"
          listTabs={listTabs}
          onCreatingChange={setCreating}
        />
      )}
    </section>
  );
}
