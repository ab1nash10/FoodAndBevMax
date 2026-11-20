import type { AuditLogQuery, AuditRow } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { downloadReportExcel } from '@/lib/report-excel';
import { AuditLogPageClient } from './audit-log-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/location-context', () => import('@/test/location'));
vi.mock('@/lib/report-excel', () => ({ downloadReportExcel: vi.fn(() => Promise.resolve()) }));
// The API calls the screen makes, each a typed stand-in.
type AuditApi = typeof ApiModule.auditApi;
const auditApi = vi.hoisted(() => ({
  exportAuditLogs: vi.fn<AuditApi['exportAuditLogs']>(),
  listAuditLogs: vi.fn<AuditApi['listAuditLogs']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  auditApi,
}));

const entry = (patch: Partial<AuditRow>): AuditRow => ({
  action: 'GRN_POST',
  actorRole: 'Store Manager',
  createdAt: '2026-11-18T09:15:00Z',
  entityId: 'grn-uuid-1',
  entityName: 'grns',
  hospitalId: 'h-ppg',
  id: 'a-1',
  ipAddress: '10.0.0.7',
  locationId: null,
  newValue: { status: 'POSTED' },
  oldValue: { status: 'DRAFT' },
  recordName: 'GRN0042',
  requestId: 'req-9',
  source: 'admin-portal',
  summary: 'Posted GRN0042 into Main Store',
  user: { id: 'u-1', name: 'Asha Rao' },
  userId: 'u-1',
  ...patch,
});
const posted = entry({});
const nightly = entry({
  action: 'ITEM_CREATE',
  entityName: 'items',
  id: 'a-2',
  newValue: { itemName: 'Veg Thali' },
  oldValue: null,
  recordName: null,
  summary: null,
  user: null,
  userId: null,
});

const lastQuery = () => auditApi.listAuditLogs.mock.calls.at(-1)?.[0];
const goTo = (url: string) => act(() => window.history.replaceState(null, '', url));

beforeEach(() => {
  vi.clearAllMocks();
  goTo('/logs/activity');
  atLocation(ppg);
  auditApi.listAuditLogs.mockReturnValue(reply({ items: [posted, nightly], nextCursor: null }));
});

describe('Activity Logs', () => {
  it('lists who did what to which record, at the chosen location', async () => {
    renderScreen(<AuditLogPageClient />);

    const row = within(await screen.findByRole('row', { name: /Posted GRN0042 into Main Store/ }));
    expect(row.getByText('Asha Rao')).toBeInTheDocument();
    expect(row.getByText('Store Manager')).toBeInTheDocument();
    expect(row.getByText('GRN posted')).toBeInTheDocument();
    expect(row.getByText('GRN0042')).toBeInTheDocument();
    // No one signed in made the change; the record has no name, so its id stands in.
    const other = within(screen.getByRole('row', { name: /Item created/ }));
    expect(other.getByText('System')).toBeInTheDocument();
    expect(other.getByText('grn-uuid-1')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ hospitalId: 'h-ppg' });
  });

  it('shows the fields a change made, old to new', async () => {
    const { user } = renderScreen(<AuditLogPageClient />);
    const row = within(await screen.findByRole('row', { name: /Posted GRN0042/ }));

    await user.click(row.getByRole('button', { name: 'Show changes' }));

    const details = within(screen.getByText('Status').closest('td')!);
    expect(details.getByText('DRAFT')).toBeInTheDocument();
    expect(details.getByText('POSTED')).toBeInTheDocument();
    expect(
      details.getByText('Record grn-uuid-1 · via admin-portal · IP 10.0.0.7 · request req-9'),
    ).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Hide changes' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('says there is nothing to show', async () => {
    auditApi.listAuditLogs.mockReturnValue(reply({ items: [], nextCursor: null }));
    renderScreen(<AuditLogPageClient />);

    expect(await screen.findByText('No audit entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeDisabled();
  });

  it('shows why the log could not be loaded', async () => {
    auditApi.listAuditLogs.mockRejectedValue(
      new ApiClientError(403, 'You may not view the audit log'),
    );
    renderScreen(<AuditLogPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('You may not view the audit log');
  });

  it('filters by log type, action, days and summary text', async () => {
    goTo('/logs/activity?type=grns&from=2026-11-01&to=2026-11-18');
    const { user } = renderScreen(<AuditLogPageClient />);
    await screen.findByText('Asha Rao');

    await user.type(screen.getByRole('searchbox', { name: 'Search audit summaries' }), 'GRN0042');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    // An action typed in words is asked for as the code the log keeps.
    await user.type(screen.getByRole('textbox', { name: 'Action' }), 'grn post');

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        action: 'GRN_POST',
        entityName: 'grns',
        from: new Date(2026, 10, 1).toISOString(),
        q: 'GRN0042',
        // The last day is included: up to the midnight after it.
        to: new Date(2026, 10, 19).toISOString(),
      } satisfies AuditLogQuery),
    );
  });

  it('loads older entries on request', async () => {
    auditApi.listAuditLogs
      .mockReturnValueOnce(reply({ items: [posted], nextCursor: 'cursor-2' }))
      .mockReturnValueOnce(reply({ items: [nightly], nextCursor: null }));
    const { user } = renderScreen(<AuditLogPageClient />);

    expect(await screen.findByText('Showing the latest 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('System')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ cursor: 'cursor-2' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('exports what the filters show to Excel', async () => {
    auditApi.exportAuditLogs.mockResolvedValue('createdAt,action\n2026-11-18,GRN_POST\n');
    goTo('/logs/activity?type=grns');
    const { user } = renderScreen(<AuditLogPageClient />);
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    await waitFor(() => expect(downloadReportExcel).toHaveBeenCalled());
    expect(auditApi.exportAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'grns', hospitalId: 'h-ppg' }),
    );
  });

  it('says why the export failed', async () => {
    auditApi.exportAuditLogs.mockRejectedValue(new ApiClientError(500, 'Export timed out'));
    const { user } = renderScreen(<AuditLogPageClient />);
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The Excel file was not exported');
    expect(screen.getByRole('alert')).toHaveTextContent('Export timed out');
  });
});
