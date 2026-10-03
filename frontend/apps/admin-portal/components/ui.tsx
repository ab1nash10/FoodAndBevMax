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
        'h-control w-full rounded-control border border-ds-input bg-ds-surface px-3 text-sm text-ds-text outline-hidden transition placeholder:text-ds-muted focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted dark:focus:border-ds-link dark:focus:ring-ds-link/20',
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

interface FieldProps {
  children: ReactNode;
  error?: ReactNode;
  label: string;
  name: string;
}

export function Field({ children, error, label, name }: FieldProps) {
  // Not space-y-2: Tailwind 4 spaces children with a bottom margin, which the inline label ignores.
  return (
    <div className="[&>*+*]:mt-2">
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
  return (
    <div className={cn('animate-pulse rounded-control bg-ds-divider', className)} {...props} />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-ds-border bg-ds-surface shadow-card', className)}
      {...props}
    />
  );
}
