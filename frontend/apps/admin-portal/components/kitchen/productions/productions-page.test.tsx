import { screen, waitFor, within } from '@testing-library/react';
import type { KitchenProduction } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { at, router } from '@/test/next-navigation';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { KitchenProductionsPageClient } from './productions-page';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    cancelKitchenProduction: vi.fn(),
    deleteKitchenProduction: vi.fn(),
    getKitchenProduction: vi.fn(),
    listKitchenItems: vi.fn(),
    listKitchenProductions: vi.fn(),
    listKitchens: vi.fn(),
    postKitchenProduction: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

const production = (patch: Partial<KitchenProduction>): KitchenProduction =>
  ({
    businessDate: '2026-11-18',
    chef: { id: 'u-1', name: 'Ravi Kumar' },
    createdAt: '2026-11-18T05:00:00.000Z',
    hospital: ppg,
    hospitalId: ppg.id,
    id: 'kp-1',
    kitchen: { id: 'k-1', kitchenCode: 'MK', kitchenName: 'Main Kitchen' },
    kitchenId: 'k-1',
    lines: [
      { acceptedQty: 9, item: { id: 'i-1', itemName: 'Dal' }, producedQty: 10, wastageQty: 1 },
      { acceptedQty: 5, item: { id: 'i-2', itemName: 'Rice' }, producedQty: 5, wastageQty: 0 },
    ],
    productionDate: '2026-11-18T05:00:00.000Z',
    productionNumber: 'KP-001',
    remarks: null,
    status: 'DRAFT',
    updatedAt: '2026-11-18T05:00:00.000Z',
    ...patch,
  }) as KitchenProduction;

const draft = production({});
const posted = production({ chef: null, id: 'kp-2', productionNumber: 'KP-002', status: 'POSTED' });

// Everything a head chef may do with a production.
const chef = [
  'KITCHEN_PRODUCTION_VIEW',
  'KITCHEN_PRODUCTION_CREATE',
  'KITCHEN_PRODUCTION_UPDATE',
  'KITCHEN_PRODUCTION_POST',
  'KITCHEN_PRODUCTION_DELETE',
];

beforeEach(() => {
  vi.clearAllMocks();
  at('/kitchen/productions');
  atLocation(ppg);
  signedIn(chef);
  api.listKitchens.mockReturnValue(page([{ id: 'k-1', kitchenName: 'Main Kitchen' }]) as never);
  api.listKitchenProductions.mockImplementation(((query: { statusCounts?: boolean }) =>
    query.statusCounts
      ? reply({
          items: [],
          meta: {
            limit: 0,
            page: 1,
            statusCounts: { CANCELLED: 0, DRAFT: 1, POSTED: 6 },
            total: 7,
            totalPages: 1,
          },
        })
      : page([draft, posted])) as never);
});

const listRequests = () =>
  api.listKitchenProductions.mock.calls
    .map(([query]) => query)
    .filter((query) => !query?.statusCounts);
const column = (name: string) => within(screen.getByRole('region', { name }));

describe('the production board', () => {
  it('puts each production in its status column with what was made and wasted', async () => {
    renderScreen(<KitchenProductionsPageClient />);

    const drafts = column('Draft productions');
    expect(await drafts.findByRole('link', { name: 'KP-001' })).toBeInTheDocument();
    expect(drafts.getByText('+ 1 more')).toBeInTheDocument();
    expect(drafts.getByText('Ravi Kumar')).toBeInTheDocument();
    const card = drafts.getByRole('link', { name: 'KP-001' }).closest('article')!;
    expect(card).toHaveTextContent('Produced 15 · Accepted 14 · Wastage 1');

    const postedColumn = column('Posted productions');
    expect(postedColumn.getByRole('link', { name: 'KP-002' })).toBeInTheDocument();
    expect(postedColumn.getByText('No chef assigned')).toBeInTheDocument();
    expect(
      column('Cancelled productions').getByText('No cancelled productions'),
    ).toBeInTheDocument();
  });

  it('counts the productions by status, and shows one column when a status is picked', async () => {
    const { user } = renderScreen(<KitchenProductionsPageClient />);
    const strip = within(screen.getByRole('group', { name: 'Productions at a glance' }));

    expect(await strip.findByText('7')).toBeInTheDocument();
    await user.click(strip.getByRole('button', { name: /^Posted/ }));

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ status: 'POSTED' }));
    expect(screen.queryByRole('region', { name: 'Draft productions' })).toBeNull();
  });

  it('searches and asks only for the location in the header', async () => {
    const { user } = renderScreen(<KitchenProductionsPageClient />);
    await screen.findByRole('link', { name: 'KP-001' });
    expect(listRequests()[0]).toMatchObject({ hospitalId: ppg.id, sortOrder: 'desc' });

    await user.type(screen.getByRole('searchbox', { name: 'Search productions' }), 'dal');

    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ page: 1, search: 'dal' }));
  });

  it('posts a draft to kitchen stock', async () => {
    api.postKitchenProduction.mockReturnValue(reply({ ...draft, status: 'POSTED' }) as never);
    const { user } = renderScreen(<KitchenProductionsPageClient />);

    await user.click(await column('Draft productions').findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(api.postKitchenProduction).toHaveBeenCalledWith('kp-1'));
    expect(await screen.findByText('Production posted')).toBeInTheDocument();
  });

  it('cancels and deletes a draft only once confirmed', async () => {
    api.cancelKitchenProduction.mockReturnValue(reply(draft));
    api.deleteKitchenProduction.mockReturnValue(reply(null) as never);
    const { user } = renderScreen(<KitchenProductionsPageClient />);
    const drafts = column('Draft productions');

    await user.click(await drafts.findByRole('button', { name: 'Cancel' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Cancel KP-001?' })).getByRole('button', {
        name: 'Cancel production',
      }),
    );
    await waitFor(() => expect(api.cancelKitchenProduction).toHaveBeenCalledWith('kp-1'));

    await user.click(drafts.getByRole('button', { name: 'Delete KP-001' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Delete KP-001?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(api.deleteKitchenProduction).toHaveBeenCalledWith('kp-1'));
    expect(await screen.findByText('KP-001 deleted')).toBeInTheDocument();
  });

  it('shows why posting failed', async () => {
    api.postKitchenProduction.mockRejectedValue(new Error('Kitchen stock is locked'));
    const { user } = renderScreen(<KitchenProductionsPageClient />);

    await user.click(await column('Draft productions').findByRole('button', { name: 'Post' }));

    expect(await screen.findByText('Kitchen stock is locked')).toBeInTheDocument();
    expect(screen.getByText('Production was not posted')).toBeInTheDocument();
  });

  it('offers Post, Cancel and Delete only to those who may do each', async () => {
    signedIn(['KITCHEN_PRODUCTION_VIEW']);
    renderScreen(<KitchenProductionsPageClient />);
    const drafts = column('Draft productions');

    await drafts.findByRole('link', { name: 'KP-001' });
    expect(drafts.queryByRole('button', { name: 'Post' })).toBeNull();
    expect(drafts.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(drafts.queryByRole('button', { name: 'Delete KP-001' })).toBeNull();
    expect(screen.queryByRole('link', { name: /new production/i })).toBeNull();
  });

  it('opens a production from its number only: clicking the card does nothing', async () => {
    const { user } = renderScreen(<KitchenProductionsPageClient />);

    await user.click(await screen.findByText('Ravi Kumar'));
    expect(router.push).not.toHaveBeenCalled();

    expect(screen.getByRole('link', { name: 'KP-001' })).toHaveAttribute(
      'href',
      '/kitchen/productions?id=kp-1',
    );
  });

  it('opens the production named in the link in place of the board', async () => {
    at('/kitchen/productions', 'id=kp-1');
    api.getKitchenProduction.mockReturnValue(reply(draft));
    api.listKitchenItems.mockReturnValue(page([]));
    renderScreen(<KitchenProductionsPageClient />);

    expect(await screen.findByRole('heading', { name: 'KP-001', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Draft productions' })).toBeNull();
  });

  it('shows why the board did not load', async () => {
    api.listKitchenProductions.mockRejectedValue(new Error('Kitchen service is down'));
    renderScreen(<KitchenProductionsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Kitchen service is down');
  });
});
