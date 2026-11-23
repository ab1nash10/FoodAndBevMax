import { ApiClientError, type BoardFeed, type BoardOrder } from '@aahar/api-client';
import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { OrderBoard } from './order-board';
import { PreparingTile } from './preparing-tile';
import { ReadyTile } from './ready-tile';
import type * as ApiModule from '@/lib/api';

type Client = typeof ApiModule.publicOrganizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getBoardFeed: vi.fn<Client['getBoardFeed']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  publicOrganizationApi: api,
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a plain stand-in for next/image
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

// 1:00 pm in India; the board's minutes follow the server's clock, not the TV's. Times are set
// half a minute off the minute, as the board's clock ticks on a moment after the feed.
const serverTime = '2026-11-19T07:30:00.000Z';
const minutesFromNow = (minutes: number) =>
  new Date(Date.parse(serverTime) + minutes * 60_000).toISOString();

const ready = (orderNumber: string, minutesAgo: number, patch: Partial<BoardOrder> = {}) =>
  ({
    counterName: 'Counter 1',
    itemCount: 1,
    orderNumber,
    readyAt: minutesFromNow(-minutesAgo),
    status: 'READY',
    ...patch,
  }) satisfies BoardOrder;

const preparing = (orderNumber: string, inMinutes: number, patch: Partial<BoardOrder> = {}) =>
  ({
    estimatedReadyAt: minutesFromNow(inMinutes),
    itemCount: 1,
    orderNumber,
    status: 'PREPARING',
    ...patch,
  }) satisfies BoardOrder;

const feed = (patch: Partial<BoardFeed> = {}): BoardFeed => ({
  helpCounterName: 'Counter 1',
  isOpen: true,
  locationName: 'Saket',
  orders: [],
  restaurantName: 'Cafe Max',
  serverTime,
  slotEndsAt: '2026-11-19T09:30:00.000Z',
  slotName: 'Lunch',
  ...patch,
});

const board = (token?: string) => (
  <OrderBoard demo={false} restaurantId="r1" sound={false} theme="light" token={token} />
);

const wakeLock = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getBoardFeed.mockImplementation(() => reply(feed()));
  // The TV keeps its screen awake; jsdom has no wake lock.
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: wakeLock },
  });
});

describe('the order board', () => {
  it('asks for its board link when opened without one', () => {
    renderScreen(board());

    expect(
      screen.getByRole('heading', { name: 'This screen needs its board link' }),
    ).toBeInTheDocument();
    expect(api.getBoardFeed).not.toHaveBeenCalled();
  });

  it('says when its link was replaced', async () => {
    api.getBoardFeed.mockRejectedValue(new ApiClientError(404, 'Not found'));
    renderScreen(board('old'));

    expect(
      await screen.findByRole('heading', { name: 'This board link is no longer valid' }),
    ).toBeInTheDocument();
  });

  // A 404 can be passing (a deploy, a restaurant switched back on): the TV must not need a restart.
  it('keeps checking a refused link, slower than its refresh, and comes back when it works', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.getBoardFeed.mockRejectedValue(new ApiClientError(404, 'Not found'));
      renderScreen(board('t'));
      await screen.findByRole('heading', { name: 'This board link is no longer valid' });

      api.getBoardFeed.mockImplementation(() => reply(feed()));
      await act(() => vi.advanceTimersByTimeAsync(3500));
      expect(api.getBoardFeed).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(3000));

      expect(
        await screen.findByRole('heading', { name: 'No orders right now' }),
      ).toBeInTheDocument();
      expect(api.getBoardFeed).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains how it works while there are no orders', async () => {
    renderScreen(board('t'));

    expect(await screen.findByRole('heading', { name: 'No orders right now' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'How it works' })).toHaveTextContent(
      'Order at the kiosk or counter',
    );
    expect(api.getBoardFeed).toHaveBeenCalledWith('r1', 't');
    expect(wakeLock).toHaveBeenCalledWith('screen');
  });

  it('says the kitchen is closed and when it opens', async () => {
    api.getBoardFeed.mockImplementation(() =>
      reply(feed({ isOpen: false, opensAt: '2026-11-19T13:00:00.000Z' })),
    );
    renderScreen(board('t'));

    expect(await screen.findByRole('heading', { name: 'Kitchen closed' })).toBeInTheDocument();
    expect(screen.getByText('Opens at 6:30 PM')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('shows the restaurant, LIVE and the meal slot while open', async () => {
    renderScreen(board('t'));

    expect(await screen.findByRole('heading', { name: 'Cafe Max' })).toBeInTheDocument();
    expect(screen.getByText('Saket')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('Lunch · till 3:00 PM')).toBeInTheDocument();
    expect(screen.getByText('Ask at Counter 1')).toBeInTheDocument();
  });

  it('calls the newest ready order in the banner and lists the rest, newest first', async () => {
    api.getBoardFeed.mockImplementation(() =>
      reply(
        feed({
          orders: [
            ready('A2', 3.5),
            ready('A1', 0.5, { itemCount: 2, serviceType: 'TAKE_AWAY' }),
            ready('A3', 12.5),
          ],
        }),
      ),
    );
    renderScreen(board('t'));

    const banner = await screen.findByRole('region', { name: 'Now ready: A1' });
    expect(banner).toHaveTextContent('Please collect at Counter 1');
    expect(banner).toHaveTextContent('Take away · 2 items');
    const readySide = screen.getByRole('region', { name: 'Ready to collect' });
    expect(within(readySide).getByRole('heading', { name: /Ready to collect/ })).toHaveTextContent(
      '3',
    );
    const rest = within(screen.getByRole('list', { name: 'More ready orders' })).getAllByRole(
      'listitem',
    );
    expect(rest.map((tile) => tile.textContent)).toEqual([
      'A2Ready 3 min agoCounter 1',
      // Waiting ten minutes or more: the guest is asked to come soon.
      'A3Collect soonCounter 1',
    ]);
  });

  it('keeps the banner place while nothing is ready yet', async () => {
    api.getBoardFeed.mockImplementation(() => reply(feed({ orders: [preparing('P1', 5)] })));
    renderScreen(board('t'));

    expect(await screen.findByText('Your number appears here')).toBeInTheDocument();
  });

  it('lists the orders being prepared, soonest first, with their time to ready', async () => {
    api.getBoardFeed.mockImplementation(() =>
      reply(
        feed({
          orders: [preparing('P2', 7.5, { serviceType: 'DINE_IN' }), preparing('P1', 0.5)],
        }),
      ),
    );
    renderScreen(board('t'));

    const side = await screen.findByRole('region', { name: 'Preparing' });
    expect(within(side).getByRole('heading', { name: /Preparing/ })).toHaveTextContent('2');
    expect(
      within(side)
        .getAllByRole('listitem')
        .map((tile) => tile.textContent),
    ).toEqual(['P1nowabout 1 min', 'P2Eat here8mabout 8 min']);
  });

  it('never scrolls: past nine orders being prepared, the last place says how many more', async () => {
    api.getBoardFeed.mockImplementation(() =>
      reply(
        feed({
          orders: Array.from({ length: 11 }, (_, index) => preparing(`P${index + 1}`, index + 1)),
        }),
      ),
    );
    renderScreen(board('t'));

    const side = await screen.findByRole('region', { name: 'Preparing' });
    expect(within(side).getAllByRole('listitem')).toHaveLength(9);
    expect(within(side).getByText('+3 more')).toBeInTheDocument();
  });

  it('keeps the last orders up while it reconnects', async () => {
    api.getBoardFeed.mockImplementation(() => reply(feed({ orders: [ready('A1', 1)] })));
    const { queryClient } = renderScreen(board('t'));
    await screen.findByRole('region', { name: 'Now ready: A1' });

    api.getBoardFeed.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(() => queryClient.refetchQueries());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Reconnecting… the numbers shown may be a minute old',
    );
    expect(screen.getByRole('region', { name: 'Now ready: A1' })).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });
});

describe('the board tiles', () => {
  it('a ready tile says "just now", then the minutes, and falls back to the counter', () => {
    render(
      <ul>
        <ReadyTile order={{ ...ready('B1', 0), collectSoon: false, readyMinutes: 0 }} />
        <ReadyTile
          order={{
            ...ready('B2', 4, { serviceType: 'DINE_IN' }),
            collectSoon: false,
            readyMinutes: 4,
          }}
        />
      </ul>,
    );

    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent('B1Ready just nowCounter 1');
    expect(second).toHaveTextContent('B2Ready 4 min agoEat here');
  });

  it('a preparing tile shows minutes until ready, or now when due', () => {
    render(
      <ul>
        <PreparingTile order={{ ...preparing('C1', 12), etaMinutes: 12 }} />
        <PreparingTile order={{ ...preparing('C2', 1), etaMinutes: 1 }} />
      </ul>,
    );

    const [later, due] = screen.getAllByRole('listitem');
    expect(later).toHaveTextContent('12m');
    expect(due).toHaveTextContent('now');
  });
});
