import type { ReportResult, Restaurant } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg, saket } from '@/test/location';
import { downloadReportExcel } from '@/lib/report-excel';
import { ReportsPageClient } from './reports-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/location-context', async () => {
  const location = await import('@/test/location');
  // The stand-in leaves out the user's locations as a picker reads them.
  return {
    ...location,
    useMyLocations: () => ({
      data: location.useLocationContext().availableLocations,
      isLoading: false,
    }),
  };
});
vi.mock('@/lib/report-excel', () => ({ downloadReportExcel: vi.fn(() => Promise.resolve()) }));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listRestaurants: vi.fn<OrganizationApi['listRestaurants']>(),
}));
type ReportsApi = typeof ApiModule.reportsApi;
const reportsApi = vi.hoisted(() => ({
  listReports: vi.fn<ReportsApi['listReports']>(),
  runReport: vi.fn<ReportsApi['runReport']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
  reportsApi,
}));

const catalog = [
  { code: 'sales', description: 'Bills and their payment modes.', title: 'Sales Report' },
  { code: 'item-wise', description: 'What sold, item by item.', title: 'Item-wise Report' },
];
const result: ReportResult = {
  code: 'sales',
  columns: [
    { key: 'restaurant', label: 'Restaurant' },
    { group: 'POS Orders', key: 'bills', kind: 'number', label: 'Bills' },
    { group: 'POS Orders', key: 'amount', kind: 'money', label: 'Amount' },
  ],
  from: '2026-11-18T00:00:00.000Z',
  generatedAt: '2026-11-18T12:00:00.000Z',
  location: 'PPG - Patparganj, Delhi',
  plain: false,
  restaurants: ['Cafe Max'],
  rows: [{ amount: 1234.5, bills: 12, restaurant: 'Cafe Max' }],
  title: 'Sales Report',
  to: '2026-11-18T12:00:00.000Z',
  totals: { amount: 1234.5, bills: 12, restaurant: 'Total' },
};

const lastRun = () => reportsApi.runReport.mock.calls.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  act(() => window.history.replaceState(null, '', '/reports'));
  atLocation(ppg);
  reportsApi.listReports.mockReturnValue(reply(catalog));
  reportsApi.runReport.mockReturnValue(reply(result));
  organizationApi.listRestaurants.mockReturnValue(
    page([{ id: 'r-cafe', restaurantName: 'Cafe Max' } as Restaurant]),
  );
});

describe('Reports', () => {
  it('offers the reports the user may run, the first one picked', async () => {
    renderScreen(<ReportsPageClient />);

    const reports = within(await screen.findByRole('group', { name: 'Report' }));
    expect(reports.getByRole('button', { name: 'Sales Report' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Bills and their payment modes.')).toBeInTheDocument();
    // Nothing runs until asked.
    expect(reportsApi.runReport).not.toHaveBeenCalled();
  });

  it('picks another report, kept in the link', async () => {
    const { user } = renderScreen(<ReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Item-wise Report' }));

    expect(screen.getByRole('button', { name: 'Item-wise Report' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.location.search).toBe('?report=item-wise');
  });

  it('says so when the user may run no report', async () => {
    reportsApi.listReports.mockReturnValue(reply([]));
    renderScreen(<ReportsPageClient />);

    expect(
      await screen.findByText('You have no reports to run. Ask an admin for report access.'),
    ).toBeInTheDocument();
  });

  it('runs the report for the header’s location, restaurant and time range', async () => {
    const { user } = renderScreen(<ReportsPageClient />);
    await screen.findByRole('group', { name: 'Report' });

    expect(screen.queryByRole('combobox', { name: 'Location' })).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Restaurant' }),
      await screen.findByRole('option', { name: 'Cafe Max' }),
    );
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-11-18T00:00');
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('To'), '2026-11-18T12:00');
    await user.click(screen.getByRole('button', { name: 'Show report' }));

    await waitFor(() =>
      expect(lastRun()).toEqual([
        'sales',
        {
          from: new Date('2026-11-18T00:00').toISOString(),
          hospitalId: 'h-ppg',
          restaurantIds: 'r-cafe',
          to: new Date('2026-11-18T12:00').toISOString(),
        },
      ]),
    );
  });

  it('shows the report with its group headings, amounts and totals, and downloads it', async () => {
    const { user } = renderScreen(<ReportsPageClient />);
    await screen.findByRole('group', { name: 'Report' });

    await user.click(screen.getByRole('button', { name: 'Show report' }));

    const report = within(await screen.findByRole('region', { name: 'Sales Report' }));
    expect(report.getByText('PPG - Patparganj, Delhi')).toBeInTheDocument();
    expect(report.getByRole('columnheader', { name: 'POS Orders' })).toHaveAttribute(
      'colspan',
      '2',
    );
    const [, , row, totals] = report.getAllByRole('row');
    expect(row).toHaveTextContent('Cafe Max121,234.50');
    expect(totals).toHaveTextContent('Total121,234.50');

    await user.click(report.getByRole('button', { name: 'Download Excel' }));
    expect(downloadReportExcel).toHaveBeenCalledWith(result);
  });

  it('says when nothing happened in the range', async () => {
    reportsApi.runReport.mockReturnValue(reply({ ...result, rows: [], totals: null }));
    const { user } = renderScreen(<ReportsPageClient />);
    await screen.findByRole('group', { name: 'Report' });

    await user.click(screen.getByRole('button', { name: 'Show report' }));

    expect(await screen.findByText('Nothing in this range.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Excel' })).toBeDisabled();
  });

  it('shows why the report could not be run', async () => {
    reportsApi.runReport.mockRejectedValue(
      new ApiClientError(400, 'The range is longer than 31 days'),
    );
    const { user } = renderScreen(<ReportsPageClient />);
    await screen.findByRole('group', { name: 'Report' });

    await user.click(screen.getByRole('button', { name: 'Show report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The range is longer than 31 days');
  });

  it('asks for a location when the header shows all of them', async () => {
    atLocation(null, [ppg, saket]);
    const { user } = renderScreen(<ReportsPageClient />);
    await screen.findByRole('group', { name: 'Report' });

    expect(screen.getByText('Choose a location.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show report' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Location' }), 'h-skt');
    await user.click(screen.getByRole('button', { name: 'Show report' }));

    await waitFor(() => expect(lastRun()?.[1]).toMatchObject({ hospitalId: 'h-skt' }));
  });

  it('refuses a range that ends before it starts', async () => {
    const { user } = renderScreen(<ReportsPageClient />);
    await screen.findByRole('group', { name: 'Report' });

    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-11-18T12:00');
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('To'), '2026-11-18T09:00');

    expect(screen.getByText('The report has to end after it starts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show report' })).toBeDisabled();
  });
});
