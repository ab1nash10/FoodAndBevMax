'use client';

import type { KioskMenu, KioskMenuItem } from '@aahar/api-client';
import { cn } from '@aahar/ui';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpDown,
  BadgePercent,
  Check,
  CreditCard,
  Leaf,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import { categoryTone, categoryTones, foodEmoji } from '@/lib/food-emoji';
import {
  categoriesOf,
  nextSort,
  visibleItems,
  type KioskFilter,
  type KioskSort,
} from '@/lib/kiosk-browse';
import { MAX_PER_ITEM, cartTotals, quantityOf, type KioskCartLine } from '@/lib/kiosk';
import styles from './kiosk-screen.module.css';

const rupees = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  style: 'currency',
});
export const formatRupees = (value: number) => rupees.format(value);

const foodTypeLabel = { EGGETARIAN: 'Egg', NON_VEG: 'Non-veg', VEG: 'Veg' } as const;

/** India's veg / non-veg / egg mark: a square with a dot (a triangle for non-veg). */
function FoodMark({ type }: Readonly<{ type: KioskMenuItem['foodType'] }>) {
  const color =
    type === 'VEG'
      ? 'border-[#1d8a4b] text-[#1d8a4b]'
      : type === 'NON_VEG'
        ? 'border-[#b42339] text-[#b42339]'
        : 'border-[#c27c0e] text-[#c27c0e]';

  return (
    <span
      aria-label={foodTypeLabel[type]}
      className={cn(
        'grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border-2 bg-white',
        color,
      )}
      role="img"
    >
      {type === 'NON_VEG' ? (
        <span className="h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-current" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-current" />
      )}
    </span>
  );
}

/** A dish's full-colour picture: the screen's own food emoji, with a soft shadow under it. */
export function FoodPic({
  className,
  item,
}: Readonly<{ className?: string; item: Pick<KioskMenuItem, 'category' | 'itemName'> }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block select-none leading-none [font-family:"Segoe_UI_Emoji","Apple_Color_Emoji","Noto_Color_Emoji",sans-serif] drop-shadow-[0_12px_14px_rgba(0,0,0,.28)]',
        className,
      )}
    >
      {foodEmoji(item.itemName, item.category?.categoryName)}
    </span>
  );
}

/** Each category's colour, in the menu's order (set by the menu screen for its sheets). */
const ToneContext = createContext<(id: string | undefined) => string>(categoryTone);

/** The dish's picture on its category's colour, as a round plate. */
function ColourPlate({ className, item }: Readonly<{ className?: string; item: KioskMenuItem }>) {
  const toneOf = useContext(ToneContext);

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-linear-to-br',
        toneOf(item.category?.id),
        className,
      )}
    >
      <FoodPic className="text-[0.55em]" item={item} />
    </span>
  );
}

function Stepper({
  label,
  onChange,
  quantity,
  size = 'md',
}: Readonly<{
  label: string;
  onChange: (next: number) => void;
  quantity: number;
  size?: 'lg' | 'md';
}>) {
  const button = size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';

  return (
    <div className="flex items-center gap-3">
      <button
        aria-label={`One less ${label}`}
        className={cn(
          button,
          'grid place-items-center rounded-xl bg-ds-subtle text-ds-text-2 active:scale-95 disabled:opacity-40',
        )}
        disabled={quantity <= 0}
        onClick={() => onChange(quantity - 1)}
        type="button"
      >
        <Minus aria-hidden="true" className="h-5 w-5" />
      </button>
      <span
        aria-live="polite"
        className={cn(
          'min-w-8 text-center font-bold tabular-nums',
          size === 'lg' ? 'text-[26px]' : 'text-[20px]',
        )}
      >
        {quantity}
      </span>
      <button
        aria-label={`One more ${label}`}
        className={cn(
          button,
          'grid place-items-center rounded-xl bg-ds-primary text-white active:scale-95 disabled:opacity-40',
        )}
        disabled={quantity >= MAX_PER_ITEM}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <Plus aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  );
}

const dayAndTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
});

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

/** A bottom sheet over the menu: the dish, or the order. Tap outside or ✕ to close. */
function Sheet({
  children,
  footer,
  label,
  onClose,
}: Readonly<{ children: ReactNode; footer: ReactNode; label: string; onClose: () => void }>) {
  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="fixed inset-0 z-20 flex flex-col justify-end"
      role="dialog"
    >
      <button
        aria-label="Close"
        className={cn('absolute inset-0 bg-[#0b1a33]/55 backdrop-blur-[2px]', styles.scrim)}
        onClick={onClose}
        type="button"
      />
      <div
        className={cn(
          'relative mx-auto flex max-h-[90dvh] w-full max-w-[960px] flex-col overflow-hidden rounded-t-[32px] bg-ds-surface shadow-[0_-24px_60px_-30px_rgba(0,0,0,.5)]',
          styles.sheet,
        )}
      >
        <button
          aria-label="Close"
          className="absolute right-5 top-5 z-10 grid h-12 w-12 place-items-center rounded-full bg-ds-subtle text-ds-text-2"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="h-6 w-6" />
        </button>
        <div className="overflow-y-auto px-6 pb-6 pt-8 sm:px-10">{children}</div>
        {footer}
      </div>
    </div>
  );
}

const actionBar =
  'flex h-[84px] items-center justify-center gap-3 pb-[env(safe-area-inset-bottom)] text-[21px] font-extrabold uppercase tracking-wide active:brightness-95 disabled:opacity-60';

function ItemSheet({
  initial,
  item,
  onClose,
  onSave,
}: Readonly<{
  initial: number;
  item: KioskMenuItem;
  onClose: () => void;
  onSave: (quantity: number) => void;
}>) {
  const [quantity, setQuantity] = useState(Math.max(1, initial));
  const removing = initial > 0 && quantity === 0;

  return (
    <Sheet
      footer={
        <button
          className={cn(actionBar, 'w-full shrink-0 bg-ds-primary text-white')}
          onClick={() => {
            onSave(quantity);
            onClose();
          }}
          type="button"
        >
          {removing ? 'Remove from order' : initial > 0 ? 'Update order' : 'Add to order'}
          {removing ? null : (
            <>
              <span className="opacity-60">·</span>
              <span className="tabular-nums">{formatRupees(item.price * quantity)}</span>
            </>
          )}
          <ArrowRight aria-hidden="true" className="h-6 w-6" />
        </button>
      }
      label={item.itemName}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <ColourPlate
          className="h-[210px] w-[210px] text-[210px] shadow-[0_24px_50px_-24px_rgba(0,0,0,.55)]"
          item={item}
        />
        <h2 className="max-w-[18ch] text-[34px] font-black uppercase leading-[1.02] tracking-[-0.02em] text-balance">
          {item.itemName}
        </h2>
        <p className="flex flex-wrap items-center justify-center gap-2 text-[17px] font-semibold uppercase tracking-wide text-ds-text-3">
          <FoodMark type={item.foodType} />
          {foodTypeLabel[item.foodType]}
          {item.category ? <> · {item.category.categoryName}</> : null}
          {item.preparationTimeMinutes ? (
            <> · ready in about {item.preparationTimeMinutes} min</>
          ) : null}
        </p>
        <p className="text-[34px] font-black tabular-nums text-ds-link">
          {formatRupees(item.price)}
        </p>
        <Stepper
          label={item.itemName}
          onChange={(next) =>
            setQuantity(Math.max(initial > 0 ? 0 : 1, Math.min(MAX_PER_ITEM, next)))
          }
          quantity={quantity}
          size="lg"
        />
      </div>
    </Sheet>
  );
}

/** A staff member's discount, confirmed by an OTP to their registered mobile. */
export interface StaffDiscount {
  code: string;
  percent: number;
  token: string;
}

function StaffDiscountRow({
  onConfirmed,
  onRemove,
  restaurantId,
  staff,
  token,
}: Readonly<{
  onConfirmed: (staff: StaffDiscount) => void;
  onRemove: () => void;
  restaurantId: string;
  staff: StaffDiscount | null;
  token: string;
}>) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (staff) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-ds-status-ok-bg px-5 py-4 text-ds-status-ok-fg">
        <BadgePercent aria-hidden="true" className="h-7 w-7 shrink-0" />
        <p className="flex-1 text-[18px] font-bold">
          {staff.percent}% staff discount applied
          <span className="block text-[15px] font-medium">Employee ID {staff.code}</span>
        </p>
        <button className="text-[16px] font-bold underline" onClick={onRemove} type="button">
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ds-primary-border px-5 py-4 text-left text-[18px] font-bold text-ds-link"
        onClick={() => setOpen(true)}
        type="button"
      >
        <BadgePercent aria-hidden="true" className="h-7 w-7" />
        Max staff? Get your staff discount
      </button>
    );
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(getApiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const input =
    'h-14 min-w-0 flex-1 rounded-xl border-2 border-ds-border bg-ds-surface px-4 text-[22px] tabular-nums tracking-wider outline-hidden focus:border-ds-primary';
  const button =
    'h-14 shrink-0 rounded-xl bg-ds-primary px-6 text-[18px] font-bold text-white disabled:opacity-50';

  return (
    <div className="grid gap-3 rounded-2xl bg-ds-subtle p-4">
      <label className="text-[17px] font-bold" htmlFor="kiosk-staff-code">
        Your Employee ID
      </label>
      <div className="flex gap-3">
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className={cn(input, 'uppercase')}
          id="kiosk-staff-code"
          maxLength={50}
          onChange={(event) => {
            setCode(event.target.value);
            setSentTo('');
          }}
          value={code}
        />
        <button
          className={button}
          disabled={!code.trim() || busy}
          onClick={() =>
            void run(async () => {
              const { data } = await publicOrganizationApi.sendQrStaffOtp(
                restaurantId,
                token,
                code.trim(),
              );
              setSentTo(data.sentTo);
              setOtp('');
            })
          }
          type="button"
        >
          {sentTo ? 'Resend' : 'Send OTP'}
        </button>
      </div>
      {sentTo ? (
        <>
          <label className="text-[17px] font-bold" htmlFor="kiosk-staff-otp">
            OTP sent to {sentTo}
          </label>
          <div className="flex gap-3">
            <input
              autoComplete="one-time-code"
              className={cn(input, 'font-mono tracking-[.4em]')}
              id="kiosk-staff-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              value={otp}
            />
            <button
              className={button}
              disabled={otp.length !== 6 || busy}
              onClick={() =>
                void run(async () => {
                  const { data } = await publicOrganizationApi.verifyQrStaffOtp(
                    restaurantId,
                    token,
                    code.trim(),
                    otp,
                  );
                  onConfirmed({
                    code: code.trim().toUpperCase(),
                    percent: data.discountPercent,
                    token: data.staffToken,
                  });
                })
              }
              type="button"
            >
              Verify
            </button>
          </div>
        </>
      ) : null}
      {error ? (
        <p className="text-[16px] font-semibold text-ds-status-bad-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CartSheet({
  cart,
  error,
  isPlacing,
  onClose,
  onPay,
  onQuantity,
  onStaff,
  payWith,
  restaurantId,
  staff,
  staffDiscountOffered,
  token,
}: Readonly<{
  cart: KioskCartLine[];
  error: string;
  isPlacing: boolean;
  onClose: () => void;
  onPay: (method: 'CARD' | 'UPI') => void;
  onQuantity: (item: KioskMenuItem, quantity: number) => void;
  onStaff: (staff: StaffDiscount | null) => void;
  payWith: Array<'CARD' | 'UPI'>;
  restaurantId: string;
  staff: StaffDiscount | null;
  staffDiscountOffered: boolean;
  token: string;
}>) {
  const totals = cartTotals(cart, staff?.percent ?? 0);

  useEffect(() => {
    if (cart.length === 0) onClose();
  }, [cart.length, onClose]);

  return (
    <Sheet
      footer={
        <div className={cn('grid shrink-0', payWith.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {payWith.includes('UPI') ? (
            <button
              className={cn(actionBar, 'bg-ds-primary text-white')}
              disabled={isPlacing}
              onClick={() => onPay('UPI')}
              type="button"
            >
              <QrCode aria-hidden="true" className="h-7 w-7" />
              Pay by UPI
            </button>
          ) : null}
          {payWith.includes('CARD') ? (
            <button
              className={cn(actionBar, 'bg-ds-text text-ds-surface')}
              disabled={isPlacing}
              onClick={() => onPay('CARD')}
              type="button"
            >
              <CreditCard aria-hidden="true" className="h-7 w-7" />
              Pay by card
            </button>
          ) : null}
        </div>
      }
      label="Your order"
      onClose={onClose}
    >
      <h2 className="text-center text-[30px] font-black uppercase tracking-[-0.01em]">
        Your order
      </h2>
      <ul className="mt-5 divide-y divide-ds-divider">
        {cart.map(({ item, quantity }) => (
          <li className="flex items-center gap-4 py-4" key={item.id}>
            <ColourPlate className="h-16 w-16 text-[64px]" item={item} />
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-extrabold uppercase leading-tight">{item.itemName}</p>
              <p className="text-[15px] font-medium uppercase tracking-wide text-ds-text-3">
                {formatRupees(item.price)} each
              </p>
            </div>
            <Stepper
              label={item.itemName}
              onChange={(next) => onQuantity(item, next)}
              quantity={quantity}
            />
            <span className="w-24 shrink-0 text-right text-[21px] font-black tabular-nums">
              {formatRupees(item.price * quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4">
        {staffDiscountOffered ? (
          <StaffDiscountRow
            onConfirmed={onStaff}
            onRemove={() => onStaff(null)}
            restaurantId={restaurantId}
            staff={staff}
            token={token}
          />
        ) : null}
        <div className="grid gap-2 rounded-2xl bg-ds-subtle px-6 py-5 text-[18px] tabular-nums">
          {totals.discountTotal > 0 ? (
            <p className="flex justify-between text-ds-status-ok-fg">
              <span>Staff discount</span>
              <span>−{formatRupees(totals.discountTotal)}</span>
            </p>
          ) : null}
          <p className="flex justify-between text-[22px] font-black uppercase">
            <span>To pay</span>
            <span>{formatRupees(totals.grandTotal)}</span>
          </p>
          <p className="text-[15px] font-medium text-ds-text-3">
            Includes GST. Pay here by{' '}
            {payWith.length > 1 ? 'UPI or card' : payWith[0] === 'CARD' ? 'card' : 'UPI'}; your
            order goes to the kitchen once it is paid.
          </p>
        </div>
        {error ? (
          <p className="text-[17px] font-semibold text-ds-status-bad-fg" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * The kiosk's menu, after the reference: a deep blue header with the question and today's date,
 * then a white sheet with the category rail, filter chips and bold colour dish tiles, and Cart /
 * Checkout along the bottom. Tapping a dish opens its sheet; Cart and Checkout open the order,
 * which is paid here by UPI or card.
 */
export function KioskMenuScreen({
  cart,
  error,
  isPlacing,
  menu,
  onPay,
  onQuantity,
  onStaff,
  onStartOver,
  restaurantId,
  staff,
  token,
}: Readonly<{
  cart: KioskCartLine[];
  error: string;
  isPlacing: boolean;
  menu: KioskMenu;
  onPay: (method: 'CARD' | 'UPI') => void;
  onQuantity: (item: KioskMenuItem, quantity: number) => void;
  onStaff: (staff: StaffDiscount | null) => void;
  onStartOver: () => void;
  restaurantId: string;
  staff: StaffDiscount | null;
  token: string;
}>) {
  const now = useClock();
  const [category, setCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<KioskFilter>('all');
  const [sort, setSort] = useState<KioskSort>('menu');
  const [open, setOpen] = useState<KioskMenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const categories = categoriesOf(menu.items);
  const tones = categoryTones(categories.map((entry) => entry.id));
  const toneOf = (id: string | undefined) => tones.get(id ?? '') ?? categoryTone(id);
  const items = visibleItems(menu.items, { category, filter, sort });
  const totals = cartTotals(cart, staff?.percent ?? 0);
  const hero = menu.items.find((item) => item.isFeatured) ?? menu.items[0];
  const hasFeatured = menu.items.some((item) => item.isFeatured);
  const SortIcon = sort === 'high' ? ArrowDownUp : ArrowUpDown;
  const chips: Array<{ icon?: ReactNode; label: string; value: KioskFilter }> = [
    { label: 'All', value: 'all' },
    ...(hasFeatured
      ? [
          {
            icon: <Sparkles aria-hidden="true" className="h-4 w-4" />,
            label: 'Featured',
            value: 'featured' as const,
          },
        ]
      : []),
    { icon: <Leaf aria-hidden="true" className="h-4 w-4" />, label: 'Veg', value: 'veg' },
  ];
  const short = '[@media(max-height:900px)]:';

  // A payment that did not go through comes back to the order sheet, to try again.
  useEffect(() => {
    if (error) setCartOpen(true);
  }, [error]);

  return (
    <ToneContext.Provider value={toneOf}>
      <div className="flex h-full flex-col bg-[#0b2a55]">
        <header
          className={cn(
            'relative shrink-0 overflow-hidden bg-[radial-gradient(120%_90%_at_85%_10%,#2477cf_0%,#0b57a4_38%,#0b2a55_100%)] px-6 pb-14 pt-6 text-white sm:px-9',
            `${short}pb-11 ${short}pt-4`,
          )}
        >
          <div className="relative z-20 flex items-center justify-between gap-3">
            <button
              className="flex h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-[15px] font-bold uppercase tracking-wide"
              onClick={onStartOver}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Start over
            </button>
            <span className="rounded-full bg-white/12 px-4 py-2.5 text-[14px] font-bold uppercase tracking-wide tabular-nums">
              {dayAndTime.format(now)}
            </span>
          </div>
          <div className={cn('relative z-10 mt-7 max-w-[62%]', `${short}mt-3`)}>
            <p className="text-[15px] font-bold uppercase tracking-[0.16em] text-white/70">
              {menu.restaurantName} · {menu.locationName}
            </p>
            <h1
              className={cn(
                'mt-2 text-[clamp(38px,6.4vw,64px)] font-black uppercase leading-[0.95] tracking-[-0.035em] text-balance',
                `${short}text-[clamp(28px,5vh,44px)]`,
              )}
            >
              What would you like today?
            </h1>
            <p
              className={cn(
                'mt-3 text-[16px] font-semibold uppercase tracking-wide text-white/80',
                `${short}mt-1.5 ${short}text-[14px]`,
              )}
            >
              Order and pay right here. Your food goes to the kitchen once it is paid.
            </p>
          </div>
          {hero ? (
            <FoodPic
              className={cn(
                'absolute right-[3%] top-[58%] z-0 -translate-y-1/2 -rotate-[8deg] text-[min(26vw,26vh,240px)] drop-shadow-[0_24px_30px_rgba(0,0,0,.45)]',
                `${short}text-[18vh]`,
              )}
              item={hero}
            />
          ) : null}
        </header>

        <main className="relative z-10 -mt-8 flex min-h-0 flex-1 overflow-hidden rounded-t-[32px] bg-ds-surface">
          <nav
            aria-label="Categories"
            className="flex w-[118px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-ds-divider px-3 py-4 sm:w-[136px]"
          >
            {[
              { count: menu.items.length, id: null as string | null, name: 'All' },
              ...categories,
            ].map((entry) => {
              const active = category === entry.id;

              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl px-2 py-3.5 text-center text-[13px] font-bold uppercase leading-tight tracking-wide',
                    active
                      ? 'bg-ds-primary text-white shadow-[0_12px_28px_-14px_rgba(11,87,164,.8)]'
                      : 'text-ds-text-2',
                  )}
                  key={entry.id ?? 'all'}
                  onClick={() => setCategory(entry.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      'grid h-14 w-14 place-items-center rounded-full',
                      active ? 'bg-white/15' : 'bg-linear-to-br ' + toneOf(entry.id ?? undefined),
                    )}
                  >
                    <FoodPic
                      className="text-[30px] drop-shadow-[0_4px_5px_rgba(0,0,0,.25)]"
                      item={{ category: null, itemName: entry.id === null ? 'All' : entry.name }}
                    />
                  </span>
                  {entry.name}
                </button>
              );
            })}
          </nav>

          <section aria-label="Dishes" className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-4 pb-2 pt-4 sm:px-5">
              {chips.map((chip) => (
                <button
                  aria-pressed={filter === chip.value}
                  className={cn(
                    'flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold uppercase tracking-wide',
                    filter === chip.value
                      ? 'bg-ds-text text-ds-surface'
                      : 'bg-ds-subtle text-ds-text-2',
                  )}
                  key={chip.value}
                  onClick={() => setFilter(chip.value)}
                  type="button"
                >
                  {chip.icon}
                  {chip.label}
                </button>
              ))}
              <button
                aria-label={
                  sort === 'menu'
                    ? 'Sort by price, low to high'
                    : sort === 'low'
                      ? 'Sort by price, high to low'
                      : 'Back to menu order'
                }
                className={cn(
                  'ml-auto flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold uppercase',
                  sort === 'menu' ? 'text-ds-text-2' : 'bg-ds-primary-soft text-ds-link',
                )}
                onClick={() => setSort(nextSort(sort))}
                type="button"
              >
                <SortIcon aria-hidden="true" className="h-5 w-5" />
                {sort === 'menu' ? null : sort === 'low' ? 'Price ↑' : 'Price ↓'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[120px] pt-2 sm:px-5">
              {items.length === 0 ? (
                <p className="py-16 text-center text-[19px] font-semibold text-ds-text-3">
                  Nothing here right now. Try another category.
                </p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                  {items.map((item) => {
                    const quantity = quantityOf(cart, item.id);

                    return (
                      <li key={item.id}>
                        <button
                          className={cn(
                            'relative flex aspect-square w-full flex-col overflow-hidden rounded-[20px] bg-linear-to-br p-3.5 text-left text-white shadow-[0_14px_30px_-18px_rgba(0,0,0,.6)] active:scale-[0.98]',
                            toneOf(item.category?.id),
                          )}
                          onClick={() => setOpen(item)}
                          type="button"
                        >
                          <span className="relative z-10 flex items-start gap-2">
                            <span className="line-clamp-3 flex-1 text-[17px] font-black uppercase leading-[1.04] tracking-[-0.01em] [text-shadow:0_1px_2px_rgba(0,0,0,.18)]">
                              {item.itemName}
                            </span>
                            <FoodMark type={item.foodType} />
                          </span>
                          <span className="relative z-10 mt-auto w-fit rounded-full bg-white px-3 py-1 text-[17px] font-black tabular-nums text-[#0e1a2b]">
                            {formatRupees(item.price)}
                          </span>
                          <FoodPic
                            className="absolute -bottom-[6%] -right-[6%] text-[min(92px,26vw)] -rotate-[6deg]"
                            item={item}
                          />
                          {quantity > 0 ? (
                            <span className="absolute left-3 top-[48%] z-10 flex items-center gap-1 rounded-full bg-[#0e1a2b] px-3 py-1 text-[13px] font-bold text-white">
                              <Check aria-hidden="true" className="h-4 w-4" />
                              {quantity} in order
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-10 grid h-[88px] grid-cols-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_-20px_rgba(0,0,0,.45)]">
          <button
            className="flex items-center justify-center gap-3 bg-ds-surface text-[20px] font-extrabold uppercase tracking-wide text-ds-text"
            disabled={cart.length === 0}
            onClick={() => setCartOpen(true)}
            type="button"
          >
            <ShoppingBag aria-hidden="true" className="h-6 w-6" />
            Cart
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-ds-subtle px-2 text-[16px] tabular-nums">
              {totals.itemCount}
            </span>
          </button>
          <button
            className="flex items-center justify-center gap-3 bg-ds-primary text-[20px] font-extrabold uppercase tracking-wide text-white disabled:bg-[#a9c3e3] disabled:bg-none"
            disabled={cart.length === 0}
            onClick={() => setCartOpen(true)}
            type="button"
          >
            Checkout
            {cart.length > 0 ? (
              <span className="tabular-nums">· {formatRupees(totals.grandTotal)}</span>
            ) : null}
            <ArrowRight aria-hidden="true" className="h-6 w-6" />
          </button>
        </footer>

        {open ? (
          <ItemSheet
            initial={quantityOf(cart, open.id)}
            item={open}
            key={open.id}
            onClose={() => setOpen(null)}
            onSave={(quantity) => onQuantity(open, quantity)}
          />
        ) : null}
        {cartOpen && cart.length > 0 ? (
          <CartSheet
            cart={cart}
            error={error}
            isPlacing={isPlacing}
            onClose={() => setCartOpen(false)}
            onPay={onPay}
            onQuantity={onQuantity}
            onStaff={onStaff}
            payWith={menu.payWith}
            restaurantId={restaurantId}
            staff={staff}
            staffDiscountOffered={menu.staffDiscount}
            token={token}
          />
        ) : null}
      </div>
    </ToneContext.Provider>
  );
}
