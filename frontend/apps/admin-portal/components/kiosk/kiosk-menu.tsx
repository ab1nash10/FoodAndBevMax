'use client';

import type { KioskMenu, KioskMenuItem } from '@aahar/api-client';
import { cn } from '@aahar/ui';
import { ChevronRight, Delete, LayoutGrid, Plus, Search, ShoppingBag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FoodTypeMarker } from '@/components/design-system';
import { cartTotals, MAX_PER_ITEM, quantityOf, type KioskCartLine } from '@/lib/kiosk';
import {
  card,
  FoodArt,
  foodIcon,
  formatRupees,
  KioskHeader,
  primaryButton,
  Stepper,
  toneOf,
} from './kiosk-parts';

function ItemTile({
  item,
  onChange,
  quantity,
}: Readonly<{ item: KioskMenuItem; onChange: (quantity: number) => void; quantity: number }>) {
  return (
    <div
      className={cn(
        card,
        'flex flex-col overflow-hidden p-0 transition-shadow duration-150',
        quantity > 0 && 'ring-[3px] ring-ds-primary',
      )}
    >
      {/* The picture is the big target: a tap adds one. */}
      <button
        aria-label={`Add ${item.itemName}`}
        className="relative block active:opacity-90"
        disabled={quantity >= MAX_PER_ITEM}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <FoodArt
          category={item.category?.categoryName}
          categoryId={item.category?.id}
          className="aspect-[16/10] w-full"
          name={item.itemName}
        />
        {quantity > 0 ? (
          <span className="absolute right-3 top-3 grid h-11 min-w-11 place-items-center rounded-full bg-ds-primary px-3 text-[20px] font-bold text-white shadow-lg shadow-ds-primary/30 tabular-nums">
            {quantity}
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <span className="flex items-start gap-2">
          <span className="mt-[7px]">
            <FoodTypeMarker type={item.foodType} />
          </span>
          <span className="line-clamp-2 text-[22px] font-semibold leading-snug">
            {item.itemName}
          </span>
        </span>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <span className="text-[26px] font-bold tabular-nums">{formatRupees(item.price)}</span>
          {quantity > 0 ? (
            <Stepper
              label={item.itemName}
              max={MAX_PER_ITEM}
              onChange={onChange}
              quantity={quantity}
            />
          ) : (
            <button
              aria-label={`Add ${item.itemName}`}
              className="flex h-14 items-center gap-2 rounded-full bg-ds-primary px-6 text-[20px] font-bold text-white shadow-lg shadow-ds-primary/30 active:scale-95"
              onClick={() => onChange(1)}
              type="button"
            >
              <Plus aria-hidden="true" className="h-5 w-5" strokeWidth={3} />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The order so far, beside the menu on a wide screen. */
function OrderPanel({
  cart,
  onQuantity,
  onReview,
  total,
}: Readonly<{
  cart: readonly KioskCartLine[];
  onQuantity: (item: KioskMenuItem, quantity: number) => void;
  onReview: () => void;
  total: number;
}>) {
  return (
    <aside
      aria-label="Your order"
      className="hidden w-[400px] shrink-0 flex-col px-6 pb-6 pt-1 xl:flex 2xl:w-[440px]"
    >
      <div className={cn(card, 'flex min-h-0 flex-1 flex-col overflow-hidden bg-ds-surface')}>
        <h2 className="flex items-center gap-3 px-6 pb-3 pt-6 text-[26px] font-bold">
          <ShoppingBag aria-hidden="true" className="h-7 w-7 text-ds-primary" />
          Your order
        </h2>
        {cart.length === 0 ? (
          <p className="grid flex-1 place-items-center px-8 text-center text-[20px] text-ds-muted">
            Tap a dish to add it here.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-ds-divider overflow-y-auto overscroll-contain px-6">
            {cart.map(({ item, quantity }) => (
              <li className="flex flex-col gap-3 py-4" key={item.id}>
                <span className="flex items-start gap-2">
                  <span className="mt-[6px]">
                    <FoodTypeMarker type={item.foodType} />
                  </span>
                  <span className="min-w-0 text-[20px] font-semibold leading-snug">
                    {item.itemName}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <Stepper
                    label={item.itemName}
                    max={MAX_PER_ITEM}
                    onChange={(next) => onQuantity(item, next)}
                    quantity={quantity}
                  />
                  <span className="text-[20px] font-bold tabular-nums">
                    {formatRupees(item.price * quantity)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-4 border-t border-ds-divider p-6">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-[20px] font-medium text-ds-text-3">Total</span>
            <span className="text-[34px] font-bold tabular-nums">{formatRupees(total)}</span>
          </p>
          <button
            className={cn(primaryButton, 'w-full')}
            disabled={cart.length === 0}
            onClick={onReview}
            type="button"
          >
            Review order
            <ChevronRight aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** A menu this long gets a search box; a short one is quicker to scan by eye. */
const SEARCH_FROM = 13;

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * Letters for the search box, drawn on the screen itself: a kiosk may have no keyboard of its
 * own, and the system's touch keyboard often stays shut in a full-screen browser. Its keys never
 * take focus, so the search box keeps it and a tap anywhere else closes the keyboard.
 */
function OnScreenKeyboard({
  onBackspace,
  onDone,
  onKey,
}: Readonly<{ onBackspace: () => void; onDone: () => void; onKey: (key: string) => void }>) {
  const key =
    'flex h-[72px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-ds-surface text-[26px] font-semibold text-ds-text shadow-sm ring-1 ring-ds-border active:scale-95 active:bg-ds-subtle';

  return (
    <div
      aria-label="Keyboard"
      className="kiosk-keyboard fixed inset-x-0 bottom-0 z-40 border-t border-ds-border bg-ds-page/95 p-4 backdrop-blur-xl"
      onPointerDown={(event) => event.preventDefault()}
      role="group"
    >
      <div className="mx-auto flex max-w-[1100px] flex-col gap-3">
        {KEY_ROWS.map((row, index) => (
          <div
            className={cn('flex gap-2.5', index === 1 && 'px-[4.5%]', index === 2 && 'pl-[9%]')}
            key={row}
          >
            {[...row].map((letter) => (
              <button
                className={key}
                key={letter}
                onClick={() => onKey(letter.toLowerCase())}
                type="button"
              >
                {letter}
              </button>
            ))}
            {index === 2 ? (
              <button
                aria-label="Backspace"
                className={cn(key, 'flex-[1.8]')}
                onClick={onBackspace}
                type="button"
              >
                <Delete aria-hidden="true" className="h-8 w-8" strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        ))}
        <div className="flex gap-2.5">
          <button
            className={cn(key, 'flex-[5] text-[22px]')}
            onClick={() => onKey(' ')}
            type="button"
          >
            Space
          </button>
          <button
            className={cn(
              key,
              'flex-[1.8] bg-ds-primary text-[22px] text-white ring-0 active:bg-ds-primary',
            )}
            onClick={onDone}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** As many 16rem cards as fit: one on a phone, up to four on a wide screen. */
function ItemGrid({
  cart,
  items,
  onQuantity,
}: Readonly<{
  cart: readonly KioskCartLine[];
  items: readonly KioskMenuItem[];
  onQuantity: (item: KioskMenuItem, quantity: number) => void;
}>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4 sm:gap-5">
      {items.map((item) => (
        <ItemTile
          item={item}
          key={item.id}
          onChange={(quantity) => onQuantity(item, quantity)}
          quantity={quantityOf(cart, item.id)}
        />
      ))}
    </div>
  );
}

/**
 * The menu: categories (a rail on a wide screen, a row of chips on a narrow one), a search box
 * on a long menu, big dish cards (under a heading per category in Everything), and the order
 * (a panel on a wide screen, a bar along the bottom otherwise).
 */
export function KioskMenuScreen({
  cart,
  menu,
  onQuantity,
  onReview,
  onStartOver,
  staffDiscountPercent,
}: Readonly<{
  cart: readonly KioskCartLine[];
  menu: KioskMenu;
  onQuantity: (item: KioskMenuItem, quantity: number) => void;
  onReview: () => void;
  onStartOver: () => void;
  staffDiscountPercent: number;
}>) {
  const [categoryId, setCategoryId] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of menu.items) {
      if (item.category) seen.set(item.category.id, item.category.categoryName);
    }
    return [...seen];
  }, [menu.items]);
  // A search looks across the whole menu, whichever category is picked.
  const query = search.trim().toLowerCase();
  const shown = menu.items.filter(
    (item) =>
      (query
        ? `${item.itemName} ${item.category?.categoryName ?? ''}`.toLowerCase().includes(query)
        : !categoryId || item.category?.id === categoryId) &&
      (!vegOnly || item.foodType === 'VEG'),
  );
  // Everything, on a menu with categories: a heading over each category's dishes, in rail order,
  // with dishes that have no category last.
  const sections =
    !query && !categoryId && categories.length > 1
      ? [
          ...categories.map(([id, name]) => ({
            id,
            items: shown.filter((item) => item.category?.id === id),
            name,
          })),
          { id: 'more', items: shown.filter((item) => !item.category), name: 'More' },
        ].filter((section) => section.items.length > 0)
      : null;

  // A new category or search starts at the top of the list, not halfway down the last one.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [categoryId, query, vegOnly]);

  function pickCategory(id: string) {
    setCategoryId(id);
    setSearch('');
  }
  const hasVeg = menu.items.some((item) => item.foodType === 'VEG');
  const hasOther = menu.items.some((item) => item.foodType !== 'VEG');
  const totals = cartTotals(cart, staffDiscountPercent);
  const options: Array<{ id: string; name: string }> = [
    { id: '', name: 'Everything' },
    ...categories.map(([id, name]) => ({ id, name })),
  ];
  const chip = (active: boolean) =>
    cn(
      'flex h-[60px] shrink-0 items-center gap-2 rounded-full px-6 text-[20px] font-semibold transition-colors duration-150 active:scale-[0.97]',
      active
        ? 'bg-ds-primary text-white shadow-lg shadow-ds-primary/30'
        : cn(card, 'text-ds-text-2'),
    );
  // Veg only shows when the menu has both, so it never empties the screen.
  const vegToggle =
    hasVeg && hasOther ? (
      <button
        aria-pressed={vegOnly}
        className={cn(
          chip(false),
          vegOnly && 'bg-ds-status-ok-bg text-ds-status-ok-fg ring-2 ring-ds-food-veg',
        )}
        onClick={() => setVegOnly(!vegOnly)}
        type="button"
      >
        <FoodTypeMarker type="VEG" />
        Veg only
      </button>
    ) : null;

  return (
    <>
      <KioskHeader
        locationName={menu.locationName}
        onStartOver={onStartOver}
        restaurantName={menu.restaurantName}
      />
      <div className="flex min-h-0 flex-1">
        {categories.length > 1 ? (
          <nav
            aria-label="Categories"
            className="hidden w-[240px] shrink-0 flex-col gap-3 overflow-y-auto overscroll-contain pb-6 pl-10 pt-1 lg:flex"
          >
            {options.map(({ id, name }) => {
              const Icon = id ? foodIcon(name) : LayoutGrid;
              const active = !query && categoryId === id;

              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-[72px] items-center gap-3 rounded-[22px] p-3 pr-4 text-left text-[19px] font-semibold leading-tight transition-colors duration-150 active:scale-[0.98]',
                    active
                      ? 'bg-ds-primary text-white shadow-lg shadow-ds-primary/30'
                      : cn(card, 'text-ds-text-2'),
                  )}
                  key={id || 'all'}
                  onClick={() => pickCategory(id)}
                  type="button"
                >
                  <span
                    className={cn(
                      'grid h-12 w-12 shrink-0 place-items-center rounded-2xl',
                      active ? 'bg-white/20' : id ? toneOf(id) : 'tile-blue',
                    )}
                  >
                    <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  {name}
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {menu.items.length >= SEARCH_FROM ? (
            <div className="shrink-0 px-6 pb-4 sm:px-10 lg:px-6">
              <label className={cn(card, 'flex h-[64px] items-center gap-3 bg-ds-surface px-6')}>
                <Search aria-hidden="true" className="h-7 w-7 shrink-0 text-ds-muted" />
                <span className="sr-only">Search the menu</span>
                <input
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-[22px] font-medium outline-hidden placeholder:text-ds-muted"
                  enterKeyHint="search"
                  // The on-screen keyboard below, never the system's as well. A plugged-in
                  // keyboard still types.
                  inputMode="none"
                  onBlur={() => setIsKeyboardOpen(false)}
                  onChange={(event) => setSearch(event.target.value)}
                  onFocus={() => setIsKeyboardOpen(true)}
                  placeholder="Search dishes"
                  ref={searchRef}
                  // Not type="search": the browser would add a second, small clear button.
                  type="text"
                  value={search}
                />
                {search ? (
                  <button
                    aria-label="Clear search"
                    className="-mr-3 grid h-12 w-12 shrink-0 place-items-center rounded-full text-ds-text-3 active:bg-ds-subtle"
                    onClick={() => setSearch('')}
                    onPointerDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
                  </button>
                ) : null}
              </label>
              {isKeyboardOpen ? (
                <OnScreenKeyboard
                  onBackspace={() => setSearch((current) => current.slice(0, -1))}
                  onDone={() => searchRef.current?.blur()}
                  onKey={(letter) => setSearch((current) => current + letter)}
                />
              ) : null}
            </div>
          ) : null}
          {/* Narrow screens: one sideways-scrolling row of chips; wide: just Veg only. */}
          {categories.length > 1 || vegToggle ? (
            <div className="flex shrink-0 gap-3 overflow-x-auto px-6 pb-4 [scrollbar-width:none] sm:px-10 lg:px-6">
              {categories.length > 1
                ? options.map(({ id, name }) => (
                    <button
                      aria-pressed={!query && categoryId === id}
                      className={cn(chip(!query && categoryId === id), 'lg:hidden')}
                      key={id || 'all'}
                      onClick={() => pickCategory(id)}
                      type="button"
                    >
                      {name}
                    </button>
                  ))
                : null}
              {vegToggle}
            </div>
          ) : null}
          <main
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-1 sm:px-10 lg:px-6',
              // Room to scroll the last dishes up above the keyboard.
              isKeyboardOpen && 'pb-[400px]',
            )}
            ref={mainRef}
          >
            {shown.length === 0 && query ? (
              <div className="flex flex-col items-center gap-6 pt-24 text-center">
                <p className="text-[24px] font-medium text-ds-muted">
                  No dishes match “{search.trim()}”.
                </p>
                <button className={cn(chip(false))} onClick={() => setSearch('')} type="button">
                  <X aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
                  Clear search
                </button>
              </div>
            ) : shown.length === 0 ? (
              <p className="pt-24 text-center text-[24px] font-medium text-ds-muted">
                Nothing is being served right now. Please check back soon.
              </p>
            ) : sections ? (
              <div className="flex flex-col gap-10">
                {sections.map((section) => (
                  <section aria-labelledby={`kiosk-section-${section.id}`} key={section.id}>
                    <h2
                      className="mb-4 flex items-baseline gap-3 text-[26px] font-bold"
                      id={`kiosk-section-${section.id}`}
                    >
                      {section.name}
                      <span className="text-[20px] font-medium text-ds-muted">
                        {section.items.length}
                      </span>
                    </h2>
                    <ItemGrid cart={cart} items={section.items} onQuantity={onQuantity} />
                  </section>
                ))}
              </div>
            ) : (
              <ItemGrid cart={cart} items={shown} onQuantity={onQuantity} />
            )}
          </main>
          {totals.itemCount > 0 ? (
            <footer className="shrink-0 px-6 pb-6 pt-2 sm:px-10 lg:px-6 xl:hidden">
              <div
                className={cn(
                  card,
                  'flex flex-wrap items-center gap-x-5 gap-y-3 bg-ds-surface p-4 pl-7',
                )}
              >
                <ShoppingBag aria-hidden="true" className="h-8 w-8 shrink-0 text-ds-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-medium text-ds-text-3">
                    {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
                  </p>
                  <p className="text-[30px] font-bold leading-tight tabular-nums">
                    {formatRupees(totals.grandTotal)}
                  </p>
                </div>
                <button
                  className={cn(primaryButton, 'max-sm:w-full max-sm:px-6 max-sm:text-[20px]')}
                  onClick={onReview}
                  type="button"
                >
                  Review order
                  <ChevronRight aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />
                </button>
              </div>
            </footer>
          ) : null}
        </div>
        <OrderPanel
          cart={cart}
          onQuantity={onQuantity}
          onReview={onReview}
          total={totals.grandTotal}
        />
      </div>
    </>
  );
}
