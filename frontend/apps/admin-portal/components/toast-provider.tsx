'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, Info, X } from 'lucide-react';
import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { flashRecord } from '@/lib/flash-record';
import { cn } from '@/lib/utils';

type ToastVariant = 'error' | 'info' | 'success';

interface ToastInput {
  /**
   * A link to what the toast is about, e.g. { href: '/inventory/transfers?id=…', label: 'View TRF0043' },
   * or a button such as Undo. Either closes the toast.
   */
  action?: { href: string; label: string } | { label: string; onClick: () => void };
  description?: string;
  /** How long it stays, in ms; by default 5 s, 8 s with an action or for an error. */
  duration?: number;
  /**
   * Hovering the stack holds the toast (and its countdown) until the pointer leaves. Off for a
   * toast whose time is kept elsewhere, such as Undo, whose change is sent on its own timer.
   */
  pauseOnHover?: boolean;
  /**
   * The record a success is about (its row carries `data-record-id`). When that row is on screen
   * it confirms the save in place (lib/flash-record.ts) and no toast shows; otherwise the toast does.
   */
  recordId?: string;
  title: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  duration: number;
  id: string;
  /** Set when it is closed: it slides out, then goes. */
  leaving?: 'left' | 'right' | 'up';
  variant: ToastVariant;
}

interface ToastContextValue {
  dismissToast: (id: string) => void;
  showToast: (toast: ToastInput) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantIcons: Record<ToastVariant, typeof CheckCircle2> = {
  error: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

const variantChips: Record<ToastVariant, string> = {
  error: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  success: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
};

const variantBars: Record<ToastVariant, string> = {
  error: 'bg-ds-status-bad-fg',
  info: 'bg-ds-link',
  success: 'bg-ds-status-ok-fg',
};

const actionStyles =
  'mt-2 inline-flex h-7 items-center gap-1 rounded-full bg-ds-primary-soft px-3 text-[12.5px] font-semibold text-ds-link transition hover:bg-ds-primary hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';

/** Toasts drawn in the stack; older ones wait unseen until these close. */
const shownWhenOpen = 5;
const shownWhenStacked = 3;
const gap = 10;
/** How far each card behind the newest peeks out below it. */
const peek = 10;
/** A sideways drag this long (px) throws the toast away. */
const swipeAway = 80;
const leaveMs = 180;

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Hover or keyboard focus on the stack fans it out and holds the countdowns.
  const [isOpen, setIsOpen] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    setHeights(({ [id]: _gone, ...rest }) => rest);
  }, []);

  const dismissToast = useCallback(
    (id: string, direction: ToastItem['leaving'] = 'up') => {
      setToasts((current) =>
        current.map((toast) =>
          toast.id === id && !toast.leaving ? { ...toast, leaving: direction } : toast,
        ),
      );
      window.setTimeout(() => remove(id), leaveMs);
    },
    [remove],
  );

  const showToast = useCallback(
    ({ duration, pauseOnHover = true, recordId, variant = 'info', ...toast }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const add = () =>
        setToasts((current) => [
          ...current,
          {
            ...toast,
            // Something to follow or to read (an error) stays longer.
            duration: duration ?? (toast.action || variant === 'error' ? 8000 : 5000),
            id,
            pauseOnHover,
            variant,
          },
        ]);

      // A success about a record on screen is shown on the record itself; its link ("View …")
      // is not needed then. Undo toasts name no record, so they always show.
      if (recordId && variant === 'success') {
        void flashRecord(recordId).then((shown) => {
          if (!shown) add();
        });
      } else {
        add();
      }

      return id;
    },
    [],
  );

  const contextValue = useMemo(
    () => ({ dismissToast: (id: string) => dismissToast(id), showToast }),
    [dismissToast, showToast],
  );

  const onHeight = useCallback((id: string, height: number) => {
    setHeights((current) => (current[id] === height ? current : { ...current, [id]: height }));
  }, []);

  // Newest first: it sits on top, the rest stack behind it (or below it, fanned out).
  const ordered = [...toasts].reverse();
  const frontHeight = heights[ordered[0]?.id ?? ''] ?? 0;
  const offsets: number[] = [];
  let reach = 0;

  ordered.forEach((toast, index) => {
    offsets.push(reach);
    if (index < shownWhenOpen) reach += (heights[toast.id] ?? 0) + gap;
  });

  const stackHeight =
    ordered.length === 0
      ? 0
      : isOpen
        ? reach - gap
        : frontHeight + Math.min(ordered.length - 1, shownWhenStacked - 1) * peek;

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Top right on desktop, top centre on phones: the bottom of the screen belongs to the
          Complete order button, the bill bar and the phone tab bar. */}
      <section
        aria-label="Notifications"
        className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-[380px] transition-[height] duration-200 sm:right-4 sm:left-auto sm:mx-0 sm:w-[380px]"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
        }}
        onFocus={() => setIsOpen(true)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        style={{ height: stackHeight }}
      >
        {ordered.map((toast, index) => (
          <ToastCard
            frontHeight={frontHeight}
            index={index}
            isOpen={isOpen}
            key={toast.id}
            offset={offsets[index] ?? 0}
            onClose={(direction) => dismissToast(toast.id, direction)}
            onHeight={onHeight}
            toast={toast}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function ToastCard({
  frontHeight,
  index,
  isOpen,
  offset,
  onClose,
  onHeight,
  toast,
}: Readonly<{
  frontHeight: number;
  index: number;
  isOpen: boolean;
  offset: number;
  onClose: (direction?: ToastItem['leaving']) => void;
  onHeight: (id: string, height: number) => void;
  toast: ToastItem;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const Icon = variantIcons[toast.variant];
  const { action } = toast;
  const isFront = index === 0;
  const isHidden = index >= (isOpen ? shownWhenOpen : shownWhenStacked);
  // Behind the newest and stacked: the size of the front card, its own text out of sight.
  const isTucked = !isOpen && !isFront;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => onHeight(toast.id, node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeight, toast.id]);

  function endDrag(event: ReactPointerEvent) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (Math.abs(dragX) > swipeAway) onClose(dragX > 0 ? 'right' : 'left');
    else setDragX(0);
  }

  const style: CSSProperties = {
    // The stack: fanned out, each below the newer ones; or stacked, each a little lower and
    // smaller behind the one in front.
    transform: isOpen
      ? `translate3d(${dragX}px, ${offset}px, 0)`
      : `translate3d(${dragX}px, ${index * peek}px, 0) scale(${1 - index * 0.05})`,
    ...(isTucked && frontHeight ? { height: frontHeight } : {}),
    opacity: isHidden ? 0 : dragX ? 1 - Math.min(Math.abs(dragX) / 240, 0.6) : 1,
    pointerEvents: isHidden ? 'none' : undefined,
    zIndex: 100 - index,
    ['--toast-leave-x' as string]:
      toast.leaving === 'right' ? '110%' : toast.leaving === 'left' ? '-110%' : '0',
  };

  return (
    <div
      aria-hidden={isHidden || undefined}
      className={cn(
        'toast-enter absolute inset-x-0 top-0 origin-top touch-pan-y overflow-hidden rounded-2xl border border-ds-border bg-ds-surface/95 shadow-[0_16px_36px_-14px_rgb(14_26_43/0.32)] backdrop-blur-md select-none',
        // Dragging follows the finger; otherwise every move eases.
        dragX ? 'transition-none' : 'transition-[transform,opacity,height] duration-200 ease-out',
        toast.leaving && 'toast-leave',
      )}
      onPointerCancel={endDrag}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return;
        drag.current = { pointerId: event.pointerId, x: event.clientX - dragX };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId === event.pointerId) setDragX(event.clientX - drag.current.x);
      }}
      onPointerUp={endDrag}
      ref={ref}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      style={style}
    >
      <div
        className={cn(
          'flex items-start gap-3 p-3.5 pr-11 transition-opacity duration-150',
          isTucked && 'opacity-0',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-full',
            variantChips[toast.variant],
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13.5px] leading-5 font-semibold text-ds-text">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 text-[13px] leading-5 text-ds-muted">{toast.description}</p>
          ) : null}
          {action && 'href' in action ? (
            <Link className={actionStyles} href={action.href} onClick={() => onClose()}>
              {action.label}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : action ? (
            <button
              className={actionStyles}
              onClick={() => {
                action.onClick();
                onClose();
              }}
              type="button"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
      <button
        aria-label="Dismiss notification"
        className="absolute top-2.5 right-2.5 grid h-7 w-7 place-items-center rounded-full text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
        onClick={() => onClose()}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
      {/* The time left, running out from the right; when it ends the toast goes. Held while the
          stack is hovered or focused, unless the toast's time is kept elsewhere (Undo). */}
      <span
        aria-hidden="true"
        className={cn(
          'toast-countdown absolute inset-x-0 bottom-0 h-[3px] origin-left opacity-60',
          variantBars[toast.variant],
        )}
        onAnimationEnd={() => onClose()}
        style={{
          animationDuration: `${toast.duration}ms`,
          animationPlayState: isOpen && toast.pauseOnHover ? 'paused' : 'running',
        }}
      />
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
