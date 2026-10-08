'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen } from '@/components/record-link';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage } from '@/lib/api';

const loadingRows = ['one', 'two', 'three', 'four', 'five'];

/** The location chosen in the header, by name; null for "All Locations". */
export function useLocationName(): string | null {
  const { selectedLocation } = useLocationContext();

  return selectedLocation ? selectedLocation.displayName || selectedLocation.hospitalName : null;
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
    return (
      <>
        {loadingRows.map((row) => (
          <tr key={row}>
            <td className="px-4 py-3" colSpan={colSpan}>
              <Skeleton className="h-9 w-full" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td
          className="px-4 py-12 text-center text-sm font-medium text-ds-status-bad-fg"
          colSpan={colSpan}
        >
          {getApiErrorMessage(error)}
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
