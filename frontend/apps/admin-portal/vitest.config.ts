import { defineConfig } from 'vitest/config';

// Resolves `@/…` and the workspace package paths from tsconfig.json as Next does, and compiles
// JSX itself because tsconfig.json leaves it to Next (`jsx: preserve`).
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { tsconfigPaths: true },
  test: {
    setupFiles: ['./test/setup.ts'],
    // Logic tests (*.test.ts) run in Node; component tests (*.test.tsx) render screens in jsdom.
    projects: [
      { extends: true, test: { environment: 'node', include: ['**/*.test.ts'], name: 'logic' } },
      {
        extends: true,
        // A whole screen in jsdom is slow on a busy machine (CI, or several test runs at once).
        test: {
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          name: 'components',
          testTimeout: 20_000,
        },
      },
    ],
  },
});
