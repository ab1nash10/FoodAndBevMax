'use client';

import { useEffect } from 'react';

/** A column's header text, or '' for one that is only read out (an Actions column) or empty. */
function headerLabel(cell: HTMLTableCellElement): string {
  const text = (cell.textContent ?? '').trim();
  const hidden = (cell.querySelector('.sr-only')?.textContent ?? '').trim();

  return text === hidden ? '' : text;
}

/** Gives each cell of a `phone-cards` table its column's name, which phones show above it. */
function labelTable(table: HTMLTableElement) {
  const headers = [...(table.tHead?.rows[0]?.cells ?? [])].map(headerLabel);

  for (const body of table.tBodies) {
    for (const row of body.rows) {
      let column = 0;

      for (const cell of row.cells) {
        // The first cell is the record itself; a cell across several columns is a message.
        const label = column > 0 && cell.colSpan === 1 ? (headers[column] ?? '') : '';

        if (label && cell.dataset.label !== label) cell.dataset.label = label;
        else if (!label && cell.dataset.label) delete cell.dataset.label;
        column += cell.colSpan;
      }
    }
  }
}

/**
 * Keeps every `phone-cards` table on the page labelled as its rows change (globals.css draws the
 * labels on phones only). It watches the whole body, so a table shown later (a page that was still
 * loading, a dialog) is labelled too. Setting data-label is an attribute change, which the
 * observer ignores.
 */
export function usePhoneCardLabels() {
  useEffect(() => {
    const root = document.body;
    let frame = 0;
    const run = () => {
      frame = 0;
      root.querySelectorAll<HTMLTableElement>('table.phone-cards').forEach(labelTable);
    };
    const observer = new MutationObserver(() => {
      frame ||= requestAnimationFrame(run);
    });

    run();
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
}
