import type { EmployeeDiscount } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { StaffDiscountPanel } from './staff-discount-panel';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  getStaffDiscounts: vi.fn<Client['getStaffDiscounts']>(),
  listEmployeeDiscounts: vi.fn<Client['listEmployeeDiscounts']>(),
  setStaffDiscounts: vi.fn<Client['setStaffDiscounts']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const cafe = { id: 'rest-1', restaurantName: 'Cafe Max' };
const settings = {
  rates: [{ discountPercent: 10, employmentType: 'ON_ROLL' as const }],
  restaurantId: 'rest-1',
  restaurantName: 'Cafe Max',
  staffDiscountApplicable: false,
};
const rule = {
  discountPercent: 15,
  employmentType: 'ON_ROLL',
  endTime: '15:00',
  id: 'd1',
  name: 'Lunch for staff',
  startTime: '12:00',
} as EmployeeDiscount;

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['RESTAURANT_UPDATE', 'EMPLOYEE_DISCOUNT_VIEW']);
  api.getStaffDiscounts.mockImplementation(() => reply(settings));
  api.listEmployeeDiscounts.mockImplementation(() => page([rule]));
});

describe('the staff discount panel', () => {
  it("shows the restaurant's live discount rules with a link to manage them", async () => {
    renderScreen(<StaffDiscountPanel onClose={vi.fn()} restaurant={cafe} />);
    const dialog = screen.getByRole('dialog', { name: 'Staff discount' });

    expect(await within(dialog).findByText('Lunch for staff')).toBeInTheDocument();
    expect(within(dialog).getByText('On roll · 12:00–15:00')).toBeInTheDocument();
    expect(within(dialog).getByText('15%')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: /Manage in Employee discounts/ }),
    ).toHaveAttribute('href', '/masters/employee-discounts?restaurant=rest-1');
    expect(api.listEmployeeDiscounts).toHaveBeenCalledWith({
      archived: false,
      limit: 50,
      restaurantId: 'rest-1',
    });
  });

  it('says staff get nothing while there are no rules', async () => {
    api.listEmployeeDiscounts.mockImplementation(() => page([]));
    renderScreen(<StaffDiscountPanel onClose={vi.fn()} restaurant={cafe} />);

    expect(
      await screen.findByText(
        'No rules yet, so staff get no discount here even with the switch on.',
      ),
    ).toBeInTheDocument();
  });

  it('turns the discount on, sending the old rates back unchanged', async () => {
    const onClose = vi.fn();
    api.setStaffDiscounts.mockImplementation(() =>
      reply({ ...settings, staffDiscountApplicable: true }),
    );
    const { user } = renderScreen(<StaffDiscountPanel onClose={onClose} restaurant={cafe} />);
    const dialog = screen.getByRole('dialog', { name: 'Staff discount' });

    const toggle = await within(dialog).findByRole('switch');
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.setStaffDiscounts).toHaveBeenCalledWith('rest-1', {
        rates: [{ discountPercent: 10, employmentType: 'ON_ROLL' }],
        staffDiscountApplicable: true,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows why a save failed', async () => {
    api.setStaffDiscounts.mockRejectedValue(new Error('Restaurant is inactive'));
    const { user } = renderScreen(<StaffDiscountPanel onClose={vi.fn()} restaurant={cafe} />);

    await screen.findByRole('switch');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Restaurant is inactive');
  });

  it('is read-only without RESTAURANT_UPDATE, and hides rules without their permission', async () => {
    signedIn(['RESTAURANT_VIEW']);
    renderScreen(<StaffDiscountPanel onClose={vi.fn()} restaurant={cafe} />);

    expect(await screen.findByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    // Nothing to cancel: the footer only closes.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByText('Discount rules')).not.toBeInTheDocument();
    expect(api.listEmployeeDiscounts).not.toHaveBeenCalled();
  });

  it('shows why the settings failed to load', async () => {
    api.getStaffDiscounts.mockRejectedValue(new Error('Restaurant not found'));
    renderScreen(<StaffDiscountPanel onClose={vi.fn()} restaurant={cafe} />);

    expect(await screen.findByText('Restaurant not found')).toBeInTheDocument();
  });
});
