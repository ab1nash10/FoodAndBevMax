export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[char]!,
  );
}

/**
 * Black only, nothing lighter than #333: thermal heads print no grey, and laser greys fade on
 * copies. Bold and size carry the hierarchy instead of colour.
 */
const baseCss = `
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0 auto; color: #000; background: #fff; font-family: "Segoe UI", Arial, "Helvetica Neue", sans-serif; font-variant-numeric: tabular-nums; }
h1, h2, p { margin: 0; }
table { width: 100%; border-collapse: collapse; }
td, th { vertical-align: top; text-align: left; font-weight: inherit; }
.c { text-align: center; } .b { font-weight: 700; }
.num { text-align: right; white-space: nowrap; }
.mono { font-family: Consolas, "Cascadia Mono", Menlo, monospace; }
hr { border: 0; border-top: 1px dashed #000; margin: 7px 0; }
`;

const receiptCss = `
@page { size: 80mm auto; margin: 3mm; }
/* Centred on the paper: the full 74 mm on an 80 mm roll, narrower where the printer prints less
   (72 mm heads), and in the middle of anything wider (A4, a PDF). */
body { max-width: 74mm; font-size: 12px; line-height: 1.35; }
.title { font-size: 15px; font-weight: 800; letter-spacing: 0.06em; text-align: center; }
.tag { display: inline-block; border: 1.5px solid #000; border-radius: 3px; padding: 1px 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
.issuer { margin-top: 4px; font-size: 11px; text-align: center; }
.brand { display: block; margin-top: 3px; font-size: 14px; font-weight: 800; }
.qr { margin-bottom: 6px; text-align: center; }
.qr img { display: block; width: 42mm; height: 42mm; margin: 0 auto 2px; }
.ids { margin-top: 2px; font-size: 13px; font-weight: 700; line-height: 1.4; }
.facts td { padding: 1px 0; font-size: 11.5px; }
.facts td:first-child { padding-right: 8px; white-space: nowrap; color: #333; }
.facts td:last-child { text-align: right; overflow-wrap: anywhere; }
.items { table-layout: fixed; font-size: 11px; }
.items th { padding: 0 2px 3px 0; border-bottom: 1px solid #000; font-size: 10px; font-weight: 800; }
.items td { padding: 3px 2px 0 0; overflow-wrap: anywhere; }
.items .name { font-weight: 600; }
.items small { display: block; font-size: 10px; font-style: italic; font-weight: 400; }
.totals td { padding: 1.5px 0; }
.totals .tax td { padding-left: 8px; font-size: 11.5px; }
.totals .sep td { padding: 0; border-top: 1px dashed #000; height: 5px; }
.grand td { padding: 5px 0 4px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 17px; font-weight: 800; }
.footer { margin-top: 8px; font-size: 11px; text-align: center; }
.fine { margin-top: 5px; font-size: 9.5px; line-height: 1.3; text-align: center; }
.order-no { margin: 4px 0 6px; padding: 4px 0 6px; border: 2.5px solid #000; border-radius: 6px; text-align: center; }
.order-no span { display: block; font-size: 12px; font-weight: 700; }
.order-no strong { display: block; font-size: 44px; font-weight: 900; line-height: 1.05; letter-spacing: 0.02em; }
.service { margin: 0 0 6px; padding: 3px 0; border: 2px solid #000; font-size: 18px; font-weight: 900; text-align: center; }
.kot-line { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px dotted #000; font-size: 14px; font-weight: 700; }
.kot-line .qty { min-width: 9mm; font-size: 20px; font-weight: 900; line-height: 1; }
.kot-line .note { display: block; margin-top: 1px; font-size: 12.5px; font-weight: 800; }
.kot-note { margin-top: 6px; padding: 4px 6px; border: 2px solid #000; font-size: 13px; font-weight: 800; }
`;

/** The whole printable document: one look for every slip and sheet the portal prints. */
export function printDocument(title: string, body: string, pageCss = receiptCss): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${baseCss}${pageCss}</style></head><body>${body}</body></html>`;
}

/** Prints through a hidden frame, so the page keeps its screen and the printer gets the paper. */
export function printHtml(title: string, body: string, pageCss = receiptCss) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;

  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(printDocument(title, body, pageCss));
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  window.setTimeout(() => frame.remove(), 60_000);
}
