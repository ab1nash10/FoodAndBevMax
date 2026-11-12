'use client';

import { ApiClientError, type KioskMenuItem, type QrOrderView } from '@aahar/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Hand, Link2Off, LoaderCircle, WifiOff } from 'lucide-react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import { reconcile, setQuantity, type KioskCartLine } from '@/lib/kiosk';
import { useBoardTheme, useWakeLock } from '@/lib/order-board/live';
import { queryKeys } from '@/lib/query-keys';
import { FoodPic, formatRupees, KioskMenuScreen, type StaffDiscount } from './kiosk-menu';

type Screen = 'done' | 'menu' | 'paying' | 'welcome';
type PayMethod = 'CARD' | 'UPI';

/** Untouched this long while ordering, the kiosk asks whether anyone is still there… */
const IDLE_MS = 60_000;
/** …and starts over after this much more, so the next guest never sees someone else's order. */
const WARNING_MS = 15_000;
/** The order number stays up this long for the guest to read, then the kiosk is ready again. */
const DONE_MS = 30_000;
/** A payment left this long is given up: the QR (or card machine) is cancelled. */
const PAY_MS = 4 * 60_000;

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

const deepBlue =
  'bg-[radial-gradient(120%_90%_at_85%_10%,#2477cf_0%,#0b57a4_38%,#0b2a55_100%)] text-white';
const whiteButton =
  'h-[80px] rounded-full bg-white px-10 text-[22px] font-black uppercase tracking-wide text-[#0b57a4]';

function Message({ children, icon }: Readonly<{ children: ReactNode; icon: ReactNode }>) {
  return (
    <div className={`grid h-full place-items-center p-10 ${deepBlue}`}>
      <div className="flex max-w-[640px] flex-col items-center gap-6 text-center">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-white/12">{icon}</span>
        <div className="text-[28px] font-bold leading-snug">{children}</div>
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
  const marked = items.filter((item) => item.isFeatured);
  const shown = (marked.length > 0 ? marked : items).slice(0, 3);

  return (
    <button
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden p-8 text-left sm:p-12 ${deepBlue}`}
      onClick={onStart}
      type="button"
    >
      <span className="relative z-10 text-[18px] font-bold uppercase tracking-[0.18em] text-white/70">
        {restaurantName ?? 'AAHAR'}
        {locationName ? ` · ${locationName}` : ''}
      </span>
      <span
        aria-hidden="true"
        className="absolute right-[4%] top-1/2 flex -translate-y-1/2 flex-col items-center gap-[2vh] max-md:-right-[10%]"
      >
        {shown.map((item, index) => (
          <FoodPic
            className={`text-[min(22vw,22vh,200px)] ${index % 2 ? 'rotate-[8deg]' : '-rotate-[8deg]'} drop-shadow-[0_24px_30px_rgba(0,0,0,.45)]`}
            item={item}
            key={item.id}
          />
        ))}
      </span>
      <span className="relative z-10 flex max-w-[70%] flex-col gap-6">
        <span className="text-[min(9vw,12vh,112px)] font-black uppercase leading-[0.9] tracking-[-0.04em]">
          Hungry? Order here.
        </span>
        <span className="text-[clamp(18px,2.4vw,24px)] font-semibold uppercase tracking-wide text-white/80">
          Pick your food · pay here by UPI or card · collect when your number shows
        </span>
        <span className="flex h-[88px] w-fit items-center gap-4 rounded-full bg-white px-10 text-[28px] font-black uppercase tracking-wide text-[#0b57a4] shadow-[0_24px_50px_-20px_rgba(0,0,0,.6)]">
          <Hand aria-hidden="true" className="h-9 w-9" />
          Tap to order
        </span>
      </span>
    </button>
  );
}

/**
 * Paying at the kiosk: the gateway's QR for the amount (UPI), or the card machine's prompt. The
 * kiosk asks the server every few seconds; once paid, the server bills the order and this hands
 * over its order number. Cancel (or four idle minutes) gives the payment up.
 */
function Paying({
  method,
  onBilled,
  onClosed,
  onNotBilled,
  order,
}: Readonly<{
  method: PayMethod;
  onBilled: (order: QrOrderView) => void;
  onClosed: (message: string) => void;
  onNotBilled: (order: QrOrderView) => void;
  order: QrOrderView;
}>) {
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(PAY_MS / 1000);
  const [cancelling, setCancelling] = useState(false);
  const statusQuery = useQuery({
    queryFn: async () => (await publicOrganizationApi.getQrOrder(order.id, order.key)).data,
    queryKey: ['kiosk-payment', order.id],
    refetchInterval: 2500,
  });
  const view = statusQuery.data ?? order;

  useEffect(() => {
    if (method !== 'UPI' || !order.paymentUrl) return;
    void QRCode.toDataURL(order.paymentUrl, { margin: 1, width: 520 }).then(setQr);
  }, [method, order.paymentUrl]);

  useEffect(() => {
    if (view.status === 'BILLED') onBilled(view);
    else if (view.status === 'PAID_NOT_BILLED') onNotBilled(view);
    else if (view.status === 'CLOSED') {
      onClosed('The payment was not completed, so nothing was charged. Please try again.');
    }
  }, [onBilled, onClosed, onNotBilled, view]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      const { data } = await publicOrganizationApi.cancelGuestOrder(order.id, order.key);
      if (data.status === 'BILLED') onBilled(data);
      else if (data.status === 'PAID_NOT_BILLED') onNotBilled(data);
      else onClosed('Payment cancelled. Nothing was charged.');
    } catch {
      setCancelling(false);
    }
  }, [onBilled, onClosed, onNotBilled, order.id, order.key]);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((PAY_MS - (Date.now() - started)) / 1000);
      if (remaining <= 0) {
        window.clearInterval(timer);
        void cancel();
      } else setLeft(remaining);
    }, 500);
    return () => window.clearInterval(timer);
  }, [cancel]);

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <div
      className={`flex h-full flex-col items-center justify-center-safe gap-7 overflow-y-auto p-6 text-center *:shrink-0 [@media(max-height:900px)]:gap-4 ${deepBlue}`}
    >
      <p className="text-[20px] font-bold uppercase tracking-[0.16em] text-white/75">
        {method === 'UPI' ? 'Scan to pay by UPI' : 'Pay on the card machine'}
      </p>
      <p className="text-[clamp(56px,9vh,96px)] font-black leading-none tabular-nums">
        {formatRupees(order.grandTotal)}
      </p>
      {method === 'UPI' ? (
        <div className="grid place-items-center rounded-[32px] bg-white p-6 shadow-2xl">
          {qr ? (
            <Image
              alt={`QR code to pay ${formatRupees(order.grandTotal)} by UPI`}
              className="h-[min(40vh,420px)] w-[min(40vh,420px)]"
              height={520}
              src={qr}
              unoptimized
              width={520}
            />
          ) : (
            <LoaderCircle
              aria-label="Preparing the QR"
              className="h-20 w-20 animate-spin text-[#0b57a4]"
            />
          )}
        </div>
      ) : (
        <div className="grid h-[min(36vh,320px)] w-[min(36vh,320px)] place-items-center rounded-full bg-white/12">
          <CreditCard aria-hidden="true" className="h-[45%] w-[45%]" strokeWidth={1.4} />
        </div>
      )}
      <p className="max-w-[560px] text-[22px] font-semibold leading-snug text-white/90">
        {method === 'UPI'
          ? 'Open any UPI app (Google Pay, PhonePe, Paytm) and scan the code. Your order goes to the kitchen once it is paid.'
          : 'Insert, tap or swipe your card on the machine next to the kiosk and follow its steps.'}
      </p>
      <p className="flex items-center gap-3 text-[18px] font-semibold text-white/70">
        <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
        Waiting for payment · {clock}
      </p>
      <button
        className="h-[72px] rounded-full border-2 border-white/40 px-10 text-[20px] font-bold uppercase tracking-wide disabled:opacity-60"
        disabled={cancelling}
        onClick={() => void cancel()}
        type="button"
      >
        {cancelling ? 'Cancelling…' : 'Cancel payment'}
      </button>
    </div>
  );
}

function Done({
  lines,
  method,
  onNext,
  order,
}: Readonly<{
  lines: KioskCartLine[];
  method: PayMethod;
  onNext: () => void;
  order: QrOrderView;
}>) {
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
    <div
      className={`flex h-full flex-col items-center justify-center-safe gap-8 overflow-y-auto p-6 text-center *:shrink-0 sm:p-10 ${deepBlue}`}
    >
      <p className="flex items-center gap-3 text-[26px] font-bold uppercase tracking-wide">
        <CheckCircle2 aria-hidden="true" className="h-9 w-9" />
        Paid · {formatRupees(order.grandTotal)} by {method === 'UPI' ? 'UPI' : 'card'}
      </p>
      <div className="w-full max-w-[640px] overflow-hidden rounded-[32px] bg-white text-[#0e1a2b] shadow-2xl">
        <div className="px-6 pb-6 pt-7">
          <p className="text-[18px] font-bold uppercase tracking-[0.16em] text-[#5b6880]">
            Your order number
          </p>
          <p
            aria-live="polite"
            className="text-[clamp(110px,min(24vw,20vh),220px)] font-black leading-none tracking-[-0.05em] tabular-nums text-[#0b57a4]"
          >
            {order.orderNumber}
          </p>
          <p className="mt-1 font-mono text-[15px] text-[#5b6880]">Invoice {order.billNumber}</p>
        </div>
        <div aria-hidden="true" className="mx-6 border-t-2 border-dashed border-[#e3e8f0]" />
        <div className="px-6 py-6 text-left sm:px-8">
          <p className="text-[24px] font-black uppercase leading-tight">
            Your order is with the kitchen
          </p>
          <p className="mt-2 text-[19px] text-[#4a576c]">
            Collect it from the counter when your number shows on the board.
          </p>
          <ul className="mt-5 flex flex-col gap-1 border-t border-[#eef1f5] pt-4 text-[19px]">
            {lines.map(({ item, quantity }) => (
              <li className="flex justify-between gap-4" key={item.id}>
                <span className="min-w-0">
                  {quantity} × {item.itemName}
                </span>
                <span className="shrink-0 tabular-nums text-[#5b6880]">
                  {formatRupees(item.price * quantity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button className={whiteButton} onClick={onNext} type="button">
        Done · next order in {left}s
      </button>
    </div>
  );
}

/** Paid, but the bill could not be made (an item sold out, the shift ended): ask for a refund. */
function NotBilled({ onNext, order }: Readonly<{ onNext: () => void; order: QrOrderView }>) {
  useEffect(() => {
    const timer = window.setTimeout(onNext, 90_000);
    return () => window.clearTimeout(timer);
  }, [onNext]);

  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-7 p-8 text-center ${deepBlue}`}
    >
      <p className="text-[34px] font-black uppercase">Payment received, order not placed</p>
      <p className="max-w-[640px] text-[22px] leading-snug text-white/90">
        {order.message} Amount: {formatRupees(order.grandTotal)}. Reference:{' '}
        {order.id.slice(0, 8).toUpperCase()}.
      </p>
      <button className={whiteButton} onClick={onNext} type="button">
        Done
      </button>
    </div>
  );
}

/**
 * The self-service kiosk at /kiosk/<restaurant>?token=<board secret>: welcome, the menu with its
 * dish and order sheets, payment right here by UPI (a QR for the amount) or card, then the order
 * number. It starts over by itself when left alone, so the next guest never sees someone else's
 * order.
 */
export function KioskScreen({
  restaurantId,
  token,
}: Readonly<{ restaurantId: string; token?: string }>) {
  useBoardTheme('light');
  useWakeLock();

  const [screen, setScreen] = useState<Screen>('welcome');
  const [pickedCart, setPickedCart] = useState<KioskCartLine[]>([]);
  const [staff, setStaff] = useState<StaffDiscount | null>(null);
  const [payment, setPayment] = useState<{ method: PayMethod; order: QrOrderView } | null>(null);
  const [paidLines, setPaidLines] = useState<KioskCartLine[]>([]);
  const [notBilled, setNotBilled] = useState<QrOrderView | null>(null);
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
    setPayment(null);
    setPaidLines([]);
    setNotBilled(null);
    setError('');
    setClientOrderId(newClientOrderId());
    setScreen('welcome');
  }, []);

  const idleLeft = useIdleCountdown(screen === 'menu', reset);

  const changeQuantity = (item: KioskMenuItem, quantity: number) => {
    setError('');
    setPickedCart(setQuantity(cart, item, quantity));
  };

  const place = useMutation({
    mutationFn: async (method: PayMethod) => ({
      method,
      order: (
        await publicOrganizationApi.createKioskPaidOrder(restaurantId, token!, {
          clientOrderId,
          lines: cart.map(({ item, quantity }) => ({ menuId: item.id, quantity })),
          method,
          staffToken: staff?.token,
        })
      ).data,
    }),
    onError: (failure) => {
      setError(
        failure instanceof ApiClientError
          ? getApiErrorMessage(failure)
          : 'We could not start the payment. Please try again, or order at the counter.',
      );
      void menuQuery.refetch();
    },
    onSuccess: (started) => {
      setError('');
      setPaidLines(cart);
      setPayment(started);
      setScreen('paying');
    },
  });

  const onBilled = useCallback((order: QrOrderView) => {
    setPayment((current) => (current ? { ...current, order } : current));
    setScreen('done');
  }, []);
  const onNotBilled = useCallback((order: QrOrderView) => setNotBilled(order), []);
  const onClosed = useCallback((message: string) => {
    // A new id: the next try is a new order with a new payment.
    setClientOrderId(newClientOrderId());
    setPayment(null);
    setError(message);
    setScreen('menu');
  }, []);

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
  } else if (notBilled) {
    body = <NotBilled onNext={reset} order={notBilled} />;
  } else if (screen === 'done' && payment) {
    body = <Done lines={paidLines} method={payment.method} onNext={reset} order={payment.order} />;
  } else if (screen === 'paying' && payment) {
    body = (
      <Paying
        method={payment.method}
        onBilled={onBilled}
        onClosed={onClosed}
        onNotBilled={onNotBilled}
        order={payment.order}
      />
    );
  } else if (!menu.open) {
    body = (
      <Message icon={<Hand aria-hidden="true" className="h-11 w-11" />}>
        This kiosk is not taking orders right now. Please order at the counter.
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
  } else {
    body = (
      <KioskMenuScreen
        cart={cart}
        error={error}
        isPlacing={place.isPending}
        menu={menu}
        onPay={(method) => place.mutate(method)}
        onQuantity={changeQuantity}
        onStaff={setStaff}
        onStartOver={reset}
        restaurantId={restaurantId}
        staff={staff}
        token={token}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-ds-page text-ds-text [-webkit-tap-highlight-color:transparent] [touch-action:manipulation]"
      onContextMenu={(event) => event.preventDefault()}
    >
      {body}
      {dropped.length > 0 && screen === 'menu' ? (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-30 flex justify-center px-6">
          <button
            className="pointer-events-auto rounded-2xl bg-ds-surface px-7 py-4 text-[19px] font-semibold shadow-xl"
            onClick={() => setPickedCart(cart)}
            type="button"
          >
            {dropped.join(', ')} {dropped.length === 1 ? 'is' : 'are'} no longer available and came
            off your order. Tap to close.
          </button>
        </div>
      ) : null}
      {menu && menuQuery.isError ? (
        <p className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ds-text px-5 py-2 text-[16px] font-medium text-ds-surface">
          <WifiOff aria-hidden="true" className="h-4 w-4" />
          Reconnecting…
        </p>
      ) : null}
      {idleLeft !== null ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-40 grid place-items-center bg-[#0b1a33]/55 p-6 backdrop-blur-sm"
          role="alertdialog"
        >
          <div className="flex max-w-[520px] flex-col items-center gap-5 rounded-[32px] bg-ds-surface p-10 text-center shadow-2xl">
            <p className="text-[34px] font-black uppercase">Still ordering?</p>
            <p className="text-[21px] text-ds-text-3">
              The kiosk starts over in {idleLeft} seconds.
            </p>
            <button
              className="h-[72px] rounded-full bg-ds-primary px-10 text-[22px] font-black uppercase text-white"
              type="button"
            >
              Yes, I&apos;m still here
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
