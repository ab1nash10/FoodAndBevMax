import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './utils';

// Colours are the portal's design tokens (ds-*), so they follow its light and dark themes.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control text-[14px] font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:pointer-events-none disabled:opacity-50',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-control px-[18px]',
        icon: 'h-control w-control',
        sm: 'h-9 px-3.5 text-[13px] pointer-coarse:h-11',
      },
      variant: {
        default:
          // Max blue lit from the top (globals.css), on a soft blue glow (premium look).
          'bg-ds-primary text-white shadow-[0_10px_22px_-12px_rgb(11_87_164/0.75)] hover:bg-ds-primary-hover',
        ghost: 'text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text',
        outline:
          'border border-ds-border bg-ds-surface text-ds-text shadow-xs hover:border-ds-primary-border hover:bg-ds-subtle',
        secondary:
          'bg-brand-navy text-white shadow-xs shadow-slate-900/10 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white',
      },
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ asChild = false, className, size, variant, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return <Component className={cn(buttonVariants({ className, size, variant }))} {...props} />;
}
