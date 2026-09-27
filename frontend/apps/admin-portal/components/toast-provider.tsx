'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ToastVariant = 'error' | 'info' | 'success';

interface ToastInput {
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
  error: 'border-red-200 bg-red-50 text-red-950',
  info: 'border-blue-200 bg-blue-50 text-brand-navy',
  success: 'border-emerald-200 bg-brand-mint text-emerald-950',
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
    ({ description, title, variant = 'info' }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setToasts((currentToasts) => [
        ...currentToasts,
        {
          description,
          id,
          title,
          variant,
        },
      ]);

      window.setTimeout(() => dismissToast(id), 5000);

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
                'flex items-start gap-3 rounded-lg border p-4 shadow-lg shadow-slate-900/10 backdrop-blur',
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
              </div>
              <button
                aria-label="Dismiss notification"
                className="rounded-md p-1 opacity-70 transition hover:bg-white/70 hover:opacity-100"
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
