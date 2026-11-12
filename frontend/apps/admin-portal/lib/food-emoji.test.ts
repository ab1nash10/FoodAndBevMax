import { describe, expect, it } from 'vitest';
import { categoryTone, categoryTones, foodEmoji, kioskTones } from './food-emoji';

describe('food pictures for the kiosk', () => {
  it('picks a food emoji from the dish name first, then its category, else a plate', () => {
    expect(foodEmoji('Chicken Biryani')).toBe('🍗');
    expect(foodEmoji('Veg Thali')).toBe('🍛');
    expect(foodEmoji('Masala Dosa')).toBe('🥞');
    expect(foodEmoji('Veg Sandwich')).toBe('🥪');
    expect(foodEmoji('Cold Coffee')).toBe('🧋');
    expect(foodEmoji('Coffee')).toBe('☕');
    expect(foodEmoji('Masala Chai')).toBe('🍵');
    expect(foodEmoji('Aloo Patty')).toBe('🍔');
    expect(foodEmoji('Gulab Jamun')).toBe('🍮');
    expect(foodEmoji('Chef special', 'Beverages')).toBe('🥤');
    expect(foodEmoji('Chef special')).toBe('🍽️');
  });

  it('gives each category one bold colour, the same every time', () => {
    const tone = categoryTone('cat-meals');
    expect(kioskTones).toContain(tone);
    expect(categoryTone('cat-meals')).toBe(tone);
    expect(categoryTone(undefined)).toBe(kioskTones[0]);
  });

  it('gives categories colours in menu order, so neighbours never share one', () => {
    const tones = categoryTones([
      'meals',
      'south',
      'bites',
      'drinks',
      'sweets',
      'snacks',
      'salads',
    ]);
    expect([...tones.values()].slice(0, 6)).toEqual([...kioskTones]);
    expect(tones.get('salads')).toBe(kioskTones[0]);
  });
});
