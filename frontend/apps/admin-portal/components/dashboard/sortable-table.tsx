'use client';

// Usage:
//   <SortableTable caption="Locations at a glance" columns={[
//       { key: 'name', label: 'Location', render: (r) => r.name, sortValue: (r) => r.name },
//       { align: 'end', key: 'pending', label: 'Pending', render: (r) => r.pending, sortValue: (r) => r.pending },
//     ]} defaultSort={{ dir: 'desc', key: 'pending' }} footer={…cells in column order…}
//     rowKey={(r) => r.id} rows={rows} template="minmax(160px,1.3fr) 80px" />
// A grid table (ARIA table roles) whose column headers sort it; the first click sorts text
// A–Z and numbers high to low, the next reverses. The body grows to fill its card and the
// footer row (totals) stays pinned to the bottom. Below its min width it scrolls sideways
// inside the card, never the page.

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SortableColumn<Row> {
  align?: 'end' | 'start';
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  sortValue: (row: Row) => number | string | null;
}

export function SortableTable<Row>({
  caption,
  columns,
  defaultSort,
  emptyText = 'Nothing to show for this period.',
  footer,
  minWidth = 640,
  rowKey,
  rows,
  template,
}: Readonly<{
  caption: string;
  columns: Array<SortableColumn<Row>>;
  defaultSort: { dir: 'asc' | 'desc'; key: string };
  emptyText?: string;
  footer?: ReactNode[];
  minWidth?: number;
  rowKey: (row: Row) => string;
  rows: Row[];
  template: string;
}>) {
  const [sort, setSort] = useState(defaultSort);
  const sorted = useMemo(() => {
    const column = columns.find((candidate) => candidate.key === sort.key);

    if (!column) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const left = column.sortValue(a);
      const right = column.sortValue(b);
      // Blanks sort last either way.
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      const order =
        typeof left === 'string' ? left.localeCompare(String(right)) : left - Number(right);

      return sort.dir === 'asc' ? order : -order;
    });
  }, [columns, rows, sort]);
  const grid = { gridTemplateColumns: template };
  const cell = (column: SortableColumn<Row>) => (column.align === 'end' ? 'text-right' : 'min-w-0');

  return (
    <div aria-label={caption} className="flex flex-1 flex-col" role="table">
      <div className="flex-1 overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid h-[38px] items-center gap-3 border-y border-ds-divider bg-ds-subtle px-[18px]"
            role="row"
            style={grid}
          >
            {columns.map((column) => {
              const isSorted = sort.key === column.key;

              return (
                <span
                  aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn('h-full', cell(column))}
                  key={column.key}
                  role="columnheader"
                >
                  <button
                    className={cn(
                      'flex h-full w-full items-center gap-1 text-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                      column.align === 'end' ? 'justify-end' : 'justify-start',
                      isSorted ? 'font-extrabold text-ds-text' : 'font-semibold text-ds-muted',
                    )}
                    onClick={() =>
                      setSort((current) =>
                        current.key === column.key
                          ? { dir: current.dir === 'asc' ? 'desc' : 'asc', key: column.key }
                          : {
                              dir:
                                typeof column.sortValue(rows[0] as Row) === 'string'
                                  ? 'asc'
                                  : 'desc',
                              key: column.key,
                            },
                      )
                    }
                    type="button"
                  >
                    {column.label}
                    <span aria-hidden="true" className="text-[10px]">
                      {isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </span>
              );
            })}
          </div>
          {sorted.length ? (
            sorted.map((row) => (
              <div
                className="grid items-center gap-3 border-b border-ds-divider px-[18px] py-2.5 text-[13px] tabular-nums"
                key={rowKey(row)}
                role="row"
                style={grid}
              >
                {columns.map((column) => (
                  <span className={cell(column)} key={column.key} role="cell">
                    {column.render(row)}
                  </span>
                ))}
              </div>
            ))
          ) : (
            <p className="px-[18px] py-6 text-center text-[13px] text-ds-muted" role="row">
              <span role="cell">{emptyText}</span>
            </p>
          )}
        </div>
      </div>
      {footer ? (
        <div className="overflow-x-auto border-t border-ds-border bg-ds-subtle">
          <div
            className="grid items-center gap-3 px-[18px] py-3 text-[13px] tabular-nums"
            role="row"
            style={{ ...grid, minWidth }}
          >
            {footer.map((content, index) => (
              <span
                className={columns[index] ? cell(columns[index]) : undefined}
                key={columns[index]?.key ?? index}
                role="cell"
              >
                {content}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
