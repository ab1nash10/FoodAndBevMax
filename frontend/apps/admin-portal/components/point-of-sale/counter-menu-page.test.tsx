import { ApiClientError, type PosCounter, type PosMenuItem } from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { at } from '@/test/next-navigation';
import { CounterMenuPageClient } from './counter-menu-page';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The location stand-in, with the module's own helpers (the empty list names the location).
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getPosMenu: vi.fn<Client['getPosMenu']>(),
  listPosCounters: vi.fn<Client['listPosCounters']>(),
  setPosMenuAvailability: vi.fn<Client['setPosMenuAvailability']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const counter = {
  counterName: 'Counter 1',
  id: 'counter-1',
  restaurant: { restaurantName: 'Cafe Max' },
  restaurantId: 'r1',
} as PosCounter;

const item = (patch: Partial<PosMenuItem>): PosMenuItem => ({
  availableFrom: null,
  availableTo: null,
  category: { categoryName: 'Snacks', id: 'c1', sortOrder: 1 },
  daysOfWeek: [],
  foodType: 'VEG',
  gstPercent: 5,
  id: 'm1',
  isAvailable: true,
  isDiscountable: true,
  isGstInclusive: true,
  isOnSale: true,
  itemCode: 'VS01',
  itemId: 'i1',
  itemName: 'Veg Sandwich',
  menuItemCode: 'M-VS01',
  preparationTimeMinutes: null,
  price: 100,
  stock: null,
  ...patch,
});

const items = [
  item({}),
  item({
    availableFrom: '07:00:00',
    availableTo: '10:30:00',
    category: { categoryName: 'Breakfast', id: 'c0', sortOrder: 0 },
    daysOfWeek: ['MONDAY', 'TUESDAY'],
    id: 'm2',
    isGstInclusive: false,
    isOnSale: false,
    itemCode: 'PO01',
    itemName: 'Poha',
    menuItemCode: 'M-PO01',
    stock: 0,
  }),
  item({
    category: null,
    id: 'm3',
    isAvailable: false,
    isOnSale: false,
    itemCode: 'TH01',
    itemName: 'Thali',
    menuItemCode: 'M-TH01',
    price: null,
    stock: 4,
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  at('/pos/menu');
  signedIn([]);
  api.listPosCounters.mockImplementation(() => reply([counter]));
  api.getPosMenu.mockImplementation(() => reply({ counter, items }));
});

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('the counter menu', () => {
  it('lists each item under its category: price, GST, when sold, stock and whether on sale', async () => {
    renderScreen(<CounterMenuPageClient />);

    expect(await screen.findByText('Veg Sandwich')).toBeInTheDocument();
    expect(api.getPosMenu).toHaveBeenCalledWith('counter-1', 'COUNTER');
    // Categories by name, the uncategorised last.
    expect(
      screen.getAllByRole('button', { expanded: true }).map((group) => group.textContent),
    ).toEqual(['Breakfast· 1 item', 'Snacks· 1 item', 'Other· 1 item']);
    expect(rowOf('Veg Sandwich')).toHaveTextContent(
      '₹100.005%InclusiveAll day · Every dayNot trackedOn sale now',
    );
    expect(rowOf('Poha')).toHaveTextContent('5%Extra07:00 – 10:30 · Mon, Tue0Not now');
    expect(rowOf('Thali')).toHaveTextContent('No price');
    expect(rowOf('Thali')).toHaveTextContent('Sold out');
  });

  it('shows stock on hold for a return to the vendor beside what can be sold', async () => {
    api.getPosMenu.mockImplementation(() =>
      reply({ counter, items: [item({ held: 2, stock: 3 })] }),
    );
    renderScreen(<CounterMenuPageClient />);

    expect(await screen.findByText('Veg Sandwich')).toBeInTheDocument();
    expect(rowOf('Veg Sandwich')).toHaveTextContent('32 on hold for return');
  });

  it('counts what is on sale, sold out and out of stock', async () => {
    renderScreen(<CounterMenuPageClient />);
    await screen.findByText('Veg Sandwich');

    const stats = within(screen.getByRole('group', { name: 'Counter menu at a glance' }));
    expect(stats.getByRole('button', { name: /On sale now/ })).toHaveTextContent('1');
    expect(stats.getByRole('button', { name: /Sold out/ })).toHaveTextContent('1');
    expect(stats.getByRole('button', { name: /Out of stock/ })).toHaveTextContent('1');
  });

  it('shows only the sold-out items from the link that asks for them', async () => {
    at('/pos/menu', 'view=sold-out&layout=list');
    renderScreen(<CounterMenuPageClient />);

    expect(await screen.findByText('Thali')).toBeInTheDocument();
    expect(screen.queryByText('Veg Sandwich')).not.toBeInTheDocument();
  });

  it('prices the room menu from its link', async () => {
    at('/pos/menu', 'channel=ROOM');
    renderScreen(<CounterMenuPageClient />);

    await screen.findByText('Veg Sandwich');
    expect(api.getPosMenu).toHaveBeenCalledWith('counter-1', 'ROOM');
  });

  it('folds a category away and finds items by name or code', async () => {
    const { user } = renderScreen(<CounterMenuPageClient />);
    await screen.findByText('Veg Sandwich');

    await user.click(screen.getByRole('button', { name: /Snacks/ }));
    expect(screen.queryByText('Veg Sandwich')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Snacks/ }));

    await user.type(screen.getByRole('searchbox', { name: 'Search the menu' }), 'po01');
    expect(screen.getByText('Poha')).toBeInTheDocument();
    expect(screen.queryByText('Veg Sandwich')).not.toBeInTheDocument();
  });

  it('takes an item off sale after a check, for someone who may update the menu', async () => {
    signedIn(['POS_MENU_UPDATE']);
    api.setPosMenuAvailability.mockImplementation(() => reply({ id: 'm1', isAvailable: false }));
    const { user } = renderScreen(<CounterMenuPageClient />);
    await screen.findByText('Veg Sandwich');

    await user.click(screen.getByRole('switch', { name: 'Veg Sandwich available' }));
    const check = screen.getByRole('dialog', { name: 'Make Veg Sandwich unavailable?' });
    await user.click(within(check).getByRole('button', { name: 'Make unavailable' }));

    expect(api.setPosMenuAvailability).toHaveBeenCalledWith('m1', false);
    expect(await screen.findByText('Item unavailable')).toBeInTheDocument();
  });

  it('changes nothing when the check is turned down', async () => {
    signedIn(['POS_MENU_UPDATE']);
    const { user } = renderScreen(<CounterMenuPageClient />);
    await screen.findByText('Thali');

    await user.click(screen.getByRole('switch', { name: 'Thali available' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.setPosMenuAvailability).not.toHaveBeenCalled();
  });

  it('offers no availability switch without the right', async () => {
    renderScreen(<CounterMenuPageClient />);
    await screen.findByText('Veg Sandwich');

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('shows why the menu could not be read', async () => {
    api.getPosMenu.mockRejectedValue(new ApiClientError(500, 'The menu is unavailable.'));
    renderScreen(<CounterMenuPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('The menu is unavailable.');
  });

  it('says when there is no counter to show', async () => {
    api.listPosCounters.mockImplementation(() => reply([]));
    renderScreen(<CounterMenuPageClient />);

    expect(await screen.findByText('No counter to bill at')).toBeInTheDocument();
  });
});
