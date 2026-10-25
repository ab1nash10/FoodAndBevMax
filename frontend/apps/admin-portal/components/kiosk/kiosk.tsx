'use client';

import { ApiClientError, type KioskMenuItem, type KioskOrder } from '@aahar/api-client';
import { cn } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Hand,
  Link2Off,
  LoaderCircle,
  Receipt,
  Utensils,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import { reconcile, setQuantity, type KioskCartLine } from '@/lib/kiosk';
import { useBoardTheme, useWakeLock } from '@/lib/order-board/live';
import { queryKeys } from '@/lib/query-keys';
import { KioskMenuScreen } from './kiosk-menu';
import {
  card,
  FoodArt,
  formatRupees,
  KioskBackdrop,
  KioskLogo,
  primaryButton,
} from './kiosk-parts';
import { KioskReviewScreen, type StaffDiscount } from './kiosk-review';

type Screen = 'welcome' | 'menu' | 'review' | 'done';

/** Untouched this long while ordering, the kiosk asks whether anyone is still there… */
const IDLE_MS = 60_000;
/** …and starts over after this much more, so the next guest never sees someone else's order. */
const WARNING_MS = 15_000;
/** The order number stays up this long for the guest to read, then the kiosk is ready again. */
const DONE_MS = 30_000;

// crypto.randomUUID needs https; a kiosk on a plain http address still needs an id.
function newClientOrderId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isInvalidLink(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 404 || error.status === 400);
}

/** Seconds left before the kiosk starts over, once it has been left alone; null while in use. */
function useIdleCountdown(active: boolean, onTimeout: () => void): number | null {
  const [left, setLeft] = useState<number | null>(null);
  const timeout = useRef(onTimeout);

  useEffect(() => {
    timeout.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!active) return undefined;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
      setLeft(null);
    };
    const timer = window.setInterval(() => {
      const idle = Date.now() - last;
      if (idle >= IDLE_MS + WARNING_MS) {
        setLeft(null);
        timeout.current();
      } else if (idle >= IDLE_MS) {
        setLeft(Math.ceil((IDLE_MS + WARNING_MS - idle) / 1000));
      }
    }, 250);

    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      setLeft(null);
    };
  }, [active]);

  return left;
}

function Message({ children, icon }: Readonly<{ children: ReactNode; icon: ReactNode }>) {
  return (
    <div className="grid h-full place-items-center p-10">
      <div className="flex max-w-[640px] flex-col items-center gap-5 text-center">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-ds-surface text-ds-text-2 shadow-lg">
          {icon}
        </span>
        <div className="text-[26px] font-semibold leading-snug">{children}</div>
      </div>
    </div>
  );
}

function Welcome({
  items,
  locationName,
  onStart,
  restaurantName,
}: Readonly<{
  items: readonly KioskMenuItem[];
  locationName?: string;
  onStart: () => void;
  restaurantName?: string;
}>) {
  const steps = [
    { icon: Utensils, label: 'Pick your food' },
    { icon: Receipt, label: 'Get your order number' },
    { icon: CheckCircle2, label: 'Pay at the counter and collect' },
  ];
  // A taste of today's menu beside the welcome, on a wide screen: the restaurant's Featured
  // items, or the start of the menu when it has marked none.
  const marked = items.filter((item) => item.isFeatured);
  const featured = (marked.length > 0 ? marked : items).slice(0, 4);

  return (
    <button
      className="flex h-full w-full items-center-safe justify-center-safe overflow-y-auto p-6 text-center sm:p-10 lg:text-left"
      onClick={onStart}
      type="button"
    >
      <span className="grid w-full max-w-[1500px] items-center gap-[6vh] lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <span className="flex flex-col items-center gap-[5vh] lg:items-start">
          <KioskLogo size={96} />
          <span>
            <span className="block text-[24px] font-semibold uppercase tracking-[0.18em] text-ds-text-3">
              Welcome to
            </span>
            <h1 className="mt-3 bg-(image:--ds-primary-gradient) bg-clip-text text-[clamp(48px,6.5vw,104px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-transparent">
              {restaurantName ?? 'AAHAR'}
            </h1>
            {locationName ? (
              <span className="mt-3 block text-[24px] font-medium text-ds-text-3">
                {locationName}
              </span>
            ) : null}
          </span>
          {/* Stacked full width on a phone, where the number alone leads each step. */}
          <ol className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4 lg:justify-start">
            {steps.map(({ icon: Icon, label }, index) => (
              <li
                className={cn(
                  card,
                  'flex items-center gap-3 px-5 py-4 text-left text-[18px] font-semibold sm:px-6 sm:text-[20px]',
                )}
                key={label}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ds-primary text-[18px] font-bold text-white">
                  {index + 1}
                </span>
                <Icon
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 text-ds-text-3 max-sm:hidden"
                />
                {label}
              </li>
            ))}
          </ol>
          <span
            className={cn(
              primaryButton,
              'h-[clamp(72px,12.5vw,96px)] shrink-0 whitespace-nowrap px-[clamp(28px,8vw,64px)] text-[clamp(24px,5vw,34px)]',
            )}
          >
            <Hand aria-hidden="true" className="h-9 w-9 shrink-0" />
            Tap to order
          </span>
        </span>
        {featured.length > 0 ? (
          <span aria-hidden="true" className="hidden grid-cols-2 gap-5 lg:grid">
            {featured.map((item, index) => (
              <span
                className={cn(
                  card,
                  'flex flex-col overflow-hidden bg-ds-surface',
                  index % 2 === 1 && 'translate-y-10',
                )}
                key={item.id}
              >
                <FoodArt
                  category={item.category?.categoryName}
                  categoryId={item.category?.id}
                  className="aspect-[4/3] w-full"
                  name={item.itemName}
                />
                <span className="flex items-center justify-between gap-3 p-5">
                  <span className="truncate text-[22px] font-semibold">{item.itemName}</span>
                  <span className="shrink-0 text-[22px] font-bold tabular-nums text-ds-link">
                    {formatRupees(item.price)}
                  </span>
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Done({ onNext, order }: Readonly<{ onNext: () => void; order: KioskOrder }>) {
  const [left, setLeft] = useState(DONE_MS / 1000);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((DONE_MS - (Date.now() - started)) / 1000);
      if (remaining <= 0) onNext();
      else setLeft(remaining);
    }, 250);

    return () => window.clearInterval(timer);
  }, [onNext]);

  return (
    // Safe centring: on a short screen the top stays in view and the rest scrolls (no child
    // shrinks to fit instead).
    <div className="flex h-full flex-col items-center justify-center-safe gap-[clamp(16px,3vh,32px)] overflow-y-auto p-6 text-center *:shrink-0 sm:p-8">
      <p className="flex items-center gap-3 text-[26px] font-semibold text-ds-status-ok-fg">
        <CheckCircle2 aria-hidden="true" className="h-9 w-9" />
        Order placed
      </p>
      {/* A ticket: the number on blue up top, a tear line, then what to pay and what was ordered. */}
      <div className={cn(card, 'w-full max-w-[640px] overflow-hidden bg-ds-surface p-0')}>
        <div className="bg-ds-primary px-6 pb-7 pt-6 text-white">
          <p className="text-[22px] font-semibold text-white">Your order number</p>
          <p
            aria-live="polite"
            className="text-[clamp(96px,min(22vw,18vh),220px)] font-extrabold leading-none tracking-[-0.05em] tabular-nums"
          >
            {order.number}
          </p>
        </div>
        <div aria-hidden="true" className="mx-6 border-t-2 border-dashed border-ds-border" />
        <div className="px-5 py-6 sm:px-8">
          <p className="text-[28px] font-bold">
            Pay {formatRupees(order.grandTotal)} at the counter
          </p>
          <p className="mt-2 text-[20px] text-ds-text-3">
            Tell the cashier your order number. Once you have paid, watch the board for the order
            number on your bill.
            {order.discountTotal > 0 ? ' Show your staff ID card for the discount.' : ''}
          </p>
          <ul className="mt-5 flex flex-col gap-1 border-t border-ds-divider pt-4 text-left text-[19px]">
            {order.lines.map((line) => (
              <li className="flex justify-between gap-4" key={line.menuId}>
                {/* Wraps rather than cuts: this list is the guest's check of what they ordered. */}
                <span className="min-w-0">
                  {line.quantity} × {line.itemName}
                </span>
                <span className="shrink-0 tabular-nums text-ds-text-3">
                  {formatRupees(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button className={primaryButton} onClick={onNext} type="button">
        Done · next order in {left}s
      </button>
    </div>
  );
}

/**
 * The restaurant's self-service kiosk: the guest picks food, places the order and gets a number,
 * and pays at the counter, where the cashier loads it by that number. Starts over by itself when
 * left alone, so nobody walks up to someone else's order.
 */
export function Kiosk({
  restaurantId,
  token,
}: Readonly<{ restaurantId: string; token: string | undefined }>) {
  useWakeLock();
  useBoardTheme('light');
  const [screen, setScreen] = useState<Screen>('welcome');
  const [pickedCart, setPickedCart] = useState<KioskCartLine[]>([]);
  const [staff, setStaff] = useState<StaffDiscount | null>(null);
  const [placed, setPlaced] = useState<KioskOrder | null>(null);
  const [error, setError] = useState('');
  const [clientOrderId, setClientOrderId] = useState(newClientOrderId);

  const menuQuery = useQuery({
    enabled: Boolean(token),
    queryFn: async () => (await publicOrganizationApi.getKioskMenu(restaurantId, token!)).data,
    queryKey: queryKeys.kioskMenu(restaurantId),
    // Items come and go with meal times; a minute is soon enough and light on the server.
    refetchInterval: (current) => (isInvalidLink(current.state.error) ? false : 60_000),
    refetchIntervalInBackground: true,
    retry: (count, failure) => !isInvalidLink(failure) && count < 2,
  });
  const menu = menuQuery.data;
  // The cart always follows the latest menu: its prices, and only what is still on sale.
  const { cart, dropped } = useMemo(
    () => (menu ? reconcile(pickedCart, menu.items) : { cart: pickedCart, dropped: [] }),
    [menu, pickedCart],
  );

  const reset = useCallback(() => {
    setPickedCart([]);
    setStaff(null);
    setPlaced(null);
    setError('');
    setClientOrderId(newClientOrderId());
    setScreen('welcome');
  }, []);
  const idleLeft = useIdleCountdown(screen === 'menu' || screen === 'review', reset);

  const changeQuantity = (item: KioskMenuItem, quantity: number) => {
    setError('');
    setPickedCart(setQuantity(cart, item, quantity));
  };

  const place = useMutation({
    mutationFn: async () =>
      (
        await publicOrganizationApi.createKioskOrder(restaurantId, token!, {
          clientOrderId,
          lines: cart.map(({ item, quantity }) => ({ menuId: item.id, quantity })),
          mobile: staff?.mobile,
        })
      ).data,
    onError: (failure) => {
      setError(
        failure instanceof ApiClientError
          ? getApiErrorMessage(failure)
          : 'We could not reach the kitchen. Please try again, or order at the counter.',
      );
      void menuQuery.refetch();
    },
    onSuccess: (order) => {
      setPlaced(order);
      setScreen('done');
    },
  });

  async function applyStaff(mobile: string): Promise<string | null> {
    try {
      const { data } = await publicOrganizationApi.getKioskStaffDiscount(
        restaurantId,
        token!,
        mobile,
      );
      setStaff({ discountPercent: data.discountPercent, mobile });
      return null;
    } catch (failure) {
      return failure instanceof ApiClientError
        ? getApiErrorMessage(failure)
        : 'We could not check that number. Please try again.';
    }
  }

  let body: ReactNode;
  if (!token || isInvalidLink(menuQuery.error)) {
    body = (
      <Message icon={<Link2Off aria-hidden="true" className="h-11 w-11" />}>
        This kiosk is not set up. Please order at the counter.
      </Message>
    );
  } else if (!menu) {
    body = menuQuery.isError ? (
      <Message icon={<WifiOff aria-hidden="true" className="h-11 w-11" />}>
        The menu could not be loaded. Retrying… Please order at the counter meanwhile.
      </Message>
    ) : (
      <Message icon={<LoaderCircle aria-hidden="true" className="h-11 w-11 animate-spin" />}>
        Getting the menu ready…
      </Message>
    );
  } else if (!menu.canPay) {
    body = (
      <Message icon={<Hand aria-hidden="true" className="h-11 w-11" />}>
        This kiosk is not taking orders yet. Please ask a member of staff.
      </Message>
    );
  } else if (screen === 'welcome') {
    body = (
      <Welcome
        items={menu.items}
        locationName={menu.locationName}
        onStart={() => setScreen('menu')}
        restaurantName={menu.restaurantName}
      />
    );
  } else if (screen === 'done' && placed) {
    body = <Done onNext={reset} order={placed} />;
  } else if (screen === 'review' && cart.length > 0) {
    body = (
      <KioskReviewScreen
        cart={cart}
        error={error}
        isPlacing={place.isPending}
        locationName={menu.locationName}
        onApplyStaff={applyStaff}
        onBack={() => setScreen('menu')}
        onPlace={() => place.mutate()}
        onQuantity={changeQuantity}
        onRemoveStaff={() => setStaff(null)}
        onStartOver={reset}
        restaurantName={menu.restaurantName}
        staff={staff}
        staffDiscountOffered={menu.staffDiscount}
      />
    );
  } else {
    body = (
      <KioskMenuScreen
        cart={cart}
        menu={menu}
        onQuantity={changeQuantity}
        onReview={() => setScreen('review')}
        onStartOver={reset}
        staffDiscountPercent={staff?.discountPercent ?? 0}
      />
    );
  }

  return (
    <KioskBackdrop>
      {body}
      {dropped.length > 0 && (screen === 'menu' || screen === 'review') ? (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-10 flex justify-center px-6">
          <button
            className={cn(
              card,
              'pointer-events-auto bg-ds-surface px-7 py-4 text-[19px] font-semibold',
            )}
            onClick={() => setPickedCart(cart)}
            type="button"
          >
            {dropped.join(', ')} {dropped.length === 1 ? 'is' : 'are'} no longer available and came
            off your order. Tap to close.
          </button>
        </div>
      ) : null}
      {menu && menuQuery.isError ? (
        <p className="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ds-text px-5 py-2 text-[16px] font-medium text-ds-surface">
          <WifiOff aria-hidden="true" className="h-4 w-4" />
          Reconnecting…
        </p>
      ) : null}
      {idleLeft !== null ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-30 grid place-items-center bg-ds-text/40 p-6 backdrop-blur-sm"
          role="alertdialog"
        >
          <div
            className={cn(
              card,
              'flex max-w-[520px] flex-col items-center gap-5 bg-ds-surface p-10 text-center',
            )}
          >
            <p className="text-[34px] font-bold">Still ordering?</p>
            <p className="text-[21px] text-ds-text-3">
              The kiosk starts over in {idleLeft} seconds.
            </p>
            <button className={primaryButton} type="button">
              Yes, I&apos;m still here
            </button>
          </div>
        </div>
      ) : null}
    </KioskBackdrop>
  );
}
