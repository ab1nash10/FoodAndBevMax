import { screen } from '@testing-library/react';
import type { InventoryLocationType } from '@aahar/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/components/auth-provider';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { useLocationHrefs, useLocationNames } from './use-locations';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: { getLocationNames: vi.fn() },
}));

const api = mockedApi(organizationApi);

// Each location a screen names, with its link when it has one.
function Names({ places }: { places: Array<[InventoryLocationType, string]> }) {
  const { hasPermission } = useAuth();
  const nameOf = useLocationNames(hasPermission);
  const linkOf = useLocationHrefs(hasPermission);

  return (
    <ul>
      {places.map(([type, id]) => (
        <li key={id}>
          {nameOf(type, id)} {linkOf(type, id) ?? 'no link'}
        </li>
      ))}
    </ul>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['STORE_VIEW', 'COUNTER_VIEW']);
  api.getLocationNames.mockReturnValue(
    reply({
      counters: [
        { counterName: 'Counter 1', id: 'c-1', restaurant: { restaurantName: 'Cafeteria' } },
      ],
      kitchens: [],
      restaurants: [],
      stores: [{ id: 's-1', storeCode: 'MS', storeName: 'Main Store' }],
    }) as never,
  );
});

describe('naming stock locations', () => {
  it('names stores and counters, and links a store to its list', async () => {
    renderScreen(
      <Names
        places={[
          ['STORE', 's-1'],
          ['COUNTER', 'c-1'],
        ]}
      />,
    );

    expect(await screen.findByText(/^Main Store \/masters\/stores/)).toBeInTheDocument();
    // A counter has no list of its own to link to.
    expect(screen.getByText('Cafeteria · Counter 1 no link')).toBeInTheDocument();
  });

  it('falls back to the kind of place, never a raw id, for one it does not know', async () => {
    renderScreen(<Names places={[['KITCHEN', 'k-9']]} />);

    expect(await screen.findByText('Kitchen no link')).toBeInTheDocument();
  });

  it('asks for no names without permission to view any kind of location', () => {
    signedIn(['STOCK_VIEW']);
    renderScreen(<Names places={[['STORE', 's-1']]} />);

    expect(screen.getByText('Store no link')).toBeInTheDocument();
    expect(api.getLocationNames).not.toHaveBeenCalled();
  });
});
