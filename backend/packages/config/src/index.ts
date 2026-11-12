import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

// Unset CORS_ORIGINS outside production. In production unset means no browser origin at all.
const LOCAL_CORS_ORIGINS =
  'http://localhost:3000,http://127.0.0.1:3000,http://172.25.208.1:3000,http://172.29.132.245:3000,http://localhost:4001,http://localhost:4002,http://localhost:4003';

// The example files ship placeholder secrets (replace-with-..., REPLACE_ME_...): anyone who
// read them could sign tokens, so a service refuses to start on one.
const jwtSecret = z
  .string()
  .min(32)
  .refine((value) => !/replace[-_ ]?(with|me)|change[-_ ]?me/i.test(value), {
    message: 'is a placeholder from an example file; generate one with openssl rand -base64 48',
  });

const serviceEnvSchema = z
  .object({
    // Fixed OTP 000000 and OTP sign-in without an SMS or mail gateway, for local development only.
    // Honoured only together with NODE_ENV=development, never in production.
    ALLOW_DEV_OTP: z.enum(['true', 'false']).optional(),
    // Routing prefix the platform is served under, e.g. /fandb. Empty means served at the root.
    BASE_PATH: z.string().default(''),
    CORS_ORIGINS: z.string().optional(),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: jwtSecret,
    JWT_ACCESS_TOKEN_TTL: z.string().default('30m'),
    JWT_REFRESH_SECRET: jwtSecret,
    JWT_REFRESH_TOKEN_TTL: z.string().default('7d'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Fails closed: development relaxes CORS and (with ALLOW_DEV_OTP) accepts the fixed dev OTP,
    // so an unset value must not mean development. Every local .env sets it explicitly.
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    // Email OTPs (auth-service), sent through Microsoft Graph as MAIL_SENDER by an Entra app
    // registration with the Mail.Send application permission. All four are needed; with any
    // missing, email OTP sign-in works only in development with ALLOW_DEV_OTP (fixed code 000000)
    // and is refused elsewhere. The client secret is a secret.
    // Sending a restaurant's day to the ERP's revenue API (organization-service), e.g.
    // https://iwebmax.maxhealthcare.in/MaxLabEMS/api/fnb/revenue. Both are needed; unset, the
    // ERP Posting screen says sending is not set up. The token is a secret.
    ERP_REVENUE_TOKEN: z.string().optional(),
    ERP_REVENUE_URL: z.union([z.literal(''), z.string().url()]).optional(),
    MAIL_CLIENT_ID: z.string().optional(),
    MAIL_CLIENT_SECRET: z.string().optional(),
    MAIL_SENDER: z.string().optional(),
    MAIL_TENANT_ID: z.string().optional(),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    // Online UPI at the till (organization-service): the cashier picks Razorpay or PayU. A
    // provider is offered only with all of its settings; key and client secrets are secrets.
    // PayU's URLs point at its UAT servers in test and at the live ones in production.
    PAYU_BASE_URL: z.string().url().optional(),
    PAYU_CLIENT_ID: z.string().optional(),
    PAYU_CLIENT_SECRET: z.string().optional(),
    PAYU_MERCHANT_ID: z.string().optional(),
    PAYU_TOKEN_URL: z.string().url().optional(),
    // Card payments on a counter's Pine Labs machine: the Plutus Cloud API, UAT in test and live in
    // production. Each machine's merchant id, IMEI, store POS code and token are set on the machine.
    PINELABS_BASE_URL: z.string().url().optional(),
    PORT: z.coerce.number().int().min(1).max(65535),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    // Bulk SMS gateway for mobile OTPs (auth-service). All four of feed id, username, password
    // and sender id are needed; with any missing, OTP sign-in works only in development with
    // ALLOW_DEV_OTP (fixed code 000000) and is refused elsewhere. Username and password are secrets.
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
    // Optional. Set, it holds OTPs, refresh tokens and rate limits for every instance: redis://
    // or rediss:// (TLS, e.g. ElastiCache with in-transit encryption), credentials in the URL.
    // Unset or empty, each process keeps them in memory, which needs a single replica.
    REDIS_URL: z
      .union([
        z.literal(''),
        z.string().regex(/^rediss?:\/\/\S+$/, 'REDIS_URL must start with redis:// or rediss://'),
      ])
      .optional(),
    // Signed-out (sign-in) requests a minute from one network address, per step. A hospital shares
    // one public address, so this must sit above a shift change; it caps SMS and code-guessing abuse.
    THROTTLE_ADDRESS_LIMIT: z.coerce.number().int().positive().default(6000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
  })
  // One shared secret would let a refresh token pass as an access token.
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'must differ from JWT_ACCESS_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  })
  .transform((env) => ({
    ...env,
    CORS_ORIGINS: env.CORS_ORIGINS ?? (env.NODE_ENV === 'production' ? '' : LOCAL_CORS_ORIGINS),
  }));

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

export { codeCase, titleCase } from './naming';
