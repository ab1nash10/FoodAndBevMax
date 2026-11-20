import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './toast-provider';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

type Show = ReturnType<typeof useToast>['showToast'];

// Hands the test the provider's showToast, as a screen's useToast() would get it.
function setup() {
  let show: Show = () => '';
  function Grab() {
    show = useToast().showToast;
    return null;
  }
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  );

  return { show: (toast: Parameters<Show>[0]) => act(() => void show(toast)), user };
}

describe('toasts', () => {
  it('shows a saved message with its description in the notifications area', () => {
    const { show } = setup();

    show({ description: 'TRF0043 is on its way.', title: 'Transfer sent', variant: 'success' });

    const notifications = screen.getByRole('region', { name: 'Notifications' });
    const toast = within(notifications).getByRole('status');
    expect(toast).toHaveTextContent('Transfer sent');
    expect(toast).toHaveTextContent('TRF0043 is on its way.');
  });

  it('announces an error as an alert, so a screen reader reads it at once', () => {
    const { show } = setup();

    show({ title: 'Could not save', variant: 'error' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('goes when dismissed', async () => {
    const { show, user } = setup();
    show({ title: 'Saved', variant: 'success' });

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    await vi.waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument());
  });

  it('goes by itself when its time runs out', async () => {
    const { show } = setup();
    show({ title: 'Saved', variant: 'success' });

    // The countdown bar's animation ending is what closes it. jsdom has no AnimationEvent, so
    // React listens for the WebKit-prefixed name there.
    const bar = screen.getByRole('status').querySelector('.toast-countdown')!;
    fireEvent(bar, new Event('webkitAnimationEnd', { bubbles: true }));

    await vi.waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument());
  });

  it('runs a button action such as Undo and closes', async () => {
    const { show, user } = setup();
    const undo = vi.fn();
    show({ action: { label: 'Undo', onClick: undo }, title: 'Item removed' });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(screen.queryByText('Item removed')).not.toBeInTheDocument());
  });

  it('links to the record a toast is about', () => {
    const { show } = setup();

    show({
      action: { href: '/inventory/transfers?id=t-43', label: 'View TRF0043' },
      title: 'Transfer created',
      variant: 'success',
    });

    expect(screen.getByRole('link', { name: 'View TRF0043' })).toHaveAttribute(
      'href',
      '/inventory/transfers?id=t-43',
    );
  });

  it('confirms a save on the row itself, without a toast, when the row is on screen', async () => {
    const { show } = setup();
    const row = document.createElement('div');
    row.dataset.recordId = 'item-7';
    // jsdom lays nothing out; a shown row has client rects.
    row.getClientRects = () => [{}] as unknown as DOMRectList;
    document.body.append(row);

    show({ recordId: 'item-7', title: 'Item saved', variant: 'success' });

    await vi.waitFor(() => expect(row).toHaveAttribute('data-flash'));
    expect(screen.queryByText('Item saved')).not.toBeInTheDocument();
    row.remove();
  });

  it('falls back to a toast when the saved record is not on screen', async () => {
    const { show } = setup();

    show({ recordId: 'not-here', title: 'Item saved', variant: 'success' });

    expect(await screen.findByText('Item saved', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('refuses to work without the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Lonely() {
      useToast();
      return null;
    }

    expect(() => render(<Lonely />)).toThrow('useToast must be used within ToastProvider');
  });
});
