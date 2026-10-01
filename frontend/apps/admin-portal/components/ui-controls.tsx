'use client';

// Interactive primitives live apart from ui.tsx so server-rendered pages can keep importing the
// static pieces (Panel, Field, Badge...) without being pulled into the client bundle.
import { cn } from '@/lib/utils';
import { Minus, Plus, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

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
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:cursor-not-allowed disabled:opacity-60',
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
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
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
              'inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control-lg border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface',
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
    'grid w-11 shrink-0 place-items-center bg-ds-subtle text-ds-text-2 transition hover:bg-ds-divider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="inline-flex h-12 items-stretch overflow-hidden rounded-control-lg border border-ds-input bg-ds-surface">
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
        className="w-20 border-x border-ds-input bg-ds-surface text-center text-base font-bold text-ds-text outline-none [appearance:textfield] focus:ring-2 focus:ring-inset focus:ring-ds-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
    <div className="fixed inset-0 z-50 !mt-0 flex items-start justify-center overflow-y-auto bg-ds-text/50 p-4 backdrop-blur-sm sm:p-6">
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
          <h2 className="text-lg font-bold text-ds-text">{title}</h2>
          <button
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-ds-border text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary"
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
