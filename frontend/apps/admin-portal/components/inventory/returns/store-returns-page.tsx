'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AppPageHeader, tableStyles, TypeTag } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { Panel } from '@/components/ui';
import { QueryState } from '@/components/inventory/shared/components';
import { formatQuantity, formatWhen } from '@/components/inventory/shared/utils';
import { useLocationNames } from '@/components/inventory/use-locations';
import { organizationApi } from '@/lib/api';
import { prefetchOnIntent, transferDetailQuery } from '@/lib/detail-queries';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/**
 * Stock restaurants sent back to the store, oldest first, until the store team counts each in
 * (the transfer acknowledgement screen, as a return count against an actual count).
 */
export function StoreReturnsPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const locationName = useLocationNames(hasPermission);
  // ponytail: first 100 only; page it if a location ever has more waiting.
  const returnsQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          destinationType: 'STORE',
          hospitalId: scopedHospitalId,
          limit: 100,
          sortBy: 'createdAt',
          sortOrder: 'asc',
          status: 'PENDING_ACKNOWLEDGEMENT',
        })
      ).data,
    queryKey: queryKeys.transfers('store-returns', scopedHospitalId ?? 'all'),
  });
  const returns = returnsQuery.data?.items ?? [];

  return (
    <section className="space-y-4">
      <AppPageHeader
        count={returnsQuery.data?.meta.total}
        description="Stock restaurants sent back to the store. Count each one in: what is counted goes into the store, anything missing goes back to the restaurant."
        title="Count returns"
      />
      <Panel aria-label="Returns waiting to be counted" className="overflow-hidden" role="region">
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[640px]')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={tableStyles.th}>Return</th>
                <th className={tableStyles.th}>From</th>
                <th className={cn(tableStyles.th, 'text-right')}>Lines</th>
                <th className={cn(tableStyles.th, 'text-right')}>Quantity</th>
                <th className={tableStyles.th}>
                  <span className="sr-only">Count</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {returns.length > 0 ? (
                returns.map((transfer) => (
                  <tr className="border-t border-ds-divider" key={transfer.id}>
                    <td className={tableStyles.td}>
                      <span className={cn(tableStyles.num, tableStyles.title)}>
                        {transfer.transferNumber}
                      </span>
                      <span className="block text-[12px] text-ds-muted">
                        Sent {formatWhen(transfer.updatedAt)}
                      </span>
                    </td>
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <TypeTag type={transfer.sourceType} />
                        <span className="truncate text-ds-text">
                          {locationName(transfer.sourceType, transfer.sourceId)}
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {transfer.lines.length}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {formatQuantity(
                        transfer.lines.reduce((total, line) => total + line.sentQty, 0),
                      )}
                    </td>
                    <td className={cn(tableStyles.td, 'text-right')}>
                      <Link
                        aria-label={`Count ${transfer.transferNumber}`}
                        className="inline-flex h-8 items-center rounded-full bg-ds-primary-soft px-3 text-[12.5px] font-semibold whitespace-nowrap text-ds-link transition-colors duration-150 hover:bg-ds-primary hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                        href={`/inventory/transfers/${transfer.id}/acknowledge`}
                        {...prefetchOnIntent(() =>
                          queryClient.prefetchQuery(transferDetailQuery(transfer.id)),
                        )}
                      >
                        Count
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={5}
                  error={returnsQuery.error}
                  hint="A restaurant's return shows here until the store counts it in."
                  isError={returnsQuery.isError}
                  isLoading={returnsQuery.isLoading}
                  label="returns to count"
                />
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
