import fs from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Locally the URL comes from the root .env as it did
// before; in containers it is already in the environment, and loadEnvFile never overrides that.
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  // Optional so `prisma generate` still runs without a database (CI, the Docker build stage);
  // migrate commands fail with a clear message when it is missing.
  datasource: { url: process.env.DATABASE_URL },
  migrations: { path: 'prisma/migrations' },
  schema: 'prisma/schema.prisma',
});
