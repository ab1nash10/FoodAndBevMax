'use client';

// Interactive primitives live apart from ui.tsx so server-rendered pages can keep importing the
// static pieces (Panel, Field, Badge...) without being pulled into the client bundle.
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface ToggleProps {
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
export function Toggle({ checked, disabled = false, id, label, onChange }: ToggleProps) {
  const control = (
    <button
      aria-checked={checked}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 disabled:cursor-not-allowed disabled:opacity-60',
        checked
          ? 'border-teal-600 bg-teal-600'
          : 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800',
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
    <span className="flex min-h-10 items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      {control}
      <span>{label}</span>
    </span>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6">
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
        className="relative z-10 my-auto w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
          <button
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/50">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
