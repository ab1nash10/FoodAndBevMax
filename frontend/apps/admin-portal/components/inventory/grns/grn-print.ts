import type { Grn, GrnBatch, GrnLine } from '@aahar/api-client';
import { formatDate, formatDateOnly, formatQuantity } from '@/components/inventory/shared/utils';
import { escapeHtml, printHtml } from '@/lib/print';
import { statusPresentation } from '@/lib/status';

// Loaded only when Print is clicked, so the A4 sheet adds nothing to the page's bundle.
const a4Css = `
@page { size: A4; margin: 14mm 12mm; }
body { max-width: 186mm; font-size: 11px; line-height: 1.4; }
.doc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid #000; }
.kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.doc-head h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
.doc-no { font-size: 18px; font-weight: 800; text-align: right; }
.status { display: inline-block; margin-top: 3px; border: 1.5px solid #000; border-radius: 4px; padding: 1px 10px; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 18px; margin: 12px 0 14px; }
.meta dt { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #333; }
.meta dd { margin: 1px 0 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.lines th { padding: 5px 6px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; font-size: 9.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.lines td { padding: 5px 6px; border-bottom: 1px solid #000; overflow-wrap: anywhere; }
.lines tr { break-inside: avoid; }
.lines .item { font-weight: 700; }
.lines small { display: block; font-size: 10px; font-weight: 400; }
.lines .sub td { padding-top: 2px; border-bottom-style: dotted; font-size: 10.5px; }
.lines tfoot td { border-top: 1.5px solid #000; border-bottom: 2px solid #000; font-size: 12px; font-weight: 800; }
.remarks { margin-top: 12px; }
.signs { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 64px; break-inside: avoid; }
.signs div { padding-top: 6px; border-top: 1px solid #000; }
.signs strong { display: block; font-size: 12px; }
.printed { margin-top: 18px; font-size: 9.5px; color: #333; }
`;

const cell = (value: string, className = '') =>
  `<td${className ? ` class="${className}"` : ''}>${escapeHtml(value)}</td>`;

/** Quantities of a line or one of its batches: received, accepted, rejected, reason. */
function quantities(entry: GrnBatch | GrnLine) {
  return (
    cell(formatQuantity(entry.receivedQty), 'num') +
    cell(formatQuantity(entry.acceptedQty), 'num b') +
    cell(formatQuantity(entry.rejectedQty), 'num') +
    cell(entry.rejectedQty > 0 ? (entry.rejectionReason ?? '—') : '—')
  );
}

/**
 * One row per line, its batch and expiry inline when it has one; a line with several batches
 * gets a row per batch under it.
 */
function lineRows(line: GrnLine, index: number): string {
  const [only] = line.batches.length === 1 ? line.batches : [];
  const head = `<tr><td>${index + 1}</td><td class="item">${escapeHtml(line.item.itemName)}${line.remarks ? `<small>${escapeHtml(line.remarks)}</small>` : ''}</td>${cell(line.item.itemCode)}${cell(only ? only.batchNumber : line.batches.length ? `${line.batches.length} batches` : '—', 'mono')}${cell(only ? formatDateOnly(only.expiryDate) : '—')}${quantities(line)}</tr>`;

  return line.batches.length > 1
    ? head +
        line.batches
          .map(
            (batch) =>
              `<tr class="sub"><td></td><td></td><td></td>${cell(batch.batchNumber, 'mono')}${cell(formatDateOnly(batch.expiryDate))}${quantities(batch)}</tr>`,
          )
          .join('')
    : head;
}

/** The GRN as stored, on an A4 sheet: header, receipt details, lines, totals and signatures. */
export function printGrn(grn: Grn) {
  const total = (pick: (line: GrnLine) => number) =>
    formatQuantity(Number(grn.lines.reduce((sum, line) => sum + pick(line), 0).toFixed(3)));
  const status = statusPresentation(grn.status);
  const meta = [
    ['Vendor', grn.vendorName || '—'],
    ['Invoice no', grn.invoiceNumber || '—'],
    ['PO number', grn.poNumber || '—'],
    [
      'Store',
      `${grn.store.storeName}${grn.store.storeCode ? ` (${grn.store.storeCode})` : ''} · ${grn.hospital.hospitalName}`,
    ],
    ['Received at', formatDate(grn.receivedDate)],
    ['Received by', grn.receivedBy],
  ]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value!)}</dd></div>`)
    .join('');
  const body = `
<header class="doc-head">
  <div><p class="kicker">${escapeHtml(grn.hospital.hospitalName)}</p><h1>Goods Received Note</h1></div>
  <div class="doc-no"><span class="mono">${escapeHtml(grn.grnNumber)}</span><br><span class="status">${escapeHtml(status.long ?? status.label)}</span></div>
</header>
<dl class="meta">${meta}</dl>
<table class="lines">
<colgroup><col style="width:4%"><col style="width:22%"><col style="width:10%"><col style="width:12%"><col style="width:11%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:14%"></colgroup>
<thead><tr><th>#</th><th>Item</th><th>Code</th><th>Batch</th><th>Expiry</th><th class="num">Received</th><th class="num">Accepted</th><th class="num">Rejected</th><th>Reason</th></tr></thead>
<tbody>${grn.lines.map(lineRows).join('')}</tbody>
<tfoot><tr><td></td><td colspan="4">Total · ${grn.lines.length} ${grn.lines.length === 1 ? 'line' : 'lines'}</td><td class="num">${total((line) => line.receivedQty)}</td><td class="num">${total((line) => line.acceptedQty)}</td><td class="num">${total((line) => line.rejectedQty)}</td><td></td></tr></tfoot>
</table>
${grn.remarks ? `<p class="remarks"><span class="b">Remarks:</span> ${escapeHtml(grn.remarks)}</p>` : ''}
<div class="signs">
  <div><strong>Received by</strong>${escapeHtml(grn.receivedBy)}<br>Signature &amp; date</div>
  <div><strong>Verified by</strong>Name<br>Signature &amp; date</div>
</div>
<p class="printed">Printed ${escapeHtml(formatDate(new Date().toISOString()))}</p>`;

  printHtml(grn.grnNumber, body, a4Css);
}
