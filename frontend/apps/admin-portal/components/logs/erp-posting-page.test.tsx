import type { ErpPosting, ErpPostingPage, Restaurant } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ErpPostingModule from '@/lib/erp-posting';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { downloadText } from '@/lib/erp-posting';
import { downloadReportExcel } from '@/lib/report-excel';
import { ErpPostingPageClient } from './erp-posting-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
vi.mock('@/lib/report-excel', () => ({ downloadReportExcel: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/erp-posting', async (importOriginal) => ({
  ...(await importOriginal<typeof ErpPostingModule>()),
  downloadText: vi.fn(),
}));
// The API calls the screen makes, each a typed stand-in.
type ErpPostingsApi = typeof ApiModule.erpPostingsApi;
const erpPostingsApi = vi.hoisted(() => ({
  getErpPosting: vi.fn<ErpPostingsApi['getErpPosting']>(),
  listErpPostings: vi.fn<ErpPostingsApi['listErpPostings']>(),
  sendErpPosting: vi.fn<ErpPostingsApi['sendErpPosting']>(),
}));
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listRestaurants: vi.fn<OrganizationApi['listRestaurants']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  erpPostingsApi,
  organizationApi,
}));

const cafe = { id: 'r-cafe', restaurantName: 'Cafe Max' } as Restaurant;
const posting = (patch: Partial<ErpPosting>): ErpPosting => ({
  billCount: 42,
  businessDate: '2026-11-17',
  createdAt: '2026-11-18T02:00:00Z',
  durationMs: 1200,
  error: null,
  hospitalId: 'h-ppg',
  id: 'p-1',
  responseStatus: 200,
  restaurantId: 'r-cafe',
  restaurantName: 'Cafe Max',
  rowCount: 120,
  sentBy: 'u-1',
  sentByName: 'Asha Rao',
  status: 'SUCCESS',
  ...patch,
});
const sent = posting({});
const failed = posting({
  billCount: 10,
  error: 'ERP refused the journal',
  id: 'p-2',
  restaurantName: 'Juice Bar',
  rowCount: 0,
  status: 'FAILED',
});

function serve(patch: Partial<ErpPostingPage> = {}) {
  erpPostingsApi.listErpPostings.mockReturnValue(
    reply({ enabled: true, items: [sent, failed], limit: 25, page: 1, total: 2, ...patch }),
  );
}

const lastQuery = () => erpPostingsApi.listErpPostings.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  act(() => window.history.replaceState(null, '', '/logs/erp'));
  atLocation(ppg);
  signedIn(['REPORT_ERP', 'ERP_POSTING_SEND']);
  serve();
  organizationApi.listRestaurants.mockReturnValue(page([cafe]));
  erpPostingsApi.sendErpPosting.mockReturnValue(
    Promise.resolve({ data: sent, message: 'Sent to the ERP', success: true }),
  );
});

describe('ERP Posting', () => {
  it('lists each day sent, its result, and who sent it', async () => {
    renderScreen(<ErpPostingPageClient />);

    const row = within(await screen.findByRole('row', { name: /Cafe Max/ }));
    expect(row.getByText('17 Nov 2026')).toBeInTheDocument();
    expect(row.getByText('Success')).toBeInTheDocument();
    expect(row.getByText('42 bills')).toBeInTheDocument();
    expect(row.getByText('Asha Rao')).toBeInTheDocument();
    const failedRow = within(screen.getByRole('row', { name: /Juice Bar/ }));
    expect(failedRow.getByText('ERP refused the journal')).toBeInTheDocument();
    // No lines: no Excel data to download.
    expect(failedRow.queryByRole('button', { name: /Excel data/ })).not.toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ hospitalId: 'h-ppg', limit: 25, page: 1 });
  });

  it('counts the sends under the list', async () => {
    renderScreen(<ErpPostingPageClient />);
    await screen.findByRole('row', { name: /Cafe Max/ });

    // The pager's line is split across spans: match it whole.
    const line = (_: string, element: Element | null) =>
      element?.tagName === 'SPAN' && element.textContent === '1–2 of 2 sends';
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  it('says nothing has been sent yet', async () => {
    serve({ items: [], total: 0 });
    renderScreen(<ErpPostingPageClient />);

    expect(await screen.findByText('Nothing sent yet')).toBeInTheDocument();
  });

  it('shows why the list could not be loaded', async () => {
    erpPostingsApi.listErpPostings.mockRejectedValue(
      new ApiClientError(500, 'ERP log unavailable'),
    );
    renderScreen(<ErpPostingPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('ERP log unavailable');
  });

  it('filters by status and business days', async () => {
    const { user } = renderScreen(<ErpPostingPageClient />);
    await screen.findByRole('row', { name: /Cafe Max/ });

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'FAILED');
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.type(screen.getByLabelText('Business day from'), '2026-11-01');

    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ from: '2026-11-01', page: 1, status: 'FAILED' }),
    );
  });

  it('sends a restaurant’s day and says how it went', async () => {
    const { user } = renderScreen(<ErpPostingPageClient />);
    const form = within(screen.getByRole('region', { name: 'Send a day to the ERP' }));

    expect(form.getByRole('button', { name: 'Send to ERP' })).toBeDisabled();
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Restaurant' }),
      await form.findByRole('option', { name: 'Cafe Max' }),
    );
    await user.clear(form.getByLabelText('Business day'));
    await user.type(form.getByLabelText('Business day'), '2026-11-10');
    await user.click(form.getByRole('button', { name: 'Send to ERP' }));

    expect(erpPostingsApi.sendErpPosting).toHaveBeenCalledWith({
      businessDate: '2026-11-10',
      hospitalId: 'h-ppg',
      resend: false,
      restaurantId: 'r-cafe',
    });
    expect(await screen.findByText('Sent to the ERP')).toBeInTheDocument();
    expect(screen.getByText('42 bills, 120 lines.')).toBeInTheDocument();
  });

  it('asks before sending a day the ERP already took, and sends it again when confirmed', async () => {
    erpPostingsApi.sendErpPosting
      .mockRejectedValueOnce(new ApiClientError(409, 'Cafe Max 10 Nov was sent already.'))
      .mockReturnValueOnce(Promise.resolve({ data: sent, message: 'Sent again', success: true }));
    const { user } = renderScreen(<ErpPostingPageClient />);
    const form = within(screen.getByRole('region', { name: 'Send a day to the ERP' }));
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Restaurant' }),
      await form.findByRole('option', { name: 'Cafe Max' }),
    );

    await user.click(form.getByRole('button', { name: 'Send to ERP' }));
    const ask = await screen.findByRole('dialog', { name: 'Send this day again?' });
    expect(ask).toHaveTextContent('A second send may count the day twice in the ERP.');
    await user.click(within(ask).getByRole('button', { name: 'Send again' }));

    await waitFor(() =>
      expect(erpPostingsApi.sendErpPosting).toHaveBeenLastCalledWith(
        expect.objectContaining({ resend: true }),
      ),
    );
    expect(await screen.findByText('Sent again')).toBeInTheDocument();
  });

  it('retries a failed send from its row', async () => {
    const { user } = renderScreen(<ErpPostingPageClient />);

    await user.click(
      within(await screen.findByRole('row', { name: /Juice Bar/ })).getByRole('button', {
        name: 'Retry',
      }),
    );

    expect(erpPostingsApi.sendErpPosting).toHaveBeenCalledWith({
      businessDate: '2026-11-17',
      hospitalId: 'h-ppg',
      resend: false,
      restaurantId: 'r-cafe',
    });
  });

  it('downloads a send’s log file and Excel data', async () => {
    erpPostingsApi.getErpPosting.mockReturnValue(
      reply({
        ...sent,
        report: { title: 'ERP Journal' } as never,
        requestBody: '{"lines":[]}',
        responseBody: 'OK',
      }),
    );
    const { user } = renderScreen(<ErpPostingPageClient />);
    const row = within(await screen.findByRole('row', { name: /Cafe Max/ }));

    await user.click(row.getByRole('button', { name: 'Log file for Cafe Max' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [name, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ERPReport-Cafe-Max-2026-11-17.txt');
    expect(text).toContain('{"lines":[]}');

    await user.click(row.getByRole('button', { name: 'Excel data for Cafe Max' }));
    await waitFor(() => expect(downloadReportExcel).toHaveBeenCalledWith({ title: 'ERP Journal' }));
  });

  it('only lists sends for someone who may not send', async () => {
    signedIn(['REPORT_ERP']);
    renderScreen(<ErpPostingPageClient />);
    await screen.findByRole('row', { name: /Juice Bar/ });

    expect(screen.queryByRole('region', { name: 'Send a day to the ERP' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('explains that sending is not set up, and offers no send', async () => {
    serve({ enabled: false });
    renderScreen(<ErpPostingPageClient />);

    expect(await screen.findByText('Sending to the ERP is not set up yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Send a day to the ERP' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('asks for a location before a day can be sent', async () => {
    atLocation(null);
    renderScreen(<ErpPostingPageClient />);

    expect(await screen.findByText(/Pick a location in the top bar/)).toBeInTheDocument();
  });
});
