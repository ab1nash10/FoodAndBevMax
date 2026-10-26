'use client';

import { cn } from '@aahar/ui';
import {
  Cake,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  IceCreamCone,
  Milk,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

// Menu items have no photos yet, so each dish is drawn as a pastel tile with the food it names.
// ponytail: keyword guess on the name; replace with the item's photo once items carry one.
const foodIcons: Array<[RegExp, LucideIcon]> = [
  [/coffee|tea|chai|espresso|latte|cappuccino/i, Coffee],
  [/lassi|milk|shake|smoothie/i, Milk],
  [/juice|soda|cola|coke|sprite|drink|water|energy|lime|beverage/i, CupSoda],
  [/pizza/i, Pizza],
  // Before the bread and meat words: Egg Roll is egg, Paneer Tikka is not meat ("veggie" is not egg).
  [/\begg|omelette|\banda\b/i, Egg],
  [/paneer|soya|mushroom/i, CookingPot],
  [/sandwich|burger|roll|wrap|toast|kathi/i, Sandwich],
  [/soup|shorba/i, Soup],
  [/salad|sprout|fruit/i, Salad],
  [/ice ?cream|kulfi|sundae/i, IceCreamCone],
  [/cake|pastry|sweet|dessert|rasmalai|gulab|halwa|kheer|mithai/i, Cake],
  [/chicken|mutton|tikka|kebab|keema|non.?veg/i, Drumstick],
  [/fish|prawn/i, Fish],
  [/croissant|bread|bun|paratha|breakfast/i, Croissant],
  [/samosa|kachodi|kachori|pakora|snack|chips|biscuit|cookie|namkeen/i, Cookie],
  [/thali|rice|biryani|pulao|dal|curry|paneer|masala|dosa|idli|meal|main|south|north/i, CookingPot],
];

export function foodIcon(...names: Array<string | undefined>): LucideIcon {
  for (const name of names) {
    const found = name ? foodIcons.find(([pattern]) => pattern.test(name)) : undefined;
    if (found) return found[1];
  }
  return UtensilsCrossed;
}

// Each category keeps its pastel everywhere, picked by its id.
const tones = ['tile-blue', 'tile-violet', 'tile-green', 'tile-amber', 'tile-rose'];

export function toneOf(id: string | undefined): string {
  if (!id) return tones[0]!;
  return tones[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length]!;
}

/** A dish's picture stand-in: its category's pastel with a large drawing of the food. */
export function FoodArt({
  category,
  categoryId,
  className,
  name,
}: Readonly<{ category?: string; categoryId?: string; className?: string; name: string }>) {
  const Icon = foodIcon(name, category);

  return (
    <span
      aria-hidden="true"
      className={cn(toneOf(categoryId), 'grid place-items-center overflow-hidden', className)}
    >
      <Icon className="h-[42%] w-[42%] text-ds-text-2/75" strokeWidth={1.3} />
    </span>
  );
}
