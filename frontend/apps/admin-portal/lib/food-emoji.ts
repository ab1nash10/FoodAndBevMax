/**
 * Full-colour food pictures for the kiosk, from the dish's name (then its category): the
 * screen's own food emoji, crisp at any size, until items have photos. First match wins, so
 * the specific comes before the general ("cold coffee" before "coffee").
 */
const foodEmojis: Array<[RegExp, string]> = [
  [/cold coffee|frapp|bubble|boba/i, '🧋'],
  [/chicken|mutton|kebab|tikka|tandoori/i, '🍗'],
  [/fish|prawn/i, '🐟'],
  [/egg|omelette|anda/i, '🍳'],
  [/thali|curry|paneer|dal|rajma|chole|sabzi|masala(?! (chai|tea|dosa))/i, '🍛'],
  [/biryani|pulao|rice|khichdi|fried rice/i, '🍚'],
  [/dosa|uttapam|chilla|pancake/i, '🥞'],
  [/idli|vada|dhokla|upma|poha/i, '🍘'],
  [/paratha|roti|naan|kulcha|chapati|bhatura|puri/i, '🫓'],
  [/sandwich|toast/i, '🥪'],
  [/burger|patty|vada pav|pav/i, '🍔'],
  [/pizza/i, '🍕'],
  [/roll|wrap|frankie|shawarma/i, '🌯'],
  [/samosa|kachori|momo|dumpling|pakora|bhaji/i, '🥟'],
  [/noodle|chowmein|maggi|ramen/i, '🍜'],
  [/pasta|macaroni|spaghetti/i, '🍝'],
  [/fries|chips/i, '🍟'],
  [/soup|stew/i, '🍲'],
  [/salad|sprout/i, '🥗'],
  [/fruit|watermelon|papaya/i, '🍉'],
  [/ice ?cream|kulfi|sundae/i, '🍨'],
  [/cake|pastry|muffin|brownie/i, '🍰'],
  [/cookie|biscuit/i, '🍪'],
  [/jamun|rasgulla|halwa|kheer|ladoo|barfi|dessert|sweet|payasam/i, '🍮'],
  [/chai|tea/i, '🍵'],
  [/coffee|espresso|cappuccino|latte/i, '☕'],
  [/juice|nimbu|lemonade/i, '🧃'],
  [/lassi|shake|smoothie|beverage|drink|cooler|soda|cola/i, '🥤'],
  [/milk|buttermilk|chaas/i, '🥛'],
  [/water/i, '💧'],
  [/snack|bites|namkeen/i, '🥟'],
  [/meal|main|lunch|dinner|north|south/i, '🍛'],
  [/breakfast/i, '🍳'],
];

export function foodEmoji(...names: Array<string | undefined>): string {
  for (const name of names) {
    const found = name ? foodEmojis.find(([pattern]) => pattern.test(name)) : undefined;
    if (found) return found[1];
  }
  return '🍽️';
}

/** The kiosk's bold category colours: saffron, chilli, leaf, indigo, teal, berry. */
export const kioskTones = [
  'from-[#ffb547] to-[#f07d1a]',
  'from-[#ff7a6b] to-[#d6372b]',
  'from-[#43c27a] to-[#1d8a4b]',
  'from-[#6f8cff] to-[#3a4fd1]',
  'from-[#3cc9c4] to-[#0f8a95]',
  'from-[#f37bb6] to-[#c23b84]',
] as const;

/** A category keeps one colour everywhere, picked by its id. */
export function categoryTone(id: string | undefined): (typeof kioskTones)[number] {
  if (!id) return kioskTones[0];
  return kioskTones[
    [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % kioskTones.length
  ]!;
}

/** The menu's categories in its order, each the next colour: neighbours never share one. */
export function categoryTones(ids: readonly string[]): Map<string, (typeof kioskTones)[number]> {
  return new Map(ids.map((id, index) => [id, kioskTones[index % kioskTones.length]!]));
}
