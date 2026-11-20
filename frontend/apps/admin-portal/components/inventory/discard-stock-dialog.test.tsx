import { screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationApi } from '@/lib/api';
import { mockedApi } from '@/components/inventory/test-support';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import {
  DiscardBatchButton,
  type DiscardableBatch,
  DiscardStockDialog,
} from './discard-stock-dialog';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  organizationApi: { discardStock: vi.fn() },
}));

const discardStock = mockedApi(organizationApi).discardStock;

const batch: DiscardableBatch = {
  availableQty: 12,
  batchNumber: 'B-7',
  expiryDate: '2099-01-31',
  itemName: 'Paneer',
  locationName: 'Main Store',
  stockBalanceId: 'sb-1',
};

// The button and the dialog together, as a stock screen wires them.
function StockRow({ row = batch }: { row?: DiscardableBatch }) {
  const [discarding, setDiscarding] = useState<DiscardableBatch | null>(null);

  return (
    <>
      <DiscardBatchButton batch={row} onDiscard={setDiscarding} />
      <DiscardStockDialog batch={discarding} onClose={() => setDiscarding(null)} />
    </>
  );
}

beforeEach(() => {
  discardStock.mockReset();
  signedIn(['STOCK_DISCARD']);
});

describe('discarding stock from a batch', () => {
  it('shows the Discard button only to someone who may discard stock', () => {
    signedIn(['STOCK_VIEW']);
    renderScreen(<StockRow />);

    expect(screen.queryByRole('button', { name: /discard from paneer/i })).toBeNull();
  });

  it('offers no Discard on a batch that holds nothing', () => {
    renderScreen(<StockRow row={{ ...batch, availableQty: 0 }} />);

    expect(screen.queryByRole('button', { name: /discard from paneer/i })).toBeNull();
  });

  it('opens with the whole batch, as damaged when it has not expired', async () => {
    const { user } = renderScreen(<StockRow />);

    await user.click(screen.getByRole('button', { name: 'Discard from Paneer batch B-7' }));

    expect(screen.getByText(/Paneer · Main Store · Batch B-7 · Expires/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity \(of 12 in this batch\)/)).toHaveValue(12);
    expect(screen.getByRole('button', { name: 'Damaged' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('picks Expired for a batch whose expiry date has passed', async () => {
    const { user } = renderScreen(<StockRow row={{ ...batch, expiryDate: '2020-01-01' }} />);

    await user.click(screen.getByRole('button', { name: /discard from paneer/i }));

    expect(screen.getByRole('button', { name: 'Expired' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('will not discard more than the batch holds, nothing, or "Other" without a note', async () => {
    const { user } = renderScreen(<StockRow />);
    await user.click(screen.getByRole('button', { name: /discard from paneer/i }));
    const quantity = screen.getByLabelText(/Quantity/);

    await user.clear(quantity);
    await user.type(quantity, '20');
    await user.click(screen.getByRole('button', { name: 'Discard 20' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only 12 left in this batch.');

    await user.clear(quantity);
    await user.click(screen.getByRole('button', { name: 'Other' }));
    await user.click(screen.getByRole('button', { name: /^Discard\s*$/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a quantity above zero.');
    expect(screen.getByRole('alert')).toHaveTextContent('Say what happened to the stock.');

    expect(discardStock).not.toHaveBeenCalled();
  });

  it('sends the quantity, reason and note, then says how much is left', async () => {
    discardStock.mockReturnValue(reply({ availableQty: 9 }) as never);
    const { user } = renderScreen(<StockRow />);
    await user.click(screen.getByRole('button', { name: /discard from paneer/i }));
    const quantity = screen.getByLabelText(/Quantity/);

    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.click(screen.getByRole('button', { name: 'Spoilt' }));
    await user.type(screen.getByLabelText(/Note/), '  left out overnight ');
    await user.click(screen.getByRole('button', { name: 'Discard 3' }));

    expect(discardStock).toHaveBeenCalledWith({
      note: 'left out overnight',
      quantity: 3,
      reason: 'SPOILT',
      stockBalanceId: 'sb-1',
    });
    expect(await screen.findByText('Paneer, batch B-7: 9 left.')).toBeInTheDocument();
    // The dialog closes once the stock is gone.
    expect(screen.queryByLabelText(/Quantity/)).toBeNull();
  });

  it('keeps the dialog open and shows the reason when the discard fails', async () => {
    discardStock.mockRejectedValue(new Error('Stock changed since you opened this batch.'));
    const { user } = renderScreen(<StockRow />);
    await user.click(screen.getByRole('button', { name: /discard from paneer/i }));

    await user.click(screen.getByRole('button', { name: 'Discard 12' }));

    expect(
      await screen.findByText('Stock changed since you opened this batch.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Stock was not discarded')).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity/)).toBeInTheDocument();
  });
});
