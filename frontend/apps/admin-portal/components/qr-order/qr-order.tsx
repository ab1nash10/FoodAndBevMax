'use client';

import {
  ApiClientError,
  type FoodType,
  type KioskMenuItem,
  type QrChannel,
  type QrGuest,
  type QrMenu,
  type QrMenuItem,
} from '@aahar/api-client';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BedDouble,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Store,
  UserRound,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { FoodTypeMarker } from '@/components/design-system';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import {
  MAX_PER_ITEM,
  cartTotals,
  quantityOf,
  reconcile,
  setQuantity,
  type KioskCartLine,
} from '@/lib/kiosk';
import {
  guestSession,
  isSettled,
  myOrders,
  orderStatus,
  progressSteps,
  rememberOrder,
  returnUrlFor,
  saveGuestSession,
  saveOrder,
  savedOrder,
  timeOf,
  type StepState,
} from '@/lib/qr-order';
import { newClientId } from '@/lib/client-id';
import { loadRazorpay, openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { cn } from '@/lib/utils';

const rupees = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});
const rupeesShort = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  style: 'currency',
});
const money = (value: number) => rupees.format(value);

/** A room's QR page: the restaurants that deliver to it. */
export const roomHref = (roomId: string) => withBasePath(`/order/room/${roomId}`);

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary';
const inputClass =
  'w-full rounded-xl border-[1.5px] border-ds-border bg-ds-surface px-3 py-2.5 text-base text-ds-text outline-hidden focus:border-ds-primary';

/** The phone-width page every QR screen sits in. */
export function QrScreen({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-dvh bg-ds-page text-ds-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-ds-page shadow-[0_0_40px_-24px_rgba(14,26,43,.35)]">
        {children}
      </div>
    </div>
  );
}

/** The bar on top: back, the screen's title (and a line under it), the orders from this phone. */
export function TopBar({
  back,
  onOrders,
  subtitle,
  title,
}: Readonly<{
  back?: string | (() => void);
  onOrders?: () => void;
  subtitle?: ReactNode;
  title: string;
}>) {
  const round = cn(
    'grid h-11 w-11 shrink-0 place-items-center rounded-full text-ds-text hover:bg-ds-subtle',
    focusRing,
  );

  return (
    <header className="sticky top-0 z-20 flex h-[calc(60px+env(safe-area-inset-top))] items-center gap-1 border-b border-ds-border bg-ds-surface pl-1 pr-2 pt-[env(safe-area-inset-top)]">
      {typeof back === 'string' ? (
        <a aria-label="Back" className={round} href={back}>
          <ArrowLeft className="h-5 w-5" />
        </a>
      ) : back ? (
        <button aria-label="Back" className={round} onClick={back} type="button">
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : (
        <span className="w-3" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold leading-tight">{title}</h1>
        {subtitle ? <div className="mt-0.5 text-[13px] font-semibold">{subtitle}</div> : null}
      </div>
      {onOrders ? (
        <button aria-label="My orders" className={round} onClick={onOrders} type="button">
          <ReceiptText className="h-5 w-5" />
        </button>
      ) : null}
    </header>
  );
}

/** "To PG-ECO-06 (EWS)": the bed the order goes to. */
export function BedLine({ name }: Readonly<{ name: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-orange-800">
      <BedDouble aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="truncate">To {name}</span>
    </span>
  );
}

/** "At table Window 2": the dine-in table the order is served at. */
export function TableLine({ name }: Readonly<{ name: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-teal-800">
      <UtensilsCrossed aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="truncate">At table {name}</span>
    </span>
  );
}

function PickupLine({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-ds-link">
      <Store aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Ordering from a QR on the guest's own phone. A bed's QR delivers to that bed (room service), a
 * dine-in table's QR is served at that table; the restaurant's own QR is pickup at its counter.
 * The menu, an optional staff discount
 * (Employee ID + OTP to the registered mobile), UPI through the location's gateway, then the
 * order's progress; My orders keeps every order this phone placed.
 */
export function QrOrder({
  orderId,
  orderKey,
  restaurantId,
  room,
  roomId,
  table,
  tableId,
  token,
}: Readonly<{
  orderId?: string;
  orderKey?: string;
  restaurantId: string;
  /** From a bed's QR: its name, shown while ordering. */
  room?: string;
  /** From a bed's QR: delivered there; back goes to its restaurants. */
  roomId?: string;
  /** From a dine-in table's QR: its name, shown while ordering. */
  table?: string;
  /** From a dine-in table's QR: served there. */
  tableId?: string;
  token?: string;
}>) {
  const [active, setActive] = useState<{ id: string; key: string } | null>(
    orderId && orderKey ? { id: orderId, key: orderKey } : null,
  );
  const [showOrders, setShowOrders] = useState(false);
  const back = roomId ? roomHref(roomId) : undefined;
  const openOrders = () => setShowOrders(true);

  // Back from the payment page (or the guest reopened the QR): the order this phone placed.
  useEffect(() => {
    if (active) {
      saveOrder(restaurantId, active);
      rememberOrder(active);
    } else setActive(savedOrder(restaurantId));
  }, []);

  function startOver() {
    saveOrder(restaurantId, null);
    setActive(null);
    window.history.replaceState(null, '', returnUrlFor(window.location.href));
  }

  return (
    <QrScreen>
      {!token ? (
        <Notice tone="bad" title="This QR code is incomplete">
          Scan the QR code on the card again.
        </Notice>
      ) : showOrders ? (
        <MyOrders onBack={() => setShowOrders(false)} />
      ) : active ? (
        <OrderProgress back={back} onOrders={openOrders} onStartOver={startOver} order={active} />
      ) : (
        <Ordering
          back={back}
          onOrders={openOrders}
          onPlaced={(order) => {
            saveOrder(restaurantId, order);
            rememberOrder(order);
            setActive(order);
          }}
          restaurantId={restaurantId}
          room={room}
          roomId={roomId}
          table={table}
          tableId={tableId}
          token={token}
        />
      )}
    </QrScreen>
  );
}

export function Notice({
  children,
  title,
  tone,
}: Readonly<{ children: ReactNode; title: string; tone: 'bad' | 'warn' }>) {
  return (
    <div className="p-4">
      <div
        className={cn(
          'grid gap-1.5 rounded-[18px] p-4 text-base leading-relaxed',
          tone === 'bad'
            ? 'bg-ds-status-bad-bg text-ds-status-bad-fg'
            : 'bg-ds-status-pending-bg text-ds-status-pending-fg',
        )}
        role={tone === 'bad' ? 'alert' : 'status'}
      >
        <b>{title}</b>
        <span className="text-[15px]">{children}</span>
      </div>
    </div>
  );
}

function Stepper({
  label,
  max,
  onChange,
  quantity,
}: Readonly<{ label: string; max: number; onChange: (next: number) => void; quantity: number }>) {
  const side =
    'grid h-11 w-10 place-items-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white disabled:opacity-40';

  return (
    <div className="flex h-11 w-28 shrink-0 items-center justify-between rounded-xl bg-ds-primary text-white">
      <button
        aria-label={`One less ${label}`}
        className={cn(side, 'rounded-l-xl')}
        onClick={() => onChange(quantity - 1)}
        type="button"
      >
        <Minus className="h-[18px] w-[18px]" />
      </button>
      <span aria-live="polite" className="text-[17px] font-bold tabular-nums">
        {quantity}
      </span>
      <button
        aria-label={`One more ${label}`}
        className={cn(side, 'rounded-r-xl')}
        disabled={quantity >= max}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <Plus className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

function PrepTime({ minutes }: Readonly<{ minutes: number | null }>) {
  return minutes ? (
    <p className="mt-1.5 flex items-center gap-1 text-sm text-ds-muted">
      <Clock aria-hidden="true" className="h-[15px] w-[15px]" /> {minutes} min
    </p>
  ) : null;
}

const maxFor = (item: KioskMenuItem & { stock?: number | null }) =>
  Math.min(MAX_PER_ITEM, item.stock ?? MAX_PER_ITEM);

type MenuItem = QrMenuItem & { isFeatured: boolean };

function Ordering({
  back,
  onOrders,
  onPlaced,
  restaurantId,
  room,
  roomId,
  table,
  tableId,
  token,
}: Readonly<{
  back?: string;
  onOrders: () => void;
  onPlaced: (order: { id: string; key: string }) => void;
  restaurantId: string;
  room?: string;
  roomId?: string;
  table?: string;
  tableId?: string;
  token: string;
}>) {
  const [cart, setCart] = useState<KioskCartLine[]>([]);
  const [step, setStep] = useState<'checkout' | 'menu'>('menu');
  const [dropped, setDropped] = useState<string[]>([]);
  // A bed's QR delivers to that bed, a table's is served at that table; the restaurant's own QR
  // is pickup at the counter only.
  const bed = roomId ? { id: roomId, name: room || 'your bed' } : undefined;
  const atTable = !bed && tableId ? { id: tableId, name: table || 'your table' } : undefined;
  // A table orders from the counter menu, at counter prices.
  const channel: QrChannel = bed ? 'ROOM' : 'COUNTER';
  const menuQuery = useQuery({
    queryFn: async () => (await publicOrganizationApi.getQrMenu(restaurantId, token, channel)).data,
    queryKey: ['qr-menu', restaurantId, token, channel],
    refetchInterval: 60_000,
  });
  const menu = menuQuery.data;
  // The kiosk's cart helpers take kiosk items; the QR menu has no featured row.
  const items = useMemo<MenuItem[]>(
    () => (menu?.items ?? []).map((item) => ({ ...item, isFeatured: false })),
    [menu],
  );

  // A fresh menu keeps the cart honest: new prices, and what went off sale comes out.
  useEffect(() => {
    if (!menu) return;
    setCart((current) => {
      const next = reconcile(
        current,
        items.filter((item) => item.available),
      );
      if (next.dropped.length) setDropped(next.dropped);
      return next.cart;
    });
  }, [items, menu]);

  if (menuQuery.isLoading) {
    return (
      <>
        <TopBar back={back} onOrders={onOrders} title="Menu" />
        <div className="grid flex-1 place-items-center">
          <Loader2 aria-label="Loading the menu" className="h-8 w-8 animate-spin text-ds-link" />
        </div>
      </>
    );
  }
  if (!menu) {
    return (
      <>
        <TopBar back={back} onOrders={onOrders} title="Menu" />
        <Notice tone="bad" title="This QR code is no longer valid">
          {getApiErrorMessage(menuQuery.error)} Please ask the staff for a new one.
        </Notice>
      </>
    );
  }
  if (bed && !menu.roomDelivery) {
    return (
      <>
        <TopBar back={back} onOrders={onOrders} title={menu.restaurantName} />
        <Notice tone="bad" title={`${menu.restaurantName} does not deliver to rooms`}>
          Please ask the ward staff.
        </Notice>
      </>
    );
  }

  const change = (item: KioskMenuItem, quantity: number) =>
    setCart((current) => setQuantity(current, item, quantity));

  return step === 'menu' ? (
    <MenuStep
      back={back}
      bed={bed?.name}
      cart={cart}
      dropped={dropped}
      items={items}
      menu={menu}
      onChange={change}
      onCheckout={() => setStep('checkout')}
      onOrders={onOrders}
      table={atTable?.name}
    />
  ) : (
    <CheckoutStep
      bed={bed}
      cart={cart}
      menu={menu}
      onBack={() => setStep('menu')}
      onChange={change}
      onPlaced={onPlaced}
      restaurantId={restaurantId}
      table={atTable}
      token={token}
    />
  );
}

const foodChips = [
  ['VEG', 'Veg'],
  ['EGGETARIAN', 'Egg'],
  ['NON_VEG', 'Non-veg'],
] as const;

/** A bottom sheet over the page; tapping outside it closes it too. */
function Sheet({
  children,
  labelledBy,
  sheet,
}: Readonly<{
  children: ReactNode;
  labelledBy: string;
  sheet: RefObject<HTMLDialogElement | null>;
}>) {
  return (
    <dialog
      aria-labelledby={labelledBy}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-md bg-transparent p-0 text-ds-text backdrop:bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      ref={sheet}
    >
      {children}
    </dialog>
  );
}

function MenuStep({
  back,
  bed,
  cart,
  dropped,
  items,
  menu,
  onChange,
  onCheckout,
  onOrders,
  table,
}: Readonly<{
  back?: string;
  /** The bed's name, from its QR; none for pickup. */
  bed?: string;
  cart: KioskCartLine[];
  dropped: string[];
  items: MenuItem[];
  menu: QrMenu;
  onChange: (item: KioskMenuItem, quantity: number) => void;
  onCheckout: () => void;
  onOrders: () => void;
  /** The dine-in table's name, from its QR. */
  table?: string;
}>) {
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState<FoodType[]>([]);
  const [seen, setSeen] = useState('');
  const tabBar = useRef<HTMLElement>(null);
  const needle = search.trim().toLowerCase();
  // Items come in category order (Item Categories), so each category's first item places it.
  const groups = new Map<string, { items: MenuItem[]; name: string }>();
  for (const item of items) {
    if (only.length && !only.includes(item.foodType)) continue;
    if (needle && !item.itemName.toLowerCase().includes(needle)) continue;
    const id = item.category?.id ?? 'other';
    const group = groups.get(id) ?? { items: [], name: item.category?.categoryName ?? 'Other' };
    group.items.push(item);
    groups.set(id, group);
  }
  const ids = [...groups.keys()];
  const current = ids.includes(seen) ? seen : (ids[0] ?? '');
  const shownIds = ids.join(',');
  const totals = cartTotals(cart, 0);
  const bag = cart.length > 0 && menu.open;

  // The tab follows the category on screen as the guest scrolls.
  useEffect(() => {
    let frame = 0;
    const spy = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = (tabBar.current?.getBoundingClientRect().bottom ?? 0) + 12;
        let reached = '';
        for (const section of document.querySelectorAll<HTMLElement>('[data-category]')) {
          if (section.getBoundingClientRect().top <= line) reached = section.dataset.category ?? '';
        }
        setSeen(reached);
      });
    };
    spy();
    window.addEventListener('scroll', spy, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', spy);
    };
  }, [shownIds]);

  // ...and stays in view in the tab bar.
  useEffect(() => {
    const bar = tabBar.current;
    const tab = bar?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(current)}"]`);
    if (bar && tab) bar.scrollLeft = tab.offsetLeft - (bar.clientWidth - tab.clientWidth) / 2;
  }, [current]);

  return (
    <>
      <TopBar
        back={back}
        onOrders={onOrders}
        subtitle={
          bed ? (
            <BedLine name={bed} />
          ) : table ? (
            <TableLine name={table} />
          ) : (
            <PickupLine>Pick up at {menu.pickupCounter ?? 'the counter'}</PickupLine>
          )
        }
        title={menu.restaurantName}
      />
      <div className="bg-ds-surface px-4 pt-3">
        <label className="flex h-12 items-center gap-2.5 rounded-[14px] bg-ds-page px-3.5 text-ds-muted focus-within:ring-2 focus-within:ring-ds-primary">
          <Search aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="sr-only">Search for dishes</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-base text-ds-text outline-hidden placeholder:text-ds-muted"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dishes"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="Show only" className="flex gap-2 py-3" role="group">
          {foodChips.map(([type, label]) => {
            const on = only.includes(type);

            return (
              <button
                aria-pressed={on}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold',
                  on
                    ? 'border-ds-primary bg-ds-primary-soft text-ds-link'
                    : 'border-ds-border bg-ds-surface text-ds-text-2',
                  focusRing,
                )}
                key={type}
                onClick={() =>
                  setOnly((chosen) =>
                    on ? chosen.filter((kept) => kept !== type) : [...chosen, type],
                  )
                }
                type="button"
              >
                <span aria-hidden="true">
                  <FoodTypeMarker type={type} />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {groups.size > 1 ? (
        <nav
          aria-label="Categories"
          className="sticky top-[calc(60px+env(safe-area-inset-top))] z-10 flex gap-6 overflow-x-auto border-b border-ds-border bg-ds-surface px-4 [scrollbar-width:none]"
          ref={tabBar}
        >
          {[...groups].map(([id, group]) => (
            <button
              aria-current={id === current ? 'true' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap border-b-[3px] py-3 text-[15px]',
                id === current
                  ? 'border-ds-primary font-bold text-ds-link'
                  : 'border-transparent font-semibold text-ds-muted',
              )}
              data-tab={id}
              key={id}
              onClick={() => {
                document.getElementById(`category-${id}`)?.scrollIntoView();
                setSeen(id);
              }}
              type="button"
            >
              {group.name}
            </button>
          ))}
        </nav>
      ) : null}
      {!menu.open ? (
        <Notice tone="warn" title="Ordering is closed right now">
          Please try again later.
        </Notice>
      ) : null}
      {dropped.length ? (
        <Notice tone="warn" title="Some dishes are no longer available">
          {dropped.join(', ')} came off your order.
        </Notice>
      ) : null}
      <main className="flex-1 bg-ds-surface px-4 pb-28">
        {groups.size === 0 ? (
          <p className="py-12 text-center text-base text-ds-muted">
            {items.length ? 'No dish matches.' : 'Nothing is on the menu right now.'}
          </p>
        ) : (
          [...groups].map(([id, group]) => (
            <section
              aria-labelledby={`category-${id}-title`}
              className="scroll-mt-[calc(112px+env(safe-area-inset-top))]"
              data-category={id}
              id={`category-${id}`}
              key={id}
            >
              <h2 className="pb-0.5 pt-5 text-lg font-extrabold" id={`category-${id}-title`}>
                {group.name} <span className="font-medium text-ds-muted">{group.items.length}</span>
              </h2>
              <ul>
                {group.items.map((item) => (
                  <DishRow
                    item={item}
                    key={item.id}
                    onChange={(next) => onChange(item, next)}
                    open={menu.open}
                    quantity={quantityOf(cart, item.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      {bag ? (
        <footer className="sticky bottom-0 z-10 border-t border-ds-border bg-ds-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          <button
            className={cn(
              'flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-ds-primary px-[18px] text-[17px] font-bold text-white',
              focusRing,
            )}
            onClick={onCheckout}
            type="button"
          >
            <span className="tabular-nums">
              {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'} ·{' '}
              {rupeesShort.format(totals.grandTotal)}
            </span>
            <span className="flex items-center gap-0.5">
              View order <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </span>
          </button>
        </footer>
      ) : null}
    </>
  );
}

function DishRow({
  item,
  onChange,
  open,
  quantity,
}: Readonly<{
  item: MenuItem;
  onChange: (quantity: number) => void;
  open: boolean;
  quantity: number;
}>) {
  return (
    <li className="flex items-start gap-3 border-b border-ds-divider py-4 last:border-b-0">
      <div className={cn('min-w-0 flex-1', !item.available && 'opacity-55')}>
        <FoodTypeMarker type={item.foodType} />
        <p className="mt-2 text-base font-semibold leading-snug">{item.itemName}</p>
        <p className="mt-1 text-base font-bold tabular-nums">{rupeesShort.format(item.price)}</p>
        <PrepTime minutes={item.available ? item.preparationTimeMinutes : null} />
      </div>
      {!open ? null : !item.available ? (
        <span className="shrink-0 self-center text-sm font-semibold text-ds-text-2">
          Not available now
        </span>
      ) : quantity ? (
        <Stepper label={item.itemName} max={maxFor(item)} onChange={onChange} quantity={quantity} />
      ) : (
        <button
          aria-label={`Add ${item.itemName}`}
          className={cn(
            'inline-flex h-11 min-w-[92px] shrink-0 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-ds-primary bg-ds-surface px-3.5 text-base font-bold text-ds-link',
            focusRing,
          )}
          onClick={() => onChange(1)}
          type="button"
        >
          <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
          Add
        </button>
      )}
    </li>
  );
}

/** Where the order goes: the bed from its QR, or the counter for pickup. */
function Destination({
  bed,
  location,
  pickupAt,
  prepMinutes,
  table,
}: Readonly<{
  bed?: string;
  location: string;
  pickupAt: string;
  prepMinutes: number;
  table?: string;
}>) {
  const when = prepMinutes ? ` · ready in about ${prepMinutes} min` : '';

  if (table) {
    return (
      <section
        aria-label="Where it goes"
        className="flex items-center gap-3 rounded-[18px] border border-teal-200 bg-teal-50 px-4 py-3.5"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white">
          <UtensilsCrossed aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-teal-900">Served at your table, {table}</p>
          <p className="text-sm text-teal-800">
            {prepMinutes ? `Ready in about ${prepMinutes} min. ` : ''}Staff bring it to you.
          </p>
        </div>
      </section>
    );
  }

  return bed ? (
    <section
      aria-label="Where it goes"
      className="flex items-center gap-3 rounded-[18px] border border-orange-200 bg-orange-50 px-4 py-3.5"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-700 text-white">
        <BedDouble aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold text-orange-900">Delivering to {bed}</p>
        <p className="text-sm text-orange-800">
          {location}
          {when}
        </p>
      </div>
    </section>
  ) : (
    <section
      aria-label="Where it goes"
      className="flex items-center gap-3 rounded-[18px] border border-ds-primary-border bg-ds-primary-soft px-4 py-3.5"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ds-primary text-white">
        <Store aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-bold text-ds-link">Pick up at {pickupAt}</p>
        <p className="text-sm text-ds-text-2">
          {prepMinutes ? `Ready in about ${prepMinutes} min. ` : ''}Show your order number to
          collect it.
        </p>
      </div>
    </section>
  );
}

/** A row that opens to show more: optional parts of the order stay out of the way. */
function Fold({
  children,
  icon: Icon,
  label,
}: Readonly<{ children: ReactNode; icon: LucideIcon; label: string }>) {
  return (
    <details className="group border-t border-ds-divider first:border-t-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-ds-link" />
        <span className="flex-1">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className="h-5 w-5 text-ds-muted transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Row({
  className,
  label,
  value,
}: Readonly<{ className?: string; label: string; value: string }>) {
  return (
    <p className={cn('flex justify-between gap-3', className)}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}

function CheckoutStep({
  bed,
  cart,
  menu,
  onBack,
  onChange,
  onPlaced,
  restaurantId,
  table,
  token,
}: Readonly<{
  /** From a bed's QR: delivered there. Without it (or a table), pickup at the counter. */
  bed?: { id: string; name: string };
  cart: KioskCartLine[];
  menu: QrMenu;
  onBack: () => void;
  onChange: (item: KioskMenuItem, quantity: number) => void;
  onPlaced: (order: { id: string; key: string }) => void;
  restaurantId: string;
  /** From a dine-in table's QR: served there. */
  table?: { id: string; name: string };
  token: string;
}>) {
  const [instructions, setInstructions] = useState('');
  // Signed in once on this phone (name and mobile, confirmed by OTP); asked only the first time.
  const [guest, setGuest] = useState<QrGuest | null>(guestSession);
  const [error, setError] = useState('');
  const confirm = useRef<HTMLDialogElement>(null);
  // One id per checkout: a double tap or a retry is the same order, not a second one.
  const clientOrderId = useRef(newClientId());
  // An employee's registered mobile gets their staff discount by itself.
  const discountQuery = useQuery({
    enabled: Boolean(guest),
    queryFn: async () =>
      (await publicOrganizationApi.getQrGuestDiscount(restaurantId, token, guest!.guestToken)).data,
    queryKey: ['qr-guest-discount', restaurantId, guest?.guestToken],
    retry: false,
    staleTime: 5 * 60_000,
  });
  const discountPercent = discountQuery.data?.discountPercent ?? 0;
  const totals = cartTotals(cart, discountPercent);
  const gstRates = [...new Set(cart.map(({ item }) => item.gstPercent))];
  // One GST rate on the bill: its CGST and SGST halves can be named.
  const rate = gstRates.length === 1 ? gstRates[0]! : null;
  const percent = (value: number | null) => (value === null ? '' : ` (${value}%)`);
  const prepMinutes = Math.max(0, ...cart.map(({ item }) => item.preparationTimeMinutes ?? 0));
  const pickupAt = menu.pickupCounter ?? 'the counter';
  const toPay = rupeesShort.format(totals.grandTotal);
  const queryClient = useQueryClient();

  const place = useMutation({
    mutationFn: async () =>
      (
        await publicOrganizationApi.createQrOrder(restaurantId, token, {
          channel: bed ? 'ROOM' : table ? 'TABLE' : 'COUNTER',
          clientOrderId: clientOrderId.current,
          guestToken: guest!.guestToken,
          instructions: instructions.trim() || undefined,
          lines: cart.map(({ item, quantity }) => ({ menuId: item.id, quantity })),
          returnUrl: returnUrlFor(window.location.href),
          roomId: bed?.id,
          tableId: table?.id,
        })
      ).data,
    onError: (failure) => {
      if (signedOut(failure)) signOut();
      setError(getApiErrorMessage(failure));
    },
    onSuccess: (order) => {
      onPlaced({ id: order.id, key: order.key });
      if (order.checkout) {
        // Razorpay's checkout over this page, name and mobile filled in. Its "paid" only makes
        // the order screen ask again at once: the server's own check with Razorpay bills it.
        void openRazorpayCheckout(order.checkout, {
          onPaid: () => void queryClient.invalidateQueries({ queryKey: ['qr-order', order.id] }),
        }).catch(() => undefined);
      } else if (order.paymentUrl) {
        window.location.assign(order.paymentUrl);
      }
    },
  });

  // Fetched while the guest checks the bill, so Pay opens Razorpay at once.
  useEffect(() => {
    loadRazorpay().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (cart.length === 0) onBack();
  }, [cart.length, onBack]);

  // A sign-in the server no longer takes (lapsed, or the keys changed): ask again.
  useEffect(() => {
    if (signedOut(discountQuery.error)) signOut();
  }, [discountQuery.error]);

  function signOut() {
    saveGuestSession(null);
    setGuest(null);
  }

  return (
    <>
      <TopBar back={onBack} title="Your order" />
      <form
        className="grid flex-1 content-start gap-3 p-4 pb-36"
        id="qr-checkout"
        onSubmit={(event) => {
          event.preventDefault();
          if (!guest) {
            setError('Confirm your mobile number to pay.');
            document.getElementById('qr-guest-name')?.focus();
            return;
          }
          setError('');
          // A room order is checked once more: it goes to the bed named, nowhere else.
          if (bed) confirm.current?.showModal();
          else place.mutate();
        }}
      >
        <Destination
          bed={bed?.name}
          location={menu.locationName}
          pickupAt={pickupAt}
          prepMinutes={prepMinutes}
          table={table?.name}
        />

        <section aria-label="Your details" className="rounded-[18px] bg-ds-surface p-4">
          {guest ? (
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ds-status-ok-bg text-ds-status-ok-fg">
                <UserRound aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">{guest.name}</p>
                <p className="text-sm text-ds-muted">
                  Mobile ******{guest.mobile.slice(-4)} · confirmed
                </p>
                {discountPercent ? (
                  <p className="text-sm font-semibold text-ds-status-ok-fg">
                    Staff discount {discountPercent}% applied
                  </p>
                ) : null}
              </div>
              <button
                className={cn(
                  'min-h-11 shrink-0 px-2 text-base font-semibold text-ds-link',
                  focusRing,
                )}
                onClick={signOut}
                type="button"
              >
                Change
              </button>
            </div>
          ) : (
            <GuestSignIn
              onSignedIn={(signed) => {
                saveGuestSession(signed);
                setGuest(signed);
                setError('');
              }}
              restaurantId={restaurantId}
              token={token}
            />
          )}
        </section>

        <section aria-label="Items" className="rounded-[18px] bg-ds-surface px-4">
          <ul>
            {cart.map(({ item, quantity }) => (
              <li className="flex items-center gap-3 border-b border-ds-divider py-4" key={item.id}>
                <div className="min-w-0 flex-1">
                  <FoodTypeMarker type={item.foodType} />
                  <p className="mt-1.5 text-base font-semibold leading-snug">{item.itemName}</p>
                  <p className="mt-1 text-base font-bold tabular-nums">
                    {rupeesShort.format(item.price)}
                  </p>
                </div>
                <Stepper
                  label={item.itemName}
                  max={maxFor(item)}
                  onChange={(next) => onChange(item, next)}
                  quantity={quantity}
                />
              </li>
            ))}
          </ul>
          <button
            className="flex min-h-[52px] w-full items-center gap-2 text-base font-semibold text-ds-link"
            onClick={onBack}
            type="button"
          >
            <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
            Add more items
          </button>
        </section>

        <section aria-label="More options" className="overflow-hidden rounded-[18px] bg-ds-surface">
          <Fold icon={MessageSquare} label="Add cooking instructions">
            <label className="sr-only" htmlFor="qr-note">
              Cooking instructions
            </label>
            <textarea
              className={cn(inputClass, 'resize-none')}
              id="qr-note"
              maxLength={200}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Less spicy, no onion… (up to 200 letters)"
              rows={3}
              value={instructions}
            />
          </Fold>
        </section>

        <section
          aria-label="Bill"
          className="grid gap-2.5 rounded-[18px] bg-ds-surface p-4 tabular-nums"
        >
          <h2 className="text-base font-bold">Bill</h2>
          <Row label="Item total" value={money(totals.subtotal)} />
          {totals.discountTotal > 0 ? (
            <Row
              className="text-ds-status-ok-fg"
              label={`Staff discount (${discountPercent}%)`}
              value={`−${money(totals.discountTotal)}`}
            />
          ) : null}
          {totals.gstTotal > 0 ? (
            <>
              <Row label={`GST${percent(rate)}`} value={money(totals.gstTotal)} />
              <div className="grid gap-1.5 rounded-xl bg-ds-page px-3 py-2.5 text-sm text-ds-text-2">
                <Row
                  label={`CGST${percent(rate === null ? null : rate / 2)}`}
                  value={money(totals.gstTotal / 2)}
                />
                <Row
                  label={`SGST${percent(rate === null ? null : rate / 2)}`}
                  value={money(totals.gstTotal / 2)}
                />
              </div>
            </>
          ) : null}
          {totals.roundOff ? <Row label="Round off" value={money(totals.roundOff)} /> : null}
          <Row
            className="border-t border-dashed border-ds-border pt-2.5 text-[19px] font-extrabold"
            label="To pay"
            value={money(totals.grandTotal)}
          />
          <p className="text-sm text-ds-muted">You pay by UPI on the next screen.</p>
        </section>
        {error ? (
          <p className="text-base font-semibold text-ds-status-bad-fg" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <footer className="sticky bottom-0 z-10 border-t border-ds-border bg-ds-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <button
          className={cn(
            'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl bg-ds-primary px-[18px] py-2 text-[17px] font-bold text-white disabled:opacity-60',
            focusRing,
          )}
          disabled={place.isPending || !menu.open}
          form="qr-checkout"
          type="submit"
        >
          {place.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              Opening the payment page…
            </span>
          ) : (
            <>
              <span className="tabular-nums">Pay {toPay} by UPI</span>
              <span className="text-[13px] font-medium opacity-85">
                {guest
                  ? 'Google Pay · PhonePe · Paytm · any UPI app'
                  : 'Confirm your mobile number above first'}
              </span>
            </>
          )}
        </button>
      </footer>
      {bed ? (
        <Sheet labelledBy="qr-confirm-title" sheet={confirm}>
          <div className="grid justify-items-center gap-3.5 rounded-t-3xl bg-ds-surface px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-center">
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-ds-border" />
            <span className="mt-1.5 grid h-16 w-16 place-items-center rounded-full bg-orange-50 text-orange-700">
              <BedDouble aria-hidden="true" className="h-8 w-8" />
            </span>
            <h2 className="text-[23px] font-extrabold tracking-tight" id="qr-confirm-title">
              Deliver to {bed.name}?
            </h2>
            <p className="text-base leading-relaxed text-ds-muted">
              {menu.locationName}. A steward brings your order to you there.
            </p>
            <button
              className={cn(
                'mt-1.5 min-h-14 w-full rounded-2xl bg-ds-primary text-[17px] font-bold text-white',
                focusRing,
              )}
              onClick={() => {
                confirm.current?.close();
                place.mutate();
              }}
              type="button"
            >
              Yes, pay {toPay}
            </button>
            <button
              className={cn(
                'min-h-[52px] w-full rounded-2xl border-[1.5px] border-ds-border text-[17px] font-semibold',
                focusRing,
              )}
              onClick={() => confirm.current?.close()}
              type="button"
            >
              No, go back
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** Every order placed from this phone, newest first; each opens its progress. */
export function MyOrders({
  initial = null,
  onBack,
}: Readonly<{
  /** Open straight on this order (its card on the bed's page). */
  initial?: { id: string; key: string } | null;
  onBack: () => void;
}>) {
  const [orders] = useState(myOrders);
  const [open, setOpen] = useState(initial);
  const views = useQueries({
    queries: orders.map((order) => ({
      queryFn: async () => (await publicOrganizationApi.getQrOrder(order.id, order.key)).data,
      queryKey: ['qr-order', order.id],
      retry: false,
    })),
  });

  if (open) {
    return (
      <OrderProgress
        back={initial ? onBack : () => setOpen(null)}
        doneLabel={initial ? 'Back' : 'Back to my orders'}
        onStartOver={initial ? onBack : () => setOpen(null)}
        order={open}
      />
    );
  }

  return (
    <>
      <TopBar back={onBack} title="My orders" />
      {orders.length === 0 ? (
        <p className="px-6 py-16 text-center text-base text-ds-muted">
          No orders from this phone yet.
        </p>
      ) : (
        <ul className="grid flex-1 content-start gap-3 p-4">
          {orders.map((order, index) => {
            const query = views[index];
            const view = query?.data;

            return (
              <li key={order.id}>
                <button
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[18px] bg-ds-surface p-4 text-left shadow-xs',
                    focusRing,
                  )}
                  onClick={() => setOpen(order)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">
                      {view?.restaurantName ?? (query?.isError ? 'Order not found' : 'Loading…')}
                    </span>
                    {view ? (
                      <span className="block text-sm text-ds-muted">
                        {view.orderNumber ? `Order ${view.orderNumber} · ` : ''}
                        {orderStatus(view)}
                      </span>
                    ) : null}
                  </span>
                  {view ? (
                    <span className="text-base font-bold tabular-nums">
                      {money(view.grandTotal)}
                    </span>
                  ) : null}
                  <ChevronRight aria-hidden="true" className="h-5 w-5 text-ds-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const RESEND_SECONDS = 60;

/** A sign-in the server refused (lapsed or not its own): the guest confirms their number again. */
const signedOut = (failure: unknown) => failure instanceof ApiClientError && failure.status === 403;

/** Name and mobile, then the OTP sent to that mobile: once per phone, then straight to paying. */
function GuestSignIn({
  onSignedIn,
  restaurantId,
  token,
}: Readonly<{ onSignedIn: (guest: QrGuest) => void; restaurantId: string; token: string }>) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const ready = name.trim().length > 0 && /^[6-9]\d{9}$/.test(mobile);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setWait((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const send = useMutation({
    mutationFn: async () =>
      (
        await publicOrganizationApi.sendQrGuestOtp(restaurantId, token, {
          mobile,
          name: name.trim(),
        })
      ).data,
    onError: (failure) => setError(getApiErrorMessage(failure)),
    onSuccess: (sent) => {
      setError('');
      setOtp('');
      setSentTo(sent.sentTo);
      setWait(RESEND_SECONDS);
    },
  });
  const verify = useMutation({
    mutationFn: async (code: string) =>
      (await publicOrganizationApi.verifyQrGuestOtp(restaurantId, token, { mobile, otp: code }))
        .data,
    onError: (failure) => setError(getApiErrorMessage(failure)),
    onSuccess: onSignedIn,
  });
  // Enter in a field acts on it, not on the order form around it.
  const onEnter = (act: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    act();
  };

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-bold">Your name and mobile</h2>
        <p className="text-sm leading-relaxed text-ds-text-2">
          We send an OTP to confirm it. You do this once on this phone.
        </p>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold text-ds-text-2" htmlFor="qr-guest-name">
        Your name
        <input
          autoComplete="name"
          className={inputClass}
          id="qr-guest-name"
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
            setSentTo('');
          }}
          value={name}
        />
      </label>
      <label
        className="grid gap-1.5 text-sm font-semibold text-ds-text-2"
        htmlFor="qr-guest-mobile"
      >
        Mobile number
        <span className="flex items-center gap-2">
          <span className="text-base font-normal text-ds-muted">+91</span>
          <input
            autoComplete="tel-national"
            className={inputClass}
            id="qr-guest-mobile"
            inputMode="numeric"
            maxLength={10}
            onChange={(event) => {
              setMobile(event.target.value.replace(/\D/g, ''));
              setSentTo('');
            }}
            onKeyDown={onEnter(() => {
              if (ready && !send.isPending) send.mutate();
            })}
            value={mobile}
          />
        </span>
      </label>
      {sentTo ? (
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-ds-text-2" htmlFor="qr-guest-otp">
            Enter the OTP sent to {sentTo}
          </label>
          <div className="flex gap-2">
            <input
              autoComplete="one-time-code"
              className={cn(inputClass, 'font-mono tracking-[.4em]')}
              id="qr-guest-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                const code = event.target.value.replace(/\D/g, '');
                setOtp(code);
                // The sixth digit confirms it: one tap fewer.
                if (code.length === 6 && !verify.isPending) verify.mutate(code);
              }}
              onKeyDown={onEnter(() => {
                if (otp.length === 6 && !verify.isPending) verify.mutate(otp);
              })}
              value={otp}
            />
            <button
              className="min-h-11 shrink-0 rounded-xl bg-ds-primary px-4 text-base font-bold text-white disabled:opacity-50"
              disabled={otp.length !== 6 || verify.isPending}
              onClick={() => verify.mutate(otp)}
              type="button"
            >
              {verify.isPending ? 'Checking…' : 'Confirm'}
            </button>
          </div>
          <button
            className="min-h-11 w-fit text-sm font-semibold text-ds-link disabled:text-ds-muted"
            disabled={wait > 0 || send.isPending}
            onClick={() => send.mutate()}
            type="button"
          >
            {wait > 0 ? `Resend OTP in ${wait}s` : 'Resend OTP'}
          </button>
        </div>
      ) : (
        <button
          className={cn(
            'min-h-12 w-full rounded-xl bg-ds-primary text-base font-bold text-white disabled:opacity-50',
            focusRing,
          )}
          disabled={!ready || send.isPending}
          onClick={() => send.mutate()}
          type="button"
        >
          {send.isPending ? 'Sending…' : 'Send OTP'}
        </button>
      )}
      {error ? (
        <p className="text-sm font-semibold text-ds-status-bad-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Dot({ state }: Readonly<{ state: StepState }>) {
  return state === 'done' ? (
    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ds-status-ok-fg text-white">
      <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
    </span>
  ) : (
    <span
      className={cn(
        'h-[22px] w-[22px] shrink-0 rounded-full',
        state === 'now'
          ? 'border-[6px] border-ds-primary bg-ds-surface'
          : 'border-2 border-ds-border',
      )}
    />
  );
}

function OrderProgress({
  back,
  doneLabel = 'Order something else',
  onOrders,
  onStartOver,
  order,
}: Readonly<{
  back?: string | (() => void);
  /** The last button: a new order, or back to the list of orders. */
  doneLabel?: string;
  onOrders?: () => void;
  onStartOver: () => void;
  order: { id: string; key: string };
}>) {
  const [payError, setPayError] = useState('');
  const orderQuery = useQuery({
    queryFn: async () => (await publicOrganizationApi.getQrOrder(order.id, order.key)).data,
    queryKey: ['qr-order', order.id],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && isSettled(data) ? false : 4000;
    },
  });
  const view = orderQuery.data;
  const top = (
    <TopBar
      back={back}
      onOrders={onOrders}
      title={view?.orderNumber ? `Order ${view.orderNumber}` : 'Your order'}
    />
  );

  if (orderQuery.isLoading) {
    return (
      <>
        {top}
        <div className="grid flex-1 place-items-center">
          <Loader2 aria-label="Checking your order" className="h-8 w-8 animate-spin text-ds-link" />
        </div>
      </>
    );
  }
  if (!view) {
    return (
      <>
        {top}
        <Notice tone="bad" title="This order could not be found">
          {getApiErrorMessage(orderQuery.error)}
        </Notice>
        <Done label="Start again" onClick={onStartOver} />
      </>
    );
  }

  if (view.status === 'AWAITING_PAYMENT') {
    return (
      <>
        {top}
        <div className="grid flex-1 content-center justify-items-center gap-4 p-6 text-center">
          <Loader2 aria-hidden="true" className="h-14 w-14 animate-spin text-ds-link" />
          <div className="grid gap-1.5">
            <h2 className="text-xl font-extrabold">Waiting for your payment</h2>
            <p className="text-base leading-relaxed text-ds-muted">
              Finish paying {money(view.grandTotal)} in your UPI app. This page updates by itself
              once the payment is confirmed.
            </p>
          </div>
        </div>
        <footer className="grid gap-2 border-t border-ds-border bg-ds-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          {payError ? (
            <p className="text-center text-sm text-ds-danger" role="alert">
              {payError}
            </p>
          ) : null}
          {view.checkout ? (
            <button
              className="grid min-h-14 place-items-center rounded-2xl bg-ds-primary px-4 text-[17px] font-bold text-white"
              onClick={() => {
                setPayError('');
                openRazorpayCheckout(view.checkout!, {
                  onPaid: () => void orderQuery.refetch(),
                }).catch((failure: unknown) =>
                  setPayError(failure instanceof Error ? failure.message : String(failure)),
                );
              }}
              type="button"
            >
              Pay {money(view.grandTotal)} by UPI
            </button>
          ) : view.paymentUrl ? (
            <a
              className="grid min-h-14 place-items-center rounded-2xl bg-ds-primary px-4 text-[17px] font-bold text-white"
              href={view.paymentUrl}
            >
              Open the payment page again
            </a>
          ) : null}
          <button
            className="min-h-11 w-full rounded-2xl text-base font-semibold text-ds-link"
            onClick={onStartOver}
            type="button"
          >
            Start a new order
          </button>
        </footer>
      </>
    );
  }

  if (view.status === 'CLOSED') {
    return (
      <>
        {top}
        <Notice tone="warn" title="This payment was not completed">
          The payment page closed before it was paid, so nothing was ordered or charged.
        </Notice>
        <Done label="Start again" onClick={onStartOver} />
      </>
    );
  }

  if (view.status === 'PAID_NOT_BILLED') {
    return (
      <>
        {top}
        <Notice tone="bad" title="Payment received, order not placed">
          {view.message} Amount paid: {money(view.grandTotal)}. Reference: {view.id.slice(0, 8)}.
        </Notice>
        <Done label="Start again" onClick={onStartOver} />
      </>
    );
  }

  const cancelled = view.kitchenStatus === 'CANCELLED';
  const steps = progressSteps(view);
  const times = [view.paidAt, null, view.readyAt, view.deliveredAt];
  const settled = isSettled(view);

  return (
    <>
      {top}
      <div className="grid flex-1 content-start gap-3 p-4 pb-28">
        <section className="grid gap-2 rounded-[18px] bg-ds-surface p-5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ds-status-ok-bg px-2.5 py-1 text-[13px] font-bold text-ds-status-ok-fg">
            <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} /> Paid{' '}
            {money(view.grandTotal)} by UPI
          </span>
          <h2 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">
            {orderStatus(view)}
          </h2>
          <p className="text-base text-ds-muted">
            {cancelled
              ? 'Please ask at the counter about your refund.'
              : `${view.readyBy && !view.readyAt ? `Expected by ${timeOf(view.readyBy)}. ` : ''}${
                  settled ? '' : 'This page updates by itself.'
                }`}
          </p>
          <div className="mt-1 text-[15px] font-semibold">
            {view.tableName ? (
              <TableLine name={view.tableName} />
            ) : view.roomNumber ? (
              <BedLine name={view.roomNumber} />
            ) : (
              <PickupLine>Collect it at the counter</PickupLine>
            )}
          </div>
        </section>
        {cancelled ? null : (
          <ol aria-label="Order progress" className="rounded-[18px] bg-ds-surface px-5 py-[18px]">
            {steps.map((step, index) => {
              const at = times[index];

              return (
                <li className="flex gap-3.5" key={step.label}>
                  <span aria-hidden="true" className="flex flex-col items-center">
                    <Dot state={step.state} />
                    {index < steps.length - 1 ? (
                      <span
                        className={cn(
                          'min-h-7 w-0.5 flex-1',
                          step.state === 'done' ? 'bg-ds-status-ok-fg' : 'bg-ds-border',
                        )}
                      />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'text-base',
                      index < steps.length - 1 && 'pb-5',
                      step.state === 'now'
                        ? 'font-bold text-ds-link'
                        : step.state === 'done'
                          ? 'font-semibold'
                          : 'text-ds-muted',
                    )}
                  >
                    {step.label}
                    {step.state === 'todo' ? null : (
                      <span className="font-normal text-ds-muted">
                        {at ? ` · ${timeOf(at)}` : step.state === 'now' ? ' · now' : ''}
                      </span>
                    )}
                    <span className="sr-only">
                      {step.state === 'done' ? ' (done)' : step.state === 'now' ? ' (now)' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {view.lines.length ? (
          <section
            aria-label="Your dishes"
            className="grid gap-2 rounded-[18px] bg-ds-surface p-4 text-base"
          >
            {view.lines.map((line, index) => (
              <p className="flex justify-between gap-3" key={`${line.itemName}-${index}`}>
                <span>
                  {line.quantity} × {line.itemName}
                </span>
                <span className="tabular-nums">{money(line.amount)}</span>
              </p>
            ))}
            {view.billNumber ? (
              <p className="mt-1 text-[13px] text-ds-muted">Invoice {view.billNumber}</p>
            ) : null}
          </section>
        ) : null}
      </div>
      <Done label={doneLabel} onClick={onStartOver} />
    </>
  );
}

/** The screen's last step: a new order, or back to where the guest came from. */
function Done({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <footer className="sticky bottom-0 mt-auto border-t border-ds-border bg-ds-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
      <button
        className={cn(
          'min-h-[52px] w-full rounded-2xl border-[1.5px] border-ds-primary text-[17px] font-bold text-ds-link',
          focusRing,
        )}
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
    </footer>
  );
}
