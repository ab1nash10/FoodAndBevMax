import type { Counter, PosShift } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { EndStuckShiftDialog } from './end-stuck-shift-dialog';

type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  endPosShiftWithoutTill: vi.fn<Client['endPosShiftWithoutTill']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const counter = {
  counterName: 'Billing 1',
  id: 'c1',
  openShift: { id: 's1', openedAt: '2026-11-19T04:00:00Z', openedByName: 'Asha Verma' },
  restaurant: { restaurantName: 'Cafe Max' },
} as Counter;

beforeEach(() => vi.clearAllMocks());

describe('ending a shift no till can reach', () => {
  it('needs a reason, and a cash count only in rupees and paise', async () => {
    const { user } = renderScreen(<EndStuckShiftDialog counter={counter} onClose={vi.fn()} />);

    const end = screen.getByRole('button', { name: 'End shift' });
    expect(end).toBeDisabled();
    await user.type(screen.getByLabelText(/Why it’s ended here/), 'Till removed');
    expect(end).toBeEnabled();

    await user.type(screen.getByLabelText(/Cash counted/), '12.345');
    expect(screen.getByText('Enter an amount, e.g. 500 or 250.50.')).toBeInTheDocument();
    expect(end).toBeDisabled();
  });

  it("ends the shift with the count and reason, then shows the shift's takings", async () => {
    api.endPosShiftWithoutTill.mockImplementation(() =>
      reply({ expectedCash: 750, summary: { bills: 4, sales: 1200 } } as PosShift),
    );
    const onClose = vi.fn();
    const { user } = renderScreen(<EndStuckShiftDialog counter={counter} onClose={onClose} />);

    await user.type(screen.getByLabelText(/Cash counted/), '250.50');
    await user.type(screen.getByLabelText(/Why it’s ended here/), '  Till removed  ');
    await user.click(screen.getByRole('button', { name: 'End shift' }));

    await waitFor(() =>
      expect(api.endPosShiftWithoutTill).toHaveBeenCalledWith('s1', {
        countedCash: 250.5,
        reason: 'Till removed',
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Shift ended' })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/1,200/)).toBeInTheDocument();
    expect(screen.getByText(/750/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('sends no count when nobody counted the cash', async () => {
    api.endPosShiftWithoutTill.mockImplementation(() =>
      reply({ expectedCash: 0, summary: { bills: 0, sales: 0 } } as PosShift),
    );
    const { user } = renderScreen(<EndStuckShiftDialog counter={counter} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Why it’s ended here/), 'Till removed');
    await user.click(screen.getByRole('button', { name: 'End shift' }));

    await waitFor(() =>
      expect(api.endPosShiftWithoutTill).toHaveBeenCalledWith('s1', {
        countedCash: undefined,
        reason: 'Till removed',
      }),
    );
  });

  it('shows why the shift was not ended', async () => {
    api.endPosShiftWithoutTill.mockRejectedValue(new Error('Shift is already closed'));
    const { user } = renderScreen(<EndStuckShiftDialog counter={counter} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Why it’s ended here/), 'Till removed');
    await user.click(screen.getByRole('button', { name: 'End shift' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Shift is already closed');
  });

  it('stays closed without a counter with an open shift', () => {
    renderScreen(<EndStuckShiftDialog counter={null} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
