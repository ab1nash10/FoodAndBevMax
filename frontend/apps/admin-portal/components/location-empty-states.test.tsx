import { ApiClientError } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import { renderScreen } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { atLocation, ppg } from '@/test/location';
import { LoadError, QueryState, SetupNotice, useLocationName } from './location-empty-states';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', async () => {
  const { getLocationTitle } = await vi.importActual<typeof LocationModule>(
    '@/components/location-context',
  );
  return { ...(await import('@/test/location')), getLocationTitle };
});

const inTable = (row: React.ReactNode) => (
  <table>
    <tbody>{row}</tbody>
  </table>
);

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(ppg);
});

describe('a failed load', () => {
  it('says what went wrong and retries only the queries that failed', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError(503, 'Stores are unavailable'))
      .mockResolvedValue('ok');
    function Page() {
      const query = useQuery({ queryFn: load, queryKey: ['stores'] });
      return query.isError ? <LoadError error={query.error} /> : <p>{query.data ?? 'loading'}</p>;
    }
    const { user } = renderScreen(<Page />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Stores are unavailable');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('ok')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('puts a network failure in plain words', () => {
    renderScreen(<LoadError error={new TypeError('Failed to fetch')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect to F&B services.');
  });
});

describe('a list with nothing to show', () => {
  it('names the location in the header', () => {
    renderScreen(
      inTable(
        <QueryState colSpan={4} error={null} isError={false} isLoading={false} label="stores" />,
      ),
    );

    expect(screen.getByText('No stores at Patparganj')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing has been added yet, or nothing matches the filters.'),
    ).toBeInTheDocument();
  });

  it('says "found" for All locations, or a list not kept per location, with its own hint', () => {
    atLocation(null);
    renderScreen(
      inTable(
        <QueryState
          colSpan={4}
          error={null}
          hint="Map items first."
          isError={false}
          isLoading={false}
          label="stores"
        />,
      ),
    );

    expect(screen.getByText('No stores found')).toBeInTheDocument();
    expect(screen.getByText('Map items first.')).toBeInTheDocument();
  });

  it('announces that it is loading', () => {
    renderScreen(
      inTable(<QueryState colSpan={4} error={null} isError={false} isLoading label="stores" />),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading stores…');
  });

  it('shows the error when the list failed', () => {
    renderScreen(
      inTable(
        <QueryState
          colSpan={4}
          error={new ApiClientError(500, 'Boom')}
          isError
          isLoading={false}
          label="stores"
        />,
      ),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });
});

describe('a setup notice', () => {
  it('links to where the missing thing is made, for someone who may open it', () => {
    signedIn(['KITCHEN_CREATE']);
    renderScreen(
      <SetupNotice href="/masters/kitchens/new" linkLabel="Create a kitchen">
        Patparganj has no kitchen yet.
      </SetupNotice>,
    );

    expect(screen.getByText(/Patparganj has no kitchen yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a kitchen' })).toHaveAttribute(
      'href',
      '/masters/kitchens/new',
    );
  });

  it('leaves the link out for someone who may not', () => {
    signedIn([]);
    renderScreen(
      <SetupNotice href="/masters/kitchens/new" linkLabel="Create a kitchen">
        Patparganj has no kitchen yet.
      </SetupNotice>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('the location’s name', () => {
  it('is the header location’s title, or nothing for All locations', () => {
    function Name() {
      return <p>{useLocationName() ?? 'all'}</p>;
    }
    const { rerender } = renderScreen(<Name />);
    expect(screen.getByText('Patparganj')).toBeInTheDocument();

    atLocation(null);
    rerender(<Name />);
    expect(screen.getByText('all')).toBeInTheDocument();
  });
});
