'use client';

import type { KioskMenuItem } from '@aahar/api-client';
import { cn } from '@aahar/ui';
import { BadgePercent, ChevronLeft, Delete, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';
import { FoodTypeMarker } from '@/components/design-system';
import { cartTotals, MAX_PER_ITEM, type KioskCartLine } from '@/lib/kiosk';
import { card, formatRupees, KioskHeader, primaryButton, Stepper } from './kiosk-parts';

export interface StaffDiscount {
  discountPercent: number;
  mobile: string;
}

/** The on-screen number pad: a kiosk may have no keyboard at all. */
function Keypad({
  onChange,
  value,
}: Readonly<{ onChange: (value: string) => void; value: string }>) {
  const key =
    'grid h-[clamp(56px,9dvh,72px)] place-items-center rounded-[20px] bg-ds-subtle text-[30px] font-semibold tabular-nums active:scale-95 active:bg-ds-primary-soft';

  return (
    <div className="grid grid-cols-3 gap-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button
          className={key}
          disabled={value.length >= 10}
          key={digit}
          onClick={() => onChange(value + digit)}
          type="button"
        >
          {digit}
        </button>
      ))}
      <button className={cn(key, 'text-[20px]')} onClick={() => onChange('')} type="button">
        Clear
      </button>
      <button
        className={key}
        disabled={value.length >= 10}
        onClick={() => onChange(`${value}0`)}
        type="button"
      >
        0
      </button>
      <button
        aria-label="Delete last digit"
        className={key}
        onClick={() => onChange(value.slice(0, -1))}
        type="button"
      >
        <Delete aria-hidden="true" className="h-8 w-8" />
      </button>
    </div>
  );
}

/** Staff type their registered mobile; the discount is shown, and checked against their badge at the counter. */
function StaffPanel({
  onApply,
  onClose,
}: Readonly<{
  onApply: (mobile: string) => Promise<string | null>;
  onClose: () => void;
}>) {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const valid = /^[6-9]\d{9}$/.test(mobile);

  async function apply() {
    setChecking(true);
    setError((await onApply(mobile)) ?? '');
    setChecking(false);
  }

  return (
    <div
      aria-label="Staff discount"
      aria-modal="true"
      // Scrolls on a short screen, so Apply discount is always reachable.
      className="fixed inset-0 z-20 flex flex-col items-center justify-center-safe overflow-y-auto overscroll-contain bg-ds-text/30 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
    >
      <div className={cn(card, 'w-full max-w-[480px] shrink-0 bg-ds-surface p-5 sm:p-7')}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-bold">Hospital staff?</h2>
            <p className="mt-1 text-[18px] text-ds-text-3">
              Enter your registered mobile number. Show your staff ID card when you pay.
            </p>
          </div>
          <button
            aria-label="Close"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ds-subtle active:scale-95"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>
        <output
          aria-live="polite"
          className="mt-6 flex h-[76px] items-center justify-center rounded-[20px] border-2 border-ds-border text-[36px] font-bold tracking-[0.12em] tabular-nums"
        >
          {mobile || (
            <span className="text-[22px] tracking-normal text-ds-muted">10-digit mobile</span>
          )}
        </output>
        <p className="mt-2 min-h-[28px] text-center text-[18px] font-medium text-ds-status-bad-fg">
          {error}
        </p>
        <Keypad
          onChange={(value) => {
            setMobile(value);
            setError('');
          }}
          value={mobile}
        />
        <button
          className={cn(primaryButton, 'mt-5 w-full')}
          disabled={!valid || checking}
          onClick={() => void apply()}
          type="button"
        >
          {checking ? <LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin" /> : null}
          Apply discount
        </button>
      </div>
    </div>
  );
}

/** The order before it is placed: change quantities, add a staff discount, place it. */
export function KioskReviewScreen({
  cart,
  error,
  isPlacing,
  locationName,
  onApplyStaff,
  onBack,
  onPlace,
  onQuantity,
  onRemoveStaff,
  onStartOver,
  restaurantName,
  staff,
  staffDiscountOffered,
}: Readonly<{
  cart: readonly KioskCartLine[];
  error: string;
  isPlacing: boolean;
  locationName?: string;
  onApplyStaff: (mobile: string) => Promise<string | null>;
  onBack: () => void;
  onPlace: () => void;
  onQuantity: (item: KioskMenuItem, quantity: number) => void;
  onRemoveStaff: () => void;
  onStartOver: () => void;
  restaurantName?: string;
  staff: StaffDiscount | null;
  staffDiscountOffered: boolean;
}>) {
  const [isStaffOpen, setStaffOpen] = useState(false);
  const totals = cartTotals(cart, staff?.discountPercent ?? 0);
  // Guests read menu prices: the items at those prices, the discount, then only the GST (and
  // rounding) added on top of prices that do not include it.
  const itemsTotal = cart.reduce((sum, { item, quantity }) => sum + item.price * quantity, 0);
  const taxesAdded =
    Math.round((totals.grandTotal - (itemsTotal - totals.discountTotal)) * 100) / 100;
  const row = 'flex items-center justify-between text-[20px]';
  const placeBlock = (
    <>
      {error ? (
        <p
          className="rounded-[20px] bg-ds-status-bad-bg px-5 py-3 text-center text-[19px] font-medium text-ds-status-bad-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        className={cn(primaryButton, 'h-[84px] w-full text-[28px]')}
        disabled={isPlacing || cart.length === 0}
        onClick={onPlace}
        type="button"
      >
        {isPlacing ? <LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin" /> : null}
        Place order
      </button>
    </>
  );

  return (
    <>
      <KioskHeader
        locationName={locationName}
        onStartOver={onStartOver}
        restaurantName={restaurantName}
      />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 sm:px-10">
        {/* Wide screens: the order on the left, the bill and Place order beside it. */}
        <div className="mx-auto grid max-w-[860px] gap-5 lg:max-w-[1400px] lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-col gap-5">
            <button
              className="flex h-[60px] w-fit items-center gap-2 rounded-full pr-5 text-[20px] font-semibold text-ds-link active:scale-[0.98]"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="h-7 w-7" />
              Add more items
            </button>
            <h2 className="text-[34px] font-bold tracking-[-0.02em]">Your order</h2>
            <ul className={cn(card, 'divide-y divide-ds-divider')}>
              {cart.map(({ item, quantity }) => (
                // On a phone the name keeps the first row; − n + and the line total wrap below.
                <li
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6"
                  key={item.id}
                >
                  <FoodTypeMarker type={item.foodType} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-[22px] font-semibold">{item.itemName}</p>
                    <p className="text-[18px] text-ds-text-3 tabular-nums">
                      {formatRupees(item.price)} each
                    </p>
                  </div>
                  <Stepper
                    label={item.itemName}
                    max={MAX_PER_ITEM}
                    onChange={(next) => onQuantity(item, next)}
                    quantity={quantity}
                  />
                  <span className="ml-auto text-right text-[22px] font-bold tabular-nums sm:w-[110px]">
                    {formatRupees(item.price * quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {staffDiscountOffered ? (
              staff ? (
                <div className={cn(card, 'flex items-center gap-4 px-6 py-4')}>
                  <BadgePercent
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 text-ds-status-ok-fg"
                  />
                  <p className="min-w-0 flex-1 text-[20px]">
                    <span className="font-semibold">
                      {staff.discountPercent > 0
                        ? `${staff.discountPercent}% staff discount`
                        : 'No staff discount for your role here'}
                    </span>
                    <span className="block text-[17px] text-ds-text-3">
                      Mobile ending {staff.mobile.slice(-4)} · show your staff ID card when you pay
                    </span>
                  </p>
                  <button
                    className="h-14 rounded-full px-5 text-[18px] font-semibold text-ds-text-2 active:bg-ds-subtle"
                    onClick={onRemoveStaff}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  className={cn(
                    card,
                    'flex items-center gap-4 px-6 py-5 text-left active:scale-[0.99]',
                  )}
                  onClick={() => setStaffOpen(true)}
                  type="button"
                >
                  <BadgePercent aria-hidden="true" className="h-8 w-8 shrink-0 text-ds-link" />
                  <span className="flex-1 text-[20px] font-semibold">
                    Hospital staff? Get your staff discount
                  </span>
                </button>
              )
            ) : null}
          </div>
          <div className="flex flex-col gap-5 lg:sticky lg:top-0">
            <div className={cn(card, 'flex flex-col gap-2 bg-ds-surface px-6 py-5')}>
              <div className={row}>
                <span className="text-ds-text-3">Items</span>
                <span className="tabular-nums">{formatRupees(itemsTotal)}</span>
              </div>
              {totals.discountTotal > 0 ? (
                <div className={cn(row, 'text-ds-status-ok-fg')}>
                  <span>Staff discount</span>
                  <span className="tabular-nums">−{formatRupees(totals.discountTotal)}</span>
                </div>
              ) : null}
              {taxesAdded > 0 ? (
                <div className={row}>
                  <span className="text-ds-text-3">Taxes</span>
                  <span className="tabular-nums">{formatRupees(taxesAdded)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-ds-divider pt-4">
                <span className="text-[24px] font-bold">To pay at the counter</span>
                <span className="text-[34px] font-bold tabular-nums">
                  {formatRupees(totals.grandTotal)}
                </span>
              </div>
            </div>
            <div className="hidden flex-col gap-3 lg:flex">{placeBlock}</div>
          </div>
        </div>
      </main>
      <footer className="shrink-0 px-6 pb-6 pt-2 sm:px-10 lg:hidden">
        <div className="mx-auto flex max-w-[860px] flex-col gap-3">{placeBlock}</div>
      </footer>
      {isStaffOpen ? (
        <StaffPanel
          onApply={async (mobile) => {
            const problem = await onApplyStaff(mobile);
            if (!problem) setStaffOpen(false);
            return problem;
          }}
          onClose={() => setStaffOpen(false)}
        />
      ) : null}
    </>
  );
}
