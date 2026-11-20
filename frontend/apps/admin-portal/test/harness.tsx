/**
 * Rendering a portal screen in a component test, as the app does: React Query (no retries, so a
 * failure shows at once), toasts and confirm dialogs. The signed-in user, the location in the
 * header and the router are stood in for per test file:
 *
 *   vi.mock('next/navigation', () => import('@/test/next-navigation'));
 *   vi.mock('@/components/auth-provider', () => import('@/test/auth'));
 *   vi.mock('@/components/location-context', () => import('@/test/location'));
 *
 * and the API the screen calls is mocked with vi.mock('@/lib/api', …) in the test file itself.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { ConfirmProvider } from '@/components/confirm-provider';
import { ToastProvider } from '@/components/toast-provider';

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: Infinity },
    },
  });
}

export function renderScreen(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );

  return { queryClient, user: userEvent.setup(), ...render(ui, { ...options, wrapper }) };
}

/** An API reply as the services send it: `{ data, message, success }`. */
export const reply = <T,>(data: T) => Promise.resolve({ data, message: 'Success', success: true });

/** A page of a list, as list endpoints send it. */
export const page = <T,>(items: T[]) =>
  reply({ items, meta: { limit: 100, page: 1, total: items.length, totalPages: 1 } });
