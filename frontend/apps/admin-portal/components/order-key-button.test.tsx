import { ApiClientError } from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '@/test/harness';
import { OrderKeyButton } from './order-key-button';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const issue = vi.fn<() => Promise<string>>();

beforeEach(() => {
  vi.clearAllMocks();
  issue.mockResolvedValue('ok_live_123');
});

describe('issuing an order key', () => {
  it('warns that the old key stops working, then shows the new one once', async () => {
    const { user } = renderScreen(
      <OrderKeyButton
        issue={issue}
        label="Order key"
        name="Cafe Max"
        usage="kiosks send their orders with it"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Order key for Cafe Max' }));
    const ask = screen.getByRole('dialog', { name: 'Issue a new order key for Cafe Max?' });
    expect(ask).toHaveTextContent('any earlier key stops working');
    await user.click(within(ask).getByRole('button', { name: 'Issue new key' }));

    const shown = within(await screen.findByRole('dialog', { name: 'Order key for Cafe Max' }));
    expect(shown.getByText('ok_live_123')).toBeInTheDocument();
    expect(shown.getByText(/^Kiosks send their orders with it\./)).toBeInTheDocument();
    await user.click(shown.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('ok_live_123')).not.toBeInTheDocument();
  });

  it('issues nothing when cancelled', async () => {
    const { user } = renderScreen(
      <OrderKeyButton issue={issue} name="POS 1" usage="the till sends orders with it" />,
    );

    // In a table row: the icon action.
    await user.click(screen.getByRole('button', { name: 'Order key for POS 1' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(issue).not.toHaveBeenCalled();
  });

  it('copies the key', async () => {
    const { user } = renderScreen(
      <OrderKeyButton issue={issue} name="POS 1" usage="the till sends orders with it" />,
    );
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    await user.click(screen.getByRole('button', { name: 'Order key for POS 1' }));
    await user.click(screen.getByRole('button', { name: 'Issue new key' }));
    await user.click(await screen.findByRole('button', { name: 'Copy key' }));

    expect(writeText).toHaveBeenCalledWith('ok_live_123');
    expect(await screen.findByText('Key copied')).toBeInTheDocument();
  });

  it('says why no key was issued', async () => {
    issue.mockRejectedValue(new ApiClientError(403, 'Not allowed to issue keys'));
    const { user } = renderScreen(
      <OrderKeyButton issue={issue} name="POS 1" usage="the till sends orders with it" />,
    );

    await user.click(screen.getByRole('button', { name: 'Order key for POS 1' }));
    await user.click(screen.getByRole('button', { name: 'Issue new key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Key not issued');
    expect(screen.getByRole('alert')).toHaveTextContent('Not allowed to issue keys');
  });
});
