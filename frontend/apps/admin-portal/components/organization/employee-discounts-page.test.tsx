import type { EmployeeDiscount, Restaurant } from '@aahar/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LocationModule from '@/components/location-context';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { EmployeeDiscountsPageClient } from './employee-discounts-page';

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
  createEmployeeDiscount: vi.fn<Client['createEmployeeDiscount']>(),
  listEmployeeDiscounts: vi.fn<Client['listEmployeeDiscounts']>(),
  listRestaurants: vi.fn<Client['listRestaurants']>(),
  updateEmployeeDiscount: vi.fn<Client['updateEmployeeDiscount']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const cafe = { id: 'rest-1', restaurantCode: 'RST-0001', restaurantName: 'Cafe Max' };
const discount = (overrides: Partial<EmployeeDiscount> = {}): EmployeeDiscount => ({
  archivedAt: null,
  createdAt: '2026-11-01T05:00:00Z',
  createdByName: 'Asha Verma',
  daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  discountPercent: 30,
  employmentType: 'ON_ROLL',
  endTime: '15:00',
  hospitalId: ppg.id,
  id: 'abcdef12-0000-0000-0000-000000000000',
  name: 'Staff lunch',
  restaurant: cafe,
  restaurantId: cafe.id,
  startTime: '12:00',
  updatedAt: '2026-11-19T05:00:00Z',
  ...overrides,
});

const all = ['EMPLOYEE_DISCOUNT_VIEW', 'EMPLOYEE_DISCOUNT_CREATE', 'EMPLOYEE_DISCOUNT_UPDATE'];

// Filling a whole form types many keys: on a busy machine that takes longer than the default 5 s.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.clearAllMocks();
  at('/masters/employee-discounts');
  atLocation(ppg);
  signedIn(all);
  api.listRestaurants.mockImplementation(() => page([cafe as Restaurant]));
});

describe('Employee Discounts', () => {
  it('lists each live rule with its value, days, timings and level', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([discount()]));
    renderScreen(<EmployeeDiscountsPageClient />);

    const row = (await screen.findByText('Staff lunch')).closest('tr') as HTMLElement;
    expect(within(row).getByText('ABCDEF12')).toBeInTheDocument();
    expect(within(row).getByText('Cafe Max')).toBeInTheDocument();
    expect(within(row).getByText('30%')).toBeInTheDocument();
    expect(within(row).getByText('Yes')).toBeInTheDocument();
    expect(within(row).getByText('Mon – Fri')).toBeInTheDocument();
    expect(within(row).getByText('On roll')).toBeInTheDocument();
    expect(within(row).getByLabelText('Not archived')).toBeInTheDocument();
    expect(within(row).getByText('Asha Verma')).toBeInTheDocument();
    expect(api.listEmployeeDiscounts).toHaveBeenCalledWith(
      expect.objectContaining({ archived: false, hospitalId: 'h-ppg', page: 1 }),
    );
  });

  it('says how rules get here when there are none, and why a load failed', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([]));
    const first = renderScreen(<EmployeeDiscountsPageClient />);
    expect(await screen.findByText('No employee discounts at Patparganj')).toBeInTheDocument();
    first.unmount();

    api.listEmployeeDiscounts.mockRejectedValue(new Error('Discounts could not be loaded'));
    renderScreen(<EmployeeDiscountsPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Discounts could not be loaded');
  });

  it('asks the API for archived rules, the restaurant in the link and the search typed', async () => {
    at('/masters/employee-discounts', 'view=archived&restaurant=rest-1');
    api.listEmployeeDiscounts.mockImplementation(() => page([]));
    const { user } = renderScreen(<EmployeeDiscountsPageClient />);

    expect(await screen.findByText('Archived discounts show here.')).toBeInTheDocument();
    expect(api.listEmployeeDiscounts).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true, restaurantId: 'rest-1' }),
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search discounts' }), 'lunch');
    await waitFor(() =>
      expect(api.listEmployeeDiscounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'lunch' }),
      ),
    );
  });

  it('offers New discount, Edit and Archive only to those allowed to', async () => {
    signedIn(['EMPLOYEE_DISCOUNT_VIEW']);
    api.listEmployeeDiscounts.mockImplementation(() => page([discount()]));
    renderScreen(<EmployeeDiscountsPageClient />);

    await screen.findByText('Staff lunch');
    expect(screen.queryByRole('button', { name: /New discount/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Staff lunch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Staff lunch' })).not.toBeInTheDocument();
  });

  it('lists what is missing before a new rule can be created', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([]));
    const { user } = renderScreen(<EmployeeDiscountsPageClient />);

    await user.click(await screen.findByRole('button', { name: /New discount/ }));
    const dialog = screen.getByRole('dialog', { name: 'New employee discount' });
    await user.type(within(dialog).getByLabelText(/Discount/), '120');
    await user.click(within(dialog).getByRole('checkbox', { name: /Special timings/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create discount' }));

    const problems = within(dialog).getByRole('alert');
    expect(problems).toHaveTextContent('Give the discount a name.');
    expect(problems).toHaveTextContent('Choose the restaurant.');
    expect(problems).toHaveTextContent('Enter a discount above 0 and up to 100%.');
    expect(problems).toHaveTextContent('Enter both times for special timings, or switch them off.');
    expect(api.createEmployeeDiscount).not.toHaveBeenCalled();
  });

  it('creates a rule for the restaurant, level, days and times picked', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([]));
    api.createEmployeeDiscount.mockImplementation(() => reply(discount()));
    const { user } = renderScreen(<EmployeeDiscountsPageClient />);

    await user.click(await screen.findByRole('button', { name: /New discount/ }));
    const dialog = screen.getByRole('dialog', { name: 'New employee discount' });
    await user.type(within(dialog).getByLabelText(/Name/), 'Night shift');
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: 'Cafe Max' })).toBeInTheDocument(),
    );
    await user.selectOptions(within(dialog).getByLabelText(/Restaurant/), 'Cafe Max');
    await user.type(within(dialog).getByLabelText(/Discount/), '12.5');
    await user.click(within(dialog).getByRole('button', { name: 'Outsourced' }));
    await user.click(within(dialog).getByRole('button', { name: 'Sat' }));
    await user.click(within(dialog).getByRole('button', { name: 'Sun' }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Special timings/ }));
    // Time boxes take a whole value at once, as a browser's time picker gives it.
    fireEvent.change(within(dialog).getByLabelText(/From/), { target: { value: '22:00' } });
    fireEvent.change(within(dialog).getByLabelText(/To/), { target: { value: '06:00' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create discount' }));

    await waitFor(() =>
      expect(api.createEmployeeDiscount).toHaveBeenCalledWith({
        daysOfWeek: ['SATURDAY', 'SUNDAY'],
        discountPercent: 12.5,
        employmentType: 'OUTSOURCED',
        endTime: '06:00',
        name: 'Night shift',
        restaurantId: 'rest-1',
        startTime: '22:00',
      }),
    );
  });

  it('starts a new rule on the restaurant chosen in the filter', async () => {
    at('/masters/employee-discounts', 'restaurant=rest-1');
    api.listEmployeeDiscounts.mockImplementation(() => page([]));
    const { user } = renderScreen(<EmployeeDiscountsPageClient />);

    await screen.findByText('No employee discounts at Patparganj');
    await user.click(screen.getByRole('button', { name: /New discount/ }));

    expect(screen.getByLabelText(/Restaurant/)).toHaveValue('rest-1');
  });

  it('saves an edited rule and shows a refusal from the API', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([discount()]));
    api.updateEmployeeDiscount.mockRejectedValue(new Error('A rule of that name already exists'));
    const { user } = renderScreen(<EmployeeDiscountsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Edit Staff lunch' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Staff lunch' });
    expect(within(dialog).getByLabelText(/Discount/)).toHaveValue('30');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateEmployeeDiscount).toHaveBeenCalledWith(
        'abcdef12-0000-0000-0000-000000000000',
        {
          daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
          discountPercent: 30,
          employmentType: 'ON_ROLL',
          endTime: '15:00',
          name: 'Staff lunch',
          restaurantId: 'rest-1',
          startTime: '12:00',
        },
      ),
    );
    expect(await screen.findByText('A rule of that name already exists')).toBeInTheDocument();
  });

  it('archives a rule once confirmed', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([discount()]));
    api.updateEmployeeDiscount.mockImplementation(() => reply(discount()));
    const { user } = renderScreen(<EmployeeDiscountsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Archive Staff lunch' }));
    const confirm = screen.getByRole('dialog', { name: 'Archive Staff lunch?' });
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(api.updateEmployeeDiscount).toHaveBeenCalledWith(
        'abcdef12-0000-0000-0000-000000000000',
        { archived: true },
      ),
    );
  });
});
