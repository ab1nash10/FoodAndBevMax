// Runs before `pnpm dev`. It used to run `prisma migrate deploy` and `prisma generate` on every
// start (about 4-5 s of Prisma CLI start-up); now each runs only when it has something to do:
// - migrate deploy: when the database lacks one of prisma/migrations (asked of the database
//   itself, so a reset or a different DATABASE_URL is still caught), or cannot be asked;
// - generate: when the schema or the Prisma version changed since the last generate here, or
//   the generated client is missing (a fresh `pnpm install` removes it).
// Production is untouched: images build with `pnpm build` and migrate with `pnpm db:deploy`.
// Force either step with `pnpm db:deploy` / `pnpm db:generate`.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

if (existsSync('.env')) {
  process.loadEnvFile('.env'); // as prisma.config.mjs does; never overrides the environment
}

const schema = 'prisma/schema.prisma';
const prisma = (args) =>
  execSync(`pnpm exec prisma ${args} --schema ${schema}`, { stdio: 'inherit' });
// pg and @prisma/client are dependencies of @aahar/auth, not of the workspace root.
const require = createRequire(path.resolve('backend/packages/auth/package.json'));

async function missingMigrations() {
  const local = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL?.replace(/\?schema=.*$/, ''),
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const applied = new Set(rows.map((row) => row.migration_name));

    return local.filter((name) => !applied.has(name));
  } catch {
    return ['(could not ask the database)']; // let migrate deploy report or fix it
  } finally {
    await client.end().catch(() => {});
  }
}

const pending = await missingMigrations();

if (pending.length > 0) {
  console.log(`predev: applying ${pending.join(', ')}`);
  prisma('migrate deploy');
} else {
  console.log('predev: database has every migration; skipped migrate deploy');
}

const clientDir = path.dirname(require.resolve('@prisma/client/package.json'));
const generated = path.join(clientDir, '..', '..', '.prisma', 'client', 'index.js');
const stamp = 'node_modules/.cache/aahar/prisma-client.sha256';
const fingerprint = createHash('sha256')
  .update(readFileSync(schema))
  .update(readFileSync(path.join(clientDir, 'package.json')))
  .digest('hex');

if (existsSync(generated) && existsSync(stamp) && readFileSync(stamp, 'utf8') === fingerprint) {
  console.log('predev: Prisma client is up to date; skipped generate');
} else {
  prisma('generate');
  mkdirSync(path.dirname(stamp), { recursive: true });
  writeFileSync(stamp, fingerprint);
}
