import { defineConfig } from 'vitest/config';

// Resolves `@/…` and the workspace package paths from tsconfig.json as Next does, and compiles
// JSX itself because tsconfig.json leaves it to Next (`jsx: preserve`).
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { tsconfigPaths: true },
});
