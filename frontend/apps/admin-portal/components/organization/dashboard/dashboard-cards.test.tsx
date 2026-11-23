import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import type { DashboardStats } from '@/hooks/use-dashboard-stats';
import { signedIn } from '@/test/auth';
import { renderScreen } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { DashboardCard, ErrorCard } from './dashboard-card';
import { DashboardOverview } from './dashboard-overview';
import { MasterDataCard, QuickCreateCard } from './master-data-card';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The real module's helpers (getLocationTitle…) with the header's location stood in.
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getLocationNames: vi.fn<Client['getLocationNames']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

beforeEach(() => {
  vi.clearAllMocks();
  at('/');
  atLocation(null);
  signedIn([]);
});

describe('a dashboard card', () => {
  it('is a section named by its title, with its subtitle and body', () => {
    renderScreen(
      <DashboardCard id="waiting" subtitle="Oldest first" title="Waiting on you">
        <p>3 transfers</p>
      </DashboardCard>,
    );

    const card = screen.getByRole('region', { name: 'Waiting on you' });
    expect(card).toHaveTextContent('Oldest first');
    expect(card).toHaveTextContent('3 transfers');
  });

  it('says a source failed and tries it again on request', async () => {
    const retry = vi.fn();
    const { user } = renderScreen(<ErrorCard onRetry={retry} title="Wastage" />);

    expect(screen.getByRole('region', { name: 'Wastage' })).toHaveTextContent(
      'Could not load this',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });
});

const mastersStats = (overrides: Partial<Record<string, boolean>> = {}) =>
  ({
    can: {
      employees: false,
      hospitals: true,
      items: true,
      kitchens: true,
      restaurants: true,
      stores: true,
      ...overrides,
    },
    masters: {
      employees: { data: undefined, isLoading: false },
      hospitals: { data: 4, isLoading: false },
      items: { data: undefined, isLoading: true },
      kitchens: { data: 9, isLoading: false },
      restaurants: { data: 12, isLoading: false },
      stores: { data: 0, isLoading: false },
    },
  }) as unknown as DashboardStats;

describe('the Master data card', () => {
  it('counts each master the user may view, each linking to its list', () => {
    renderScreen(<MasterDataCard stats={mastersStats()} />);

    expect(screen.getByRole('link', { name: /4\s*Locations/ })).toHaveAttribute(
      'href',
      '/masters/locations',
    );
    expect(screen.getByRole('link', { name: /9\s*Kitchens/ })).toHaveAttribute(
      'href',
      '/masters/kitchens',
    );
    expect(screen.getByRole('link', { name: /12\s*Restaurants/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /0\s*Stores/ })).toBeInTheDocument();
    // Still loading: no number yet.
    expect(screen.getByRole('link', { name: 'Items' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Employees/ })).not.toBeInTheDocument();
  });

  it('counts one location while the header shows one', () => {
    atLocation(ppg);
    renderScreen(<MasterDataCard stats={mastersStats()} />);

    expect(screen.getByRole('link', { name: /1\s*Locations/ })).toBeInTheDocument();
  });

  it('is left out for a role that may view no masters', () => {
    renderScreen(
      <MasterDataCard
        stats={mastersStats({
          hospitals: false,
          items: false,
          kitchens: false,
          restaurants: false,
          stores: false,
        })}
      />,
    );

    expect(screen.queryByText('Master data')).not.toBeInTheDocument();
  });
});

describe('the Quick create card', () => {
  it('offers only the create pages the user may open', () => {
    signedIn(['GRN_VIEW']);
    renderScreen(<QuickCreateCard />);

    // Goods come in from the ERP, so N G opens its GRNs rather than a delivery form.
    expect(screen.getByRole('link', { name: /ERP GRNs/ })).toHaveAttribute(
      'href',
      '/inventory/erp-grns',
    );
    expect(screen.queryByRole('link', { name: /New transfer/ })).not.toBeInTheDocument();
  });

  it('is left out when the user may create nothing', () => {
    renderScreen(<QuickCreateCard />);

    expect(screen.queryByText('Quick create')).not.toBeInTheDocument();
  });
});

describe('the dashboard', () => {
  it('tells a role with nothing to see so, rather than showing empty cards', () => {
    renderScreen(<DashboardOverview />);

    expect(screen.getByText('Nothing to show on your dashboard')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Good (morning|afternoon|evening), Test Admin/ }),
    ).toBeInTheDocument();
  });
});
