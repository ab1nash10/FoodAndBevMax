import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "scrolling should be effortless" (2026-11-22, in Zen, a Firefox browser): nothing that stays on
// screen while the page scrolls may blur what passes under it (re-blurred every frame), and
// nothing may move with the scroll itself.
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('scrolling costs nothing extra', () => {
  it('the top bar and the phone tab bar are solid, not blurred see-through glass', () => {
    const shell = read('components/admin-shell/admin-shell.tsx');
    const header = shell.slice(
      shell.indexOf('<header'),
      shell.indexOf('>', shell.indexOf('<header')),
    );

    expect(header).toContain('sticky');
    expect(header).not.toMatch(/backdrop-blur|bg-ds-surface\/\d/);
    expect(read('components/admin-shell/mobile-tab-bar.tsx')).not.toMatch(/backdrop-blur/);
  });

  it('a panel’s pinned save bar is solid, and no section moves with the scroll', () => {
    const css = read('app/globals.css');

    expect(css).not.toMatch(/animation-timeline/);
    const saveBar = css.slice(
      css.indexOf("[data-side] form > :last-child:has(button[type='submit'])"),
    );
    expect(saveBar.slice(0, saveBar.indexOf('}'))).not.toMatch(/backdrop-filter/);
    expect(read('components/ui.tsx')).not.toMatch(/['" ]reveal[ '"]/);
  });
});
