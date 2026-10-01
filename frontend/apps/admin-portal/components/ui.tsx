import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      className={cn(
        'h-control w-full rounded-control border border-ds-input bg-ds-surface px-3 text-sm text-ds-text outline-none transition placeholder:text-ds-muted focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted dark:focus:border-ds-link dark:focus:ring-ds-link/20',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  ),
);

Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  ({ className, children, disabled, ...props }, ref) => (
    <span className="relative block w-full">
      <select
        className={cn(
          'h-control w-full appearance-none rounded-control border border-ds-input bg-ds-surface px-3 pr-8 text-sm text-ds-text outline-none transition focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted dark:focus:border-ds-link dark:focus:ring-ds-link/20',
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

  return <p className="text-sm font-medium text-brand-danger dark:text-red-400">{children}</p>;
}

interface FieldProps {
  children: ReactNode;
  error?: ReactNode;
  label: string;
  name: string;
}

export function Field({ children, error, label, name }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
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
        variant === 'success' &&
          'bg-ds-received-bg text-ds-received-fg dark:bg-emerald-950 dark:text-emerald-300',
        variant === 'danger' &&
          'bg-ds-rejected-bg text-ds-rejected-fg dark:bg-red-950 dark:text-red-300',
        variant === 'warning' &&
          'bg-ds-pending-bg text-ds-pending-fg dark:bg-amber-950 dark:text-amber-300',
        variant === 'info' &&
          'bg-ds-transit-bg text-ds-transit-fg dark:bg-blue-950 dark:text-blue-300',
        variant === 'neutral' && 'bg-ds-subtle text-ds-text-3 ring-1 ring-inset ring-ds-border',
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-control bg-ds-divider', className)} {...props} />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-ds-border bg-ds-surface shadow-sm shadow-ds-text/[0.04] dark:shadow-none',
        className,
      )}
      {...props}
    />
  );
}
