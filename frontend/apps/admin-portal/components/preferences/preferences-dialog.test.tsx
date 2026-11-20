import type { UserPreferences } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';
import { renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg, saket } from '@/test/location';
import { ThemeProvider } from '@/components/theme-provider';
import { PreferencesDialog } from './preferences-dialog';

// The stand-ins, with the user's email and sign-out set per test.
const override = vi.hoisted(() => ({ auth: {} }));

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', async () => {
  const auth = await import('@/test/auth');
  return { ...auth, useAuth: () => ({ ...auth.useAuth(), ...override.auth }) };
});
vi.mock('@/components/location-context', async () => {
  const location = await import('@/test/location');
  const { formatGlobalLocationLabel } = await vi.importActual<typeof LocationModule>(
    '@/components/location-context',
  );
  return { ...location, formatGlobalLocationLabel };
});
// The API calls the screen makes, each a typed stand-in.
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  getMyPreferences: vi.fn<UserApi['getMyPreferences']>(),
  updateMyPreferences: vi.fn<UserApi['updateMyPreferences']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  userApi,
}));

const saved: UserPreferences = {
  defaultLocationId: 'h-ppg',
  startPage: null,
  theme: 'light',
};
const logout = vi.fn(() => Promise.resolve());
const onClose = vi.fn();

const renderDialog = () =>
  renderScreen(
    <ThemeProvider>
      <PreferencesDialog onClose={onClose} />
    </ThemeProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['GRN_VIEW', 'ITEM_VIEW']);
  atLocation(ppg, [ppg, saket]);
  override.auth = {
    currentUser: { email: 'asha@max.in', id: 'user-1', name: 'Asha Rao', roles: [] },
    logout,
  };
  userApi.getMyPreferences.mockReturnValue(reply(saved));
  userApi.updateMyPreferences.mockImplementation((body) => reply({ ...saved, ...body }));
});

describe('Preferences', () => {
  it('shows the saved theme, start page and default location', async () => {
    renderDialog();

    const theme = within(await screen.findByRole('group', { name: 'Theme' }));
    expect(theme.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Start page' })).toHaveDisplayValue(
      'Dashboard (default)',
    );
    expect(screen.getByRole('combobox', { name: /^Default location/ })).toHaveDisplayValue(
      'PPG - Patparganj',
    );
  });

  it('saves a theme as soon as it is picked', async () => {
    const { user } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Dark' }));

    expect(userApi.updateMyPreferences).toHaveBeenCalledWith({ theme: 'dark' });
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveClass('dark');
    expect(await screen.findByText('Preferences saved')).toBeInTheDocument();
  });

  it('saves a start page, and the role’s own page as no choice at all', async () => {
    const { user } = renderDialog();
    const startPage = await screen.findByRole('combobox', { name: 'Start page' });

    await user.selectOptions(startPage, '/inventory/erp-grns');
    expect(userApi.updateMyPreferences).toHaveBeenLastCalledWith({
      startPage: '/inventory/erp-grns',
    });

    await user.selectOptions(startPage, '/dashboard');
    expect(userApi.updateMyPreferences).toHaveBeenLastCalledWith({ startPage: null });
  });

  it('saves another default location', async () => {
    const { user } = renderDialog();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: /^Default location/ }),
      'h-skt',
    );

    expect(userApi.updateMyPreferences).toHaveBeenCalledWith({ defaultLocationId: 'h-skt' });
  });

  it('puts a setting back and says why when it could not be saved', async () => {
    userApi.updateMyPreferences.mockRejectedValue(
      new ApiClientError(500, 'Preferences service is down'),
    );
    const { user } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Dark' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Preferences service is down');
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps list density on this device', async () => {
    const { user } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Compact' }));

    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true');
    expect(userApi.updateMyPreferences).not.toHaveBeenCalled();
  });

  it('tells a single-location user the portal always opens there', async () => {
    atLocation(ppg, [ppg]);
    renderDialog();

    expect(
      await screen.findByText('You work at a single location, so the portal always opens there.'),
    ).toBeInTheDocument();
  });

  it('shows why the preferences could not be loaded', async () => {
    userApi.getMyPreferences.mockRejectedValue(
      new ApiClientError(503, 'User service is unavailable'),
    );
    renderDialog();

    expect(await screen.findByText('Preferences could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('User service is unavailable')).toBeInTheDocument();
  });

  it('shows who you are and where you work, read-only', async () => {
    override.auth = {
      ...override.auth,
      currentUser: {
        email: 'asha@max.in',
        id: 'user-1',
        mobile: '9876543210',
        name: 'Asha Rao',
        roles: ['Admin', 'Store Manager'],
      },
    };
    renderDialog();

    const details = within(await screen.findByRole('region', { name: 'My details' }));
    expect(details.getByText('Asha Rao')).toBeInTheDocument();
    expect(details.getByText('E1001')).toBeInTheDocument();
    expect(details.getByText('asha@max.in')).toBeInTheDocument();
    expect(details.getByText('9876543210')).toBeInTheDocument();
    expect(details.getByText('Admin, Store Manager')).toBeInTheDocument();
    expect(details.getByText('All locations')).toBeInTheDocument();
    expect(details.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('has no sign-in section and no password to set or change', async () => {
    renderDialog();

    expect(await screen.findByText('Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Sign-in')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /password/i })).not.toBeInTheDocument();
  });
});
