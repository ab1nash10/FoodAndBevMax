'use client';

import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { KeyboardHint } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { organizationApi } from '@/lib/api';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/command-palette-events';
import { findSubRoute, getActiveNavHref } from '@/lib/navigation';
import { statusPresentation } from '@/lib/status';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';

/** A sidebar page the user may open, passed in by the shell (already permission-filtered). */
export interface PalettePage {
  count?: number;
  group: string;
  href: string;
  label: string;
}

const tones = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  items: 'bg-ds-tile-items-bg text-ds-tile-items-fg',
  kitchens: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  neutral: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
  ok: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
  stores: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg',
};

interface Command {
  abbr: string;
  hint: string;
  href: string;
  keys?: string;
  label: string;
  tone: keyof typeof tones;
}

// Who may create comes from the route registry, so the palette and the pages agree.
function routePermissions(pattern: string): string[] {
  return findSubRoute(pattern)?.permissions ?? [];
}

export const createCommands: Array<Command & { permissions: string[] }> = [
  {
    abbr: '+T',
    hint: 'Store or kitchen to a restaurant',
    href: '/inventory/transfers/new',
    keys: 'N T',
    label: 'New transfer',
    permissions: routePermissions('/inventory/transfers/new'),
    tone: 'info',
  },
  {
    abbr: '+G',
    hint: 'Receive goods into a store',
    href: '/inventory/grns/new',
    keys: 'N G',
    label: 'New GRN',
    permissions: routePermissions('/inventory/grns/new'),
    tone: 'stores',
  },
  {
    abbr: '+P',
    hint: 'Record produced and wasted quantity',
    href: '/kitchen/productions/new',
    keys: 'N P',
    label: 'New kitchen production',
    permissions: routePermissions('/kitchen/productions/new'),
    tone: 'kitchens',
  },
];

/** Two-key shortcuts: N then a letter creates, G then a letter goes to a page. */
const sequences: Record<'g' | 'n', Record<string, string>> = {
  // Go-to order is the order the palette lists them in.
  g: { d: '/dashboard', t: '/inventory/transfers', i: '/masters/items', p: '/kitchen/productions' },
  n: { g: '/inventory/grns/new', p: '/kitchen/productions/new', t: '/inventory/transfers/new' },
};
const goToKeys = Object.fromEntries(
  Object.entries(sequences.g).map(([letter, href]) => [href, `G ${letter.toUpperCase()}`]),
);
const sequenceTimeoutMs = 1200;
const recentStorageKey = 'aahar-palette-recent';
const recentLimit = 3;

function initials(label: string): string {
  const [first = '', second] = label.split(/[\s/&]+/).filter(Boolean);

  return (second ? first.charAt(0) + second.charAt(0) : label.slice(0, 2)).toUpperCase();
}

function matches(command: Command, query: string): boolean {
  return `${command.label} ${command.hint}`.toLowerCase().includes(query);
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

// Recent picks live in this browser only; storage can be blocked, so every access is guarded.
function readRecent(): Command[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(recentStorageKey) ?? '[]');

    return Array.isArray(parsed) ? (parsed as Command[]).filter((item) => item?.href) : [];
  } catch {
    return [];
  }
}

function saveRecent(command: Command): void {
  try {
    const next = [command, ...readRecent().filter((item) => item.href !== command.href)];

    window.localStorage.setItem(recentStorageKey, JSON.stringify(next.slice(0, recentLimit)));
  } catch {
    // Not remembering a recent pick is harmless.
  }
}

const noRecords: Command[] = [];
const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

/** Transfers, GRNs and items whose number, code or name contains the search text. */
function useRecordSearch(term: string): { isFetching: boolean; records: Command[] } {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const canSee = {
    grns: hasPermission('GRN_VIEW'),
    items: hasPermission('ITEM_VIEW'),
    transfers: hasPermission(['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW']),
  };
  const query = useQuery({
    enabled: term.length >= 2,
    queryFn: async () => {
      const base = { hospitalId: scopedHospitalId, limit: 3, search: term };
      // One failing list (no access, network) leaves the other results in place.
      const [transfers, grns, items] = await Promise.all([
        canSee.transfers
          ? organizationApi.listTransfers(base).then(
              (response) => response.data.items,
              () => [],
            )
          : [],
        canSee.grns
          ? organizationApi.listGrns(base).then(
              (response) => response.data.items,
              () => [],
            )
          : [],
        canSee.items
          ? organizationApi.listItems({ limit: 3, search: term }).then(
              (response) => response.data.items,
              () => [],
            )
          : [],
      ]);

      return [
        ...transfers.map((transfer): Command => {
          const status = statusPresentation(transfer.status);

          return {
            abbr: 'TR',
            hint: `${status.label} · ${dateFormatter.format(new Date(transfer.transferDate))}`,
            href: `/inventory/transfers?id=${transfer.id}`,
            label: transfer.transferNumber,
            tone: status.tone,
          };
        }),
        ...grns.map((grn): Command => {
          const status = statusPresentation(grn.status);

          return {
            abbr: 'GR',
            hint: `${status.label} · ${grn.vendorName ?? grn.store.storeName}`,
            href: `/inventory/grns?id=${grn.id}`,
            label: grn.grnNumber,
            tone: status.tone,
          };
        }),
        ...items.map((item): Command => ({
          abbr: 'IT',
          hint: `Item · ${item.itemCode} · ${item.category.categoryName}`,
          href: `/masters/items?id=${item.id}`,
          label: item.itemName,
          tone: 'items',
        })),
      ];
    },
    queryKey: queryKeys.commandPaletteSearch(term, scopedHospitalId ?? 'all', canSee),
    staleTime: 30_000,
  });

  return { isFetching: query.isFetching, records: query.data ?? noRecords };
}

export function CommandPalette({ pages }: Readonly<{ pages: PalettePage[] }>) {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<Command[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // The first key of a two-key shortcut; a ref so a re-render between the keys keeps it.
  const pendingKeyRef = useRef<{ at: number; prefix: 'g' | 'n' } | null>(null);
  const listId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const { isFetching, records } = useRecordSearch(isOpen ? searchTerm : '');
  const activeHref = getActiveNavHref(usePathname());

  const available = useMemo(() => {
    const create = createCommands
      .filter((command) => hasPermission(command.permissions))
      .map(({ permissions: _permissions, ...command }) => command);
    const goTo = pages.map((page): Command => ({
      abbr: initials(page.label),
      hint: [
        page.group,
        page.count ? `${page.count} pending` : null,
        page.href === activeHref ? 'Current page' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: page.href,
      keys: goToKeys[page.href],
      label: page.label,
      tone: 'neutral',
    }));

    return { create, goTo };
  }, [activeHref, hasPermission, pages]);

  const groups = useMemo(() => {
    const filter = (commands: Command[]) =>
      normalizedQuery ? commands.filter((command) => matches(command, normalizedQuery)) : commands;

    return [
      { items: normalizedQuery ? records : [], label: 'Results' },
      { items: filter(recent), label: 'Recent' },
      { items: filter(available.create), label: 'Create' },
      // Without a search, Go to lists only the pages that have a shortcut.
      {
        items: normalizedQuery
          ? filter(available.goTo)
          : Object.values(sequences.g).flatMap(
              (href) => available.goTo.find((page) => page.href === href) ?? [],
            ),
        label: 'Go to',
      },
    ].filter((group) => group.items.length > 0);
  }, [available, normalizedQuery, recent, records]);
  const flatItems = groups.flatMap((group) => group.items);
  const activeItem = flatItems[Math.min(activeIndex, flatItems.length - 1)];
  const optionId = (index: number) => `${listId}-option-${index}`;
  // Records (search results and recent picks) are remembered when opened; commands are not.
  const isRecord = (item: Command) => records.includes(item) || recent.includes(item);

  function open() {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setRecent(readRecent());
    setQuery('');
    setSearchTerm('');
    setActiveIndex(0);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    returnFocusRef.current?.focus();
  }

  function run(command: Command) {
    if (isRecord(command)) {
      saveRecent({
        abbr: command.abbr,
        hint: command.hint,
        href: command.href,
        label: command.label,
        tone: command.tone,
      });
    }

    close();
    router.push(command.href);
  }

  // Ctrl/Cmd+K anywhere, the top bar's search button, and the N/G letter sequences.
  useEffect(() => {
    const allowedHrefs = new Set([...available.create, ...available.goTo].map((item) => item.href));

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // Browser autofill (saved passwords, addresses) fires a plain keydown Event with no key.
      if (!(event instanceof globalThis.KeyboardEvent)) {
        return;
      }

      const key = event.key.toLowerCase();

      // Listened for here, not on the search box, so Esc still closes after focus leaves it.
      if (isOpen && key === 'escape') {
        event.preventDefault();
        close();

        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();

        if (isOpen) {
          close();
        } else {
          open();
        }

        return;
      }

      const blocked =
        isOpen ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.defaultPrevented ||
        isTypingTarget(event.target) ||
        document.querySelector('[aria-modal="true"]') !== null;

      if (blocked) {
        pendingKeyRef.current = null;

        return;
      }

      const pending = pendingKeyRef.current;
      pendingKeyRef.current = null;

      if (pending && Date.now() - pending.at < sequenceTimeoutMs) {
        const href = sequences[pending.prefix][key];

        if (href && allowedHrefs.has(href)) {
          event.preventDefault();
          router.push(href);
        }

        return;
      }

      if (key === 'g' || key === 'n') {
        pendingKeyRef.current = { at: Date.now(), prefix: key };
      }
    };

    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
      document.removeEventListener('keydown', onKeyDown);
    };
    // open/close only touch state setters and a ref, so they need no dependency.
  }, [available, isOpen, router]);

  // Wait for a short pause in typing before searching records.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 200);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery, records]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeItem) {
      document
        .getElementById(optionId(flatItems.indexOf(activeItem)))
        ?.scrollIntoView({ block: 'nearest' });
    }
  });

  if (!isOpen) {
    return null;
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const count = flatItems.length;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (count) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => (Math.min(current, count - 1) + step + count) % count);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();

      if (activeItem) {
        run(activeItem);
      }
    } else if (event.key === 'Tab') {
      // Keep focus in the search box; the Close button is for the mouse, Esc does the same.
      event.preventDefault();
    }
  }

  const isSearching = normalizedQuery.length >= 2 && (isFetching || searchTerm !== query.trim());
  let index = -1;

  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center bg-ds-overlay p-4 pt-[10vh] backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        aria-label="Search and commands"
        aria-modal="true"
        className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-ds-border bg-ds-surface shadow-2xl"
        role="dialog"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-ds-border px-4 text-ds-muted">
          <label className="flex min-w-0 flex-1 items-center gap-3 self-stretch">
            <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
            <input
              aria-activedescendant={
                activeItem ? optionId(flatItems.indexOf(activeItem)) : undefined
              }
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              aria-label="Search or type a command"
              autoComplete="off"
              autoFocus
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ds-text outline-hidden placeholder:text-ds-muted focus-visible:outline-hidden"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search transfers, GRNs, items, or type a command…"
              role="combobox"
              spellCheck={false}
              type="text"
              value={query}
            />
          </label>
          <button
            aria-label="Close"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-ds-primary"
            onClick={close}
            type="button"
          >
            <KeyboardHint keys={['Esc']} />
          </button>
        </div>

        <div
          aria-label="Results"
          className="max-h-[min(420px,60vh)] overflow-y-auto p-2"
          id={listId}
          role="listbox"
        >
          {groups.map((group, groupIndex) => (
            <div
              aria-labelledby={`${listId}-group-${groupIndex}`}
              className="flex flex-col gap-0.5 pb-1.5"
              key={group.label}
              role="group"
            >
              <div
                className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ds-muted"
                id={`${listId}-group-${groupIndex}`}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                index += 1;
                const itemIndex = index;
                const isActive = item === activeItem;

                return (
                  <div
                    aria-selected={isActive}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2.5 py-1',
                      isActive && 'bg-ds-selected',
                    )}
                    id={optionId(itemIndex)}
                    key={`${group.label}-${item.href}`}
                    onClick={() => run(item)}
                    // Keep focus in the search box when an option is clicked.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActiveIndex(itemIndex)}
                    role="option"
                    tabIndex={-1}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10.5px] font-extrabold',
                        tones[item.tone] ?? tones.neutral,
                      )}
                    >
                      {item.abbr}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-bold text-ds-text">
                        {item.label}
                      </span>
                      <span className="truncate text-xs text-ds-muted">{item.hint}</span>
                    </span>
                    {item.keys ? (
                      <KeyboardHint className="hidden sm:inline-flex" keys={item.keys.split(' ')} />
                    ) : null}
                    {isActive ? (
                      <CornerDownLeft
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-ds-link"
                        strokeWidth={2}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {isSearching ? (
            <p className="px-3 py-2 text-[13px] text-ds-muted" role="status">
              Searching records…
            </p>
          ) : null}
          {!isSearching && flatItems.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ds-muted" role="status">
              No matches for “{query.trim()}”. Try a transfer number like TRF0042.
            </p>
          ) : null}
        </div>

        <div className="hidden flex-wrap gap-x-4 gap-y-1 border-t border-ds-border bg-ds-subtle px-4 py-2.5 text-xs text-ds-muted sm:flex">
          <span>
            <kbd className="font-sans font-bold text-ds-text-3">↑ ↓</kbd> move
          </span>
          <span>
            <kbd className="font-sans font-bold text-ds-text-3">Enter</kbd> open
          </span>
          <span>
            <kbd className="font-sans font-bold text-ds-text-3">N</kbd> then a letter to create
          </span>
        </div>
      </div>
    </div>
  );
}
