import type {
  ApiList,
  ApiResponse,
  HospitalSummary,
  Restaurant,
  Room,
  RoomInput,
} from '@aahar/api-client';
import {
  activeStatus,
  fetchAllPages,
  type CsvColumn,
  type CsvRowImporter,
} from '@/components/csv-import-export';
import {
  getLocationCode,
  getLocationDisplayName,
} from '@/components/organization/shared/locations';
import { withBasePath } from '@/lib/base-path';

/** A room as exported: with the link its QR holds. */
export type RoomRow = Room & { qrLink?: string };

/** The address a room's QR opens on a guest's phone. */
export const roomOrderUrl = (origin: string, roomId: string) =>
  `${origin}${withBasePath(`/order/room/${roomId}`)}`;

/** The address a dine-in table's QR opens: its restaurant's menu, with the table filled in. */
export const tableOrderUrl = (origin: string, tableId: string) =>
  `${origin}${withBasePath(`/order/table/${tableId}`)}`;

const updatedAt = (room: RoomRow) =>
  new Date(room.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** The Tables tab's import and export: each table with its restaurant (and QR link, exported). */
export const tableColumns: Array<CsvColumn<RoomRow>> = [
  {
    header: 'Table code',
    optional: true,
    hint: 'Blank adds a table (it gets the next code), or updates the table of that name at its restaurant. A code updates that table.',
    value: (room) => room.roomCode,
  },
  {
    example: 'T5',
    header: 'Table name',
    hint: 'As written on the table. Up to 50 characters, once per restaurant.',
    required: true,
    value: (room) => room.roomName,
  },
  {
    example: 'Cafe Max',
    header: 'Restaurant',
    hint: 'The restaurant’s name or code, at the row’s location.',
    required: true,
    value: (room) => room.restaurant?.restaurantName,
  },
  {
    example: 'PPG',
    header: 'Location code',
    optional: true,
    hint: 'An existing location’s code. Blank: the location chosen at the top of the screen.',
    value: (room) => getLocationCode(room.hospital),
  },
  { header: 'Location', readOnly: true, value: (room) => getLocationDisplayName(room.hospital) },
  {
    example: 'Active',
    header: 'Table status',
    hint: 'Active or Inactive. Blank: active when added, unchanged on an update.',
    optional: true,
    value: (room) => (room.isActive ? 'Active' : 'Inactive'),
  },
  { header: 'Updated at', readOnly: true, value: updatedAt },
  { header: 'QR link', readOnly: true, value: (room) => room.qrLink },
];

export const tableMatching =
  'A row with a Table code updates that table. A blank code updates the table of the same name at the restaurant, or adds it.';

export const roomColumns: Array<CsvColumn<RoomRow>> = [
  {
    header: 'Room code',
    optional: true,
    hint: 'Blank adds a room (it gets the next code), or updates the room of that name at its location. A code updates that room.',
    value: (room) => room.roomCode,
  },
  {
    example: 'PG-ECO-06 (EWS)',
    header: 'Room name',
    hint: 'The room or bed, as the steward finds it. Up to 50 characters, once per location.',
    required: true,
    value: (room) => room.roomName,
  },
  {
    example: 'PPG',
    header: 'Location code',
    optional: true,
    hint: 'An existing location’s code. Blank: the location chosen at the top of the screen.',
    value: (room) => getLocationCode(room.hospital),
  },
  {
    header: 'Location',
    readOnly: true,
    value: (room) => getLocationDisplayName(room.hospital),
  },
  {
    example: 'Active',
    // As named in the room lists the hospitals keep, so theirs import as they are.
    header: 'Room status',
    hint: 'Active or Inactive. Blank: active when added, unchanged on an update.',
    optional: true,
    value: (room) => (room.isActive ? 'Active' : 'Inactive'),
  },
  { header: 'Updated at', readOnly: true, value: updatedAt },
  { header: 'QR link', readOnly: true, value: (room) => room.qrLink },
];

export const roomMatching =
  'A row with a Room code updates that room. A blank code updates the room of the same name at the location, or adds it.';

export interface RoomImportApi {
  createRoom(body: RoomInput): Promise<unknown>;
  listHospitals(query: {
    limit: number;
    page: number;
  }): Promise<ApiResponse<ApiList<HospitalSummary>>>;
  listRooms(query: {
    kind?: 'ROOM' | 'TABLE';
    limit: number;
    page: number;
  }): Promise<ApiResponse<ApiList<Room>>>;
  updateRoom(id: string, body: { isActive?: boolean; roomName?: string }): Promise<unknown>;
}

/** Reads one row: finds its room by code, else by name at its location; adds it when new. */
export async function startRoomImport(
  api: RoomImportApi,
  /** The location chosen at the top of the screen: where a row without a Location code goes. */
  scopedHospitalId: string | undefined,
): Promise<CsvRowImporter> {
  const [rooms, locations] = await Promise.all([
    // Rooms and beds only: a table of the same name is another thing.
    fetchAllPages((page) => api.listRooms({ kind: 'ROOM', limit: 100, page })),
    fetchAllPages((page) => api.listHospitals({ limit: 100, page })),
  ]);
  const byCode = new Map(rooms.map((room) => [room.roomCode.toUpperCase(), room]));
  const byName = new Map(
    rooms.map((room) => [`${room.hospitalId}:${room.roomName.toLowerCase()}`, room]),
  );
  const locationByCode = new Map(
    locations.map((location) => [getLocationCode(location).toUpperCase(), location]),
  );

  return async (cells) => {
    const name = cells('Room name');
    const code = cells('Room code').toUpperCase();
    const locationCode = cells('Location code').toUpperCase();
    const location = locationCode ? locationByCode.get(locationCode) : undefined;

    if (!name) throw new Error('Room name is required.');
    if (locationCode && !location) throw new Error(`No location has code ${locationCode}.`);

    const hospitalId = location?.id ?? scopedHospitalId;
    const match = code
      ? byCode.get(code)
      : hospitalId
        ? byName.get(`${hospitalId}:${name.toLowerCase()}`)
        : undefined;

    if (code && !match)
      throw new Error(`No room has code ${code}. Leave Room code blank to add a room.`);
    if (match && location && location.id !== match.hospitalId) {
      throw new Error(
        `A room stays at its location; ${match.roomCode} can't move to ${locationCode}.`,
      );
    }

    const isActive = activeStatus(cells('Room status'), match?.isActive ?? true);

    if (match) {
      await api.updateRoom(match.id, { isActive, roomName: name });
      return 'updated';
    }

    if (!hospitalId) {
      throw new Error(
        'Give a Location code, or choose the location at the top of the screen first.',
      );
    }

    const created = (await api.createRoom({ hospitalId, isActive, roomName: name })) as {
      data?: Room;
    };

    // A later row naming the same room updates it instead of adding it twice.
    if (created.data) byName.set(`${hospitalId}:${name.toLowerCase()}`, created.data);

    return 'created';
  };
}

export interface TableImportApi extends RoomImportApi {
  listRestaurants(query: {
    limit: number;
    page: number;
  }): Promise<ApiResponse<ApiList<Restaurant>>>;
}

/**
 * Reads one row of tables: its restaurant by code or name (at the row's location), then the table
 * by code, else by name at that restaurant; adds it when new.
 */
export async function startTableImport(
  api: TableImportApi,
  /** The location chosen at the top of the screen: where a row without a Location code looks. */
  scopedHospitalId: string | undefined,
): Promise<CsvRowImporter> {
  const [tables, locations, restaurants] = await Promise.all([
    fetchAllPages((page) => api.listRooms({ kind: 'TABLE', limit: 100, page })),
    fetchAllPages((page) => api.listHospitals({ limit: 100, page })),
    fetchAllPages((page) => api.listRestaurants({ limit: 100, page })),
  ]);
  const byCode = new Map(tables.map((table) => [table.roomCode.toUpperCase(), table]));
  const byName = new Map(
    tables.map((table) => [`${table.restaurantId}:${table.roomName.toLowerCase()}`, table]),
  );
  const locationByCode = new Map(
    locations.map((location) => [getLocationCode(location).toUpperCase(), location]),
  );

  return async (cells) => {
    const name = cells('Table name');
    const code = cells('Table code').toUpperCase();
    const named = cells('Restaurant');
    const locationCode = cells('Location code').toUpperCase();
    const location = locationCode ? locationByCode.get(locationCode) : undefined;

    if (!name) throw new Error('Table name is required.');
    if (!named) throw new Error('Restaurant is required.');
    if (locationCode && !location) throw new Error(`No location has code ${locationCode}.`);

    const hospitalId = location?.id ?? scopedHospitalId;
    const found = restaurants.filter(
      (restaurant) =>
        (!hospitalId || restaurant.hospitalId === hospitalId) &&
        (restaurant.restaurantCode.toUpperCase() === named.toUpperCase() ||
          restaurant.restaurantName.toLowerCase() === named.toLowerCase()),
    );
    const restaurant = found[0];

    if (!restaurant) {
      throw new Error(
        `No restaurant ${named}${locationCode ? ` at ${locationCode}` : hospitalId ? ' at this location' : ''}.`,
      );
    }
    if (found.length > 1) {
      throw new Error(
        `More than one restaurant is named ${named}. Give its code, or a Location code.`,
      );
    }

    const match = code ? byCode.get(code) : byName.get(`${restaurant.id}:${name.toLowerCase()}`);

    if (code && !match)
      throw new Error(`No table has code ${code}. Leave Table code blank to add a table.`);
    if (match && match.restaurantId !== restaurant.id) {
      throw new Error(
        `A table stays at its restaurant; ${match.roomCode} can't move to ${restaurant.restaurantName}.`,
      );
    }

    const isActive = activeStatus(cells('Table status'), match?.isActive ?? true);

    if (match) {
      await api.updateRoom(match.id, { isActive, roomName: name });
      return 'updated';
    }

    const created = (await api.createRoom({
      hospitalId: restaurant.hospitalId,
      isActive,
      restaurantId: restaurant.id,
      roomName: name,
    })) as { data?: Room };

    // A later row naming the same table updates it instead of adding it twice.
    if (created.data) byName.set(`${restaurant.id}:${name.toLowerCase()}`, created.data);

    return 'created';
  };
}

// The site address a phone can reach (the LAN address in development), for QR links; it lives
// with the QR helpers, as the kiosk's take-away QR uses it too.
export { fetchQrOrigin } from '@/lib/qr-order';
