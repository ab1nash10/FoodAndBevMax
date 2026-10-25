'use client';

import { Button } from '@aahar/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen } from '@/components/record-link';
import { TableSkeletonRows } from '@/components/design-system';
import { getApiErrorMessage } from '@/lib/api';

/** The location chosen in the header, by name; null for "All Locations". */
export function useLocationName(): string | null {
  const { selectedLocation } = useLocationContext();

  return selectedLocation ? selectedLocation.displayName || selectedLocation.hospitalName : null;
}

/**
 * What failed to load, announced, with a retry of just the queries that failed on the page (the
 * toolbar's refresh reloads everything).
 */
export function LoadError({ error }: Readonly<{ error: unknown }>) {
  const queryClient = useQueryClient();

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center" role="alert">
      <p className="text-sm font-medium text-ds-status-bad-fg">{getApiErrorMessage(error)}</p>
      <Button
        onClick={() =>
          void queryClient.refetchQueries({
            predicate: (query) => query.state.status === 'error',
            type: 'active',
          })
        }
        size="sm"
        type="button"
        variant="outline"
      >
        Try again
      </Button>
    </div>
  );
}

/**
 * A list table's body while it loads, fails or has nothing to show. An empty list names the
 * location chosen in the header; `atLocation` is off for lists that are not kept per location.
 */
export function QueryState({
  atLocation = true,
  colSpan,
  error,
  hint,
  isError,
  isLoading,
  label,
}: Readonly<{
  atLocation?: boolean;
  colSpan: number;
  error: unknown;
  /** How records get here, when that is more useful than the general line. */
  hint?: string;
  isError: boolean;
  isLoading: boolean;
  label: string;
}>) {
  const locationName = useLocationName();

  if (isLoading) {
    // Shaped like the list's rows. Phones keep two cells, as a list there shows few columns.
    return (
      <>
        <tr className="sr-only">
          <td colSpan={colSpan}>
            <span role="status">Loading {label}…</span>
          </td>
        </tr>
        <TableSkeletonRows
          cells={Array.from({ length: colSpan - 1 }, (_, index) =>
            index === 0 ? undefined : 'hidden sm:table-cell',
          )}
          rows={5}
        />
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td className="px-4 py-12" colSpan={colSpan}>
          <LoadError error={error} />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto max-w-sm">
          <p className="text-sm font-semibold text-ds-text">
            {atLocation && locationName ? `No ${label} at ${locationName}` : `No ${label} found`}
          </p>
          <p className="mt-1 text-sm text-ds-muted">
            {hint ?? 'Nothing has been added yet, or nothing matches the filters.'}
          </p>
        </div>
      </td>
    </tr>
  );
}

/**
 * Something a form needs that the location does not have yet, with a link to set it up for
 * users who may open that page.
 */
export function SetupNotice({
  children,
  href,
  linkLabel,
}: Readonly<{ children: ReactNode; href?: string; linkLabel?: string }>) {
  return (
    <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg p-3 text-sm font-medium text-ds-status-pending-fg">
      {children}
      {href && linkLabel ? (
        <IfCanOpen href={href}>
          {' '}
          <Link className="font-semibold underline underline-offset-2" href={href}>
            {linkLabel}
          </Link>
        </IfCanOpen>
      ) : null}
    </div>
  );
}
