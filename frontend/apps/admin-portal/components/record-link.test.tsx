import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { IfCanOpen, RecordLink } from './record-link';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));

describe('a record link', () => {
  it('links to a page the user may open', () => {
    signedIn(['ITEM_VIEW']);
    render(<RecordLink href="/masters/items?id=i-1">Veg Thali</RecordLink>);

    expect(screen.getByRole('link', { name: 'Veg Thali' })).toHaveAttribute(
      'href',
      '/masters/items?id=i-1',
    );
  });

  it('is plain text where the user may not go, or there is nowhere to go', () => {
    signedIn([]);
    const { rerender } = render(<RecordLink href="/masters/items?id=i-1">Veg Thali</RecordLink>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Veg Thali')).toBeInTheDocument();

    signedIn(['ITEM_VIEW']);
    rerender(<RecordLink href={null}>Veg Thali</RecordLink>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('a button for another page', () => {
  it('shows only for someone who may open that page', () => {
    signedIn(['ITEM_CREATE']);
    const { rerender } = render(
      <IfCanOpen href="/masters/items/new">
        <button type="button">New item</button>
      </IfCanOpen>,
    );
    expect(screen.getByRole('button', { name: 'New item' })).toBeInTheDocument();

    signedIn(['ITEM_VIEW']);
    rerender(
      <IfCanOpen href="/masters/items/new">
        <button type="button">New item</button>
      </IfCanOpen>,
    );
    expect(screen.queryByRole('button', { name: 'New item' })).not.toBeInTheDocument();
  });
});
