'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, Info, X } from 'lucide-react';
import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ToastVariant = 'error' | 'info' | 'success';

interface ToastInput {
  /** A link to what the toast is about, e.g. { href: '/inventory/transfers?id=…', label: 'View TRF0043' }. */
  action?: { href: string; label: string };
  description?: string;
  title: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  id: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  dismissToast: (id: string) => void;
  showToast: (toast: ToastInput) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  error: 'border-ds-status-bad-fg/25 bg-ds-status-bad-bg text-ds-status-bad-fg',
  info: 'border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg',
  success: 'border-ds-status-ok-fg/25 bg-ds-status-ok-bg text-ds-status-ok-fg',
};

const variantIcons: Record<ToastVariant, typeof CheckCircle2> = {
  error: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ action, description, title, variant = 'info' }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        {
          action,
          description,
          id,
          title,
          variant,
        },
      ]);

      // A toast with a link stays a little longer, so there is time to follow it.
      window.setTimeout(() => dismissToast(id), action ? 8000 : 5000);

      return id;
    },
    [dismissToast],
  );

  const contextValue = useMemo(
    () => ({
      dismissToast,
      showToast,
    }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const Icon = variantIcons[toast.variant];

          return (
            <div
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 shadow-lg shadow-ds-text/10 backdrop-blur-sm',
                variantStyles[toast.variant],
              )}
              key={toast.id}
              role="status"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 text-sm opacity-80">{toast.description}</p>
                ) : null}
                {toast.action ? (
                  <Link
                    className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-sm font-bold underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-current"
                    href={toast.action.href}
                    onClick={() => dismissToast(toast.id)}
                  >
                    {toast.action.label}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
              <button
                aria-label="Dismiss notification"
                className="rounded-md p-1 opacity-70 transition hover:bg-ds-surface/60 hover:opacity-100"
                onClick={() => dismissToast(toast.id)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
