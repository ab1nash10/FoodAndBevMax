import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { page, renderScreen } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { at, router } from '@/test/next-navigation';
import { openCommandPalette } from '@/lib/command-palette-events';
import { CommandPalette, type PalettePage } from './command-palette';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
type GrnEntriesApi = typeof ApiModule.grnEntriesApi;
const grnEntriesApi = vi.hoisted(() => ({
  listGrnEntries: vi.fn<GrnEntriesApi['listGrnEntries']>(),
}));
const organizationApi = vi.hoisted(() => ({
  listEmployees: vi.fn<OrganizationApi['listEmployees']>(),
  listItems: vi.fn<OrganizationApi['listItems']>(),
  listKitchenProductions: vi.fn<OrganizationApi['listKitchenProductions']>(),
  listKitchens: vi.fn<OrganizationApi['listKitchens']>(),
  listPosBills: vi.fn<OrganizationApi['listPosBills']>(),
  listRestaurants: vi.fn<OrganizationApi['listRestaurants']>(),
  listStores: vi.fn<OrganizationApi['listStores']>(),
  listTransfers: vi.fn<OrganizationApi['listTransfers']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  grnEntriesApi,
  organizationApi,
}));

const pages: PalettePage[] = [
  { group: 'Dashboard', href: '/dashboard', label: 'Dashboard' },
  { count: 2, group: 'Inventory', href: '/inventory/transfers', label: 'Transfers' },
  { group: 'Inventory', href: '/inventory/store-stock', label: 'Store stock' },
  { group: 'Item & menu', href: '/masters/items', label: 'Items' },
];

const options = () => screen.getAllByRole('option').map((option) => option.textContent);

function openPalette() {
  act(() => openCommandPalette());
  return screen.getByRole('dialog', { name: 'Search and commands' });
}

beforeEach(() => {
  vi.clearAllMocks();
  at('/dashboard');
  atLocation(ppg);
  signedIn(['TRANSFER_VIEW', 'TRANSFER_CREATE', 'ITEM_VIEW']);
  // Every list empty unless a test says otherwise.
  for (const list of [...Object.values(organizationApi), grnEntriesApi.listGrnEntries]) {
    (list as Mock).mockReturnValue(page([]));
  }
});

describe('the command palette', () => {
  it('opens with Ctrl K and closes with Esc', async () => {
    const { user } = renderScreen(<CommandPalette pages={pages} />);

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('combobox', { name: 'Search or type a command' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers only what the user may create, and the shortcut pages', () => {
    renderScreen(<CommandPalette pages={pages} />);
    openPalette();

    const create = within(screen.getByRole('group', { name: 'Create' }));
    expect(create.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('New transfer'),
    ]);
    const goTo = within(screen.getByRole('group', { name: 'Go to' }));
    expect(goTo.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('Dashboard'),
      expect.stringContaining('Transfers'),
      expect.stringContaining('Items'),
    ]);
    expect(goTo.getByRole('option', { name: /Transfers/ })).toHaveTextContent('2 pending');
  });

  it('filters pages by what is typed and opens the one picked with Enter', async () => {
    const { user } = renderScreen(<CommandPalette pages={pages} />);
    openPalette();

    await user.keyboard('stock');
    expect(options()).toEqual([expect.stringContaining('Store stock')]);
    await user.keyboard('{Enter}');

    expect(router.push).toHaveBeenCalledWith('/inventory/store-stock');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves through the choices with the arrow keys', async () => {
    const { user } = renderScreen(<CommandPalette pages={pages} />);
    openPalette();

    await user.keyboard('{ArrowDown}');

    const active = screen
      .getAllByRole('option')
      .find((option) => option.getAttribute('aria-selected') === 'true');
    expect(active).toHaveTextContent('Dashboard');
  });

  it('finds records the user may see at the chosen location', async () => {
    organizationApi.listTransfers.mockReturnValue(
      page([
        { id: 't-42', status: 'IN_TRANSIT', transferDate: '2026-11-18', transferNumber: 'TRF0042' },
      ]) as never,
    );
    const { user } = renderScreen(<CommandPalette pages={pages} />);
    openPalette();

    await user.keyboard('TRF0042');

    const results = within(await screen.findByRole('group', { name: 'Results' }));
    expect(results.getByRole('option', { name: /TRF0042/ })).toBeInTheDocument();
    expect(organizationApi.listTransfers).toHaveBeenCalledWith({
      hospitalId: 'h-ppg',
      limit: 3,
      search: 'TRF0042',
    });
    // Bills, GRNs and employees are not this user's to see, so they are not asked for.
    expect(organizationApi.listPosBills).not.toHaveBeenCalled();
    expect(grnEntriesApi.listGrnEntries).not.toHaveBeenCalled();
    expect(organizationApi.listEmployees).not.toHaveBeenCalled();

    await user.click(results.getByRole('option', { name: /TRF0042/ }));
    expect(router.push).toHaveBeenCalledWith('/inventory/transfers?id=t-42');
  });

  it('finds a GRN the ERP sent and opens it on ERP GRNs', async () => {
    signedIn(['GRN_VIEW']);
    grnEntriesApi.listGrnEntries.mockReturnValue(
      page([{ grn_No: 'ERP-7', status: 'PENDING', store_name: 'Main Store' }]) as never,
    );
    const { user } = renderScreen(<CommandPalette pages={pages} />);
    openPalette();

    await user.keyboard('ERP-7');

    const results = within(await screen.findByRole('group', { name: 'Results' }));
    expect(grnEntriesApi.listGrnEntries).toHaveBeenCalledWith({
      hospitalId: 'h-ppg',
      limit: 3,
      search: 'ERP-7',
    });
    await user.click(results.getByRole('option', { name: /ERP-7/ }));
    expect(router.push).toHaveBeenCalledWith('/inventory/erp-grns?grn=ERP-7');
  });

  it('opens ERP GRNs with N then G, where deliveries used to be received', async () => {
    signedIn(['GRN_VIEW']);
    const { user } = renderScreen(<CommandPalette pages={pages} />);

    await user.keyboard('ng');

    expect(router.push).toHaveBeenCalledWith('/inventory/erp-grns');
  });

  it('says so when nothing matches', async () => {
    const { user } = renderScreen(<CommandPalette pages={pages} />);
    openPalette();

    await user.keyboard('zzz');

    expect(await screen.findByText(/No matches for “zzz”/)).toBeInTheDocument();
  });

  it('goes to a page with G then a letter, outside any field', async () => {
    const { user } = renderScreen(<CommandPalette pages={pages} />);

    await user.keyboard('gi');

    expect(router.push).toHaveBeenCalledWith('/masters/items');
  });

  it('ignores a create shortcut the user may not use', async () => {
    const { user } = renderScreen(<CommandPalette pages={pages} />);

    await user.keyboard('ng');

    expect(router.push).not.toHaveBeenCalled();
  });
});
