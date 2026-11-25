'use client';

// Interactive primitives live apart from ui.tsx so server-rendered pages can keep importing the
// static pieces (Panel, Field, Badge...) without being pulled into the client bundle.
import { SlideIndicator, useSlidingIndicator } from '@/components/swiss-motion';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Eye, EyeOff, Minus, Plus, Search, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

/** A password box with an eye button that shows or hides what has been typed. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<'input'>, 'type'>
>(({ className, disabled, ...props }, ref) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span className="relative block w-full">
      <Input
        className={cn('pr-10', className)}
        disabled={disabled}
        ref={ref}
        type={isVisible ? 'text' : 'password'}
        {...props}
      />
      <button
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-control text-ds-muted transition hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => setIsVisible((current) => !current)}
        type="button"
      >
        {isVisible ? (
          <EyeOff aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Eye aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
    </span>
  );
});

PasswordInput.displayName = 'PasswordInput';

interface ToggleProps {
  /** Accessible name when there is no visible `label`. */
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  id?: string;
  label?: ReactNode;
  onChange: (checked: boolean) => void;
}

/**
 * Switch-styled boolean control. The POS masters spec describes every status field as a toggle
 * button rather than a checkbox, so grid rows and forms share this control.
 */
export function Toggle({ ariaLabel, checked, disabled = false, id, label, onChange }: ToggleProps) {
  const control = (
    <button
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-ds-primary bg-ds-primary' : 'border-ds-input bg-ds-divider',
      )}
      disabled={disabled}
      id={id}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );

  if (!label) {
    return control;
  }

  // A <label> around the switch names it by the text and lets the text flip it.
  return (
    <label className="flex min-h-control items-center gap-3 rounded-control border border-ds-border bg-ds-surface px-3.5 text-sm font-medium text-ds-text-2">
      {control}
      <span>{label}</span>
    </label>
  );
}

interface FilterTabsProps<TValue extends string> {
  label: string;
  onChange: (value: TValue) => void;
  options: Array<{ count?: number; label: string; value: TValue }>;
  value: TValue;
}

/**
 * Pill filter buttons with optional counts, as in the transfers and menu concepts. A filter, not
 * a tab panel, so it is a labelled group of pressed/unpressed buttons.
 */
export function FilterTabs<TValue extends string>({
  label,
  onChange,
  options,
  value,
}: FilterTabsProps<TValue>) {
  return (
    // Wraps rather than scrolls sideways, so every choice is visible on a phone.
    <div aria-label={label} className="flex flex-wrap gap-2" role="group">
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control-lg border px-3.5 text-sm font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface',
              isActive
                ? 'border-ds-primary bg-ds-primary text-white'
                : 'border-ds-border bg-ds-surface text-ds-text-2 hover:bg-ds-subtle',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-ds-subtle text-ds-text-3',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

interface QuantityStepperProps {
  /** 38px tall and fills its cell, for steppers inside table rows. */
  compact?: boolean;
  /** Put on the number input, so errors can move focus to it. */
  id?: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  step?: number;
  /** 56px tall with wide buttons, for touch screens (kitchen tablet, receiving). */
  touch?: boolean;
  value: string;
}

/**
 * Minus / value / plus control from the acknowledgement concept. The value stays editable for
 * decimals; it is held to [min, max] when a button is used or the field loses focus.
 */
export function QuantityStepper({
  compact = false,
  id,
  label,
  max,
  min = 0,
  onChange,
  step = 1,
  touch = false,
  value,
}: QuantityStepperProps) {
  const numeric = Number(value || 0);
  const commit = (next: number) => {
    const held = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, next));

    onChange(String(Number(held.toFixed(3))));
  };
  const buttonClass =
    // On a touch screen (pointer-coarse) the compact stepper grows to finger size.
    (compact
      ? 'grid w-9 pointer-coarse:w-12 '
      : touch
        ? 'grid w-14 active:bg-ds-divider '
        : 'grid w-11 ') +
    'shrink-0 place-items-center bg-ds-subtle text-ds-text-2 transition hover:bg-ds-divider focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden border border-ds-input bg-ds-surface',
        compact
          ? 'h-[38px] w-full rounded-control border-[1.5px] pointer-coarse:h-11'
          : touch
            ? 'h-14 rounded-control-lg'
            : 'h-12 rounded-control-lg',
      )}
    >
      <button
        aria-label={`Decrease ${label}`}
        className={buttonClass}
        disabled={numeric <= min}
        onClick={() => commit(numeric - step)}
        type="button"
      >
        <Minus className={touch ? 'h-5 w-5' : 'h-4 w-4'} />
      </button>
      <input
        aria-label={label}
        id={id}
        className={cn(
          'border-x border-ds-input bg-ds-surface text-center font-bold text-ds-text outline-hidden focus:ring-2 focus:ring-inset focus:ring-ds-primary',
          compact
            ? 'w-full min-w-0 text-[13.5px] tabular-nums'
            : touch
              ? 'w-24 text-xl tabular-nums'
              : 'w-20 text-base',
        )}
        inputMode="decimal"
        max={max}
        min={min}
        onBlur={() => commit(numeric)}
        onChange={(event) => onChange(event.target.value)}
        step="any"
        type="number"
        value={value}
      />
      <button
        aria-label={`Increase ${label}`}
        className={buttonClass}
        disabled={max !== undefined && numeric >= max}
        onClick={() => commit(numeric + step)}
        type="button"
      >
        <Plus className={touch ? 'h-5 w-5' : 'h-4 w-4'} />
      </button>
    </div>
  );
}

interface ModalProps {
  children: ReactNode;
  /** A line under the title: what this panel is for. */
  description?: string;
  footer?: ReactNode;
  /** Before the title, for a record's panel: its picture (RecordAvatar). */
  leading?: ReactNode;
  /** Under the title, for a record's panel: its code, type and status as small tags. */
  meta?: ReactNode;
  onClose: () => void;
  open: boolean;
  /**
   * Where focus goes on close when the dialog never saw what opened it: a panel on its own route
   * mounts after the click, on a list that is mounted anew when it closes.
   */
  returnFocusTo?: { href?: string; label?: string };
  /** Docks the pop-up on the right at full height, so the list it came from stays in view. */
  side?: boolean;
  title: string;
}

/**
 * Centred pop-up used by the POS masters. The spec asks for create/edit to open as a pop-up over
 * the grid instead of pushing the table down the page.
 */
/**
 * A dropdown of checkable options, styled like Select, for picking several values. The closed
 * box lists what is picked, or the placeholder when nothing is.
 */
export function MultiSelectDropdown<TValue extends string>({
  emptyText = 'No options',
  id,
  onChange,
  options,
  placeholder,
  value,
}: Readonly<{
  emptyText?: string;
  id: string;
  onChange: (value: TValue[]) => void;
  options: Array<{ label: string; value: TValue }>;
  placeholder: string;
  value: TValue[];
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const picked = options.filter((option) => value.includes(option.value));

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);

    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
        }
      }}
      ref={rootRef}
    >
      <button
        aria-controls={`${id}-options`}
        aria-expanded={isOpen}
        className="flex h-control w-full items-center gap-2 rounded-control border border-ds-input bg-ds-surface px-3 text-left text-sm text-ds-text outline-hidden transition focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 dark:focus:border-ds-link dark:focus:ring-ds-link/20"
        id={id}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className={cn('min-w-0 flex-1 truncate', picked.length === 0 && 'text-ds-muted')}>
          {picked.length ? picked.map((option) => option.label).join(', ') : placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ds-muted" />
      </button>
      {isOpen ? (
        <div
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-control border border-ds-border bg-ds-surface p-1 shadow-card"
          id={`${id}-options`}
          role="group"
        >
          {options.length ? (
            options.map((option) => (
              <label
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-sm text-ds-text hover:bg-ds-subtle"
                key={option.value}
              >
                <input
                  checked={value.includes(option.value)}
                  className="h-4 w-4"
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, option.value]
                        : value.filter((selected) => selected !== option.value),
                    )
                  }
                  type="checkbox"
                />
                {option.label}
              </label>
            ))
          ) : (
            <p className="px-2.5 py-2 text-sm text-ds-muted">{emptyText}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A record's read-only details, opened from a list's View action; `rows` null keeps it closed. */
export function DetailsModal({
  onClose,
  rows,
  title,
}: Readonly<{ onClose: () => void; rows: Array<[string, ReactNode]> | null; title: string }>) {
  return (
    <Modal onClose={onClose} open={rows !== null} title={title}>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows?.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold text-ds-muted">{label}</dt>
            <dd className="mt-0.5 wrap-break-word text-sm font-medium text-ds-text">{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  children,
  description,
  footer,
  leading,
  meta,
  onClose,
  open,
  returnFocusTo,
  side = false,
  title,
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only the dialog on top closes: a confirm opened over another dialog (Discard over the
      // unsent bills) must not take the one underneath with it. It is the last in the page.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');

      if (event.key === 'Escape' && dialogs[dialogs.length - 1] === dialogRef.current) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose, open]);

  const dialogRef = useRef<HTMLDivElement>(null);
  // What had focus when the dialog opened. A ref, so it survives React running the effect twice
  // in development; the link or label finds it again on a list that mounted anew.
  const openerRef = useRef<{ element: Element; href?: string; label?: string }>(null);
  // The latest, so an edit panel whose title arrives with its record is found by that title.
  const returnFocusRef = useRef(returnFocusTo);

  useEffect(() => {
    returnFocusRef.current = returnFocusTo;
  });

  // Focus goes into the dialog when it opens (unless a field inside already took it), Tab stays
  // in it, and on close focus goes back to what opened it. Its own effect, keyed on `open`
  // alone: callers pass a new onClose on every render.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!open || !dialog) {
      return undefined;
    }

    if (!dialog.contains(document.activeElement)) {
      const element = document.activeElement;

      if (element && element !== document.body) {
        openerRef.current ??= {
          element,
          href: element.getAttribute('href') ?? undefined,
          label: element.getAttribute('aria-label') ?? undefined,
        };
      }

      dialog.focus();
    }

    const trapTab = (event: KeyboardEvent) => {
      const active = document.activeElement;

      // A dialog opened inside this one keeps Tab for itself.
      if (event.key !== 'Tab' || (active && active.closest('[role="dialog"]') !== dialog)) {
        return;
      }

      const stops = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) =>
          element.closest('[role="dialog"]') === dialog && element.getClientRects().length > 0,
      );
      const first = stops[0];
      const last = stops.at(-1);

      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapTab);

    return () => {
      document.removeEventListener('keydown', trapTab);

      requestAnimationFrame(() => {
        // Still open: the effect ran again, nothing closed.
        if (dialogRef.current?.isConnected) {
          return;
        }

        const opener = openerRef.current ?? returnFocusRef.current;

        openerRef.current = null;

        // A panel on its own route (/new, /edit) closes back to a list that mounts again: the
        // link to that route, or the control with that label, there. The first that takes
        // focus wins (a copy in a closed menu does not).
        const candidates = () => [
          ...(opener && 'element' in opener && opener.element instanceof HTMLElement
            ? [opener.element]
            : []),
          ...(opener?.href
            ? document.querySelectorAll<HTMLElement>(`a[href$="${CSS.escape(opener.href)}"]`)
            : []),
          ...(opener?.label
            ? document.querySelectorAll<HTMLElement>(`[aria-label="${CSS.escape(opener.label)}"]`)
            : []),
        ];

        // The list may take a few frames to show it; give up after about half a second.
        const giveBack = (framesLeft: number) => {
          // Only while nothing else took focus as the dialog went (it falls to the body).
          if (document.activeElement !== document.body && document.activeElement) {
            return;
          }

          const focused = candidates().some((element) => {
            element.focus();

            return document.activeElement === element;
          });

          if (!focused && framesLeft > 0) {
            requestAnimationFrame(() => giveBack(framesLeft - 1));
          }
        };

        giveBack(30);
      });
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    // !mt-0: a parent space-y-* would otherwise push this fixed overlay down.
    <div
      className={cn(
        'fixed inset-0 z-50 mt-0! flex',
        // A side panel keeps the list behind it readable: a light veil, no blur. From sm up it
        // floats as a rounded sheet inset from the edges; on phones it is a bottom sheet, as tall
        // as its content up to 92% of the screen.
        side
          ? 'side-overlay items-end justify-end bg-ds-text/30 sm:items-stretch sm:p-4'
          : 'items-start justify-center overflow-y-auto bg-ds-overlay p-4 backdrop-blur-xs sm:p-6',
      )}
    >
      <button
        aria-label="Close dialog"
        className="fixed inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={title}
        aria-modal="true"
        className={cn(
          'relative z-10 w-full border-ds-border bg-ds-surface shadow-2xl shadow-ds-text/20 outline-hidden',
          side
            ? 'flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden rounded-t-[26px] border-0 shadow-[0_30px_80px_-20px_rgb(14_26_43/0.45)] sm:h-full sm:max-h-none sm:rounded-[26px]'
            : 'my-auto max-w-2xl rounded-card border',
        )}
        data-side={side ? '' : undefined}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {side ? (
          // A bottom sheet's grab handle, on phones only (it is not a control).
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-2 z-10 block h-1 w-10 -translate-x-1/2 rounded-full bg-white/50 sm:hidden"
          />
        ) : null}
        <div
          className={cn(
            'flex justify-between gap-4',
            // Care Kitchen: the record's panel opens on a Max-blue band, its tile beside its name.
            side
              ? 'items-center bg-linear-to-r from-ds-primary to-[#1a66c2] px-6 pb-5 pt-6 text-white sm:pt-5'
              : 'items-start border-b border-ds-divider px-5 py-3.5',
          )}
        >
          <div className={cn('flex min-w-0 gap-4', side ? 'items-center' : 'items-start')}>
            {leading ? (
              <span className={cn('shrink-0', side && '[&>*]:ring-2 [&>*]:ring-white/40')}>
                {leading}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2
                className={cn(
                  'font-semibold',
                  side
                    ? 'text-[21px] font-bold leading-7 tracking-[-0.02em] text-white'
                    : 'text-base text-ds-text',
                )}
              >
                {title}
              </h2>
              {description ? (
                <p className={cn('mt-0.5 text-[13px]', side ? 'text-white/80' : 'text-ds-muted')}>
                  {description}
                </p>
              ) : null}
              {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
            </div>
          </div>
          <button
            aria-label="Close"
            className={cn(
              'grid shrink-0 place-items-center border transition focus-visible:outline-hidden focus-visible:ring-2',
              side
                ? 'h-10 w-10 rounded-full border-white/35 text-white hover:bg-white/15 focus-visible:ring-white'
                : 'h-control w-control rounded-control border-ds-border text-ds-text-3 hover:bg-ds-subtle hover:text-ds-text focus-visible:ring-ds-primary',
            )}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className={cn(
            // relative: anything positioned inside (a label's hidden " (required)") is clipped
            // here; placed by the dialog, it hung below it and the backdrop scrolled the title away.
            'relative overflow-y-auto',
            // min-h-0: in the sheet, which sizes to its content, the body shrinks and scrolls.
            side
              ? 'min-h-0 flex-1 px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
              : 'max-h-[70vh] px-5 py-4',
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              'border-t border-ds-divider',
              side ? 'bg-ds-subtle-2 px-6 py-4' : 'bg-ds-subtle-2 px-5 py-3',
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SegmentedOption<TValue extends string> {
  /** Shown but not choosable; say why in title. */
  disabled?: boolean;
  label: ReactNode;
  title?: string;
  value: TValue;
}

/** Two-to-four way switch (Store | Kitchen, Veg | Non-veg | Egg, Today | 7 days). */
/**
 * A create or edit form opened from a list (its own route, e.g. /masters/items/new): the side
 * panel over that list, closing back to it, so records are created and edited the same way.
 */
export function FormPanel({
  backHref,
  children,
  onClose,
  subtitle,
  title,
}: Readonly<{
  backHref: string;
  children: ReactNode;
  /** Given when the list opened it in place (no URL of its own): closing calls it instead. */
  onClose?: () => void;
  subtitle?: string;
  title: string;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    // The list it closes to is mounted anew: focus goes back to the link to this route (New …)
    // or the control named like this panel (Edit …).
    <Modal
      description={subtitle}
      onClose={onClose ?? (() => router.push(backHref))}
      open
      returnFocusTo={{ href: pathname, label: title }}
      side
      title={title}
    >
      {children}
    </Modal>
  );
}

export function SegmentedControl<TValue extends string>({
  className,
  label,
  onChange,
  options,
  size = 'md',
  value,
}: Readonly<{
  className?: string;
  label: string;
  onChange: (value: TValue) => void;
  options: Array<SegmentedOption<TValue>>;
  /** lg: the full-width 40px switch on the sign-in page. */
  size?: 'lg' | 'md';
  value: TValue;
}>) {
  // The white thumb slides to the option pressed (Swiss motion).
  const { box, rowRef, slides } = useSlidingIndicator<HTMLDivElement>(
    '[aria-pressed="true"]',
    value,
  );
  // The chosen option: a white tab lifted off the grey track.
  const thumb = 'bg-ds-surface shadow-[0_1px_3px_rgb(16_24_40/0.14)]';

  return (
    <div
      aria-label={label}
      className={cn(
        'relative inline-flex gap-0.5 rounded-control bg-ds-status-neutral-bg p-1',
        size === 'lg' && 'grid grid-flow-col auto-cols-fr gap-1 rounded-xl p-1',
        className,
      )}
      ref={rowRef}
      role="group"
    >
      <SlideIndicator box={box} className={cn(thumb, 'rounded-[9px]')} slides={slides} />
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              'relative h-[34px] flex-1 whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
              size === 'lg' &&
                'inline-flex h-10 items-center justify-center gap-2 rounded-[9px] text-[13.5px]',
              isActive ? cn('text-ds-text', !box && thumb) : 'text-ds-text-3 hover:text-ds-text',
              option.disabled && 'cursor-not-allowed opacity-50 hover:text-ds-text-3',
            )}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.title}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface SavedView<TValue extends string> {
  count?: number;
  label: string;
  value: TValue;
}

/**
 * Underlined view tabs with counts (All · Draft · Pending acknowledgement …). Arrow keys,
 * Home and End move between views, as in a standard tab list.
 */
export function SavedViewTabs<TValue extends string>({
  label,
  onChange,
  value,
  views,
}: Readonly<{
  label: string;
  onChange: (value: TValue) => void;
  value: TValue;
  views: Array<SavedView<TValue>>;
}>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveTo(index: number) {
    const view = views[index];

    if (view) {
      tabRefs.current[index]?.focus();
      onChange(view.value);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const last = views.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    if (next !== null) {
      event.preventDefault();
      moveTo(next);
    }
  }

  // The underline slides to the view picked (Swiss motion).
  const { box, rowRef, slides } = useSlidingIndicator<HTMLDivElement>(
    '[aria-selected="true"]',
    value,
  );

  return (
    <div
      aria-label={label}
      className="relative flex gap-1 overflow-x-auto border-b border-ds-border px-3"
      ref={rowRef}
      role="tablist"
    >
      <SlideIndicator box={box} className="bg-ds-primary" slides={slides} underline />
      {views.map((view, index) => {
        const isActive = view.value === value;

        return (
          <button
            aria-selected={isActive}
            className={cn(
              'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[12.5px] transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
              isActive
                ? cn('font-semibold text-ds-text', box ? 'border-transparent' : 'border-ds-primary')
                : 'border-transparent font-medium text-ds-text-3 hover:text-ds-text',
            )}
            key={view.value}
            onClick={() => onChange(view.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {view.label}
            {view.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-[7px] py-px text-[11px] font-bold tabular-nums',
                  isActive
                    ? 'bg-ds-primary-soft text-ds-link'
                    : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
                )}
              >
                {view.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Row of list filters under the view tabs. */
export function FilterBar({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 border-b border-ds-divider p-3', className)}
    >
      {children}
    </div>
  );
}

/** Search field for a FilterBar; grows to fill the row. */
export function FilterSearch({
  label,
  onChange,
  placeholder,
  shortcut = true,
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** "/" anywhere on the page (outside a field or dialog) jumps here; a key hint shows it. */
  shortcut?: boolean;
  value: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;

    function onKeyDown(event: KeyboardEvent) {
      // defaultPrevented: another "/" (a second search on the page, the till) already took it.
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  return (
    <label className="flex h-11 min-w-[160px] flex-1 items-center gap-2.5 rounded-control border border-ds-border bg-ds-surface px-3.5 text-ds-muted transition focus-within:border-ds-primary focus-within:ring-4 focus-within:ring-ds-primary/10">
      <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
      <input
        aria-keyshortcuts={shortcut ? '/' : undefined}
        aria-label={label}
        className="peer min-w-0 flex-1 bg-transparent text-[14px] text-ds-text outline-hidden placeholder:text-ds-muted"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
      />
      {shortcut && !value ? (
        <kbd
          aria-hidden="true"
          className="hidden h-5 min-w-5 place-items-center rounded-md border border-ds-border bg-ds-subtle px-1 font-mono text-[11px] text-ds-muted peer-focus:hidden sm:grid"
        >
          /
        </kbd>
      ) : null}
    </label>
  );
}

/** Compact labelled select for a FilterBar ("From  Any source"). */
export function FilterSelect({
  children,
  disabled = false,
  label,
  onChange,
  value,
}: Readonly<{
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <label
      className={cn(
        'flex h-control items-center gap-1.5 rounded-control border border-ds-input bg-ds-surface pl-3 pr-2 text-[12.5px] text-ds-muted transition focus-within:border-ds-primary focus-within:ring-3 focus-within:ring-ds-primary/10',
        disabled && 'opacity-60',
      )}
    >
      {label}
      <select
        className="max-w-[180px] cursor-pointer bg-transparent text-[12.5px] font-bold text-ds-text outline-hidden disabled:cursor-not-allowed"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

/** Replaces the filter row while rows are ticked: count, actions, clear. */
export function BulkActionBar({
  children,
  count,
  onClear,
}: Readonly<{ children?: ReactNode; count: number; onClear: () => void }>) {
  return (
    <div
      aria-label="Bulk actions"
      className="bulk-float fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-[18px] bg-[#0b1730] py-2 pl-4 pr-2 text-white shadow-[0_24px_48px_-16px_rgb(11_23_48/0.6)] ring-1 ring-white/10 nav:bottom-6 [&_button]:border-0 [&_button]:bg-white/10 [&_button]:text-white [&_button]:shadow-none [&_button:hover]:bg-white/20"
      role="region"
    >
      <span aria-live="polite" className="mr-2 text-[14px] font-semibold text-white">
        {count} selected
      </span>
      {children}
      <button
        className="h-9 rounded-[11px] px-3 text-[13px] font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
        onClick={onClear}
        type="button"
      >
        Clear selection
      </button>
    </div>
  );
}

/**
 * Docked details beside a list: title, status, close button, sections and a footer of
 * actions. Sticks below the top bar on wide screens; Esc closes it.
 */
export function DetailPanel({
  children,
  className,
  footer,
  id,
  label,
  meta,
  onClose,
  status,
  title,
}: Readonly<{
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  id?: string;
  label: string;
  meta?: ReactNode;
  onClose?: () => void;
  status?: ReactNode;
  title: ReactNode;
}>) {
  return (
    <aside
      aria-label={label}
      id={id}
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card nav:sticky nav:top-20',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onClose) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex flex-col gap-1.5 border-b border-ds-divider px-[18px] pb-3.5 pt-4">
        <div className="flex items-center gap-2.5">
          <h2 className="min-w-0 truncate text-lg font-extrabold tabular-nums text-ds-text">
            {title}
          </h2>
          {status}
          {onClose ? (
            <button
              aria-label="Close details"
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-control border border-ds-border text-ds-text-3 transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
              onClick={onClose}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {meta ? <p className="text-[12.5px] text-ds-muted">{meta}</p> : null}
      </div>
      {children}
      {footer ? (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-ds-divider bg-ds-subtle px-[18px] py-3">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
