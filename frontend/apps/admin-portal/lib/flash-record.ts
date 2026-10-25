/** How long the row glows; matches `record-flash` in globals.css. */
const flashMs = 1800;
/** How long to wait for the record to appear (a created row arrives with the list's refetch). */
const waitMs = 900;

/** The record's element on screen, if it is there and visible. */
function findRecord(id: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(id)}"]`);
  // Not shown: inside a closed menu, a hidden tab or a display: none table cell.
  return element && element.getClientRects().length > 0 ? element : null;
}

/**
 * Confirms a save where it happened: the record's row (any element with `data-record-id`) glows
 * with a "Saved" tag and is scrolled into view. Resolves false when the record is not on screen
 * within a moment, so the caller can say it another way (a toast).
 */
export function flashRecord(id: string): Promise<boolean> {
  const started = performance.now();

  return new Promise((resolve) => {
    function look() {
      const element = findRecord(id);

      if (element) {
        // Restart the glow if it is already running (two quick saves of one record).
        element.removeAttribute('data-flash');
        element.getBoundingClientRect();
        element.setAttribute('data-flash', '');
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        window.setTimeout(() => element.removeAttribute('data-flash'), flashMs);
        resolve(true);
      } else if (performance.now() - started > waitMs) {
        resolve(false);
      } else {
        window.setTimeout(look, 60);
      }
    }

    look();
  });
}
