import type { Room } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { RoomsPageClient } from './rooms-page';

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
  createRoom: vi.fn<Client['createRoom']>(),
  listRestaurants: vi.fn<Client['listRestaurants']>(),
  listRooms: vi.fn<Client['listRooms']>(),
  updateRoom: vi.fn<Client['updateRoom']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));
// jsdom has no canvas to draw a QR on.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));

const bed = (overrides: Partial<Room> = {}): Room => ({
  createdAt: '2026-11-19T05:00:00Z',
  hospital: ppg,
  hospitalId: ppg.id,
  id: 'r1',
  isActive: true,
  restaurant: null,
  restaurantId: null,
  roomCode: 'R-000001',
  roomName: 'PG-ECO-06 (EWS)',
  updatedAt: '2026-11-19T05:00:00Z',
  ...overrides,
});

function listOf(rooms: Room[]) {
  api.listRooms.mockImplementation((query) =>
    // The counts above the list ask with limit 0 and read only the total.
    query?.limit === 0
      ? page(
          rooms.filter((room) => query.isActive === undefined || room.isActive === query.isActive),
        )
      : page(rooms),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/rooms');
  atLocation(ppg);
  signedIn(['ROOM_VIEW', 'ROOM_CREATE', 'ROOM_UPDATE']);
  // The QR's site address comes from the portal's own route.
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ origin: 'https://aahar.test' }), ok: true }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('Rooms & Tables', () => {
  it('lists the rooms at the location with how many are active and inactive', async () => {
    listOf([
      bed(),
      bed({ id: 'r2', isActive: false, roomCode: 'R-000002', roomName: 'Bed 2220 b' }),
    ]);
    renderScreen(<RoomsPageClient />);

    expect(await screen.findByText('PG-ECO-06 (EWS)')).toBeInTheDocument();
    expect(screen.getByText('R-000002')).toBeInTheDocument();
    const glance = screen.getByRole('group', { name: 'Rooms at a glance' });
    // Each count sits beside its name: "Active 1".
    await waitFor(() =>
      expect(within(glance).getByRole('button', { name: /^Active/ })).toHaveTextContent('Active1'),
    );
    expect(within(glance).getByRole('button', { name: /^Inactive/ })).toHaveTextContent(
      'Inactive1',
    );
    expect(within(glance).getByRole('button', { name: /^All rooms/ })).toHaveTextContent(
      'All rooms2',
    );
    expect(api.listRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        hospitalId: 'h-ppg',
        page: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    );
  });

  it('says there are no rooms at the location when the list is empty', async () => {
    listOf([]);
    renderScreen(<RoomsPageClient />);

    expect(await screen.findByText('No rooms at Patparganj')).toBeInTheDocument();
  });

  it('shows why the list failed to load', async () => {
    api.listRooms.mockRejectedValue(new Error('Organization service is down'));
    renderScreen(<RoomsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Organization service is down');
  });

  it('asks the API for what is typed in search, the status in the link and the sort picked', async () => {
    at('/masters/rooms', 'status=inactive');
    listOf([]);
    const { user } = renderScreen(<RoomsPageClient />);

    await screen.findByText('No rooms at Patparganj');
    expect(api.listRooms).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, limit: 10 }),
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search rooms' }), 'eco');
    await waitFor(() =>
      expect(api.listRooms).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'eco' })),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Name A–Z');
    await waitFor(() =>
      expect(api.listRooms).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'eco', sortBy: 'roomName', sortOrder: 'asc' }),
      ),
    );
  });

  it('offers New room, Import and the edit pencil only to those allowed to', async () => {
    signedIn(['ROOM_VIEW']);
    listOf([bed()]);
    renderScreen(<RoomsPageClient />);

    await screen.findByText('PG-ECO-06 (EWS)');
    expect(screen.queryByRole('button', { name: /New room/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit PG-ECO-06 (EWS)' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Set inactive' })).toBeDisabled();
    // Anyone who sees the list may still print a bed's QR.
    expect(screen.getByRole('button', { name: 'QR code for PG-ECO-06 (EWS)' })).toBeEnabled();
  });

  it('needs a location in the header before a room can be added', async () => {
    atLocation(null);
    listOf([]);
    renderScreen(<RoomsPageClient />);

    const add = await screen.findByRole('button', { name: /New room/ });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', 'Choose a location at the top first');
  });

  it('adds a room at the header location with its name exactly as typed', async () => {
    listOf([]);
    api.createRoom.mockResolvedValue({
      data: bed({ id: 'r9', roomName: '2220 b' }),
      message: 'Created',
      success: true,
    });
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: /New room/ }));
    const dialog = screen.getByRole('dialog', { name: 'New room' });
    expect(within(dialog).getByLabelText('Location')).toHaveValue('Patparganj');
    const name = within(dialog).getByLabelText(/Room or bed/);
    await user.type(name, '2220 b');
    // Leaving the box is when a name is put in Title Case; a room's is not.
    await user.click(within(dialog).getByLabelText('Location'));
    expect(name).toHaveValue('2220 b');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.createRoom).toHaveBeenCalledWith({
        hospitalId: 'h-ppg',
        isActive: true,
        roomName: '2220 b',
      }),
    );
    expect(await screen.findByText('2220 b added')).toBeInTheDocument();
  });

  it('will not save a room without a name', async () => {
    listOf([]);
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: /New room/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Room or bed is required.')).toBeInTheDocument();
    expect(api.createRoom).not.toHaveBeenCalled();
  });

  it('renames a room as typed and shows a refusal from the API', async () => {
    listOf([bed()]);
    api.updateRoom.mockRejectedValueOnce(new Error('A room of that name is already at Patparganj'));
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit PG-ECO-06 (EWS)' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit room' });
    const name = within(dialog).getByLabelText(/Room or bed/);
    expect(name).toHaveValue('PG-ECO-06 (EWS)');
    await user.clear(name);
    await user.type(name, 'pg-eco-07 (ews)');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateRoom).toHaveBeenCalledWith('r1', {
        isActive: true,
        roomName: 'pg-eco-07 (ews)',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A room of that name is already at Patparganj',
    );
    // Still open, so the name can be corrected.
    expect(screen.getByRole('dialog', { name: 'Edit room' })).toBeInTheDocument();
  });

  it('deactivates a room once the switch is confirmed', async () => {
    listOf([bed()]);
    api.updateRoom.mockResolvedValue({
      data: bed({ isActive: false }),
      message: '',
      success: true,
    });
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Set inactive' }));
    const confirm = screen.getByRole('dialog', { name: 'Deactivate PG-ECO-06 (EWS)?' });
    expect(confirm).toHaveTextContent('Its QR stops taking orders while the room is inactive.');
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(api.updateRoom).toHaveBeenCalledWith('r1', { isActive: false }));
  });

  it('leaves a room as it was when the switch is cancelled', async () => {
    listOf([bed()]);
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Set inactive' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.updateRoom).not.toHaveBeenCalled();
  });

  it('will not activate a room at an inactive location', async () => {
    listOf([bed({ hospital: { ...ppg, isActive: false }, isActive: false })]);
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('switch', { name: 'Set active' }));

    expect(await screen.findByText('Location is inactive')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Activate/ })).not.toBeInTheDocument();
    expect(api.updateRoom).not.toHaveBeenCalled();
  });

  it("shows a bed's QR with the link that opens ordering for that bed", async () => {
    listOf([bed()]);
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'QR code for PG-ECO-06 (EWS)' }));
    const dialog = screen.getByRole('dialog', { name: 'PG-ECO-06 (EWS) · R-000001' });

    expect(
      await within(dialog).findByRole('img', { name: 'QR code for PG-ECO-06 (EWS)' }),
    ).toBeVisible();
    expect(within(dialog).getByRole('textbox', { name: 'Ordering link' })).toHaveValue(
      'https://aahar.test/fandb/order/room/r1',
    );
    expect(within(dialog).getByRole('button', { name: /Print QR/ })).toBeInTheDocument();
  });

  it('says so when the QR address cannot be worked out', async () => {
    listOf([bed()]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false })),
    );
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'QR code for PG-ECO-06 (EWS)' }));

    expect(
      await screen.findByText('Could not determine a phone-reachable site address.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ordering link' })).not.toBeInTheDocument();
  });
});

describe('Rooms & Tables: dine-in tables', () => {
  const cafe = {
    atTableDining: true,
    id: 'rest-1',
    restaurantCode: 'CAFE',
    restaurantName: 'Cafe Max',
  };
  const table = (overrides: Partial<Room> = {}) =>
    bed({
      id: 't1',
      restaurant: cafe,
      restaurantId: cafe.id,
      roomCode: 'T-000001',
      roomName: 'T5',
      ...overrides,
    });
  const created = (roomName: string) => ({
    data: table({ id: `t-${roomName}`, roomName }),
    message: 'Created',
    success: true,
  });

  beforeEach(() => {
    api.listRestaurants.mockImplementation(() =>
      page([{ id: cafe.id, restaurantName: cafe.restaurantName }] as never[]),
    );
  });

  it('lists the tables apart from the rooms, each with its restaurant', async () => {
    listOf([]);
    const { user } = renderScreen(<RoomsPageClient />);

    await screen.findByText('No rooms at Patparganj');
    expect(api.listRooms).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'ROOM' }));

    listOf([table()]);
    // Tabs, as Access has Admins and Operators.
    await user.click(screen.getByRole('tab', { name: 'Tables' }));
    expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true');

    const row = (await screen.findByText('T5')).closest('tr')!;
    expect(row).toHaveTextContent('Cafe Max');
    expect(api.listRooms).toHaveBeenLastCalledWith(
      expect.objectContaining({ hospitalId: 'h-ppg', kind: 'TABLE' }),
    );
    expect(api.listRestaurants).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalId: 'h-ppg', isActive: true }),
    );
    // Tables import from a sheet, as rooms do.
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('adds a table without filtering first: its restaurant is picked in the form', async () => {
    at('/masters/rooms', 'kind=tables');
    listOf([]);
    api.listRestaurants.mockImplementation(() =>
      page([
        { id: cafe.id, restaurantName: cafe.restaurantName },
        { id: 'rest-2', restaurantName: 'Bistro' },
      ] as never[]),
    );
    api.createRoom.mockResolvedValue(created('Window 2'));
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: /New table/ }));
    const dialog = screen.getByRole('dialog', { name: 'New table' });
    const restaurant = within(dialog).getByRole('combobox', { name: /Restaurant/ });
    expect(restaurant).toHaveValue('');
    await user.type(within(dialog).getByLabelText(/^Table/), 'Window 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Choose the table’s restaurant.')).toBeInTheDocument();
    expect(api.createRoom).not.toHaveBeenCalled();

    await user.selectOptions(restaurant, 'Cafe Max');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.createRoom).toHaveBeenCalledWith({
        hospitalId: 'h-ppg',
        isActive: true,
        restaurantId: 'rest-1',
        roomName: 'Window 2',
      }),
    );
    expect(await screen.findByText('Window 2 added')).toBeInTheDocument();
  });

  it('starts a new table at the restaurant filtered on, or the only one there is', async () => {
    at('/masters/rooms', 'kind=tables');
    listOf([]);
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: /New table/ }));
    const dialog = screen.getByRole('dialog', { name: 'New table' });
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: /Restaurant/ })).toHaveValue('rest-1'),
    );
  });

  it('adds a run of tables at once, and says which were already there', async () => {
    at('/masters/rooms', 'kind=tables&restaurant=rest-1');
    listOf([]);
    api.createRoom.mockImplementation((body) =>
      body.roomName === 'T2'
        ? Promise.reject(new Error('T2 already exists at this restaurant (T-000002).'))
        : Promise.resolve(created(body.roomName)),
    );
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: /Add tables/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add tables' });
    // The restaurant filtered on, changeable here.
    expect(within(dialog).getByRole('combobox', { name: /Restaurant/ })).toHaveValue('rest-1');
    expect(within(dialog).getByLabelText('Name before the number')).toHaveValue('T');
    const to = within(dialog).getByLabelText('To number');
    await user.clear(to);
    await user.type(to, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Add T1 to T3' }));

    await waitFor(() => expect(api.createRoom).toHaveBeenCalledTimes(3));
    expect(api.createRoom.mock.calls.map(([body]) => body)).toEqual(
      ['T1', 'T2', 'T3'].map((roomName) => ({
        hospitalId: 'h-ppg',
        isActive: true,
        restaurantId: 'rest-1',
        roomName,
      })),
    );
    expect(await screen.findByText('2 tables added')).toBeInTheDocument();
    expect(
      screen.getByText('T2 already exists at this restaurant (T-000002).'),
    ).toBeInTheDocument();
  });

  it("shows a table's QR with its own link, and warns while At Table Dining is off", async () => {
    at('/masters/rooms', 'kind=tables');
    listOf([table({ restaurant: { ...cafe, atTableDining: false } })]);
    const { user } = renderScreen(<RoomsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'QR code for T5' }));
    const dialog = screen.getByRole('dialog', { name: 'T5 · T-000001' });

    expect(await within(dialog).findByRole('textbox', { name: 'Ordering link' })).toHaveValue(
      'https://aahar.test/fandb/order/table/t1',
    );
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'At Table Dining is off for Cafe Max, so this QR shows a message instead of the menu. Switch it on in Restaurants.',
    );
  });
});
