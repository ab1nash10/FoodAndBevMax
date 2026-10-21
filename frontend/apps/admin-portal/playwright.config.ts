import { defineConfig } from '@playwright/test';

/**
 * Browser checks against a running local portal and API (pnpm dev). They sign in with the
 * development OTP, so they only work where the auth service runs with NODE_ENV=development.
 *   E2E_MOBILE=<a local Super Admin's mobile> pnpm test:ui
 */
export default defineConfig({
  globalSetup: './e2e/sign-in.ts',
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000/fandb/',
    // The installed Chrome, so no browser download is needed.
    channel: 'chrome',
    storageState: 'e2e/.auth.json',
    viewport: { height: 900, width: 1440 },
  },
  workers: 1,
});
