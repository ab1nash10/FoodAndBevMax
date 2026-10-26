import { writeFileSync } from 'node:fs';
import type { FullConfig } from '@playwright/test';

/**
 * Signs in once with the development OTP (no SMS is sent: the auth service accepts 000000 only
 * when NODE_ENV=development) and saves the session where the portal keeps it.
 */
export async function newSession(): Promise<{ accessToken: string; refreshToken: string }> {
  const mobile = process.env.E2E_MOBILE;

  if (!mobile) {
    throw new Error('Set E2E_MOBILE to the mobile number of a local Super Admin.');
  }

  const authUrl = process.env.E2E_AUTH_URL ?? 'http://localhost:4001/api/v1';
  const response = await fetch(`${authUrl}/auth/verify-otp`, {
    body: JSON.stringify({ mobile, otp: process.env.E2E_OTP ?? '000000' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(
      `Sign-in failed (${response.status}). Is the auth service in development mode?`,
    );
  }

  return ((await response.json()) as { data: { accessToken: string; refreshToken: string } }).data;
}

/**
 * Saves a fresh session for the specs that use e2e/.auth.json. A user is signed in on one browser
 * at a time, so a spec signing in on its own ends the saved one: those specs call this again in
 * beforeAll, before their pages open.
 */
export default async function signIn(config?: FullConfig) {
  const data = await newSession();
  const origin = new URL(
    String(
      config?.projects[0]?.use.baseURL ??
        process.env.E2E_BASE_URL ??
        'http://localhost:3000/fandb/',
    ),
  ).origin;

  writeFileSync(
    'e2e/.auth.json',
    JSON.stringify({
      cookies: [],
      origins: [
        {
          localStorage: [
            {
              name: 'aahar.admin.auth',
              value: JSON.stringify({
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                savedAt: new Date().toISOString(),
              }),
            },
          ],
          origin,
        },
      ],
    }),
  );
}
