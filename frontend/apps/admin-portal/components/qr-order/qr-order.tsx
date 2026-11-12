'use client';

import type { KioskMenuItem, QrChannel, QrMenu } from '@aahar/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, Loader2, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FoodTypeMarker } from '@/components/design-system';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import {
  MAX_PER_ITEM,
  cartTotals,
  quantityOf,
  reconcile,
  setQuantity,
  type KioskCartLine,
} from '@/lib/kiosk';
import {
  isSettled,
  progressSteps,
  returnUrlFor,
  saveOrder,
  savedOrder,
  type StepState,
} from '@/lib/qr-order';
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

/**
 * Ordering from the restaurant's QR on the guest's own phone: patients and attendants have it
 * delivered to their room, staff and visitors pick it up at the counter. The menu for either,
 * an optional staff discount (Employee ID + OTP to the registered mobile), UPI through the
 * location's gateway, then the order's progress.
 */
export function QrOrder({
  orderId,
  orderKey,
  restaurantId,
  token,
}: Readonly<{ orderId?: string; orderKey?: string; restaurantId: string; token?: string }>) {
  const [active, setActive] = useState<{ id: string; key: string } | null>(
    orderId && orderKey ? { id: orderId, key: orderKey } : null,
  );

  // Back from the payment page (or the guest reopened the QR): the order this phone placed.
  useEffect(() => {
    if (active) saveOrder(restaurantId, active);
    else setActive(savedOrder(restaurantId));
  }, []);

  function startOver() {
    saveOrder(restaurantId, null);
    setActive(null);
    window.history.replaceState(null, '', returnUrlFor(window.location.href));
  }

  return (
    <div className="min-h-dvh bg-ds-page text-ds-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-ds-surface shadow-[0_0_40px_-24px_rgba(14,26,43,.35)]">
        {!token ? (
          <Notice tone="bad" title="This QR code is incomplete">
            Scan the QR code on the card again.
          </Notice>
        ) : active ? (
          <OrderProgress onStartOver={startOver} order={active} />
        ) : (
          <Ordering
            onPlaced={(order) => {
              saveOrder(restaurantId, order);
              setActive(order);
            }}
            restaurantId={restaurantId}
            token={token}
          />
        )}
      </div>
    </div>
  );
}

function Notice({
  children,
  title,
  tone,
}: Readonly<{ children: ReactNode; title: string; tone: 'bad' | 'warn' }>) {
  return (
    <div className="p-4">
      <div
        className={cn(
          'grid gap-1.5 rounded-2xl p-4 text-sm leading-relaxed',
          tone === 'bad'
            ? 'bg-ds-status-bad-bg text-ds-status-bad-fg'
            : 'bg-ds-status-pending-bg text-ds-status-pending-fg',
        )}
        role={tone === 'bad' ? 'alert' : 'status'}
      >
        <b className="text-[15px]">{title}</b>
        <span>{children}</span>
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
  return (
    <div className="flex items-center rounded-xl bg-ds-primary text-white">
      <button
        aria-label={`One less ${label}`}
        className="grid h-9 w-9 place-items-center rounded-l-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        onClick={() => onChange(quantity - 1)}
        type="button"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span aria-live="polite" className="min-w-5 text-center text-sm font-bold tabular-nums">
        {quantity}
      </span>
      <button
        aria-label={`One more ${label}`}
        className="grid h-9 w-9 place-items-center rounded-r-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:opacity-40"
        disabled={quantity >= max}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

const maxFor = (item: KioskMenuItem & { stock?: number | null }) =>
  Math.min(MAX_PER_ITEM, item.stock ?? MAX_PER_ITEM);

function Ordering({
  onPlaced,
  restaurantId,
  token,
}: Readonly<{
  onPlaced: (order: { id: string; key: string }) => void;
  restaurantId: string;
  token: string;
}>) {
  const [cart, setCart] = useState<KioskCartLine[]>([]);
  const [step, setStep] = useState<'checkout' | 'menu'>('menu');
  const [category, setCategory] = useState('');
  const [dropped, setDropped] = useState<string[]>([]);
  const [channel, setChannel] = useState<QrChannel>('ROOM');
  const menuQuery = useQuery({
    // Switching room/pickup keeps this menu up until the other one is in: no blank page.
    placeholderData: (previous) => previous,
    queryFn: async () => (await publicOrganizationApi.getQrMenu(restaurantId, token, channel)).data,
    queryKey: ['qr-menu', restaurantId, token, channel],
    refetchInterval: 60_000,
  });
  const menu = menuQuery.data;
  // The kiosk's cart helpers take kiosk items; the QR menu has no featured row.
  const items = useMemo(
    () => (menu?.items ?? []).map((item) => ({ ...item, isFeatured: false })),
    [menu],
  );

  // A fresh menu keeps the cart honest: new prices, and what went off sale comes out.
  useEffect(() => {
    if (!menu) return;
    setCart((current) => {
      const next = reconcile(current, items);
      if (next.dropped.length) setDropped(next.dropped);
      return next.cart;
    });
  }, [items, menu]);

  if (menuQuery.isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 aria-label="Loading the menu" className="h-8 w-8 animate-spin text-ds-link" />
      </div>
    );
  }
  if (!menu) {
    return (
      <Notice tone="bad" title="This QR code is no longer valid">
        {getApiErrorMessage(menuQuery.error)} Please ask the ward staff for a new one.
      </Notice>
    );
  }

  const change = (item: KioskMenuItem, quantity: number) =>
    setCart((current) => setQuantity(current, item, quantity));

  return step === 'menu' ? (
    <MenuStep
      cart={cart}
      category={category}
      channel={channel}
      onChannel={setChannel}
      dropped={dropped}
      items={items}
      menu={menu}
      onCategory={setCategory}
      onChange={change}
      onCheckout={() => setStep('checkout')}
    />
  ) : (
    <CheckoutStep
      cart={cart}
      channel={channel}
      menu={menu}
      onBack={() => setStep('menu')}
      onChange={change}
      onPlaced={onPlaced}
      restaurantId={restaurantId}
      token={token}
    />
  );
}

function Header({ children, menu }: Readonly<{ children?: ReactNode; menu: QrMenu }>) {
  return (
    <header className="sticky top-0 z-10 grid gap-3 border-b border-ds-border bg-ds-surface/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold tracking-tight">{menu.restaurantName}</h1>
          <p className="truncate text-xs text-ds-muted">{menu.locationName}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
            menu.open
              ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
              : 'bg-ds-status-pending-bg text-ds-status-pending-fg',
          )}
        >
          {menu.open ? 'Open now' : 'Closed'}
        </span>
      </div>
      {children}
    </header>
  );
}

function MenuStep({
  cart,
  category,
  channel,
  dropped,
  items,
  menu,
  onCategory,
  onChange,
  onChannel,
  onCheckout,
}: Readonly<{
  cart: KioskCartLine[];
  category: string;
  channel: QrChannel;
  onChannel: (channel: QrChannel) => void;
  dropped: string[];
  items: Array<KioskMenuItem & { stock: number | null }>;
  menu: QrMenu;
  onCategory: (id: string) => void;
  onChange: (item: KioskMenuItem, quantity: number) => void;
  onCheckout: () => void;
}>) {
  const categories = [
    ...new Map(
      items.flatMap((item) => (item.category ? [[item.category.id, item.category]] : [])),
    ).values(),
  ];
  const shown = category ? items.filter((item) => item.category?.id === category) : items;
  const groups = [...new Set(shown.map((item) => item.category?.categoryName ?? 'Other'))];
  const totals = cartTotals(cart, 0);

  return (
    <>
      <Header menu={menu}>
        <div className="grid gap-1.5">
          <div
            aria-label="How you get your order"
            className="grid grid-cols-2 gap-1 rounded-xl bg-ds-subtle p-1"
            role="group"
          >
            {(
              [
                ['ROOM', 'Deliver to my room'],
                ['COUNTER', 'Pick up at counter'],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={channel === value}
                className={cn(
                  'rounded-lg px-2 py-2 text-[13px] font-bold',
                  channel === value ? 'bg-ds-surface text-ds-link shadow-xs' : 'text-ds-text-2',
                )}
                key={value}
                onClick={() => onChannel(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-ds-muted">
            {channel === 'ROOM'
              ? 'For patients and attendants: a steward brings it to your room.'
              : `For staff and visitors: collect it at ${menu.pickupCounter ?? 'the counter'} when it is ready.`}
          </p>
        </div>
        {categories.length > 1 ? (
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5"
            role="group"
            aria-label="Categories"
          >
            {[{ categoryName: 'All', id: '' }, ...categories].map((entry) => (
              <button
                aria-pressed={category === entry.id}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                  category === entry.id
                    ? 'border-ds-primary bg-ds-primary text-white'
                    : 'border-ds-border text-ds-text-2',
                )}
                key={entry.id || 'all'}
                onClick={() => onCategory(entry.id)}
                type="button"
              >
                {entry.categoryName}
              </button>
            ))}
          </div>
        ) : null}
      </Header>
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
      <main className="flex-1 px-4 pb-28 pt-2">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-ds-muted">
            Nothing is on the menu right now.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group}>
              <h2 className="pb-1 pt-4 text-[11px] font-bold uppercase tracking-widest text-ds-muted">
                {group}
              </h2>
              <ul className="divide-y divide-ds-divider">
                {shown
                  .filter((item) => (item.category?.categoryName ?? 'Other') === group)
                  .map((item) => {
                    const quantity = quantityOf(cart, item.id);

                    return (
                      <li className="flex items-center gap-3 py-3" key={item.id}>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-start gap-2 text-[15px] font-semibold leading-snug">
                            <span className="mt-0.5">
                              <FoodTypeMarker type={item.foodType} />
                            </span>
                            {item.itemName}
                          </p>
                          <p className="ml-6 mt-0.5 text-xs tabular-nums text-ds-muted">
                            {rupeesShort.format(item.price)}
                            {item.preparationTimeMinutes
                              ? ` · ready in about ${item.preparationTimeMinutes} min`
                              : ''}
                          </p>
                        </div>
                        {!menu.open ? null : quantity ? (
                          <Stepper
                            label={item.itemName}
                            max={maxFor(item)}
                            onChange={(next) => onChange(item, next)}
                            quantity={quantity}
                          />
                        ) : (
                          <button
                            className="rounded-xl border-[1.5px] border-ds-primary px-4 py-1.5 text-sm font-bold text-ds-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                            onClick={() => onChange(item, 1)}
                            type="button"
                          >
                            Add
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
        )}
      </main>
      {cart.length && menu.open ? (
        <footer className="sticky bottom-0 border-t border-ds-border bg-ds-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button
            className="flex w-full items-center justify-between rounded-2xl bg-ds-primary px-4 py-3.5 text-left font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            onClick={onCheckout}
            type="button"
          >
            <span>
              {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
              <span className="block text-xs font-medium opacity-85">
                {channel === 'ROOM' ? 'Room number and payment next' : 'Payment next'}
              </span>
            </span>
            <span className="tabular-nums">
              {rupeesShort.format(totals.grandTotal)} · View order
            </span>
          </button>
        </footer>
      ) : null}
    </>
  );
}

const inputClass =
  'w-full rounded-xl border-[1.5px] border-ds-border bg-ds-surface px-3 py-2.5 text-[15px] text-ds-text outline-hidden focus:border-ds-primary';

function CheckoutStep({
  cart,
  channel,
  menu,
  onBack,
  onChange,
  onPlaced,
  restaurantId,
  token,
}: Readonly<{
  cart: KioskCartLine[];
  channel: QrChannel;
  menu: QrMenu;
  onBack: () => void;
  onChange: (item: KioskMenuItem, quantity: number) => void;
  onPlaced: (order: { id: string; key: string }) => void;
  restaurantId: string;
  token: string;
}>) {
  const [roomNumber, setRoomNumber] = useState('');
  const [bedNumber, setBedNumber] = useState('');
  const [instructions, setInstructions] = useState('');
  const [staff, setStaff] = useState<{ code: string; percent: number; token: string } | null>(null);
  const [error, setError] = useState('');
  // One id per checkout: a double tap or a retry is the same order, not a second one.
  const clientOrderId = useRef(crypto.randomUUID());
  const totals = cartTotals(cart, staff?.percent ?? 0);
  const itemsTotal = cart.reduce((sum, { item, quantity }) => sum + item.price * quantity, 0);
  const toRoom = channel === 'ROOM';
  const pickupAt = menu.pickupCounter ?? 'the counter';

  const place = useMutation({
    mutationFn: async () =>
      (
        await publicOrganizationApi.createQrOrder(restaurantId, token, {
          bedNumber: (toRoom && bedNumber.trim()) || undefined,
          channel,
          clientOrderId: clientOrderId.current,
          instructions: instructions.trim() || undefined,
          lines: cart.map(({ item, quantity }) => ({ menuId: item.id, quantity })),
          returnUrl: returnUrlFor(window.location.href),
          roomNumber: toRoom ? roomNumber.trim() : undefined,
          staffToken: staff?.token,
        })
      ).data,
    onError: (failure) => setError(getApiErrorMessage(failure)),
    onSuccess: (order) => {
      onPlaced({ id: order.id, key: order.key });
      if (order.paymentUrl) window.location.assign(order.paymentUrl);
    },
  });

  useEffect(() => {
    if (cart.length === 0) onBack();
  }, [cart.length, onBack]);

  return (
    <>
      <header className="sticky top-0 z-10 grid gap-1 border-b border-ds-border bg-ds-surface px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          className="flex w-fit items-center gap-1 text-sm font-semibold text-ds-link"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" /> Menu
        </button>
        <h1 className="text-lg font-extrabold tracking-tight">Your order</h1>
      </header>
      <form
        className="grid flex-1 content-start gap-4 px-4 pb-32 pt-4"
        id="qr-checkout"
        onSubmit={(event) => {
          event.preventDefault();
          if (toRoom && !roomNumber.trim()) {
            setError('Enter your room number.');
            return;
          }
          setError('');
          place.mutate();
        }}
      >
        {toRoom ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-ds-text-2" htmlFor="qr-room">
              Room
              <input
                autoComplete="off"
                className={inputClass}
                id="qr-room"
                inputMode="text"
                maxLength={20}
                onChange={(event) => {
                  setRoomNumber(event.target.value);
                  setError('');
                }}
                value={roomNumber}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-ds-text-2" htmlFor="qr-bed">
              Bed (optional)
              <input
                autoComplete="off"
                className={inputClass}
                id="qr-bed"
                maxLength={20}
                onChange={(event) => setBedNumber(event.target.value)}
                value={bedNumber}
              />
            </label>
          </div>
        ) : (
          <p className="rounded-xl bg-ds-primary-soft px-3 py-2.5 text-[13px] font-semibold text-ds-link">
            Pick up at {pickupAt}. Show your order number when it is ready.
          </p>
        )}
        <label className="grid gap-1.5 text-xs font-semibold text-ds-text-2" htmlFor="qr-note">
          Note for the kitchen (optional)
          <input
            className={inputClass}
            id="qr-note"
            maxLength={200}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Less spicy, please"
            value={instructions}
          />
        </label>

        <ul className="grid gap-3">
          {cart.map(({ item, quantity }) => (
            <li className="flex items-center gap-3" key={item.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.itemName}</p>
                <p className="text-xs tabular-nums text-ds-muted">{money(item.price * quantity)}</p>
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

        {menu.staffDiscount ? (
          <StaffDiscount
            onConfirmed={setStaff}
            onRemove={() => setStaff(null)}
            restaurantId={restaurantId}
            staff={staff}
            token={token}
          />
        ) : null}

        <dl className="grid gap-1.5 text-sm tabular-nums">
          <Row label="Items" value={money(itemsTotal)} />
          {totals.discountTotal > 0 ? (
            <Row
              className="text-ds-status-ok-fg"
              label={`Staff discount (${staff?.percent ?? 0}%)`}
              value={`−${money(totals.discountTotal)}`}
            />
          ) : null}
          {totals.gstTotal > 0 ? <Row label="GST" value={money(totals.gstTotal)} /> : null}
          <Row
            className="border-t border-dashed border-ds-border pt-2 text-base font-extrabold"
            label="To pay"
            value={money(totals.grandTotal)}
          />
        </dl>
        <p className="text-xs leading-relaxed text-ds-muted">
          Prices include GST where it applies. The amount is confirmed on the payment page.
        </p>
        {error ? (
          <p className="text-sm font-semibold text-ds-status-bad-fg" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <footer className="sticky bottom-0 border-t border-ds-border bg-ds-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <button
          className="flex w-full items-center justify-between rounded-2xl bg-ds-primary px-4 py-3.5 text-left font-bold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          disabled={place.isPending || !menu.open}
          form="qr-checkout"
          type="submit"
        >
          <span>
            {place.isPending ? 'Opening the payment page…' : 'Pay by UPI'}
            <span className="block text-xs font-medium opacity-85">
              {!toRoom
                ? `Pick up at ${pickupAt}`
                : roomNumber.trim()
                  ? `Delivered to Room ${roomNumber.trim()}${bedNumber.trim() ? ` / Bed ${bedNumber.trim()}` : ''}`
                  : 'Google Pay, PhonePe, Paytm or any UPI app'}
            </span>
          </span>
          {place.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="tabular-nums">{rupeesShort.format(totals.grandTotal)}</span>
          )}
        </button>
      </footer>
    </>
  );
}

function Row({
  className,
  label,
  value,
}: Readonly<{ className?: string; label: string; value: string }>) {
  return (
    <div className={cn('flex justify-between gap-3', className)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const RESEND_SECONDS = 60;

function StaffDiscount({
  onConfirmed,
  onRemove,
  restaurantId,
  staff,
  token,
}: Readonly<{
  onConfirmed: (staff: { code: string; percent: number; token: string }) => void;
  onRemove: () => void;
  restaurantId: string;
  staff: { code: string; percent: number } | null;
  token: string;
}>) {
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setWait((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const send = useMutation({
    mutationFn: async () =>
      (await publicOrganizationApi.sendQrStaffOtp(restaurantId, token, code.trim())).data,
    onError: (failure) => setError(getApiErrorMessage(failure)),
    onSuccess: (sent) => {
      setError('');
      setOtp('');
      setSentTo(sent.sentTo);
      setWait(RESEND_SECONDS);
    },
  });
  const verify = useMutation({
    mutationFn: async () =>
      (await publicOrganizationApi.verifyQrStaffOtp(restaurantId, token, code.trim(), otp)).data,
    onError: (failure) => setError(getApiErrorMessage(failure)),
    onSuccess: (confirmed) => {
      setError('');
      onConfirmed({
        code: code.trim().toUpperCase(),
        percent: confirmed.discountPercent,
        token: confirmed.staffToken,
      });
    },
  });

  if (staff) {
    return (
      <section className="grid gap-1 rounded-2xl bg-ds-status-ok-bg p-3.5 text-ds-status-ok-fg">
        <h2 className="flex items-center justify-between text-sm font-bold">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Staff discount applied
          </span>
          <span>{staff.percent}%</span>
        </h2>
        <p className="text-xs">
          {staff.code} · good for 30 minutes on this phone.{' '}
          <button className="font-semibold underline" onClick={onRemove} type="button">
            Remove
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-ds-border bg-ds-subtle p-3.5">
      <h2 className="text-sm font-bold">Staff discount</h2>
      <p className="text-xs leading-relaxed text-ds-text-2">
        Max staff: enter your Employee ID. An OTP goes to the mobile number registered with it.
      </p>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="qr-employee">
          Employee ID
        </label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className={inputClass}
          id="qr-employee"
          maxLength={50}
          onChange={(event) => {
            setCode(event.target.value);
            setSentTo('');
          }}
          placeholder="Employee ID"
          value={code}
        />
        <button
          className="shrink-0 rounded-xl border-[1.5px] border-ds-primary bg-ds-surface px-3 text-sm font-bold text-ds-link disabled:opacity-50"
          disabled={!code.trim() || send.isPending || wait > 0}
          onClick={() => send.mutate()}
          type="button"
        >
          {send.isPending
            ? 'Sending…'
            : wait > 0
              ? `Resend in ${wait}s`
              : sentTo
                ? 'Resend'
                : 'Send OTP'}
        </button>
      </div>
      {sentTo ? (
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-ds-text-2" htmlFor="qr-otp">
            OTP sent to {sentTo}
          </label>
          <div className="flex gap-2">
            <input
              autoComplete="one-time-code"
              className={cn(inputClass, 'font-mono tracking-[.4em]')}
              id="qr-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              pattern="\d{6}"
              value={otp}
            />
            <button
              className="shrink-0 rounded-xl bg-ds-primary px-4 text-sm font-bold text-white disabled:opacity-50"
              disabled={otp.length !== 6 || verify.isPending}
              onClick={() => verify.mutate()}
              type="button"
            >
              {verify.isPending ? 'Checking…' : 'Verify'}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs font-semibold text-ds-status-bad-fg" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const stepDot: Record<StepState, string> = {
  done: 'border-ds-status-ok-fg bg-ds-status-ok-fg',
  now: 'border-ds-primary bg-ds-primary shadow-[inset_0_0_0_3px_rgb(var(--ds-surface))]',
  todo: 'border-ds-border',
};

function OrderProgress({
  onStartOver,
  order,
}: Readonly<{ onStartOver: () => void; order: { id: string; key: string } }>) {
  const orderQuery = useQuery({
    queryFn: async () => (await publicOrganizationApi.getQrOrder(order.id, order.key)).data,
    queryKey: ['qr-order', order.id],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && isSettled(data) ? false : 4000;
    },
  });
  const view = orderQuery.data;

  if (orderQuery.isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 aria-label="Checking your order" className="h-8 w-8 animate-spin text-ds-link" />
      </div>
    );
  }
  if (!view) {
    return (
      <>
        <Notice tone="bad" title="This order could not be found">
          {getApiErrorMessage(orderQuery.error)}
        </Notice>
        <StartAgain onClick={onStartOver} />
      </>
    );
  }

  if (view.status === 'AWAITING_PAYMENT') {
    return (
      <>
        <div className="grid flex-1 content-center justify-items-center gap-4 p-6 text-center">
          <Loader2 aria-hidden="true" className="h-14 w-14 animate-spin text-ds-link" />
          <div className="grid gap-1.5">
            <h1 className="text-lg font-extrabold">Waiting for your payment</h1>
            <p className="text-sm leading-relaxed text-ds-muted">
              Finish paying {money(view.grandTotal)} in your UPI app. This page updates by itself
              once the payment is confirmed.
            </p>
          </div>
        </div>
        <footer className="grid gap-2 border-t border-ds-border px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          {view.paymentUrl ? (
            <a
              className="block rounded-2xl bg-ds-primary px-4 py-3.5 text-center font-bold text-white"
              href={view.paymentUrl}
            >
              Open the payment page again
            </a>
          ) : null}
          <StartAgain label="Start a new order" onClick={onStartOver} />
        </footer>
      </>
    );
  }

  if (view.status === 'CLOSED') {
    return (
      <>
        <Notice tone="warn" title="This payment was not completed">
          The payment page closed before it was paid, so nothing was ordered or charged.
        </Notice>
        <StartAgain onClick={onStartOver} />
      </>
    );
  }

  if (view.status === 'PAID_NOT_BILLED') {
    return (
      <>
        <Notice tone="bad" title="Payment received, order not placed">
          {view.message} Amount paid: {money(view.grandTotal)}. Reference: {view.id.slice(0, 8)}.
        </Notice>
        <StartAgain onClick={onStartOver} />
      </>
    );
  }

  const cancelled = view.kitchenStatus === 'CANCELLED';

  return (
    <>
      <div className="grid flex-1 content-start justify-items-center gap-5 px-5 pb-8 pt-8 text-center">
        <span className="rounded-full bg-ds-status-ok-bg px-3 py-1 text-xs font-bold text-ds-status-ok-fg">
          Paid · {money(view.grandTotal)} · UPI
        </span>
        <div className="grid gap-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-ds-muted">
            Your order number
          </span>
          <span className="font-mono text-6xl font-semibold leading-none tracking-tight">
            {view.orderNumber}
          </span>
          <span className="font-mono text-xs text-ds-muted">Invoice {view.billNumber}</span>
        </div>
        {cancelled ? (
          <Notice tone="bad" title="This order was cancelled">
            Please ask at the counter about your refund.
          </Notice>
        ) : (
          <ol className="w-full text-left" aria-label="Order progress">
            {progressSteps(view).map((step) => (
              <li
                className="flex items-center gap-3 border-b border-ds-divider py-3 text-[15px] font-semibold last:border-b-0"
                key={step.label}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 rounded-full border-2',
                    stepDot[step.state],
                  )}
                />
                <span className={cn(step.state === 'todo' && 'text-ds-muted')}>{step.label}</span>
                <span className="sr-only">
                  {step.state === 'done' ? ' (done)' : step.state === 'now' ? ' (now)' : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className="border-t border-ds-border px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <StartAgain label="Place another order" onClick={onStartOver} />
      </footer>
    </>
  );
}

function StartAgain({
  label = 'Start again',
  onClick,
}: Readonly<{ label?: string; onClick: () => void }>) {
  return (
    <button
      className="w-full rounded-2xl px-4 py-3 text-center text-sm font-semibold text-ds-link"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
