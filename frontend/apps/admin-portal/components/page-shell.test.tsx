import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { at } from '@/test/next-navigation';
import { FoodArt, foodIcon, toneOf } from './food-art';
import { PageIcon } from './page-icon';
import { PageShell } from './page-shell';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

describe('a placeholder page', () => {
  it('shows its title and an empty list, its action not yet usable', () => {
    render(<PageShell actionLabel="New store" eyebrow="Setup" title="Stores" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Stores' })).toBeInTheDocument();
    expect(screen.getByText('No records')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'New store' }))
      expect(button).toBeDisabled();
  });
});

describe('the page icon', () => {
  it('draws the open page’s icon, and nothing off the menu', () => {
    at('/masters/items');
    const { container, rerender } = render(<PageIcon />);
    expect(container.querySelector('svg')).not.toBeNull();

    at('/nowhere');
    rerender(<PageIcon />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('food art', () => {
  it('draws the food a dish names, then its category’s, else a plate', () => {
    expect(foodIcon('Masala Chai')).not.toBe(foodIcon('Chicken Biryani'));
    // An egg roll is egg, not bread.
    expect(foodIcon('Egg Roll')).toBe(foodIcon('Egg Omelette'));
    expect(foodIcon('House Special', 'Soups')).toBe(foodIcon('Tomato Soup'));
    expect(foodIcon('House Special')).toBe(foodIcon(undefined));
  });

  it('keeps a category’s colour wherever it shows', () => {
    expect(toneOf('c-snacks')).toBe(toneOf('c-snacks'));
    expect(toneOf(undefined)).toBe('tile-blue');

    const { container } = render(<FoodArt categoryId="c-snacks" name="Samosa" />);
    expect(container.firstElementChild).toHaveClass(toneOf('c-snacks'));
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
