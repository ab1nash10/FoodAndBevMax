'use client';

// Interactive primitives live apart from ui.tsx so server-rendered pages can keep importing the
// static pieces (Panel, Field, Badge...) without being pulled into the client bundle.
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Minus, Plus, Search, X } from 'lucide-react';
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
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-ds-teal bg-ds-teal' : 'border-ds-input bg-ds-divider',
      )}
      disabled={disabled}
      id={id}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );

  if (!label) {
    return control;
  }

  return (
    <span className="flex min-h-control items-center gap-3 rounded-control border border-ds-border bg-ds-surface px-3.5 text-sm font-medium text-ds-text-2">
      {control}
      <span>{label}</span>
    </span>
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
    <div aria-label={label} className="-mb-1 flex gap-2 overflow-x-auto pb-1" role="group">
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
  value,
}: QuantityStepperProps) {
  const numeric = Number(value || 0);
  const commit = (next: number) => {
    const held = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, next));

    onChange(String(Number(held.toFixed(3))));
  };
  const buttonClass =
    (compact ? 'grid w-9 ' : 'grid w-11 ') +
    'shrink-0 place-items-center bg-ds-subtle text-ds-text-2 transition hover:bg-ds-divider focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden border border-ds-input bg-ds-surface',
        compact ? 'h-[38px] w-full rounded-control border-[1.5px]' : 'h-12 rounded-control-lg',
      )}
    >
      <button
        aria-label={`Decrease ${label}`}
        className={buttonClass}
        disabled={numeric <= min}
        onClick={() => commit(numeric - step)}
        type="button"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label={label}
        id={id}
        className={cn(
          'border-x border-ds-input bg-ds-surface text-center font-bold text-ds-text outline-hidden [appearance:textfield] focus:ring-2 focus:ring-inset focus:ring-ds-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          compact ? 'w-full min-w-0 text-[13.5px] tabular-nums' : 'w-20 text-base',
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
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ModalProps {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}

/**
 * Centred pop-up used by the POS masters. The spec asks for create/edit to open as a pop-up over
 * the grid instead of pushing the table down the page.
 */
export function Modal({ children, footer, onClose, open, title }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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

  if (!open) {
    return null;
  }

  return (
    // !mt-0: a parent space-y-* would otherwise push this fixed overlay down.
    <div className="fixed inset-0 z-50 mt-0! flex items-start justify-center overflow-y-auto bg-ds-overlay p-4 backdrop-blur-xs sm:p-6">
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
        className="relative z-10 my-auto w-full max-w-2xl rounded-card border border-ds-border bg-ds-surface shadow-xl shadow-ds-text/10"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4 border-b border-ds-divider px-5 py-3">
          <h2 className="text-[15px] font-extrabold text-ds-text">{title}</h2>
          <button
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-ds-border text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-ds-divider bg-ds-subtle px-5 py-3">{footer}</div>
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
  return (
    <div
      aria-label={label}
      className={cn(
        'inline-flex gap-0.5 rounded-control border border-ds-border bg-ds-subtle p-[3px]',
        size === 'lg' && 'grid grid-flow-col auto-cols-fr gap-1 rounded-xl p-1',
        className,
      )}
      role="group"
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              'h-8 flex-1 whitespace-nowrap rounded-[7px] px-3 text-[12.5px] font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
              size === 'lg' &&
                'inline-flex h-10 items-center justify-center gap-2 rounded-[9px] text-[13.5px]',
              isActive
                ? 'bg-ds-surface text-ds-text shadow-card ring-1 ring-ds-border'
                : 'text-ds-text-3 hover:text-ds-text',
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

  return (
    <div
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-ds-border px-3"
      role="tablist"
    >
      {views.map((view, index) => {
        const isActive = view.value === value;

        return (
          <button
            aria-selected={isActive}
            className={cn(
              'flex h-[46px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13px] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
              isActive
                ? 'border-ds-primary font-extrabold text-ds-text'
                : 'border-transparent font-semibold text-ds-text-3 hover:text-ds-text',
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
  value,
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}>) {
  return (
    <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-control border border-ds-input bg-ds-surface px-2.5 text-ds-muted focus-within:border-ds-primary focus-within:ring-2 focus-within:ring-ds-primary/15">
      <Search aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
      <input
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ds-text outline-hidden placeholder:text-ds-muted"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
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
        'flex h-9 items-center gap-1.5 rounded-control border border-ds-input bg-ds-surface pl-2.5 pr-1.5 text-[12.5px] text-ds-muted focus-within:border-ds-primary focus-within:ring-2 focus-within:ring-ds-primary/15',
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
      className="flex flex-wrap items-center gap-2 border-b border-ds-divider bg-ds-primary-soft px-3 py-2.5"
      role="region"
    >
      <span aria-live="polite" className="px-1.5 text-[13px] font-extrabold text-ds-link">
        {count} selected
      </span>
      {children}
      <button
        className="ml-auto h-[34px] rounded-control px-2.5 text-[12.5px] font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
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
