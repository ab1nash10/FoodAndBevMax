import type { Hospital } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { LocationPickerDialog } from './location-picker-dialog';

// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  listHospitals: vi.fn<OrganizationApi['listHospitals']>(),
}));
vi.mock('@/lib/api', () => ({ organizationApi }));

const place = (n: number) =>
  ({
    city: 'Delhi',
    hospitalCode: `L${n}`,
    hospitalName: `Hospital ${n}`,
    id: `h-${n}`,
    isActive: true,
    state: 'Delhi',
  }) as Hospital;

/** 45 locations, 20 a page, as the server pages them. */
function serve() {
  organizationApi.listHospitals.mockImplementation((query) => {
    const all = Array.from({ length: 45 }, (_, i) => place(i + 1)).filter(
      (location) => !query?.search || location.hospitalName.includes(query.search),
    );
    const pageNo = query?.page ?? 1;
    const items = all.slice((pageNo - 1) * 20, pageNo * 20);
    return reply({
      items,
      meta: { limit: 20, page: pageNo, total: all.length, totalPages: Math.ceil(all.length / 20) },
    });
  });
}

const onCancel = vi.fn();
const onConfirm = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  serve();
});

describe('the location picker', () => {
  it('lists active locations a page at a time, labelled with code, name, city and state', async () => {
    renderScreen(
      <LocationPickerDialog onCancel={onCancel} onConfirm={onConfirm} selectedIds={[]} />,
    );

    expect(
      await screen.findByRole('checkbox', { name: 'L1 - Hospital 1, Delhi, Delhi' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 20 of 45 results')).toBeInTheDocument();
    expect(organizationApi.listHospitals).toHaveBeenCalledWith({
      isActive: true,
      limit: 20,
      page: 1,
      search: undefined,
    });
  });

  it('pages on to the next locations', async () => {
    const { user } = renderScreen(
      <LocationPickerDialog onCancel={onCancel} onConfirm={onConfirm} selectedIds={[]} />,
    );
    await screen.findByText('Showing 1 to 20 of 45 results');

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Showing 21 to 40 of 45 results')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^L21 -/ })).toBeInTheDocument();
  });

  it('searches from page 1', async () => {
    const { user } = renderScreen(
      <LocationPickerDialog onCancel={onCancel} onConfirm={onConfirm} selectedIds={[]} />,
    );
    await screen.findByText('Showing 1 to 20 of 45 results');
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await user.type(screen.getByRole('textbox', { name: 'Search locations' }), 'Hospital 4');

    await waitFor(() =>
      expect(organizationApi.listHospitals).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: 'Hospital 4' }),
      ),
    );
  });

  it('says so when nothing matches', async () => {
    const { user } = renderScreen(
      <LocationPickerDialog onCancel={onCancel} onConfirm={onConfirm} selectedIds={[]} />,
    );
    await screen.findByText('Showing 1 to 20 of 45 results');

    await user.type(screen.getByRole('textbox', { name: 'Search locations' }), 'Nowhere');

    expect(await screen.findByText('No locations found.')).toBeInTheDocument();
  });

  it('adds every location ticked, keeping those already chosen', async () => {
    const { user } = renderScreen(
      <LocationPickerDialog onCancel={onCancel} onConfirm={onConfirm} selectedIds={['h-1']} />,
    );

    expect(await screen.findByRole('checkbox', { name: /^L1 -/ })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /^L2 -/ }));
    // A click anywhere on the row ticks it too.
    await user.click(screen.getByText('L3 - Hospital 3, Delhi, Delhi'));
    await user.click(screen.getByRole('button', { name: 'Add 3 locations' }));

    expect(onConfirm).toHaveBeenCalledWith(['h-1', 'h-2', 'h-3']);
  });

  it('holds one location for a single-location role', async () => {
    const { user } = renderScreen(
      <LocationPickerDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        selectedIds={['h-1']}
        singleSelect
      />,
    );

    await user.click(await screen.findByRole('radio', { name: /^L2 -/ }));
    await user.click(screen.getByRole('button', { name: 'Add 1 location' }));

    expect(onConfirm).toHaveBeenCalledWith(['h-2']);
  });

  it('cancels without changing anything', async () => {
    const { user } = renderScreen(
      <LocationPickerDialog onCancel={onCancel} onConfirm={onConfirm} selectedIds={[]} />,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
