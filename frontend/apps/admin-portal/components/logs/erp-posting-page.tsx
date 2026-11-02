'use client';

import type {
  ErpPosting,
  ErpPostingQuery,
  ErpPostingStatus,
  SendErpPostingInput,
} from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Loader2, Send, ServerOff } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { useConfirm } from '@/components/confirm-provider';
import {
  AppPageHeader,
  DateTimeCell,
  EmptyState,
  ListPager,
  TableSkeletonRows,
  tableStyles,
} from '@/components/design-system';
import { useRestaurants } from '@/components/inventory/shared/utils';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, Input, Panel, Select } from '@/components/ui';
import { erpPostingsApi, getApiErrorMessage } from '@/lib/api';
import { downloadText, erpLogFile, erpLogFileName, erpStatus } from '@/lib/erp-posting';
import { queryKeys } from '@/lib/query-keys';
import { downloadReportExcel } from '@/lib/report-excel';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const STATUSES: ErpPostingStatus[] = ['SUCCESS', 'FAILED', 'EMPTY', 'PENDING'];

/** Yesterday in India, YYYY-MM-DD: the latest day that can be sent. */
function yesterday(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const dayFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

/**
 * Every send of a restaurant's day to the ERP, newest first, with its log file and Excel data;
 * an admin with ERP_POSTING_SEND sends a day (yesterday or earlier) or sends one again.
 */
export function ErpPostingPageClient() {
  const { hasPermission } = useAuth();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canSend = hasPermission('ERP_POSTING_SEND');
  const [status, setStatus] = useUrlParam('status');
  const [restaurantFilter, setRestaurantFilter] = useUrlParam('restaurant');
  const [from, setFrom] = useUrlParam('from');
  const [to, setTo] = useUrlParam('to');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [restaurantId, setRestaurantId] = useState('');
  const [businessDate, setBusinessDate] = useState(yesterday);
  const [downloading, setDownloading] = useState<string | null>(null);
  const restaurants = useRestaurants(scopedHospitalId);
  const filters: ErpPostingQuery = {
    from: from || undefined,
    hospitalId: scopedHospitalId,
    limit,
    page,
    restaurantId: restaurantFilter || undefined,
    status: (status || undefined) as ErpPostingStatus | undefined,
    to: to || undefined,
  };
  const query = useQuery({
    enabled: !isLoadingLocations,
    queryFn: async () => (await erpPostingsApi.listErpPostings(filters)).data,
    queryKey: queryKeys.erpPostings('list', filters),
  });
  const rows = query.data?.items ?? [];
  const enabled = query.data?.enabled ?? true;
  const activeFilters = [status, restaurantFilter, from, to].filter(Boolean).length;

  const send = useMutation({
    mutationFn: (input: SendErpPostingInput) => erpPostingsApi.sendErpPosting(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.erpPostings() }),
  });

  async function sendDay(input: Omit<SendErpPostingInput, 'resend'>, resend = false) {
    try {
      const { data: posting, message } = await send.mutateAsync({ ...input, resend });
      showToast({
        description: posting.error ?? `${posting.billCount} bills, ${posting.rowCount} lines.`,
        title: message ?? erpStatus(posting.status).label,
        variant: posting.status === 'FAILED' ? 'error' : 'success',
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409 && !resend) {
        const again = await confirm({
          confirmLabel: 'Send again',
          description: `${getApiErrorMessage(error)} A second send may count the day twice in the ERP.`,
          icon: Send,
          title: 'Send this day again?',
          tone: 'danger',
        });
        if (again) await sendDay(input, true);
        return;
      }
      showToast({
        description: getApiErrorMessage(error),
        title: 'Not sent to the ERP',
        variant: 'error',
      });
    }
  }

  async function download(posting: ErpPosting, kind: 'excel' | 'log') {
    setDownloading(`${posting.id}:${kind}`);
    try {
      const { data } = await erpPostingsApi.getErpPosting(posting.id);
      if (kind === 'log') downloadText(erpLogFileName(data), erpLogFile(data));
      else if (data.report) await downloadReportExcel(data.report);
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'The file was not downloaded',
        variant: 'error',
      });
    } finally {
      setDownloading(null);
    }
  }

  const filterBy = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="Each restaurant's day sent to the ERP: what was sent, what the ERP answered, and the files to check it."
        eyebrow="Logs"
        title="ERP Posting"
      />

      {!enabled ? (
        <Panel className="flex items-start gap-3 p-4 sm:p-5" role="status">
          <ServerOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ds-muted" />
          <p className="text-sm text-ds-text-2">
            <span className="font-semibold text-ds-text">
              Sending to the ERP is not set up yet.
            </span>{' '}
            IT has to add the ERP address and token (ERP_REVENUE_URL and ERP_REVENUE_TOKEN). Until
            then, download the ERP Journal (SUN) from Reports.
          </p>
        </Panel>
      ) : null}

      {canSend && enabled ? (
        <Panel aria-label="Send a day to the ERP" className="p-4 sm:p-5" role="region">
          {scopedHospitalId ? (
            <form
              className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void sendDay({ businessDate, hospitalId: scopedHospitalId, restaurantId });
              }}
            >
              <Field label="Restaurant" name="erp-restaurant">
                <Select
                  id="erp-restaurant"
                  onChange={(event) => setRestaurantId(event.target.value)}
                  value={restaurantId}
                >
                  <option value="">Choose a restaurant</option>
                  {(restaurants.data ?? []).map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.restaurantName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Business day" name="erp-day">
                <Input
                  id="erp-day"
                  max={yesterday()}
                  onChange={(event) => setBusinessDate(event.target.value)}
                  type="date"
                  value={businessDate}
                />
              </Field>
              <Button disabled={!restaurantId || !businessDate || send.isPending} type="submit">
                {send.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Send aria-hidden="true" className="h-4 w-4" />
                )}
                Send to ERP
              </Button>
            </form>
          ) : (
            <p className="text-sm text-ds-text-2">
              Pick a location in the top bar to send its restaurants&apos; days.
            </p>
          )}
        </Panel>
      ) : null}

      <Panel aria-label="ERP sends" className="overflow-hidden" role="region">
        <ListToolbar>
          <FiltersMenu activeCount={activeFilters}>
            <FilterField label="Status">
              <Select onChange={(event) => filterBy(setStatus)(event.target.value)} value={status}>
                <option value="">All statuses</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {erpStatus(value).label}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Restaurant">
              <Select
                disabled={!scopedHospitalId}
                onChange={(event) => filterBy(setRestaurantFilter)(event.target.value)}
                value={restaurantFilter}
              >
                <option value="">All restaurants</option>
                {(restaurants.data ?? []).map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.restaurantName}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Business day from">
              <Input
                max={to || undefined}
                onChange={(event) => filterBy(setFrom)(event.target.value)}
                type="date"
                value={from}
              />
            </FilterField>
            <FilterField label="Business day to">
              <Input
                min={from || undefined}
                onChange={(event) => filterBy(setTo)(event.target.value)}
                type="date"
                value={to}
              />
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void query.refetch()} />
          <ClearFiltersButton
            active={activeFilters > 0}
            onClear={() => {
              setStatus('');
              setRestaurantFilter('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[132px]')}>Sent</th>
                <th className={tableStyles.th}>Restaurant</th>
                <th className={cn(tableStyles.th, 'w-[120px]')}>Business day</th>
                <th className={cn(tableStyles.th, 'w-[132px]')}>Status</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[110px]')}>Bills</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[15%]')}>By</th>
                <th className={cn(tableStyles.th, 'w-[230px] text-right')}>Files</th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <TableSkeletonRows
                  cells={[
                    undefined,
                    undefined,
                    undefined,
                    tableStyles.phoneHidden,
                    tableStyles.phoneHidden,
                    undefined,
                  ]}
                />
              ) : query.isError ? (
                <tr>
                  <td className="p-6 text-sm text-ds-status-bad-fg" colSpan={7} role="alert">
                    {getApiErrorMessage(query.error)}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="p-4" colSpan={7}>
                    <EmptyState
                      description={
                        activeFilters
                          ? 'Try other filters.'
                          : 'Each day sent to the ERP is listed here.'
                      }
                      icon={Send}
                      title="Nothing sent yet"
                    />
                  </td>
                </tr>
              ) : (
                rows.map((posting) => {
                  const shown = erpStatus(posting.status);
                  const busy = (kind: string) => downloading === `${posting.id}:${kind}`;

                  return (
                    <tr className="border-t border-ds-divider align-top" key={posting.id}>
                      <td className={tableStyles.td}>
                        <DateTimeCell value={posting.createdAt} />
                      </td>
                      <td className={tableStyles.td}>
                        <span className="block truncate font-semibold text-ds-text">
                          {posting.restaurantName ?? '—'}
                        </span>
                        {posting.error ? (
                          <span
                            className="line-clamp-2 text-[12px] text-ds-status-bad-fg"
                            title={posting.error}
                          >
                            {posting.error}
                          </span>
                        ) : null}
                      </td>
                      <td className={tableStyles.td}>
                        {dayFormat.format(new Date(`${posting.businessDate}T00:00:00Z`))}
                      </td>
                      <td className={tableStyles.td}>
                        <Badge className="normal-case" variant={shown.tone}>
                          {shown.label}
                        </Badge>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden, 'tabular-nums')}>
                        {posting.billCount} bills
                        <span className="block text-[12px] text-ds-muted">
                          {posting.rowCount} lines
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <span className="block truncate">{posting.sentByName ?? '—'}</span>
                      </td>
                      <td className={cn(tableStyles.td, 'text-right')}>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            aria-label={`Log file for ${posting.restaurantName ?? 'this send'}`}
                            disabled={busy('log')}
                            onClick={() => void download(posting, 'log')}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <FileText aria-hidden="true" className="h-4 w-4" />
                            Log
                          </Button>
                          {posting.rowCount > 0 ? (
                            <Button
                              aria-label={`Excel data for ${posting.restaurantName ?? 'this send'}`}
                              disabled={busy('excel')}
                              onClick={() => void download(posting, 'excel')}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                              Excel
                            </Button>
                          ) : null}
                          {canSend && enabled && posting.status === 'FAILED' ? (
                            <Button
                              disabled={send.isPending}
                              onClick={() =>
                                void sendDay({
                                  businessDate: posting.businessDate,
                                  hospitalId: posting.hospitalId,
                                  restaurantId: posting.restaurantId,
                                })
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Retry
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {query.data ? (
          <ListPager
            limit={limit}
            noun="sends"
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
            onPageChange={setPage}
            page={page}
            total={query.data.total}
            totalPages={Math.max(1, Math.ceil(query.data.total / limit))}
          />
        ) : null}
      </Panel>
    </section>
  );
}
