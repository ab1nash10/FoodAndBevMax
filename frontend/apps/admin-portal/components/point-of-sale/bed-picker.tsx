'use client';

import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Input } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_SHOWN = 8;

/**
 * A room order's bed, searched in the beds of the counter's location (Rooms & tables), in any
 * case. Only a bed on that list is taken: `onChange` gets its name, or '' while the text is not
 * one. Enter takes the highlighted match. Give it a new key to start it again (after a bill).
 */
export function BedPicker({
  counterId,
  onChange,
  value,
}: Readonly<{ counterId: string; onChange: (bed: string) => void; value: string }>) {
  const listId = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const bedsQuery = useQuery({
    queryFn: async () => (await organizationApi.listPosBeds(counterId)).data,
    queryKey: ['pos-beds', counterId],
    // Beds change rarely: the list is fetched once per counter and searched here.
    staleTime: 10 * 60_000,
  });
  const beds = bedsQuery.data ?? [];
  const wanted = text.trim().toLowerCase();
  const matches = wanted
    ? beds.filter((bed) => bed.roomName.toLowerCase().includes(wanted)).slice(0, MAX_SHOWN)
    : [];

  const pick = (bed: string) => {
    setText(bed);
    setOpen(false);
    onChange(bed);
  };

  return (
    <div className="relative">
      <Input
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && wanted.length > 0}
        aria-label="Bed number"
        autoComplete="off"
        className="h-9 w-48"
        id="pos-bed"
        onBlur={() => {
          setOpen(false);
          // Typed in full: taken, in the list's own spelling.
          const exact = beds.find((bed) => bed.roomName.toLowerCase() === wanted);
          if (exact) pick(exact.roomName);
        }}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
          onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((current) => (current + step + matches.length) % Math.max(matches.length, 1));
          } else if (event.key === 'Enter' && matches[active]) {
            event.preventDefault();
            pick(matches[active].roomName);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Bed no. *"
        role="combobox"
        value={text}
      />
      {open && wanted ? (
        <ul
          aria-label="Matching beds"
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-control border border-ds-border bg-ds-surface p-1 text-ds-text shadow-xl shadow-ds-text/10"
          id={listId}
          role="listbox"
        >
          {bedsQuery.isLoading ? (
            <li className="px-3 py-2 text-[13px] text-ds-muted">Loading beds…</li>
          ) : beds.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-ds-muted">
              No beds set up at this location. Add them under Organization, Rooms &amp; tables.
            </li>
          ) : matches.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-ds-muted">
              No bed here matches “{text.trim()}”.
            </li>
          ) : (
            matches.map((bed, index) => (
              <li
                aria-selected={index === active}
                className={cn(
                  'cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium',
                  index === active && 'bg-ds-selected',
                )}
                id={`${listId}-${index}`}
                key={bed.id}
                // Before the input's blur, so the click is not lost.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(bed.roomName);
                }}
                role="option"
              >
                {bed.roomName}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
