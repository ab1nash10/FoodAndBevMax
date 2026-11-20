import { screen, waitFor, within } from '@testing-library/react';
import type { KitchenProduction } from '@aahar/api-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { KitchenTabletPageClient } from './kitchen-tablet-page';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/components/inventory/test-location'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: {
    createKitchenProduction: vi.fn(),
    listKitchenItems: vi.fn(),
    listKitchenProductions: vi.fn(),
    listKitchens: vi.fn(),
    listTimeSlots: vi.fn(),
    postKitchenProduction: vi.fn(),
  },
}));

const api = mockedApi(organizationApi);

// 12:30 in India on 19 Nov: only the clock is fixed, so typing and waiting still work.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T07:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

const mainKitchen = { hospitalId: ppg.id, id: 'k-1', kitchenName: 'Main Kitchen' };
const mapping = (id: string, itemName: string, itemType = 'READYMADE') => ({
  item: { id, itemCode: itemName.toUpperCase(), itemName, itemType },
  itemId: id,
});
const postedDal = {
  id: 'kp-4',
  lines: [
    {
      acceptedQty: 18,
      id: 'line-4',
      item: { itemName: 'Dal' },
      itemId: 'i-dal',
      wastageQty: 2,
    },
  ],
  productionDate: '2026-11-19T04:30:00.000Z',
  productionNumber: 'KP-004',
} as unknown as KitchenProduction;

beforeEach(() => {
  vi.clearAllMocks();
  atLocation(ppg);
  signedIn(['KITCHEN_PRODUCTION_CREATE', 'KITCHEN_PRODUCTION_POST']);
  api.listKitchens.mockReturnValue(page([mainKitchen]) as never);
  api.listKitchenItems.mockReturnValue(
    page([mapping('i-rice', 'Rice'), mapping('i-dal', 'Dal')]) as never,
  );
  api.listKitchenProductions.mockReturnValue(page([postedDal]));
  api.listTimeSlots.mockReturnValue(
    page([
      { endTime: '11:00', slotName: 'Breakfast', startTime: '07:00' },
      { endTime: '15:00', slotName: 'Lunch', startTime: '12:00' },
    ]) as never,
  );
  api.createKitchenProduction.mockReturnValue(reply({ id: 'kp-5' }) as never);
  api.postKitchenProduction.mockReturnValue(
    reply({
      lines: [{ acceptedQty: 8, item: { itemName: 'Rice' } }],
      productionNumber: 'KP-005',
    }) as never,
  );
});

const card = (item: string) => within(screen.getByText(item, { selector: 'p' }).closest('li')!);

describe('the kitchen tablet', () => {
  it('shows the kitchen, the meal slot and what was posted today', async () => {
    renderScreen(<KitchenTabletPageClient />);

    expect(await screen.findByRole('heading', { name: 'Main Kitchen' })).toBeInTheDocument();
    expect(await screen.findByText('Lunch')).toBeInTheDocument();
    const today = within(screen.getByRole('region', { name: 'Posted today' }));
    expect((await today.findByText('KP-004 · 2 wasted')).closest('li')).toHaveTextContent('18');
    expect(today.getByText(/made ·/)).toHaveTextContent('18 made · 2 wasted');
    expect(card('Dal').getByText('18')).toBeInTheDocument();
    expect(api.listKitchenProductions).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-11-19', kitchenId: 'k-1', status: 'POSTED' }),
    );
  });

  it('posts a batch less what was wasted, straight to kitchen stock', async () => {
    const { user } = renderScreen(<KitchenTabletPageClient />);
    await screen.findByText('Rice', { selector: 'p' });
    const rice = card('Rice');

    expect(rice.getByRole('button', { name: /^Post/ })).toBeDisabled();
    await user.click(rice.getByRole('button', { name: 'Ten more Rice' }));
    await user.click(rice.getByRole('button', { name: 'Increase Rice wasted' }));
    await user.click(rice.getByRole('button', { name: 'Increase Rice wasted' }));
    await user.click(rice.getByRole('button', { name: 'Post 8' }));

    await waitFor(() => expect(api.postKitchenProduction).toHaveBeenCalledWith('kp-5'));
    expect(api.createKitchenProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDate: '2026-11-19',
        hospitalId: ppg.id,
        items: [{ acceptedQty: 8, itemId: 'i-rice', producedQty: 10, wastageQty: 2 }],
        kitchenId: 'k-1',
      }),
    );
    expect(await screen.findByText('KP-005 posted')).toBeInTheDocument();
    // The card is ready for the next batch.
    expect(rice.getByRole('spinbutton', { name: 'Rice made' })).toHaveValue(0);
  });

  it('will not post a batch that was all wasted', async () => {
    const { user } = renderScreen(<KitchenTabletPageClient />);
    await screen.findByText('Rice', { selector: 'p' });
    const rice = card('Rice');

    await user.click(rice.getByRole('button', { name: 'Increase Rice made' }));
    await user.click(rice.getByRole('button', { name: 'Increase Rice wasted' }));

    expect(rice.getByRole('button', { name: /^Post/ })).toBeDisabled();
  });

  it('keeps the batch and says why when posting fails', async () => {
    api.createKitchenProduction.mockRejectedValue(new Error('Rice is not mapped any more'));
    const { user } = renderScreen(<KitchenTabletPageClient />);
    await screen.findByText('Rice', { selector: 'p' });
    const rice = card('Rice');

    await user.click(rice.getByRole('button', { name: 'Ten more Rice' }));
    await user.click(rice.getByRole('button', { name: 'Post 10' }));

    expect(await screen.findByText('Rice is not mapped any more')).toBeInTheDocument();
    expect(rice.getByRole('spinbutton', { name: 'Rice made' })).toHaveValue(10);
  });

  it('will not let a cook without permission to post do so', async () => {
    signedIn(['KITCHEN_PRODUCTION_CREATE']);
    const { user } = renderScreen(<KitchenTabletPageClient />);
    await screen.findByText('Rice', { selector: 'p' });

    await user.click(card('Rice').getByRole('button', { name: 'Ten more Rice' }));

    expect(card('Rice').getByRole('button', { name: 'Post 10' })).toBeDisabled();
  });

  it('offers only ready-made items: a live item cannot be posted as production', async () => {
    api.listKitchenItems.mockReturnValue(
      page([mapping('i-rice', 'Rice'), mapping('i-dosa', 'Masala Dosa', 'LIVE')]) as never,
    );
    renderScreen(<KitchenTabletPageClient />);

    expect(await screen.findByText('Rice', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Masala Dosa')).toBeNull();
  });

  it('switches kitchens and remembers the choice on this tablet', async () => {
    api.listKitchens.mockReturnValue(
      page([mainKitchen, { hospitalId: ppg.id, id: 'k-2', kitchenName: 'Cafe Kitchen' }]) as never,
    );
    const { user } = renderScreen(<KitchenTabletPageClient />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Kitchen' }), 'k-2');

    expect(await screen.findByRole('heading', { name: 'Cafe Kitchen' })).toBeInTheDocument();
    expect(window.localStorage.getItem('aahar.kitchen-tablet.kitchen')).toBe('k-2');
    await waitFor(() =>
      expect(api.listKitchenItems).toHaveBeenLastCalledWith(
        expect.objectContaining({ kitchenId: 'k-2' }),
      ),
    );
  });

  it('says so when the location has no kitchen, or kitchens did not load', async () => {
    api.listKitchens.mockReturnValue(page([]));
    const { unmount } = renderScreen(<KitchenTabletPageClient />);
    expect(await screen.findByText('No kitchen at this location')).toBeInTheDocument();
    unmount();

    api.listKitchens.mockRejectedValue(new Error('Kitchens are down'));
    renderScreen(<KitchenTabletPageClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kitchens are down');
  });
});
