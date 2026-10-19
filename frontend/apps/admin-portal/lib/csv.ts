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

/**
 * CSV text to rows, the reverse of toCsv: quoted cells may hold commas, quotes and line
 * breaks, a leading BOM is dropped, blank lines are skipped, and the apostrophe toCsv puts in
 * front of a formula-like cell is taken off again, so an export imports back unchanged.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  // A leading byte-order mark (Excel writes one) is not part of the first header.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endCell = () => {
    row.push(/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell);
    cell = '';
  };
  const endRow = () => {
    endCell();

    if (row.some((value) => value.trim() !== '')) {
      rows.push(row);
    }

    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') {
        index += 1;
      }

      endRow();
    } else {
      cell += char;
    }
  }

  endRow();

  return rows;
}
