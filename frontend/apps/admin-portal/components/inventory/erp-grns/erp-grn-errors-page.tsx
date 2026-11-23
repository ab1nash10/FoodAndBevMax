'use client';

import type { GrnRefusal, GrnRefusalQuery } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { FileWarning } from 'lucide-react';
import { useState } from 'react';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  AppPageHeader,
  DateTimeCell,
  EmptyState,
  ListPager,
  TableSkeletonRows,
  tableStyles,
} from '@/components/design-system';
import { SearchInput } from '@/components/inventory/shared/components';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { Input, Panel } from '@/components/ui';
import { getApiErrorMessage, grnEntriesApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

// A GRN refused while the list is open shows up within this.
const REFRESH_MS = 15_000;
// Rows of a refused GRN shown in its line; the rest are counted.
const ROWS_SHOWN = 3;
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** One row the ERP sent: item, batch, and goods in or a return, with its quantity. */
const rowLine = (row: GrnRefusal['rows'][number]) =>
  `${row.part_item_code} · ${row.batch} · ${row.flag === 1 ? 'return' : 'in'} ${numberFormat.format(row.transaction_qty)}`;

/**
 * GRNs the ERP sent that F&B refused, newest first: nothing was saved and no stock moved. Each
 * shows every reason and what it asked for, for the store team to take up with the ERP.
 */
export function ErpGrnErrorsPage() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [page, setPage] = useUrlNumberParam('page');
  const [receivedFrom, setReceivedFrom] = useUrlParam('from');
  const [receivedTo, setReceivedTo] = useUrlParam('to');
  const [limit, setLimit] = useState(25);
  const filters: GrnRefusalQuery = {
    hospitalId: scopedHospitalId,
    limit,
    page,
    receivedFrom: receivedFrom || undefined,
    receivedTo: receivedTo || undefined,
    search: search || undefined,
  };
  const query = useQuery({
    enabled: !isLoadingLocations,
    queryFn: async () => (await grnEntriesApi.listGrnRefusals(filters)).data,
    queryKey: queryKeys.grnEntries('refusals', filters),
    refetchInterval: REFRESH_MS,
  });
  const refusals = query.data?.items ?? [];
  const activeFilters = [search, receivedFrom, receivedTo].filter(Boolean).length;

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => setPage(1));

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="GRNs the ERP sent that F&B refused, with why. Nothing of these was saved and no stock moved."
        eyebrow="Logs"
        title="ERP GRN errors"
      />

      <Panel aria-label="Refused GRNs" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search ERP GRN errors"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="GRN number"
            value={searchInput}
          />
          <FiltersMenu activeCount={[receivedFrom, receivedTo].filter(Boolean).length}>
            <FilterField label="Received from">
              <Input
                max={receivedTo || undefined}
                onChange={(event) => {
                  setReceivedFrom(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={receivedFrom}
              />
            </FilterField>
            <FilterField label="Received to">
              <Input
                min={receivedFrom || undefined}
                onChange={(event) => {
                  setReceivedTo(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={receivedTo}
              />
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void query.refetch()} />
          <ClearFiltersButton
            active={activeFilters > 0}
            onClear={() => {
              setSearch('');
              setReceivedFrom('');
              setReceivedTo('');
              setPage(1);
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[170px]')}>GRN No</th>
                <th className={tableStyles.th}>Why it was refused</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden)}>What it asked for</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[132px]')}>
                  Received
                </th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <TableSkeletonRows
                  cells={[undefined, tableStyles.phoneHidden, tableStyles.phoneHidden]}
                />
              ) : query.isError ? (
                <tr>
                  <td className="p-6 text-sm text-ds-status-bad-fg" colSpan={4} role="alert">
                    {getApiErrorMessage(query.error)}
                  </td>
                </tr>
              ) : refusals.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={4}>
                    <EmptyState
                      description={
                        activeFilters
                          ? 'Try other filters.'
                          : 'A GRN F&B cannot take is listed here, with why.'
                      }
                      icon={FileWarning}
                      title="No refused GRNs"
                    />
                  </td>
                </tr>
              ) : (
                refusals.map((refusal) => (
                  <tr className={tableStyles.row} data-record-id={refusal.id} key={refusal.id}>
                    <td className={tableStyles.td}>
                      <span className="block truncate font-semibold text-ds-text">
                        {refusal.grn_No}
                      </span>
                      <span className="block truncate text-[12px] text-ds-muted">
                        {refusal.location_name ?? refusal.location}
                      </span>
                    </td>
                    <td className={tableStyles.td}>
                      <ul className="space-y-1 text-ds-status-bad-fg">
                        {refusal.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                      <ul className={cn('space-y-0.5 text-[12.5px]', tableStyles.code)}>
                        {refusal.rows.slice(0, ROWS_SHOWN).map((row, index) => (
                          <li key={index}>{rowLine(row)}</li>
                        ))}
                      </ul>
                      {refusal.rows.length > ROWS_SHOWN ? (
                        <span className="block text-[12px] text-ds-muted">
                          +{refusal.rows.length - ROWS_SHOWN} more
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                      <DateTimeCell value={refusal.received_at} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {query.data ? (
          <ListPager
            limit={limit}
            noun="refused GRNs"
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
            onPageChange={setPage}
            page={page}
            total={query.data.meta.total}
            totalPages={Math.max(1, query.data.meta.totalPages)}
          />
        ) : null}
      </Panel>
    </section>
  );
}
