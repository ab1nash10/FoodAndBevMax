import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

const serviceEnvSchema = z.object({
  // Routing prefix the platform is served under, e.g. /fandb. Empty means served at the root.
  BASE_PATH: z.string().default(''),
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,http://127.0.0.1:3000,http://172.25.208.1:3000,http://172.29.132.245:3000,http://localhost:4001,http://localhost:4002,http://localhost:4003',
    ),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_TTL: z.string().default('30m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TOKEN_TTL: z.string().default('7d'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Fails closed: development relaxes CORS and accepts the fixed dev OTP, so an unset value
  // must not mean development. Every local .env sets it explicitly.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  PORT: z.coerce.number().int().min(1).max(65535),
  // Bulk SMS gateway for mobile OTPs (auth-service). All four of feed id, username, password
  // and sender id are needed; with any missing, OTPs are only printed in development and
  // refused elsewhere. Username and password are secrets.
  SMS_API_URL: z.string().url().optional(),
  SMS_FEED_ID: z.string().optional(),
  SMS_PASSWORD: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_USERNAME: z.string().optional(),
  // Unset means on outside production, off in it.
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  // Redis is commented out for now - OTPs and the refresh-token denylist are held in
  // process instead. Restore this line together with the code in
  // auth-service/src/common/redis/redis.service.ts when Redis comes back.
  // REDIS_URL: z.string().url(),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
});

export type ServiceEnv = z.infer<typeof serviceEnvSchema>;

function findWorkspaceRoot(startDirectory: string): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (fs.existsSync(path.join(currentDirectory, 'pnpm-workspace.yaml'))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return path.resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

export function getServiceEnvFilePaths(): string[] {
  const cwd = process.cwd();
  const workspaceRoot = findWorkspaceRoot(cwd);

  return uniquePaths([
    path.resolve(workspaceRoot, '.env.local'),
    path.resolve(workspaceRoot, '.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env'),
  ]);
}

export function shouldUseRootEnvFileOnly(): boolean {
  return process.env.npm_lifecycle_event === 'dev';
}

export function validateServiceEnv(config: Record<string, unknown>): ServiceEnv {
  const parsed = serviceEnvSchema.safeParse(config);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid service environment configuration. ${details}`);
  }

  return parsed.data;
}

export function validateServiceEnvWithPort(
  config: Record<string, unknown>,
  portKey: string,
  defaultPort: number,
): ServiceEnv {
  return validateServiceEnv({
    ...config,
    PORT: config.PORT ?? config[portKey] ?? defaultPort,
  });
}
