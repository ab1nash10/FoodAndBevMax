'use client';

import { Button } from '@aahar/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Input, Panel } from '@/components/ui';
import { organizationApi } from '@/lib/api';

const PAGE_SIZE = 20;

/** Shown as `CODE - Name, City, State`, matching how locations are identified operationally. */
function locationLabel(hospital: {
  city?: string | null;
  hospitalCode: string;
  hospitalName: string;
  state?: string | null;
}): string {
  const tail = [hospital.hospitalName, hospital.city, hospital.state].filter(Boolean).join(', ');

  return `${hospital.hospitalCode} - ${tail}`;
}

export function LocationPickerDialog({
  onCancel,
  onConfirm,
  selectedIds,
  singleSelect = false,
}: Readonly<{
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
  selectedIds: string[];
  /** A single-location role can only ever hold one, so picking replaces instead of adding. */
  singleSelect?: boolean;
}>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<string[]>(selectedIds);

  const query = useQuery({
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await organizationApi.listHospitals({ limit: PAGE_SIZE, page, search: search || undefined }))
        .data,
    queryKey: ['location-picker', page, search],
  });

  const items = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  const toggle = (id: string) =>
    setDraft((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);

      return singleSelect ? [id] : [...current, id];
    });

  // A short window of page numbers, so 50+ locations do not produce 50 buttons.
  const windowStart = Math.max(1, Math.min(page - 1, totalPages - 2));
  const pageNumbers = Array.from({ length: Math.min(3, totalPages) }, (_, i) => windowStart + i);

  return (
    <div
      aria-label="Select locations"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
    >
      <Panel className="flex max-h-[85vh] w-full max-w-2xl flex-col p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
            Select Location(s)
          </h2>
          <Button aria-label="Close" onClick={onCancel} size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="Search locations"
              className="pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by code, name, or city"
              value={search}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.isLoading ? (
            <div className="grid place-items-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No locations found.</p>
          ) : (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((hospital) => (
                  <tr
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                    key={hospital.id}
                    onClick={() => toggle(hospital.id)}
                  >
                    <td className="w-10 px-5 py-3">
                      <input
                        aria-label={locationLabel(hospital)}
                        checked={draft.includes(hospital.id)}
                        onChange={() => toggle(hospital.id)}
                        onClick={(event) => event.stopPropagation()}
                        type={singleSelect ? 'radio' : 'checkbox'}
                      />
                    </td>
                    <td className="px-2 py-3 text-slate-700 dark:text-slate-200">
                      {locationLabel(hospital)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-500">{hospital.hospitalCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            Showing {firstRow} to {lastRow} of {total} results
            {draft.length > 0 ? ` · ${draft.length} selected` : ''}
          </p>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers.map((number) => (
              <Button
                key={number}
                onClick={() => setPage(number)}
                size="icon"
                type="button"
                variant={number === page ? 'default' : 'outline'}
              >
                {number}
              </Button>
            ))}
            <Button
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={() => onConfirm(draft)} type="button">
            Add {draft.length || ''} location{draft.length === 1 ? '' : 's'}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
