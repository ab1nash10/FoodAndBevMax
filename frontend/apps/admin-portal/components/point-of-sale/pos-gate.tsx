'use client';

import { MonitorSmartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppPageHeader } from '@/components/design-system';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/api';
import { usePosTill } from './shared';

/** Why a POS screen does not open on this computer. */
export function PosClosed({
  hostname,
  problem,
}: Readonly<{ hostname?: string | null; problem: string }>) {
  return (
    <div className="rounded-card border border-dashed border-ds-border bg-ds-surface p-8 text-center sm:p-10">
      <MonitorSmartphone aria-hidden="true" className="mx-auto h-8 w-8 text-ds-muted" />
      <p className="mx-auto mt-3 max-w-xl font-semibold text-ds-text">{problem}</p>
      {hostname ? (
        <p className="mt-1 text-sm text-ds-muted">
          This computer: <span className="font-mono">{hostname}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The POS module opens only on a computer DNS names as a mapped POS device (POS & Payment
 * Machines → its hostname and restaurants), and only for a user assigned to the location of
 * one of those restaurants. Anywhere else, for anyone else, it says why.
 */
export function PosGate({ children }: Readonly<{ children: ReactNode }>) {
  const till = usePosTill();

  if (till.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const problem = till.isError
    ? getApiErrorMessage(till.error)
    : !till.data?.till
      ? 'This computer is not mapped to a POS, so the POS screens do not open here. Ask an admin to add its hostname to a POS device under POS & Payment Machines.'
      : !till.data.allowed
        ? `You are not assigned to the location of this till’s restaurant (${till.data.restaurants.join(', ')}), so the POS screens do not open for you. Ask an admin to give you access to its location.`
        : null;

  if (problem) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Point of Sale" />
        <PosClosed hostname={till.data?.hostname ?? till.data?.ip} problem={problem} />
      </section>
    );
  }

  return children;
}
