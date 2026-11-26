import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// backend/: the services and packages whose searches this checks.
const backend = fileURLToPath(new URL('../../../../', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return ['node_modules', 'dist', '__snapshots__'].includes(entry.name) ? [] : sources(path);
    }

    return entry.name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Every search ignores case (the user, 2026-11-26): a Prisma text match (contains, startsWith,
 * endsWith, equals) says mode: 'insensitive' in its object, unless the line above says why case
 * matters there ("case matters: ..."); raw SQL matches with ILIKE, never LIKE.
 */
test('every text match in the services ignores case, unless it says why it must not', () => {
  const roots = ['services', 'packages'].flatMap((group) =>
    readdirSync(join(backend, group)).map((name) => join(backend, group, name, 'src')),
  );
  const offenders: string[] = [];

  for (const file of roots.flatMap((root) => {
    try {
      return sources(root);
    } catch {
      return [];
    }
  })) {
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      const at = `${relative(backend, file).split(sep).join('/')}:${index + 1}`;
      const textMatch = /\b(contains|startsWith|endsWith|equals):/.test(line);
      const near = lines.slice(Math.max(0, index - 2), index + 4).join('\n');

      if (textMatch && !/insensitive/.test(near) && !/case matters:/.test(lines[index - 1] ?? '')) {
        offenders.push(`${at} ${line.trim()}`);
      }
      if (/\$queryRaw|\$executeRaw/.test(near) && /\bLIKE\b/.test(line) && !/ILIKE/.test(line)) {
        offenders.push(`${at} raw LIKE: ${line.trim()}`);
      }
    });
  }

  expect(offenders).toEqual([]);
});
