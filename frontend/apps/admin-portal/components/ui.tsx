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
        'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm shadow-slate-900/5 outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/15 dark:disabled:bg-slate-900',
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
          'h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-950 shadow-sm shadow-slate-900/5 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-400/15 dark:disabled:bg-slate-900',
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
          'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400',
          disabled && 'text-slate-300 dark:text-slate-600',
        )}
      />
    </span>
  ),
);

Select.displayName = 'Select';

export function Label({ className, ...props }: ComponentPropsWithoutRef<'label'>) {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none text-slate-700 dark:text-slate-300',
        className,
      )}
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
        'inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-semibold capitalize shadow-sm shadow-slate-900/5',
        variant === 'success' &&
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
        variant === 'danger' &&
          'border-red-200 bg-red-50 text-brand-danger dark:border-red-900 dark:bg-red-950 dark:text-red-300',
        variant === 'warning' &&
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
        variant === 'info' &&
          'border-blue-200 bg-blue-50 text-brand-info dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
        variant === 'neutral' &&
          'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800/80', className)}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/20',
        className,
      )}
      {...props}
    />
  );
}
