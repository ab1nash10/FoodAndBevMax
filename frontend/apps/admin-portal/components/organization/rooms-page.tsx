'use client';

import type { Room, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, Copy, Download, ListPlus, Pencil, Plus, Printer, QrCode } from 'lucide-react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useEffect, useId, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
import { CsvImportExport, fetchAllPages } from '@/components/csv-import-export';
import { DateTimeCell, RecordAvatar, RowAction, tableStyles } from '@/components/design-system';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import {
  fetchQrOrigin,
  roomColumns,
  roomMatching,
  roomOrderUrl,
  startRoomImport,
  startTableImport,
  tableColumns,
  tableMatching,
  tableOrderUrl,
} from '@/components/organization/rooms-import-export';
import {
  EditMasterDialog,
  type EditMasterValues,
} from '@/components/organization/shared/edit-master-dialog';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  StatusToggleCell,
} from '@/components/organization/shared/list-controls';
import {
  getLocationDisplayName,
  inactiveLocationMessage,
} from '@/components/organization/shared/locations';
import type { ActiveFilter } from '@/components/organization/shared/types';
import { activeFilterToBoolean } from '@/components/organization/shared/utils';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { FilterSelect, Modal, SavedViewTabs } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { useListLimit } from '@/lib/list-limit';

const newRoom: EditMasterValues = { isActive: true, name: '' };

type Kind = 'rooms' | 'tables';

/** A table's restaurant, as the Tables tab picks it. */
interface TableRestaurant {
  id: string;
  restaurantName: string;
}

/**
 * Rooms and beds at a location, and the restaurants' dine-in tables (the Tables tab). Each has a
 * QR: scanned, it opens ordering on the guest's phone with the bed or table already filled in.
 * Import adds or updates rooms from Excel; Export gives each one's QR link too.
 */
export function RoomsPageClient() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('ROOM_UPDATE');
  const canCreate = hasPermission('ROOM_CREATE');
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { isLoadingLocations, scopedHospitalId, selectedLocation } = useLocationContext();
  const [kind, setKind] = useUrlParam<Kind>('kind', 'rooms', ['rooms', 'tables']);
  const tables = kind === 'tables';
  // The Tables tab's restaurant: its tables only, and where a new table goes.
  const [restaurantId, setRestaurantId] = useUrlParam('restaurant');
  const noun = tables ? 'table' : 'room';
  const [page, setPage] = useUrlNumberParam('page');
  const [limit, setLimit] = useListLimit(setPage);
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  // The room being edited; 'new' while adding one.
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [addingTables, setAddingTables] = useState(false);
  // A new table's restaurant, as picked in its form; blank keeps the default below.
  const [pickedRestaurantId, setPickedRestaurantId] = useState('');
  const [restaurantMissing, setRestaurantMissing] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setPage(1);
    setRestaurantId('');
  });

  // The location's restaurants, for the Tables tab only.
  const restaurantsQuery = useQuery({
    enabled: tables,
    queryFn: async () =>
      (
        await organizationApi.listRestaurants({
          hospitalId: scopedHospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'restaurantName',
          sortOrder: 'asc',
        })
      ).data.items as TableRestaurant[],
    queryKey: queryKeys.restaurants('table-picker', scopedHospitalId ?? 'all'),
  });
  const restaurants = restaurantsQuery.data ?? [];
  const restaurant = restaurants.find((option) => option.id === restaurantId);
  // Where a new table goes unless another is picked: the restaurant filtered on, or the only one.
  const defaultRestaurantId =
    restaurant?.id ?? (restaurants.length === 1 ? restaurants[0]!.id : '');
  const newTableRestaurantId = pickedRestaurantId || defaultRestaurantId;

  const listQuery = {
    hospitalId: scopedHospitalId,
    isActive: activeFilterToBoolean(activeFilter),
    kind: tables ? ('TABLE' as const) : ('ROOM' as const),
    restaurantId: tables && restaurantId ? restaurantId : undefined,
    search,
    sortBy,
    sortOrder,
  };
  const roomsQuery = useQuery({
    queryFn: async () => (await organizationApi.listRooms({ ...listQuery, limit, page })).data,
    queryKey: queryKeys.rooms({ limit, ...listQuery, page }),
  });
  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listRooms({
            hospitalId: scopedHospitalId,
            isActive,
            kind: listQuery.kind,
            limit: 0,
            restaurantId: listQuery.restaurantId,
          })
        ).data.meta.total;
      return { all: await count() };
    },
    queryKey: queryKeys.rooms(
      'stats',
      scopedHospitalId ?? 'all',
      listQuery.kind,
      listQuery.restaurantId ?? 'all',
    ),
  });
  const stats = statsQuery.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() });

  const saveMutation = useMutation({
    mutationFn: async ({ isActive, name }: EditMasterValues) =>
      editing === 'new'
        ? organizationApi.createRoom({
            hospitalId: scopedHospitalId ?? '',
            isActive,
            ...(tables ? { restaurantId: newTableRestaurantId } : {}),
            roomName: name,
          })
        : organizationApi.updateRoom((editing as Room).id, { isActive, roomName: name }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: tables ? 'Table was not saved' : 'Room was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      refresh();
      showToast({
        recordId: response.data.id,
        title:
          editing === 'new'
            ? `${response.data.roomName} added`
            : tables
              ? 'Table updated'
              : 'Room updated',
        variant: 'success',
      });
      closeEditor();
    },
  });

  function closeEditor() {
    setEditing(null);
    setPickedRestaurantId('');
    setRestaurantMissing(false);
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateRoom(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Room status was not updated',
        variant: 'error',
      });
    },
    onSettled: () => setStatusUpdatingId(null),
    onSuccess(_, variables) {
      refresh();
      showToast({
        recordId: variables.id,
        title: variables.isActive ? 'Room activated' : 'Room deactivated',
        variant: 'success',
      });
    },
  });

  async function toggleStatus(room: Room) {
    const isActive = !room.isActive;

    if (isActive && !room.hospital.isActive) {
      showToast({
        description: inactiveLocationMessage,
        title: 'Location is inactive',
        variant: 'info',
      });
      return;
    }

    const confirmed = await confirmStatusChange(confirm, {
      activate: isActive,
      effect: `Its QR stops taking orders while the ${noun} is inactive.`,
      name: room.roomName,
    });

    if (!confirmed) return;

    setStatusUpdatingId(room.id);
    statusMutation.mutate({ id: room.id, isActive });
  }

  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
    setPage(1);
  }

  const items = roomsQuery.data?.items ?? [];
  const meta = roomsQuery.data?.meta ?? { limit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(searchInput || activeFilter);
  const editingRecord =
    editing === 'new'
      ? newRoom
      : editing
        ? { isActive: editing.isActive, name: editing.roomName }
        : null;
  const locationName = selectedLocation ? getLocationDisplayName(selectedLocation) : '';
  // Why nothing can be added yet: no location chosen at the top.
  const addBlocker = scopedHospitalId ? undefined : 'Choose a location at the top first';

  function switchKind(next: Kind) {
    setKind(next);
    setPage(1);
  }

  return (
    <section className="space-y-5">
      <PageHeader
        count={stats?.all}
        action={
          <>
            <CsvImportExport
              columns={tables ? tableColumns : roomColumns}
              exportRows={async () => {
                const [origin, rooms] = await Promise.all([
                  fetchQrOrigin(),
                  fetchAllPages((exportPage) =>
                    organizationApi.listRooms({ ...listQuery, limit: 100, page: exportPage }),
                  ),
                ]);
                const orderUrl = tables ? tableOrderUrl : roomOrderUrl;

                return rooms.map((room) => ({ ...room, qrLink: orderUrl(origin, room.id) }));
              }}
              filename={tables ? 'tables' : 'rooms'}
              matching={tables ? tableMatching : roomMatching}
              noun={tables ? 'tables' : 'rooms'}
              onImported={refresh}
              startImport={
                canCreate
                  ? () =>
                      (tables ? startTableImport : startRoomImport)(
                        organizationApi,
                        scopedHospitalId,
                      )
                  : undefined
              }
            />
            {canCreate && tables ? (
              <Button
                disabled={Boolean(addBlocker)}
                onClick={() => setAddingTables(true)}
                title={addBlocker}
                type="button"
                variant="outline"
              >
                <ListPlus className="h-4 w-4" />
                Add tables
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                disabled={Boolean(addBlocker)}
                onClick={() => setEditing('new')}
                title={addBlocker}
                type="button"
              >
                <Plus className="h-4 w-4" />
                {tables ? 'New table' : 'New room'}
              </Button>
            ) : null}
          </>
        }
        icon={BedDouble}
        subtitle="Rooms and beds, and the restaurants' dine-in tables. Each one's QR opens ordering with it filled in."
        title="Rooms & tables"
      />
      <Panel>
        {/* Rooms or tables on top of the list card, as Item locations has Store / Kitchen. */}
        <div className="pt-2">
          <SavedViewTabs<Kind>
            label="Rooms or tables"
            onChange={switchKind}
            views={[
              { label: 'Rooms & beds', value: 'rooms' },
              { label: 'Tables', value: 'tables' },
            ]}
            value={kind}
          />
        </div>
        <ListToolbar>
          <SearchInput
            label={tables ? 'Search tables' : 'Search rooms'}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={tables ? 'Table name, code or restaurant' : 'Room name, code or location'}
            value={searchInput}
          />
          {tables ? (
            <FilterSelect
              disabled={!scopedHospitalId}
              label="Restaurant"
              onChange={(value) => {
                setRestaurantId(value);
                setPage(1);
              }}
              value={restaurant ? restaurantId : ''}
            >
              <option value="">All restaurants</option>
              {(restaurantsQuery.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.restaurantName}
                </option>
              ))}
            </FilterSelect>
          ) : null}
          <FiltersMenu activeCount={activeFilter ? 1 : 0}>
            <FilterField label="Status">
              <ActiveFilterSelect onChange={showStatus} value={activeFilter} />
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            onSortByChange={(value) => {
              setSortBy(value);
              setPage(1);
            }}
            options={[
              { label: 'Created date', value: 'createdAt' },
              { label: 'Updated date', value: 'updatedAt' },
              { label: 'Name', value: 'roomName' },
              { label: 'Code', value: 'roomCode' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void roomsQuery.refetch()} />
          <ClearFiltersButton
            active={hasFilters || Boolean(tables && restaurantId)}
            onClear={() => {
              setSearch('');
              setRestaurantId('');
              showStatus('');
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-160 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[32%]')}>{tables ? 'Table' : 'Room'}</th>
                <th className={cn(tableStyles.th, 'w-[26%]')}>
                  {tables ? 'Restaurant' : 'Location'}
                </th>
                <th className={cn(tableStyles.th, 'w-[20%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Updated</th>
                <th className={cn(tableStyles.th, 'w-24')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((room) => (
                  <tr className={tableStyles.row} data-record-id={room.id} key={room.id}>
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar name={room.roomName} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={cn('truncate', tableStyles.title)}>{room.roomName}</span>
                          <span className={cn('truncate', tableStyles.code)}>{room.roomCode}</span>
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {room.restaurant ? (
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate">{room.restaurant.restaurantName}</span>
                          <span className="truncate text-xs text-ds-muted">
                            {getLocationDisplayName(room.hospital)}
                          </span>
                        </span>
                      ) : (
                        getLocationDisplayName(room.hospital)
                      )}
                    </td>
                    <td className={tableStyles.td}>
                      <StatusToggleCell
                        disabled={
                          !canEdit || (statusMutation.isPending && statusUpdatingId === room.id)
                        }
                        isActive={room.isActive}
                        onToggle={() => void toggleStatus(room)}
                        showFrozenMessage={!room.hospital.isActive}
                      />
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell value={room.updatedAt} />
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end gap-1">
                        <RowAction
                          icon={QrCode}
                          label={`QR code for ${room.roomName}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setQrRoom(room);
                          }}
                        />
                        {canEdit ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${room.roomName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditing(room);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={5}
                  error={roomsQuery.error}
                  isError={roomsQuery.isError}
                  isLoading={roomsQuery.isLoading}
                  label={tables ? 'tables' : 'rooms'}
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onLimitChange={setLimit}
          limit={meta.limit}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
      <EditMasterDialog
        asTyped
        isPending={saveMutation.isPending}
        location={
          editing === 'new'
            ? locationName
            : editing
              ? [editing.restaurant?.restaurantName, getLocationDisplayName(editing.hospital)]
                  .filter(Boolean)
                  .join(' · ')
              : ''
        }
        nameLabel={tables ? 'Table' : 'Room or bed'}
        onClose={closeEditor}
        onSave={(values) => {
          if (editing === 'new' && tables && !newTableRestaurantId) {
            setRestaurantMissing(true);
            return;
          }
          saveMutation.mutate(values);
        }}
        record={editingRecord}
        title={editing === 'new' ? `New ${noun}` : `Edit ${noun}`}
      >
        {editing === 'new' && tables ? (
          <RestaurantField
            error={
              restaurantMissing && !newTableRestaurantId
                ? 'Choose the table’s restaurant.'
                : undefined
            }
            onChange={setPickedRestaurantId}
            restaurants={restaurants}
            value={newTableRestaurantId}
          />
        ) : null}
      </EditMasterDialog>
      <RoomQrDialog onClose={() => setQrRoom(null)} room={qrRoom} />
      {scopedHospitalId ? (
        <AddTablesDialog
          hospitalId={scopedHospitalId}
          initialRestaurantId={defaultRestaurantId}
          onClose={() => setAddingTables(false)}
          onDone={refresh}
          open={addingTables}
          restaurants={restaurants}
        />
      ) : null}
    </section>
  );
}

/** A table's restaurant, picked from the location's active ones. */
function RestaurantField({
  error,
  onChange,
  restaurants,
  value,
}: Readonly<{
  error?: string;
  onChange: (restaurantId: string) => void;
  restaurants: TableRestaurant[];
  value: string;
}>) {
  const id = useId();

  return (
    <Field error={error} label="Restaurant" name={id} required>
      <Select id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">
          {restaurants.length ? 'Choose a restaurant' : 'No active restaurant at this location'}
        </option>
        {restaurants.map((option) => (
          <option key={option.id} value={option.id}>
            {option.restaurantName}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Adds a run of tables to a restaurant at once: T1 to T20, say. One at a time, so their codes
 * follow their numbers; a name the restaurant already has is skipped and named in the result.
 */
function AddTablesDialog({
  hospitalId,
  initialRestaurantId,
  onClose,
  onDone,
  open,
  restaurants,
}: Readonly<{
  hospitalId: string;
  /** The restaurant filtered on (or the only one), until another is picked here. */
  initialRestaurantId: string;
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  restaurants: TableRestaurant[];
}>) {
  const { showToast } = useToast();
  const [picked, setPicked] = useState('');
  const restaurantId = picked || initialRestaurantId;
  const [prefix, setPrefix] = useState('T');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [busy, setBusy] = useState(false);
  const first = Number(from);
  const last = Number(to);
  const count = last - first + 1;
  const problem = !restaurantId
    ? 'Choose the restaurant the tables are in.'
    : !Number.isInteger(first) || !Number.isInteger(last) || first < 0
      ? 'Give whole numbers, from 0 up.'
      : count < 1
        ? 'The last number must be at least the first.'
        : count > 100
          ? 'Up to 100 tables at a time.'
          : '';
  const name = (number: number) => `${prefix.trim()}${number}`;

  async function add() {
    setBusy(true);
    const refused: string[] = [];
    let added = 0;

    for (let number = first; number <= last; number += 1) {
      try {
        await organizationApi.createRoom({
          hospitalId,
          isActive: true,
          restaurantId,
          roomName: name(number),
        });
        added += 1;
      } catch (error) {
        refused.push(getApiErrorMessage(error));
      }
    }

    setBusy(false);
    onDone();
    close();
    showToast({
      description: refused.length ? refused.join(' ') : undefined,
      title: `${added} ${added === 1 ? 'table' : 'tables'} added`,
      variant: added ? 'success' : 'error',
    });
  }

  function close() {
    setPicked('');
    onClose();
  }

  return (
    <Modal
      description="Each gets its own code and QR. Names the restaurant already has are skipped."
      footer={
        <Button disabled={Boolean(problem) || busy} onClick={() => void add()} type="button">
          {problem ? 'Add tables' : `Add ${name(first)} to ${name(last)}`}
        </Button>
      }
      onClose={close}
      open={open}
      title="Add tables"
    >
      <div className="mb-4">
        <RestaurantField onChange={setPicked} restaurants={restaurants} value={restaurantId} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name before the number" name="tables-prefix">
          <Input
            autoCapitalize="none"
            id="tables-prefix"
            maxLength={40}
            onChange={(event) => setPrefix(event.target.value)}
            value={prefix}
          />
        </Field>
        <Field label="From number" name="tables-from">
          <Input
            id="tables-from"
            inputMode="numeric"
            onChange={(event) => setFrom(event.target.value)}
            value={from}
          />
        </Field>
        <Field label="To number" name="tables-to">
          <Input
            id="tables-to"
            inputMode="numeric"
            onChange={(event) => setTo(event.target.value)}
            value={to}
          />
        </Field>
      </div>
      {problem ? <p className="mt-3 text-sm text-ds-danger">{problem}</p> : null}
    </Modal>
  );
}

/** A room's or table's QR: to print and stick by the bed or on the table, download, or send. */
function RoomQrDialog({ onClose, room }: Readonly<{ onClose: () => void; room: Room | null }>) {
  const { showToast } = useToast();
  const [image, setImage] = useState<string | null>(null);
  const originQuery = useQuery({
    enabled: room !== null,
    queryFn: fetchQrOrigin,
    queryKey: ['qr-origin'],
    staleTime: Infinity,
  });
  const table = room?.restaurant ?? null;
  const url =
    room && originQuery.data
      ? (table ? tableOrderUrl : roomOrderUrl)(originQuery.data, room.id)
      : null;

  useEffect(() => {
    let active = true;

    setImage(null);
    if (url) {
      void QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 2, width: 512 }).then(
        (data) => active && setImage(data),
      );
    }

    return () => {
      active = false;
    };
  }, [url]);

  function print() {
    if (!room || !image) return;

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      showToast({
        description: 'Allow pop-ups for this site, then try printing again.',
        title: 'Print window was blocked',
        variant: 'error',
      });
      return;
    }

    printWindow.opener = null;
    const doc = printWindow.document;
    const style = doc.createElement('style');
    style.textContent =
      'body{align-items:center;display:flex;flex-direction:column;font-family:Arial,sans-serif;justify-content:center;min-height:90vh;text-align:center}img{height:72mm;width:72mm}h1{font-size:24pt;margin:12px 0 4px}p{font-size:12pt}';
    const heading = doc.createElement('h1');
    heading.textContent = table ? `${table.restaurantName} · ${room.roomName}` : room.roomName;
    const picture = doc.createElement('img');
    picture.alt = `QR code for ${room.roomName}`;
    picture.src = image;
    const note = doc.createElement('p');
    note.textContent = table ? 'Scan to order at this table' : 'Scan to order food to this room';
    doc.title = `${room.roomName} QR`;
    doc.body.replaceChildren(style, heading, picture, note);
    void picture.decode().then(() => {
      printWindow.focus();
      printWindow.print();
    });
  }

  return (
    <Modal
      description={
        table
          ? `Scanned on a phone, it opens ${table.restaurantName}'s menu with this table filled in; the guest pays by UPI.`
          : 'Scanned on a phone, it opens the menu with this room filled in; the guest pays by UPI.'
      }
      onClose={onClose}
      open={room !== null}
      side
      title={room ? `${room.roomName} · ${room.roomCode}` : 'Room QR'}
    >
      <div className="grid gap-4 text-sm">
        {table && !table.atTableDining ? (
          <p
            className="rounded-xl bg-ds-status-pending-bg px-3 py-2.5 text-ds-status-pending-fg"
            role="status"
          >
            At Table Dining is off for {table.restaurantName}, so this QR shows a message instead of
            the menu. Switch it on in Restaurants.
          </p>
        ) : null}
        {image ? (
          <Image
            alt={`QR code for ${room?.roomName ?? 'room'}`}
            className="mx-auto h-56 w-56 rounded-card bg-white object-contain"
            height={512}
            src={image}
            unoptimized
            width={512}
          />
        ) : (
          <p className={originQuery.isError ? 'text-ds-danger' : 'text-ds-muted'}>
            {originQuery.isError ? getApiErrorMessage(originQuery.error) : 'Preparing QR…'}
          </p>
        )}
        {url && image ? (
          <>
            <input
              aria-label="Ordering link"
              className="h-11 w-full rounded-xl border border-ds-border bg-ds-subtle px-3 font-mono text-xs text-ds-text"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={url}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={print} type="button">
                <Printer aria-hidden="true" className="h-4 w-4" />
                Print QR
              </Button>
              <Button
                onClick={() => {
                  const link = document.createElement('a');
                  link.download = `${room?.roomCode ?? 'room'}-qr.png`;
                  link.href = image;
                  link.click();
                }}
                type="button"
                variant="outline"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Download PNG
              </Button>
              <Button
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(url)
                    .then(() => showToast({ title: 'Ordering link copied', variant: 'success' }))
                }
                type="button"
                variant="outline"
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
                Copy link
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
