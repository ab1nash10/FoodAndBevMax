'use client';

import {
  UNDELIVERED_REASONS,
  type Delivery,
  type OrderStatus,
  type UndeliveredReason,
} from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BedDouble,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  Clock,
  MessageSquare,
  Undo2,
  UtensilsCrossed,
  Volume2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/design-system';
import { LoadError } from '@/components/location-empty-states';
import { useToast } from '@/components/toast-provider';
import { Input, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { formatTime } from '@/lib/order-board/format';
import { minutesSince } from '@/lib/order-board/rules';
import { setUrlParams, useHrefWith, useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

// Live changes bring a new or ready order within a second; this is the fallback.
const REFRESH_MS = 10_000;
/** How long "Delivered" can be undone before it is sent. */
export const UNDO_MS = 5_000;
/** How often the alert rings while it is up. */
const RING_EVERY_MS = 2_000;
const deliveriesKey = ['my-deliveries'] as const;
const ACTIVE: OrderStatus[] = ['PLACED', 'PREPARING', 'READY'];

/** Still theirs to take: not delivered, cancelled or given back. */
const isActive = (order: Delivery) => !order.undeliveredReason && ACTIVE.includes(order.status);

export interface DeliveryAlert {
  kind: 'new' | 'ready';
  order: Delivery;
}

/**
 * What to ring for since the last look: an order newly given to them ("new"; "ready" when it
 * comes cooked), and one of theirs turning ready. Nothing on the first look: what was already
 * there when the screen opened is not news.
 */
export function newAlerts(before: Delivery[] | undefined, after: Delivery[]): DeliveryAlert[] {
  if (!before) return [];
  const known = new Map(before.filter(isActive).map((order) => [order.id, order.status]));

  return after.filter(isActive).flatMap((order): DeliveryAlert[] => {
    const was = known.get(order.id);

    if (was === undefined) return [{ kind: order.status === 'READY' ? 'ready' : 'new', order }];
    if (order.status === 'READY' && was !== 'READY') return [{ kind: 'ready', order }];
    return [];
  });
}

const roomOf = (order: Delivery) =>
  order.roomNumber
    ? `Room ${order.roomNumber}${order.bedNumber ? ` · Bed ${order.bedNumber}` : ''}`
    : 'Room not given';

const itemCount = (order: Delivery) => {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return `${count} item${count === 1 ? '' : 's'}`;
};

function agoText(prefix: string, iso: string | null, now: number) {
  const minutes = minutesSince(iso ?? undefined, now);

  return minutes < 1 ? `${prefix} just now` : `${prefix} ${minutes} min ago`;
}

/** The clock the "Ready 6 min ago" badges count from, ticking each half minute. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

/** A two-tone ring and a buzz every 2 s while `ringing`; the sound only once a tap allowed it. */
function useRing(ringing: boolean, audio: AudioContext | null) {
  useEffect(() => {
    if (!ringing) return;
    const ring = () => {
      if ('vibrate' in navigator) navigator.vibrate([400, 200, 400]);
      if (!audio) return;
      for (const [offset, hertz] of [
        [0, 880],
        [0.25, 660],
      ] as const) {
        const tone = audio.createOscillator();
        const volume = audio.createGain();
        tone.frequency.value = hertz;
        volume.gain.value = 0.3;
        tone.connect(volume).connect(audio.destination);
        tone.start(audio.currentTime + offset);
        tone.stop(audio.currentTime + offset + 0.2);
      }
    };

    ring();
    const timer = window.setInterval(ring, RING_EVERY_MS);

    return () => {
      window.clearInterval(timer);
      if ('vibrate' in navigator) navigator.vibrate(0);
    };
  }, [audio, ringing]);
}

/** Keeps the screen on while alerts are on, taking the lock again when the app comes back. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (taken) => {
          lock = taken;
        },
        () => undefined,
      );
    };

    take();
    document.addEventListener('visibilitychange', take);

    return () => {
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [on]);
}

/** A link to another view of this screen, kept in the address so the phone's Back returns. */
function ViewLink({
  children,
  className,
  label,
  patch,
}: Readonly<{
  children: ReactNode;
  className?: string;
  label?: string;
  patch: Record<string, string | null>;
}>) {
  const hrefWith = useHrefWith();

  return (
    <a
      aria-label={label}
      className={className}
      href={hrefWith(patch)}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        setUrlParams(patch, 'push');
      }}
    >
      {children}
    </a>
  );
}

function Header({
  back,
  right,
  subtitle,
  title,
}: Readonly<{ back?: boolean; right?: ReactNode; subtitle?: string; title: string }>) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-ds-border bg-ds-surface px-3.5 py-3">
      {back ? (
        <ViewLink
          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-ds-text hover:bg-ds-subtle"
          label="Back to my deliveries"
          patch={{ order: null, view: null }}
        >
          <ChevronLeft aria-hidden="true" className="h-6 w-6" />
        </ViewLink>
      ) : (
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[image:var(--ds-primary-gradient)] text-[12px] font-bold text-white"
        >
          F&amp;B
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="truncate text-[13px] text-ds-muted">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}

function Items({ order }: Readonly<{ order: Delivery }>) {
  return (
    <ul className="space-y-1 text-[15px]">
      {order.items.map((item, index) => (
        <li key={`${item.name}-${index}`}>
          <span className="font-semibold tabular-nums">{item.quantity} ×</span> {item.name}
          {item.note ? <span className="text-ds-muted"> · {item.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Instructions({ text }: Readonly<{ text: string }>) {
  return (
    <p className="flex gap-2 rounded-[12px] bg-ds-status-pending-bg px-3 py-2 text-[14px] text-ds-status-pending-fg">
      <MessageSquare aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

/**
 * A phone order's Delivered: the guest's six digits (under the QR on their order page, or read
 * out) hand it over, sent at once. Scanning the QR is in the F&B Deliveries phone app.
 */
function CodeDelivery({
  big,
  onDone,
  order,
}: Readonly<{ big?: boolean; onDone: () => void; order: Delivery }>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const send = useMutation({
    mutationFn: () => organizationApi.markOrderDelivered(order.id, code),
    onError: (failure) => setError(getApiErrorMessage(failure)),
    onSuccess: onDone,
  });

  if (!open) {
    return (
      <Button
        className={cn('w-full', big ? 'h-14 text-[17px]' : 'h-12 text-[16px]')}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Check aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
        Delivered
      </Button>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        send.mutate();
      }}
    >
      <label className="block text-[13px] font-semibold text-ds-muted" htmlFor={id}>
        Guest’s 6-digit code
      </label>
      <Input
        autoComplete="off"
        autoFocus
        className="h-12 text-center font-mono text-2xl tracking-[0.3em]"
        id={id}
        inputMode="numeric"
        maxLength={6}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        value={code}
      />
      <p className="text-[13px] text-ds-muted">
        Under the QR on the guest’s order page. The phone app scans it.
      </p>
      {error ? (
        <p
          className="rounded-[12px] bg-ds-status-bad-bg px-3 py-2 text-[14px] text-ds-status-bad-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          className="h-12 flex-1"
          disabled={code.length !== 6 || send.isPending}
          type="submit"
        >
          Confirm delivery
        </Button>
        <Button
          className="h-12"
          onClick={() => {
            setOpen(false);
            setCode('');
            setError('');
          }}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReadyCard({
  now,
  onDelivered,
  order,
}: Readonly<{ now: number; onDelivered: () => void; order: Delivery }>) {
  const waited = minutesSince(order.readyAt ?? undefined, now);

  return (
    <li className="space-y-2.5 rounded-[20px] border border-ds-border bg-ds-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <ViewLink
          className="text-[26px] font-bold tracking-[-0.02em] text-ds-text tabular-nums"
          label={`Open order #${order.orderNumber}`}
          patch={{ order: order.id }}
        >
          #{order.orderNumber}
        </ViewLink>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold',
            // Waiting a while: amber, so the oldest is taken first.
            waited >= 5
              ? 'bg-ds-status-pending-bg text-ds-status-pending-fg'
              : 'bg-ds-status-ok-bg text-ds-status-ok-fg',
          )}
        >
          <Clock aria-hidden="true" className="h-3.5 w-3.5" />
          {agoText('Ready', order.readyAt, now)}
        </span>
      </div>
      <p className="flex items-center gap-2 text-[20px] font-bold text-ds-link">
        <BedDouble aria-hidden="true" className="h-5 w-5 shrink-0" />
        {roomOf(order)}
      </p>
      <p className="flex items-center gap-1.5 text-[13px] text-ds-muted">
        <UtensilsCrossed aria-hidden="true" className="h-4 w-4 shrink-0" />
        {`Pick up at ${order.restaurantName}`}
      </p>
      <div className="border-t border-ds-divider pt-2.5">
        <Items order={order} />
      </div>
      {order.instructions ? <Instructions text={order.instructions} /> : null}
      {order.needsCode ? (
        <CodeDelivery onDone={onDelivered} order={order} />
      ) : (
        <Button className="h-12 w-full text-[16px]" onClick={onDelivered} type="button">
          <Check aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
          Delivered
        </Button>
      )}
    </li>
  );
}

function Section({
  children,
  count,
  title,
}: Readonly<{ children: ReactNode; count: number; title: string }>) {
  return (
    <section aria-label={title} className="space-y-2.5">
      <h2 className="flex items-center justify-between px-1 text-[15px] font-bold">
        {title}
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-ds-subtle px-2 text-[13px] tabular-nums text-ds-muted">
          {count}
        </span>
      </h2>
      <ul className="space-y-2.5">{children}</ul>
    </section>
  );
}

function ListView({
  coming,
  deliveredToday,
  now,
  onDelivered,
  ready,
}: Readonly<{
  coming: Delivery[];
  deliveredToday: number;
  now: number;
  onDelivered: (order: Delivery) => void;
  ready: Delivery[];
}>) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-3.5">
      {ready.length + coming.length === 0 ? (
        <EmptyState
          description="When a cashier or the kitchen gives you a room order, it rings here."
          title="No deliveries for you right now"
        />
      ) : null}
      {ready.length ? (
        <Section count={ready.length} title="Ready to take">
          {ready.map((order) => (
            <ReadyCard
              key={order.id}
              now={now}
              onDelivered={() => onDelivered(order)}
              order={order}
            />
          ))}
        </Section>
      ) : null}
      {coming.length ? (
        <Section count={coming.length} title="Being made">
          {coming.map((order) => (
            <li
              className="flex items-center gap-2.5 rounded-[16px] border border-dashed border-ds-primary-border bg-ds-surface px-3.5 py-3 text-[14px]"
              key={order.id}
            >
              <ViewLink
                className="text-[16px] font-bold tabular-nums text-ds-text"
                label={`Open order #${order.orderNumber}`}
                patch={{ order: order.id }}
              >
                #{order.orderNumber}
              </ViewLink>
              <span>{roomOf(order)}</span>
              <span className="ml-auto text-[13px] text-ds-muted">{itemCount(order)}</span>
            </li>
          ))}
        </Section>
      ) : null}
      <ViewLink
        className="mt-auto flex h-12 items-center justify-between rounded-[14px] border border-ds-border bg-ds-surface px-4 text-[14px] font-semibold text-ds-text"
        patch={{ view: 'done' }}
      >
        <span>Delivered today</span>{' '}
        <span className="font-bold tabular-nums text-ds-status-ok-fg">{deliveredToday}</span>
      </ViewLink>
    </div>
  );
}

function OrderView({
  isGivingBack,
  now,
  onDelivered,
  onGiveBack,
  order,
}: Readonly<{
  isGivingBack: boolean;
  now: number;
  onDelivered: () => void;
  onGiveBack: (reason: UndeliveredReason) => void;
  order: Delivery;
}>) {
  const [askingWhy, setAskingWhy] = useState(false);
  const isReady = order.status === 'READY';
  const rows: Array<[string, string]> = [
    ['Ordered', formatTime(order.placedAt)],
    ...(order.stewardAssignedAt
      ? [['Given to you', formatTime(order.stewardAssignedAt)] as [string, string]]
      : []),
    [
      'Ready',
      order.readyAt
        ? `${formatTime(order.readyAt)} · ${agoText('', order.readyAt, now).trim()}`
        : 'Still being made',
    ],
  ];

  return (
    <>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <section className="space-y-1 rounded-[20px] bg-[image:var(--ds-primary-gradient)] p-[18px] text-white">
          <p className="text-[13px] font-semibold text-white/75">Take to</p>
          <p className="text-[30px] font-bold leading-tight tracking-[-0.03em]">{roomOf(order)}</p>
          <p className="text-[14px] text-white/85">{`Pick up at ${order.restaurantName}`}</p>
        </section>
        <section className="space-y-2.5 rounded-[20px] border border-ds-border bg-ds-surface p-4">
          <p className="text-[13px] font-semibold text-ds-muted">
            What to take · {itemCount(order)}
          </p>
          <Items order={order} />
        </section>
        {order.instructions ? <Instructions text={order.instructions} /> : null}
        <dl className="space-y-2 rounded-[20px] border border-ds-border bg-ds-surface px-4 py-3.5 text-[14px]">
          {rows.map(([label, value]) => (
            <div className="flex justify-between gap-3" key={label}>
              <dt className="text-ds-muted">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="sticky bottom-0 space-y-2 border-t border-ds-border bg-ds-surface p-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
        {askingWhy ? (
          <fieldset className="space-y-2" disabled={isGivingBack}>
            <legend className="pb-1 text-[15px] font-bold">Why couldn’t you deliver it?</legend>
            {UNDELIVERED_REASONS.map((reason) => (
              <Button
                className="h-12 w-full justify-start text-[15px]"
                key={reason}
                onClick={() => onGiveBack(reason)}
                type="button"
                variant="outline"
              >
                {reason}
              </Button>
            ))}
            <Button
              className="h-11 w-full"
              onClick={() => setAskingWhy(false)}
              type="button"
              variant="ghost"
            >
              Back
            </Button>
          </fieldset>
        ) : (
          <>
            {isReady && order.needsCode ? (
              <CodeDelivery big onDone={onDelivered} order={order} />
            ) : isReady ? (
              <Button className="h-14 w-full text-[17px]" onClick={onDelivered} type="button">
                <Check aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
                Delivered
              </Button>
            ) : (
              <p className="py-2 text-center text-[14px] text-ds-muted">
                Still in the kitchen: it rings when it’s ready.
              </p>
            )}
            <Button
              className="h-11 w-full text-ds-status-bad-fg"
              onClick={() => setAskingWhy(true)}
              type="button"
              variant="ghost"
            >
              Couldn’t deliver
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function DoneView({ done }: Readonly<{ done: Delivery[] }>) {
  return (
    <section aria-label="Delivered today" className="p-3.5">
      {done.length === 0 ? (
        <EmptyState
          description="Each order you deliver today is listed here."
          title="Nothing delivered yet today"
        />
      ) : (
        <ul className="space-y-2">
          {done.map((order) => {
            const delivered = order.status === 'COLLECTED';

            return (
              <li
                className="flex items-center gap-3 rounded-[16px] border border-ds-border bg-ds-surface px-3.5 py-3"
                key={order.id}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                    delivered
                      ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
                      : 'bg-ds-status-bad-bg text-ds-status-bad-fg',
                  )}
                >
                  {delivered ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-[15px]">{roomOf(order)}</strong>
                  <span
                    className={cn(
                      'block text-[13px]',
                      delivered ? 'text-ds-muted' : 'text-ds-status-bad-fg',
                    )}
                  >
                    {delivered
                      ? `#${order.orderNumber} · ${itemCount(order)}`
                      : `#${order.orderNumber} · couldn’t deliver · ${order.undeliveredReason}`}
                  </span>
                </span>
                <span className="text-[14px] tabular-nums text-ds-muted">
                  {formatTime((delivered ? order.deliveredAt : order.undeliveredAt) ?? '')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AlertScreen({
  alerts,
  onDismiss,
  onOpen,
}: Readonly<{ alerts: DeliveryAlert[]; onDismiss: () => void; onOpen: (id: string) => void }>) {
  const titleId = useId();
  const { kind, order } = alerts[alerts.length - 1]!;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center gap-7 overflow-y-auto bg-[linear-gradient(180deg,#1c6ec4_0%,#0b57a4_55%,#08427e_100%)] px-6 pb-8 pt-16 text-white"
      role="alertdialog"
    >
      <span className="grid h-28 w-28 place-items-center rounded-full bg-white/10">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-white text-[#0b57a4]">
          <Bell aria-hidden="true" className="h-9 w-9" />
        </span>
      </span>
      <div className="space-y-2 text-center">
        <h2 className="text-[15px] font-semibold text-white/80" id={titleId}>
          {kind === 'new' ? 'New delivery for you' : 'Ready to take'}
        </h2>
        <p className="text-[40px] font-bold leading-none tracking-[-0.03em]">{roomOf(order)}</p>
        <p className="text-[17px] text-white/90">
          Order #{order.orderNumber} · {itemCount(order)}
        </p>
      </div>
      <div className="w-full max-w-md space-y-3 rounded-[20px] border border-white/20 bg-white/10 p-4 text-[15px]">
        <p className="flex items-center gap-2.5">
          <UtensilsCrossed aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span>
            Pick up at <strong>{order.restaurantName}</strong>
          </span>
        </p>
        <p className="flex items-center gap-2.5">
          <Clock aria-hidden="true" className="h-5 w-5 shrink-0" />
          {kind === 'new' ? 'Being made · it rings again when it’s ready' : 'Ready now'}
        </p>
      </div>
      {alerts.length > 1 ? (
        <p className="text-[14px] text-white/80">and {alerts.length - 1} more</p>
      ) : null}
      <p className="flex items-center gap-2 text-[13px] text-white/75">
        <Volume2 aria-hidden="true" className="h-4 w-4" />
        Rings until you tap
      </p>
      <div className="mt-auto w-full max-w-md space-y-2.5">
        {/* An alert takes the screen: its answer gets the focus. */}
        <button
          autoFocus
          className="h-14 w-full rounded-[16px] bg-white text-[17px] font-bold text-[#0b57a4]"
          onClick={onDismiss}
          type="button"
        >
          Got it
        </button>
        <button
          className="h-12 w-full rounded-[16px] border border-white/35 text-[15px] font-semibold"
          onClick={() => onOpen(order.id)}
          type="button"
        >
          Open the order
        </button>
      </div>
    </div>
  );
}

/**
 * The steward's phone screen: their room orders, ready ones first, each marked Delivered at the
 * bed (undoable for a few seconds) or given back with why it couldn't be. It rings and buzzes
 * when an order is given to them and when one turns ready, while the screen is open; the screen
 * stays on once alerts are on. ?order= opens one order; ?view=done lists today's.
 */
export function MyDeliveriesPageClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();
  const now = useNow();
  const [openId] = useUrlParam('order');
  const [view] = useUrlParam<'' | 'done'>('view', '', ['done']);
  const deliveries = useQuery({
    queryFn: async () => (await organizationApi.listMyDeliveries()).data,
    queryKey: deliveriesKey,
    refetchInterval: REFRESH_MS,
  });
  const orders = deliveries.data;
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
    [queryClient],
  );

  // Ringing: phones let a page make sound only after a tap, so alerts start with one.
  const [audio, setAudio] = useState<AudioContext | null>(null);
  const [alertsOn, setAlertsOn] = useState(false);
  const [alerts, setAlerts] = useState<DeliveryAlert[]>([]);
  const [seen, setSeen] = useState<Delivery[] | undefined>(undefined);

  if (orders && orders !== seen) {
    setSeen(orders);
    const found = newAlerts(seen, orders);
    if (found.length) setAlerts([...alerts, ...found]);
  }
  useRing(alerts.length > 0 && alertsOn, audio);
  useWakeLock(alertsOn);

  const turnOnAlerts = () => {
    if ('AudioContext' in window) {
      const context = new AudioContext();
      void context.resume();
      setAudio(context);
    }
    setAlertsOn(true);
  };

  // Delivered waits UNDO_MS for Undo, then is sent; leaving the screen sends it at once.
  const [held, setHeld] = useState<Delivery | null>(null);
  const heldRef = useRef<{ id: string; timer: number } | null>(null);
  const sendHeld = useCallback(() => {
    const waiting = heldRef.current;
    if (!waiting) return;
    heldRef.current = null;
    window.clearTimeout(waiting.timer);
    organizationApi.markOrderDelivered(waiting.id).then(refresh, (error: unknown) => {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Not delivered',
        variant: 'error',
      });
      refresh();
    });
  }, [refresh, showToast]);

  useEffect(() => {
    window.addEventListener('pagehide', sendHeld);

    return () => {
      window.removeEventListener('pagehide', sendHeld);
      sendHeld();
    };
  }, [sendHeld]);

  const markDelivered = (order: Delivery) => {
    sendHeld(); // One tapped just before goes now.
    heldRef.current = {
      id: order.id,
      timer: window.setTimeout(() => {
        sendHeld();
        setHeld(null);
      }, UNDO_MS),
    };
    setHeld(order);
    setUrlParams({ order: null });
  };
  // A phone order's code went with it: done, nothing to undo.
  const delivered = (order: Delivery) => {
    if (!order.needsCode) {
      markDelivered(order);
      return;
    }
    refresh();
    setUrlParams({ order: null });
    showToast({ title: `#${order.orderNumber} delivered`, variant: 'success' });
  };
  const undo = () => {
    if (heldRef.current) window.clearTimeout(heldRef.current.timer);
    heldRef.current = null;
    setHeld(null);
  };

  const giveBack = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: UndeliveredReason }) =>
      organizationApi.markOrderNotDelivered(id, reason),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Not given back',
        variant: 'error',
      });
    },
    onSettled: refresh,
    onSuccess(_, { reason }) {
      setUrlParams({ order: null });
      showToast({ title: `Given back: ${reason}`, variant: 'success' });
    },
  });

  const all = orders ?? [];
  const active = all.filter((order) => isActive(order) && order.id !== held?.id);
  const ready = active.filter((order) => order.status === 'READY');
  const coming = active.filter((order) => order.status !== 'READY');
  const done = all
    .filter((order) => order.status === 'COLLECTED' || order.undeliveredReason)
    .sort((a, b) =>
      (b.deliveredAt ?? b.undeliveredAt ?? '').localeCompare(
        a.deliveredAt ?? a.undeliveredAt ?? '',
      ),
    );
  const deliveredToday = done.filter((order) => order.status === 'COLLECTED').length;
  const opened = openId ? active.find((order) => order.id === openId) : undefined;

  const alertsButton = (
    <button
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
        alertsOn
          ? 'border-ds-primary-border bg-ds-primary-soft text-ds-link'
          : 'border-transparent bg-ds-status-pending-bg text-ds-status-pending-fg',
      )}
      onClick={alertsOn ? undefined : turnOnAlerts}
      type="button"
    >
      {alertsOn ? (
        <Bell aria-hidden="true" className="h-4 w-4" />
      ) : (
        <BellOff aria-hidden="true" className="h-4 w-4" />
      )}
      {alertsOn ? 'Alerts on' : 'Turn on alerts'}
    </button>
  );

  let body: ReactNode;

  if (deliveries.isLoading) {
    body = (
      <div className="space-y-3 p-3.5">
        <Skeleton className="h-56 w-full rounded-[20px]" />
        <Skeleton className="h-16 w-full rounded-[16px]" />
      </div>
    );
  } else if (deliveries.isError) {
    body = (
      <div className="p-3.5">
        <LoadError error={deliveries.error} />
      </div>
    );
  } else if (opened) {
    body = (
      <OrderView
        isGivingBack={giveBack.isPending}
        now={now}
        onDelivered={() => delivered(opened)}
        onGiveBack={(reason) => giveBack.mutate({ id: opened.id, reason })}
        order={opened}
      />
    );
  } else if (view === 'done') {
    body = <DoneView done={done} />;
  } else {
    body = (
      <>
        <ListView
          coming={coming}
          deliveredToday={deliveredToday}
          now={now}
          onDelivered={delivered}
          ready={ready}
        />
        <button
          className="mx-auto mb-4 h-11 px-4 text-[14px] font-semibold text-ds-muted"
          onClick={() => void logout().then(() => router.replace('/auth/login'))}
          type="button"
        >
          Sign out
        </button>
      </>
    );
  }

  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-md flex-col bg-ds-page text-ds-text',
        // Room for the Undo bar, so it never covers the last link.
        held && 'pb-24',
      )}
    >
      {opened ? (
        <Header back right={alertsButton} title={`Order #${opened.orderNumber}`} />
      ) : view === 'done' && !deliveries.isLoading ? (
        <Header back title="Delivered today" />
      ) : (
        <Header
          right={alertsButton}
          subtitle={currentUser?.name ?? undefined}
          title="My deliveries"
        />
      )}
      {body}
      {held ? (
        <div
          className="fixed inset-x-3.5 bottom-[max(18px,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-2.5 rounded-[16px] bg-[#0e1a2b] py-2.5 pl-4 pr-2.5 text-white shadow-[0_16px_32px_-12px_rgb(14_26_43/0.5)]"
          role="status"
        >
          <Check aria-hidden="true" className="h-5 w-5 text-[#7ad3ae]" strokeWidth={2.4} />
          <span className="flex-1 text-[15px]">#{held.orderNumber} delivered</span>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-white/10 px-3.5 text-[14px] font-semibold"
            onClick={undo}
            type="button"
          >
            <Undo2 aria-hidden="true" className="h-4 w-4" />
            Undo
          </button>
        </div>
      ) : null}
      {alerts.length ? (
        <AlertScreen
          alerts={alerts}
          onDismiss={() => setAlerts([])}
          onOpen={(id) => {
            setAlerts([]);
            setUrlParams({ order: id, view: null }, 'push');
          }}
        />
      ) : null}
    </div>
  );
}
