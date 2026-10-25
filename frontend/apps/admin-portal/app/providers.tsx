'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from '@/components/auth-provider';
import { ConfirmProvider } from '@/components/confirm-provider';
import { LocationProvider } from '@/components/location-context';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast-provider';
import { createQueryClient } from '@/lib/query-client';

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(createQueryClient);

  // A focused number box changes its value under the mouse wheel; quantities and prices then
  // change by accident while scrolling the form. Blurring it lets the wheel scroll the page.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        target === document.activeElement
      ) {
        target.blur();
      }
    };

    document.addEventListener('wheel', onWheel, { capture: true, passive: true });

    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <LocationProvider>{children}</LocationProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
