import { describe, expect, it } from 'vitest';
import { escapeHtml, printDocument } from './print';

describe('print', () => {
  it('escapes markup in printed values', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });

  it('prints on an 80 mm roll unless a page style is given', () => {
    expect(printDocument('A<1>', '<p>x</p>')).toContain('<title>A&lt;1&gt;</title>');
    expect(printDocument('A', '<p>x</p>')).toContain('size: 80mm auto');
    expect(printDocument('A', '', '@page { size: A4; }')).not.toContain('80mm');
  });
});
