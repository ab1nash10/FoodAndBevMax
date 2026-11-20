import {
  ApiClientError,
  type PosCounter,
  type PosDaySummary,
  type PosShift,
} from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { DayShiftsPanel } from './day-shifts-panel';
import { ShiftChip, ShiftStartPanel } from './shift-controls';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  closePosDay: vi.fn<Client['closePosDay']>(),
  endPosShift: vi.fn<Client['endPosShift']>(),
  openPosShift: vi.fn<Client['openPosShift']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const shift = (patch: Partial<PosShift> = {}): PosShift => ({
  closedAt: null,
  closedByName: null,
  counterId: 'counter-1',
  countedCash: null,
  expectedCash: null,
  handoverStock: null,
  id: 'shift-1',
  name: null,
  note: null,
  openedAt: '2026-11-19T03:30:00.000Z',
  openedBy: 'user-1',
  openedByName: 'Asha',
  openingCash: 500,
  status: 'OPEN',
  summary: null,
  takenOverFromId: null,
  ...patch,
});

const counter = (state: Partial<PosCounter['shift']> = {}) =>
  ({
    id: 'counter-1',
    restaurantId: 'rest-1',
    shift: { dayClosed: false, elsewhere: null, handover: null, open: null, ...state },
  }) as PosCounter;

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['POS_SHIFT_MANAGE']);
});

describe('opening a shift', () => {
  it('opens with the cash counted in the till', async () => {
    api.openPosShift.mockImplementation(() => reply(shift()));
    const { user } = renderScreen(<ShiftStartPanel counter={counter()} />);

    const open = screen.getByRole('button', { name: 'Open shift' });
    expect(open).toBeDisabled();
    await user.type(screen.getByLabelText('Cash in the till'), '12.505');
    expect(screen.getByText('Enter an amount, e.g. 500 or 250.50.')).toBeInTheDocument();
    expect(open).toBeDisabled();

    await user.clear(screen.getByLabelText('Cash in the till'));
    await user.type(screen.getByLabelText('Cash in the till'), '250.50');
    await user.click(open);

    expect(api.openPosShift).toHaveBeenCalledWith('counter-1', 250.5);
    expect(await screen.findByText('Shift opened. You can bill now.')).toBeInTheDocument();
  });

  it('shows why a shift was not opened', async () => {
    api.openPosShift.mockRejectedValue(new ApiClientError(409, 'A shift is already open here.'));
    const { user } = renderScreen(<ShiftStartPanel counter={counter()} />);

    await user.type(screen.getByLabelText('Cash in the till'), '0');
    await user.click(screen.getByRole('button', { name: 'Open shift' }));

    expect(await screen.findByText('A shift is already open here.')).toBeInTheDocument();
  });

  it('takes over a handover with the cash and stock passed on', async () => {
    const { user } = renderScreen(
      <ShiftStartPanel
        counter={counter({
          handover: shift({
            closedAt: '2026-11-19T09:30:00.000Z',
            countedCash: 1500,
            handoverStock: [{ itemId: 'i1', itemName: 'Samosa', quantity: 12 }],
            note: 'Two notes of 500',
            status: 'HANDED_OVER',
          }),
        })}
      />,
    );

    expect(screen.getByText(/Handed over by Asha at/)).toBeInTheDocument();
    expect(screen.getByText('Cash handed over').nextElementSibling).toHaveTextContent('₹1,500.00');
    expect(screen.getByText('Stock passed on').nextElementSibling).toHaveTextContent('1 item');
    expect(screen.getByText('“Two notes of 500”')).toBeInTheDocument();
    // The counted cash is the new shift's opening cash, to change only if it differs.
    expect(screen.getByLabelText('Cash in the till')).toHaveValue('1500');
    await user.click(screen.getByText('See the stock'));
    expect(screen.getByText('Samosa').nextElementSibling).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: 'Take over and open shift' })).toBeEnabled();
  });

  it('will not open while the cashier has a shift open at another counter', () => {
    renderScreen(
      <ShiftStartPanel
        counter={counter({
          elsewhere: {
            counterName: 'Counter 2',
            hasTill: false,
            openedAt: '2026-11-18T03:30:00.000Z',
            restaurantName: 'Juice Bar',
          },
        })}
      />,
    );

    const card = screen.getByRole('status');
    expect(card).toHaveTextContent('You still have a shift open at another counter.');
    expect(card).toHaveTextContent('Counter 2');
    expect(card).toHaveTextContent('Juice Bar');
    expect(card).toHaveTextContent('That counter has no till, so it can’t be ended there.');
    expect(screen.getByRole('button', { name: 'Open shift' })).toBeDisabled();
  });

  it('says the day is closed, so bills go on tomorrow', () => {
    renderScreen(<ShiftStartPanel counter={counter({ dayClosed: true })} />);

    expect(
      screen.getByText('Today is closed at this counter, so bills from this shift go on tomorrow.'),
    ).toBeInTheDocument();
  });

  it('leaves opening to a cashier for someone without the right', () => {
    signedIn([]);
    renderScreen(<ShiftStartPanel counter={counter()} />);

    expect(screen.getByText('Ask a cashier to open a shift at this counter.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cash in the till')).not.toBeInTheDocument();
  });
});

describe('ending a shift', () => {
  it('lets the cashier who opened it end it, and shows the cash check', async () => {
    api.endPosShift.mockImplementation(() =>
      reply(
        shift({
          countedCash: 1480,
          expectedCash: 1500,
          status: 'CLOSED',
          summary: {
            bills: 12,
            byPaymentMode: [],
            cancelled: { amount: 0, count: 0 },
            complimentary: { amount: 0, count: 0 },
            sales: 3200,
          },
        }),
      ),
    );
    const { user } = renderScreen(<ShiftChip counter={counter({ open: shift() })} />);

    await user.click(screen.getByRole('button', { name: /Asha · since .*End shift/ }));
    const dialog = screen.getByRole('dialog', { name: 'End shift' });
    expect(within(dialog).getByRole('button', { name: /Close sales/ })).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Cash counted in the till/), '1480');
    await user.type(within(dialog).getByLabelText(/Note/), ' ₹20 short ');
    await user.click(within(dialog).getByRole('button', { name: /Close sales/ }));

    expect(api.endPosShift).toHaveBeenCalledWith('shift-1', {
      countedCash: 1480,
      handover: false,
      note: '₹20 short',
    });
    const done = await screen.findByRole('dialog', { name: 'Shift closed' });
    expect(within(done).getByText('Difference').nextElementSibling).toHaveTextContent('−₹20.00');
    expect(done).toHaveTextContent('12 bills · ₹3,200.00 in sales this shift.');
  });

  it('hands the shift over to the next cashier', async () => {
    api.endPosShift.mockImplementation(() =>
      reply(shift({ countedCash: 1500, expectedCash: 1500, status: 'HANDED_OVER' })),
    );
    const { user } = renderScreen(<ShiftChip counter={counter({ open: shift() })} />);

    await user.click(screen.getByRole('button', { name: /End shift/ }));
    await user.type(screen.getByLabelText(/Cash counted in the till/), '1500');
    await user.click(screen.getByRole('button', { name: /Hand over to next person/ }));

    expect(api.endPosShift).toHaveBeenCalledWith('shift-1', {
      countedCash: 1500,
      handover: true,
      note: undefined,
    });
    const done = await screen.findByRole('dialog', { name: 'Shift handed over' });
    expect(within(done).getByText('Difference').nextElementSibling).toHaveTextContent('None');
  });

  it('offers to return the restaurant’s stock to the store once the shift is closed', async () => {
    signedIn(['POS_SHIFT_MANAGE', 'RESTAURANT_TRANSFER_SEND']);
    api.endPosShift.mockImplementation(() =>
      reply(shift({ countedCash: 500, expectedCash: 500, status: 'CLOSED' })),
    );
    const { user } = renderScreen(<ShiftChip counter={counter({ open: shift() })} />);

    await user.click(screen.getByRole('button', { name: /End shift/ }));
    expect(screen.queryByRole('link', { name: 'Return stock to store' })).toBeNull();
    await user.type(screen.getByLabelText(/Cash counted in the till/), '500');
    await user.click(screen.getByRole('button', { name: /Close sales/ }));

    const done = await screen.findByRole('dialog', { name: 'Shift closed' });
    expect(within(done).getByRole('link', { name: 'Return stock to store' })).toHaveAttribute(
      'href',
      '/inventory/returns/new?restaurant=rest-1',
    );
  });

  it('does not offer the return to a cashier who may not send stock', async () => {
    api.endPosShift.mockImplementation(() => reply(shift({ status: 'CLOSED' })));
    const { user } = renderScreen(<ShiftChip counter={counter({ open: shift() })} />);

    await user.click(screen.getByRole('button', { name: /End shift/ }));
    await user.type(screen.getByLabelText(/Cash counted in the till/), '500');
    await user.click(screen.getByRole('button', { name: /Close sales/ }));

    await screen.findByRole('dialog', { name: 'Shift closed' });
    expect(screen.queryByRole('link', { name: 'Return stock to store' })).toBeNull();
  });

  it('does not let another cashier end someone else’s shift', () => {
    const { container } = renderScreen(
      <ShiftChip counter={counter({ open: shift({ openedBy: 'someone-else' }) })} />,
    );

    expect(within(container).getByRole('button')).toBeDisabled();
    expect(screen.queryByText('End shift')).not.toBeInTheDocument();
  });

  it('lets a day-close admin end anyone’s shift', () => {
    signedIn(['POS_DAY_CLOSE']);
    renderScreen(<ShiftChip counter={counter({ open: shift({ openedBy: 'someone-else' }) })} />);

    expect(screen.getByRole('button', { name: /End shift/ })).toBeEnabled();
  });
});

describe("the day's shifts", () => {
  const summary = (patch: Partial<PosDaySummary> = {}) =>
    ({ dayClose: null, shifts: [], ...patch }) as unknown as PosDaySummary;

  it('lists each shift with its cash check', () => {
    renderScreen(
      <DayShiftsPanel
        counterId="counter-1"
        date="2026-11-19"
        summary={summary({
          shifts: [
            shift({
              closedAt: '2026-11-19T09:30:00.000Z',
              countedCash: 1520,
              expectedCash: 1500,
              name: 'Morning',
              status: 'CLOSED',
            }),
          ],
        })}
      />,
    );

    const [, row] = screen.getAllByRole('row');
    expect(row).toHaveTextContent('AshaMorning');
    expect(row).toHaveTextContent('₹500.00₹1,500.00₹1,520.00+₹20.00Closed');
  });

  it('offers the restaurant’s return to the store at day end', () => {
    signedIn(['POS_DAY_CLOSE', 'RESTAURANT_TRANSFER_SEND']);
    renderScreen(
      <DayShiftsPanel
        counterId="counter-1"
        date="2026-11-19"
        summary={summary({ counter: { restaurantId: 'rest-1' } as PosDaySummary['counter'] })}
      />,
    );

    expect(screen.getByRole('link', { name: 'Return stock to store' })).toHaveAttribute(
      'href',
      '/inventory/returns/new?restaurant=rest-1',
    );
  });

  it('says when no shift was opened that day', () => {
    renderScreen(<DayShiftsPanel counterId="counter-1" date="2026-11-19" summary={summary()} />);

    expect(
      screen.getByText('No shift was opened at this counter on this day.'),
    ).toBeInTheDocument();
  });

  it('closes the day only once no shift is open, after a check', async () => {
    signedIn(['POS_DAY_CLOSE']);
    api.closePosDay.mockImplementation(() =>
      reply({
        businessDate: '2026-11-19',
        closedAt: '2026-11-19T16:30:00.000Z',
        closedByName: 'Ravi',
      }),
    );
    const { rerender, user } = renderScreen(
      <DayShiftsPanel
        counterId="counter-1"
        date="2026-11-19"
        summary={summary({ shifts: [shift()] })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
    expect(screen.getByText(/Asha’s shift is still open/)).toBeInTheDocument();

    rerender(
      <DayShiftsPanel
        counterId="counter-1"
        date="2026-11-19"
        summary={summary({ shifts: [shift({ status: 'CLOSED' })] })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Close day' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Close the day at this counter?' })).getByRole(
        'button',
        { name: 'Close day' },
      ),
    );

    expect(api.closePosDay).toHaveBeenCalledWith('counter-1', '2026-11-19');
    expect(
      await screen.findByText('Day closed. New bills go on the next day.'),
    ).toBeInTheDocument();
  });

  it('shows who closed the day, and offers no close to others', () => {
    renderScreen(
      <DayShiftsPanel
        counterId="counter-1"
        date="2026-11-19"
        summary={summary({
          dayClose: { closedAt: '2026-11-19T16:30:00.000Z', closedByName: 'Ravi' },
        })}
      />,
    );

    expect(screen.getByText(/Day closed by Ravi at/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close day' })).not.toBeInTheDocument();
  });
});
