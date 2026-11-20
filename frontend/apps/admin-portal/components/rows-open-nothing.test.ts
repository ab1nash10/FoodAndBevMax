import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The user's rule (2026-11-20): clicking a list row or a record card does nothing. A record opens
 * only through its own controls: the Edit button for the edit form, the record number or Open for
 * its details. This scans every screen, so a new one cannot bring row clicks back.
 */
const portal = fileURLToPath(new URL('..', import.meta.url));

/** Picker rows pick the row (a checkbox list); they open no record. */
const pickers = new Set(['components/access/location-picker-dialog.tsx']);

function screens(dir: string): string[] {
  return readdirSync(path.join(portal, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : screens(file);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [file] : [];
  });
}

/** Each `<tag …>` opening tag, read past braces so `() =>` inside a prop does not end it. */
function openingTags(source: string, tag: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(new RegExp(`<${tag}(?=[\\s>])`, 'g'))) {
    let depth = 0;
    let end = match.index + tag.length + 1;
    for (; end < source.length; end++) {
      const char = source[end];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

const handler = /\son(Click|DoubleClick|KeyDown)=/;

describe('list rows and record cards', () => {
  it('open nothing when clicked: only their buttons and links do', () => {
    const offenders = [...screens('components'), ...screens('app')]
      .filter((file) => !pickers.has(file))
      .flatMap((file) => {
        const source = readFileSync(path.join(portal, file), 'utf8');
        const rows = openingTags(source, 'tr').filter((tag) => handler.test(tag));
        const cards = ['li', 'div', 'article']
          .flatMap((tag) => openingTags(source, tag))
          .filter((tag) => tag.includes('data-record-id') && handler.test(tag));
        return [...rows, ...cards].length > 0 ? [file] : [];
      });

    expect(offenders).toEqual([]);
  });
});
