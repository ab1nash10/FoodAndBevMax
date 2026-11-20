'use client';

import type { Employee } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Field, Input } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useDebouncedValue } from '@/lib/use-url-state';

/** Search active employees by name or code and pick one (the reporting manager, a new user). */
export function EmployeeSearch({
  excludeId,
  hospitalId,
  id,
  label,
  onPick,
}: Readonly<{
  /** Never offered (the employee being edited, as their own manager). */
  excludeId?: string;
  /** That location's employees and the shared ones; all reachable when left out. */
  hospitalId?: string;
  id: string;
  label: string;
  onPick: (employee: Employee) => void;
}>) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const matchesQuery = useQuery({
    enabled: term.length > 0,
    queryFn: async () => {
      const response = await organizationApi.listEmployees({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 8,
        search: term,
      });

      return response.data.items.filter((match) => match.id !== excludeId);
    },
    queryKey: queryKeys.employees({ hospitalId, pickSearch: term }),
  });
  const matches = matchesQuery.data ?? [];

  return (
    <Field label={label} name={id}>
      <div className="relative">
        <Input
          autoComplete="off"
          id={id}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or code"
          value={search}
        />
        {term ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white py-1 shadow-md">
            {matchesQuery.isLoading ? (
              <li className="px-3 py-2 text-sm text-ds-muted">Searching…</li>
            ) : matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ds-muted">No employee found.</li>
            ) : (
              matches.map((match) => (
                <li key={match.id}>
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-ds-subtle"
                    onClick={() => {
                      onPick(match);
                      setSearch('');
                    }}
                    type="button"
                  >
                    {match.employeeName}{' '}
                    <span className="text-ds-muted">({match.employeeCode})</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
