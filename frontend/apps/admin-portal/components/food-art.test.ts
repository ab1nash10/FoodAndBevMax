import { strict as assert } from 'node:assert';
import {
  Coffee,
  CookingPot,
  CupSoda,
  Drumstick,
  Egg,
  Sandwich,
  UtensilsCrossed,
} from 'lucide-react';
import { test } from 'vitest';
import { foodIcon, toneOf } from './food-art';

test('a dish is drawn from its name, then its category, else a plate', () => {
  assert.equal(foodIcon('Masala Chai'), Coffee);
  assert.equal(foodIcon('Coke 300 ml'), CupSoda);
  assert.equal(foodIcon('Veg Thali'), CookingPot);
  // The name wins over the category; an unknown name falls back to the category.
  assert.equal(foodIcon('Club Sandwich', 'Beverages'), Sandwich);
  assert.equal(foodIcon('House Special', 'Beverages'), CupSoda);
  assert.equal(foodIcon('House Special', undefined), UtensilsCrossed);
  // Paneer is not meat, an egg roll is egg, and a veggie burger is not egg.
  assert.equal(foodIcon('Paneer Tikka'), CookingPot);
  assert.equal(foodIcon('Chicken Tikka'), Drumstick);
  assert.equal(foodIcon('Egg Roll'), Egg);
  assert.equal(foodIcon('Veggie Burger'), Sandwich);
});

test('a category keeps the same pastel everywhere, picked from its id', () => {
  assert.equal(toneOf('cat-1'), toneOf('cat-1'));
  assert.equal(toneOf(undefined), 'tile-blue');
  assert.equal(toneOf(''), 'tile-blue');
  const seen = new Set(['a', 'b', 'c', 'd', 'e'].map(toneOf));
  assert.equal(seen.size, 5);
});
