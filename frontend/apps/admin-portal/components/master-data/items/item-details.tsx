'use client';

import { Fragment } from 'react';
import type { Item } from '@aahar/api-client';
import { foodTypeFormLabels } from '@/components/master-data/items/shared';
import { formatDate } from '@/components/master-data/shared/utils';

/** Read-only details of the open item. Prices are managed on Item Prices. */
export function ItemDetails({ item }: Readonly<{ item: Item }>) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 text-[13px]">
      {[
        ['Item code', item.itemCode],
        ['Food type', foodTypeFormLabels[item.type]],
        ['Preparation', item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : '—'],
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
  );
}
