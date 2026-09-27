import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './utils';

export const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5CAD] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-10 px-4 py-2',
        icon: 'h-10 w-10',
        sm: 'h-9 px-3',
      },
      variant: {
        default: 'bg-[#0B5CAD] text-white shadow-sm shadow-[#0B5CAD]/20 hover:bg-[#084F93]',
        ghost:
          'text-slate-700 hover:bg-[#ECFDF5] hover:text-[#0F766E] dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white',
        outline:
          'border border-slate-200 bg-white text-slate-900 shadow-sm shadow-slate-900/5 hover:border-[#0B5CAD]/30 hover:bg-[#ECFDF5] hover:text-[#0B5CAD] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900',
        secondary:
          'bg-[#0F172A] text-white shadow-sm shadow-slate-900/10 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white',
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
