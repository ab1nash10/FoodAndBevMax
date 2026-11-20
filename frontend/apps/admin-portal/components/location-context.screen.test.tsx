import type { HospitalSummary, MyAccess } from '@aahar/api-client';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { LocationProvider, useLocationContext, useMyLocations } from './location-context';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The API calls the screen makes, each a typed stand-in.
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  getMyAccess: vi.fn<UserApi['getMyAccess']>(),
}));
vi.mock('@/lib/api', () => ({ userApi }));

const place = (id: string, code: string, name: string) =>
  ({
    city: 'Delhi',
    hospitalCode: code,
    hospitalName: name,
    id,
    isActive: true,
    postalCode: '110092',
    state: 'Delhi',
  }) as HospitalSummary;
const saket = place('h-skt', 'SKT', 'Saket');
const ppg = place('h-ppg', 'PPG', 'Patparganj');

function access(patch: Partial<MyAccess> = {}) {
  userApi.getMyAccess.mockReturnValue(
    reply({
      defaultLocationId: 'h-ppg',
      employeeCode: 'E1001',
      locationScope: 'MULTI',
      locations: [saket, ppg],
      permissions: [],
      ...patch,
    }),
  );
}

let context: ReturnType<typeof useLocationContext>;

// Shows the header's location as a screen reads it.
function Probe() {
  context = useLocationContext();
  const mine = useMyLocations();

  return (
    <div>
      <p>{context.isLoadingLocations ? 'loading' : context.locationLabel}</p>
      <p>{context.isLocationSelectorLocked ? 'locked' : 'can switch'}</p>
      <p>{context.locationsFailed ? 'could not load locations' : 'locations loaded'}</p>
      <ul aria-label="My locations">
        {mine.data.map((location) => (
          <li key={location.id}>{location.hospitalName}</li>
        ))}
      </ul>
    </div>
  );
}

const renderProvider = () =>
  renderScreen(
    <LocationProvider>
      <Probe />
    </LocationProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe('the header location', () => {
  it('starts at the user’s default location, labelled with code, city and PIN', async () => {
    access();
    renderProvider();

    expect(await screen.findByText('PPG - Patparganj, Delhi, Delhi-110092')).toBeInTheDocument();
    expect(context.scopedHospitalId).toBe('h-ppg');
  });

  it('keeps a location chosen earlier in the session over the default', async () => {
    localStorage.setItem('aahar.location-context', 'h-skt');
    access();
    renderProvider();

    expect(await screen.findByText(/^SKT - Saket/)).toBeInTheDocument();
  });

  it('ignores a remembered location the user can no longer reach', async () => {
    localStorage.setItem('aahar.location-context', 'h-gone');
    access();
    renderProvider();

    expect(await screen.findByText(/^PPG - Patparganj/)).toBeInTheDocument();
  });

  it('keeps "All" only for a user who reaches every location', async () => {
    localStorage.setItem('aahar.location-context', 'all');
    access();
    renderProvider();
    expect(await screen.findByText(/^PPG - Patparganj/)).toBeInTheDocument();

    // Nor can they pick it from the header.
    act(() => context.setSelectedLocation(null));
    expect(context.isAllLocations).toBe(false);
  });

  it('lets an all-locations user pick All Locations and remembers it', async () => {
    access({ locationScope: 'ALL' });
    renderProvider();
    await screen.findByText(/^PPG - Patparganj/);

    act(() => context.setSelectedLocation(null));

    expect(screen.getByText('All Locations')).toBeInTheDocument();
    expect(context.scopedHospitalId).toBeUndefined();
    expect(localStorage.getItem('aahar.location-context')).toBe('all');
  });

  it('refuses a location the user does not have', async () => {
    access();
    renderProvider();
    await screen.findByText(/^PPG - Patparganj/);

    act(() => context.setSelectedLocation('h-elsewhere'));

    expect(context.selectedLocationId).toBe('h-ppg');
  });

  it('switches to another of the user’s locations', async () => {
    access();
    renderProvider();
    await screen.findByText(/^PPG - Patparganj/);

    act(() => context.setSelectedLocation('h-skt'));

    expect(screen.getByText(/^SKT - Saket/)).toBeInTheDocument();
    expect(localStorage.getItem('aahar.location-context')).toBe('h-skt');
  });

  it('locks the selector for a user with a single location', async () => {
    access({ defaultLocationId: 'h-skt', locationScope: 'SINGLE', locations: [saket] });
    renderProvider();

    expect(await screen.findByText(/^SKT - Saket/)).toBeInTheDocument();
    expect(screen.getByText('locked')).toBeInTheDocument();
  });

  it('says so when the user has no location', async () => {
    access({ defaultLocationId: null, locationScope: 'MULTI', locations: [] });
    renderProvider();

    expect(await screen.findByText('No location assigned')).toBeInTheDocument();
  });

  it('lists the user’s locations by name for pickers', async () => {
    access();
    renderProvider();
    await screen.findByText(/^PPG - Patparganj/);

    const names = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(names).toEqual(['Patparganj', 'Saket']);
  });

  it('offers a retry when the locations cannot be loaded, and recovers', async () => {
    userApi.getMyAccess.mockRejectedValueOnce(new Error('Service unavailable'));
    renderProvider();

    expect(await screen.findByText('could not load locations')).toBeInTheDocument();
    expect(screen.getByText('loading')).toBeInTheDocument();

    access();
    act(() => context.retryLocations());

    expect(await screen.findByText(/^PPG - Patparganj/)).toBeInTheDocument();
  });

  it('opens on the access remembered from the last visit while it asks again', async () => {
    localStorage.setItem(
      'aahar.my-access',
      JSON.stringify({
        data: {
          defaultLocationId: 'h-skt',
          locationScope: 'MULTI',
          locations: [saket],
          permissions: [],
        },
        userId: 'user-1',
      }),
    );
    // The server's answer never arrives in this test: the stored copy is all there is.
    userApi.getMyAccess.mockReturnValue(new Promise(() => undefined));
    renderProvider();

    expect(await screen.findByText(/^SKT - Saket/)).toBeInTheDocument();
  });
});
