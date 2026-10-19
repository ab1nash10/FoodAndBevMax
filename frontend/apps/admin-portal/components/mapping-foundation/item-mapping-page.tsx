'use client';

import { Link2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { KitchenItemsPageClient } from '@/components/mapping-foundation/kitchen-items/kitchen-items-page';
import { PageHeader } from '@/components/mapping-foundation/shared/components';
import { StoreItemsPageClient } from '@/components/mapping-foundation/store-items/store-items-page';
import { SavedViewTabs, SegmentedControl } from '@/components/ui-controls';
import { setUrlParams, useUrlParam } from '@/lib/use-url-state';

type MappingTarget = 'kitchen' | 'store';

const targets: Array<{ label: string; permission: string; tab: string; value: MappingTarget }> = [
  { label: 'Store', permission: 'STORE_ITEM_VIEW', tab: 'Store items', value: 'store' },
  { label: 'Kitchen', permission: 'KITCHEN_ITEM_VIEW', tab: 'Kitchen items', value: 'kitchen' },
];

/**
 * Store and kitchen item mapping in one panel: the Store / Kitchen switch above the form and
 * the tabs above the list choose the same thing (?tab=store|kitchen), so editing a row always
 * opens it in the matching form. Each side works exactly as its own screen did.
 */
export function ItemMappingPageClient() {
  const { hasPermission } = useAuth();
  const allowed = targets.filter((target) => hasPermission(target.permission));
  const [tab] = useUrlParam<MappingTarget>('tab', allowed[0]?.value ?? 'store', [
    'store',
    'kitchen',
  ]);
  const mode = allowed.some((target) => target.value === tab)
    ? tab
    : (allowed[0]?.value ?? 'store');

  // A switch starts the other side clean: its own search, status and page.
  const choose = (next: MappingTarget) => {
    if (next !== mode) setUrlParams({ page: null, q: null, status: null, tab: next });
  };
  const formSwitch =
    allowed.length > 1 ? (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-ds-text-2">Map to</span>
        <SegmentedControl<MappingTarget>
          label="Map to"
          onChange={choose}
          options={allowed.map(({ label, value }) => ({ label, value }))}
          value={mode}
        />
      </div>
    ) : undefined;
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
      <PageHeader
        icon={Link2}
        subtitle="Map items to stores (they become MRP) and kitchens (they become Readymade), with their category."
        title="Item Mapping"
      />
      {mode === 'store' ? (
        <StoreItemsPageClient embedded formSwitch={formSwitch} key="store" listTabs={listTabs} />
      ) : (
        <KitchenItemsPageClient
          embedded
          formSwitch={formSwitch}
          key="kitchen"
          listTabs={listTabs}
        />
      )}
    </section>
  );
}
