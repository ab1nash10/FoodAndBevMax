/**
 * Rows to CSV text. Cells with commas, quotes or line breaks are quoted, and a cell that a
 * spreadsheet would run as a formula (=, +, -, @, tab, carriage return) gets a leading
 * apostrophe, since item names and remarks are typed by users.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

          return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(','),
    )
    .join('\r\n');
}

export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<string | number>>) {
  // A BOM so Excel reads the UTF-8 (₹, names in Hindi) correctly.
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
