import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The FANDB-UI build (2026-11-23) failed on a hook in a module a Server Component imports:
// `next build` refuses that, but `pnpm dev` and the unit tests don't notice. Walk every import a
// server file makes (stopping at 'use client' files, which may use hooks) and find hook calls.
const root = join(__dirname, '..');
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source);

function resolve(from: string, spec: string) {
  const base = spec.startsWith('@/')
    ? join(root, spec.slice(2))
    : spec.startsWith('.')
      ? join(dirname(from), spec)
      : null;
  if (!base) return null;
  return (
    ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((ext) => base + ext).find(existsSync) ?? null
  );
}

function serverFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return serverFiles(path);
    return entry.name.endsWith('.tsx') && !isClient(readFileSync(path, 'utf8')) ? [path] : [];
  });
}

describe('server components', () => {
  it('never reach a hook outside a "use client" file', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const queue = serverFiles(join(root, 'app'));

    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      if (isClient(source)) continue;
      const code = source.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
      if (/\buse[A-Z]\w*\(/.test(code)) offenders.push(relative(root, file).replaceAll('\\', '/'));
      for (const [, spec] of code.matchAll(/^import (?!type )[^'"]*['"]([^'"]+)['"]/gm)) {
        const next = resolve(file, spec!);
        if (next) queue.push(next);
      }
    }

    expect(offenders).toEqual([]);
  });
});
