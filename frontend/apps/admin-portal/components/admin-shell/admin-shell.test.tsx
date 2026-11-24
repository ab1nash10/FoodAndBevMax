import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { at, router } from '@/test/next-navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { AdminShell } from './admin-shell';

// The stand-ins, with a way to sign the user out or hold the locations for one test.
const override = vi.hoisted(() => ({
  auth: {},
  location: {},
}));

vi.mock('next/navigation', () => import('@/test/next-navigation'));
// Whether a link's page is still on its way (Next's useLinkStatus): set per test.
const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLinkStatus: () => ({ pending: linkStatus.pending }),
}));
vi.mock('@/components/auth-provider', async () => {
  const auth = await import('@/test/auth');
  return { ...auth, useAuth: () => ({ ...auth.useAuth(), ...override.auth }) };
});
vi.mock('@/components/location-context', async () => {
  const location = await import('@/test/location');
  // The stand-in leaves out the label helpers; the real ones need nothing from the provider.
  const { formatGlobalLocationLabel, getLocationTitle } = await vi.importActual<
    typeof LocationModule
  >('@/components/location-context');
  return {
    ...location,
    formatGlobalLocationLabel,
    getLocationTitle,
    useLocationContext: () => ({ ...location.useLocationContext(), ...override.location }),
  };
});
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  getDashboardNavCounts: vi.fn<OrganizationApi['getDashboardNavCounts']>(),
  getMyPosShift: vi.fn<OrganizationApi['getMyPosShift']>(),
}));
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  getMyPreferences: vi.fn<UserApi['getMyPreferences']>(),
  updateMyPreferences: vi.fn<UserApi['updateMyPreferences']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
  userApi,
}));

const logout = vi.fn(() => Promise.resolve());

const renderShell = () =>
  renderScreen(
    <ThemeProvider>
      <AdminShell>
        <h1>Items page</h1>
      </AdminShell>
    </ThemeProvider>,
  );

const modules = () =>
  within(screen.getByRole('navigation', { name: 'Modules' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  linkStatus.pending = false;
  override.auth = { logout };
  override.location = {};
  at('/masters/items');
  signedIn(['ITEM_VIEW', 'ITEM_CATEGORY_VIEW', 'USER_VIEW'], ['Store Manager']);
  userApi.getMyPreferences.mockReturnValue(
    reply({ defaultLocationId: 'h-ppg', startPage: null, theme: null }),
  );
  organizationApi.getDashboardNavCounts.mockReturnValue(
    reply({ grns: 3, productions: 0, transfers: 0 }),
  );
  organizationApi.getMyPosShift.mockReturnValue(reply(null));
});

describe('the portal shell', () => {
  it('shows the page with only the modules the user may open', () => {
    renderShell();

    expect(screen.getByRole('heading', { name: 'Items page' })).toBeInTheDocument();
    expect(modules()).toEqual(['Dashboard', 'Item & menu', 'Access']);
    const pills = within(screen.getByRole('navigation', { name: 'Modules' }));
    expect(pills.getByRole('link', { current: 'page' })).toHaveTextContent('Item & menu');
  });

  it('gives a steward’s phone screen the whole phone: no top bar', () => {
    signedIn(['ORDER_DELIVER'], ['Delivery Operator']);
    at('/deliveries');
    renderShell();

    expect(screen.getByRole('heading', { name: 'Items page' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Modules' })).toBeNull();
  });

  it('answers a menu click at once: the page gives way to the loading shape', () => {
    // A module or page link whose page has not arrived yet (dev mode, or not prefetched).
    linkStatus.pending = true;
    renderShell();

    const main = within(screen.getByRole('main'));
    expect(main.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(main.queryByRole('heading', { name: 'Items page' })).not.toBeInTheDocument();
  });

  it('leaves the page up when no menu link is waiting (a prefetched page opens at once)', () => {
    renderShell();

    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'Items page' })).toBeInTheDocument();
    expect(main.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('lists the current module’s pages as tabs', () => {
    renderShell();

    const tabs = within(screen.getByRole('navigation', { name: 'Item & menu pages' }));
    expect(tabs.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Item categories',
      'Items',
    ]);
    expect(tabs.getByRole('link', { name: 'Items' })).toHaveAttribute('aria-current', 'page');
  });

  it('adds the work waiting in a module to its pill', async () => {
    signedIn(['GRN_VIEW']);
    at('/inventory/erp-grns');
    renderShell();

    const pills = within(screen.getByRole('navigation', { name: 'Modules' }));
    expect(await pills.findByRole('link', { name: /Inventory\s*3\s*waiting/ })).toBeInTheDocument();
  });

  it('sends a user away from a page they may not open, without showing it', async () => {
    at('/masters/employees');
    renderShell();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/forbidden'));
    expect(screen.queryByRole('heading', { name: 'Items page' })).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign in', async () => {
    override.auth = { currentUser: null, isAuthenticated: false };
    renderShell();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/login'));
    expect(screen.queryByRole('heading', { name: 'Items page' })).not.toBeInTheDocument();
  });

  it('leaves an ended session to the sign-in redirect that says why (8 idle hours)', async () => {
    override.auth = {
      currentUser: null,
      isAuthenticated: false,
      sessionNotice: 'You were signed out after 8 hours without activity. Please login again.',
    };
    renderShell();

    await act(() => Promise.resolve());
    expect(router.replace).not.toHaveBeenCalledWith('/auth/login');
    expect(screen.queryByRole('heading', { name: 'Items page' })).not.toBeInTheDocument();
  });

  it('offers a retry when the user’s locations cannot be loaded', async () => {
    const retryLocations = vi.fn();
    override.location = { isLoadingLocations: true, locationsFailed: true, retryLocations };
    const { user } = renderShell();

    expect(screen.getByText('Could not load your locations')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Items page' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retryLocations).toHaveBeenCalled();
  });

  it('logs out straight away when no POS shift is open', async () => {
    const { user } = renderShell();

    await user.click(screen.getAllByRole('menuitem', { name: 'Log out' })[0]!);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/login'));
    expect(logout).toHaveBeenCalled();
  });

  it('asks a cashier with an open shift to end it first, and can log out anyway', async () => {
    organizationApi.getMyPosShift.mockReturnValue(
      reply({
        counterName: 'Counter 2',
        hasTill: true,
        openedAt: new Date().toISOString(),
        restaurantName: 'Cafe Max',
      }),
    );
    const { user } = renderShell();

    await user.click(screen.getAllByRole('menuitem', { name: 'Log out' })[0]!);

    const dialog = within(
      await screen.findByRole('dialog', { name: 'End your shift before you log out' }),
    );
    expect(dialog.getByText('Counter 2')).toBeInTheDocument();
    expect(dialog.getByText('Cafe Max')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Log out anyway' }));
    expect(logout).toHaveBeenCalled();
  });

  it('keeps the user signed in when they choose to stay', async () => {
    organizationApi.getMyPosShift.mockReturnValue(
      reply({
        counterName: 'Counter 2',
        hasTill: false,
        openedAt: new Date().toISOString(),
        restaurantName: 'Cafe Max',
      }),
    );
    const { user } = renderShell();

    await user.click(screen.getAllByRole('menuitem', { name: 'Log out' })[0]!);
    await screen.findByRole('dialog', { name: 'End your shift before you log out' });
    // No till reaches that counter: there is nowhere to go and end it.
    expect(screen.queryByRole('link', { name: 'Go to the POS' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(screen.queryByRole('dialog', { name: /End your shift/ })).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out even when the shift check fails', async () => {
    organizationApi.getMyPosShift.mockRejectedValue(new Error('Failed to fetch'));
    const { user } = renderShell();

    await user.click(screen.getAllByRole('menuitem', { name: 'Log out' })[0]!);

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it('opens the full menu on small screens and closes it with Esc', async () => {
    const { user } = renderShell();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getAllByRole('navigation', { name: 'Modules' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Item & menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('navigation', { name: 'Modules' })).toHaveLength(1);
  });

  it('opens search from the top bar', async () => {
    const { user } = renderShell();

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByRole('dialog', { name: 'Search and commands' })).toBeInTheDocument();
  });

  it('opens Preferences from the account menu', async () => {
    const { user } = renderShell();

    await user.click(screen.getAllByRole('menuitem', { name: 'Preferences' })[0]!);

    expect(await screen.findByRole('dialog', { name: 'Preferences' })).toBeInTheDocument();
  });
});
