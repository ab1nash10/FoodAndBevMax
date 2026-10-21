import { titleCase } from '@/lib/names';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

// Fields named like a name or a code but holding something technical, left exactly as typed.
const technicalFields = new Set([
  'hostName',
  'pinelabMerchantStorePosCode',
  'postalCode',
  'userName',
  'username',
]);

/**
 * The naming convention for a name a person types (a field called "name" or "…Name", by its
 * form name or else its id): Title Case, acronyms kept (lib/names.ts).
 */
export function isNameField(key: string | undefined): boolean {
  return Boolean(key) && !technicalFields.has(key!) && (key === 'name' || /[a-z]Name$/.test(key!));
}

/** A code a person types (a field called "…Code"): upper case. */
export function isCodeField(key: string | undefined): boolean {
  return Boolean(key) && !technicalFields.has(key!) && /[a-z]Code$/.test(key!);
}

/** Rewrites what is in the box, keeping the cursor where it was (a rewrite moves it to the end). */
function rewrite(input: HTMLInputElement, value: string): boolean {
  if (input.value === value) {
    return false;
  }

  const { selectionEnd, selectionStart } = input;

  input.value = value;

  if (document.activeElement === input) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }

  return true;
}

export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(
  ({ className, onBlur, onChange, type = 'text', ...props }, ref) => {
    const key = props.name ?? props.id;
    const isName = type === 'text' && Boolean(onChange) && isNameField(key);
    const isCode = type === 'text' && Boolean(onChange) && isCodeField(key);

    return (
      <input
        className={cn(
          'h-control w-full rounded-control border border-ds-input bg-ds-surface px-3 text-sm text-ds-text outline-hidden transition placeholder:text-ds-muted focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted dark:focus:border-ds-link dark:focus:ring-ds-link/20',
          className,
        )}
        onBlur={
          isName
            ? (event) => {
                // Title Case once the name is typed, so letters don't change under the cursor.
                if (rewrite(event.target, titleCase(event.target.value))) {
                  onChange?.(event);
                }

                onBlur?.(event);
              }
            : onBlur
        }
        onChange={
          isName || isCode
            ? (event) => {
                const { value } = event.target;

                // While typing: a name's first letter is a capital, a code is all capitals.
                rewrite(
                  event.target,
                  isCode ? value.toUpperCase() : value.charAt(0).toUpperCase() + value.slice(1),
                );
                onChange?.(event);
              }
            : onChange
        }
        ref={ref}
        // Autofill/temp-mail extensions inject attributes before hydration.
        suppressHydrationWarning
        type={type}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  ({ className, children, disabled, ...props }, ref) => (
    <span className="relative block w-full">
      <select
        className={cn(
          'h-control w-full appearance-none rounded-control border border-ds-input bg-ds-surface px-3 pr-8 text-sm text-ds-text outline-hidden transition focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted dark:focus:border-ds-link dark:focus:ring-ds-link/20',
          className,
        )}
        disabled={disabled}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted',
          disabled && 'opacity-50',
        )}
      />
    </span>
  ),
);

Select.displayName = 'Select';

export function Label({ className, ...props }: ComponentPropsWithoutRef<'label'>) {
  return (
    <label
      className={cn('text-[13px] font-semibold leading-none text-ds-text-2', className)}
      {...props}
    />
  );
}

export function FieldError({ children }: Readonly<{ children?: ReactNode }>) {
  if (!children) {
    return null;
  }

  return <p className="text-sm font-medium text-ds-status-bad-fg">{children}</p>;
}

/** The mark after a label whose field must be filled in. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-ds-status-bad-fg">
      *
    </span>
  );
}

interface FieldProps {
  children: ReactNode;
  error?: ReactNode;
  label: string;
  name: string;
  /** Marks the label with a red asterisk; the form's own validation still enforces it. */
  required?: boolean;
}

export function Field({ children, error, label, name, required }: FieldProps) {
  // Not space-y-2: Tailwind 4 spaces children with a bottom margin, which the inline label ignores.
  return (
    <div className="[&>*+*]:mt-2">
      <Label htmlFor={name}>
        {label}
        {required ? (
          <>
            <RequiredMark />
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'danger' | 'info' | 'neutral' | 'success' | 'warning';
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold capitalize',
        variant === 'success' && 'bg-ds-status-ok-bg text-ds-status-ok-fg',
        variant === 'danger' && 'bg-ds-status-bad-bg text-ds-status-bad-fg',
        variant === 'warning' && 'bg-ds-status-pending-bg text-ds-status-pending-fg',
        variant === 'info' && 'bg-ds-status-info-bg text-ds-status-info-fg',
        variant === 'neutral' && 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-control', className)} {...props} />;
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'reveal rounded-card border border-ds-border bg-ds-surface shadow-card',
        className,
      )}
      {...props}
    />
  );
}
