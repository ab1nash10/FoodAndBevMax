import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

/** How long a started Microsoft sign-in may take before it has to be started again. */
const SIGN_IN_TTL_SECONDS = 10 * 60;
const SCOPE = 'openid profile email';

interface MicrosoftSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenantId: string;
}

interface PendingSignIn {
  nonce: string;
  verifier: string;
}

export interface MicrosoftIdClaims {
  aud?: string;
  email?: string;
  exp?: number;
  iss?: string;
  nonce?: string;
  preferred_username?: string;
  tid?: string;
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

/** The claims of a JWT, without checking its signature (see verifiedEmail for why). */
export function decodeJwtClaims(token: string): MicrosoftIdClaims {
  const payload = token.split('.')[1];

  if (!payload) {
    throw new UnauthorizedException('Microsoft sent an unreadable sign-in.');
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MicrosoftIdClaims;
}

/**
 * The ID token's checks: our tenant, our app, this sign-in's nonce, not expired. Returns the
 * signed-in address (email, else the work account's user name), lower-cased.
 */
export function emailFromClaims(
  claims: MicrosoftIdClaims,
  expected: { clientId: string; nonce: string; tenantId: string },
  now = Date.now(),
): string {
  const valid =
    claims.iss === `https://login.microsoftonline.com/${expected.tenantId}/v2.0` &&
    claims.tid === expected.tenantId &&
    claims.aud === expected.clientId &&
    claims.nonce === expected.nonce &&
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > now;

  if (!valid) {
    throw new UnauthorizedException('Microsoft could not confirm this sign-in. Please try again.');
  }

  const email = (claims.email ?? claims.preferred_username ?? '').trim().toLowerCase();

  if (!email.includes('@')) {
    throw new UnauthorizedException('This Microsoft account has no email address.');
  }

  return email;
}

/**
 * "Sign in with Microsoft" through the organisation's Entra ID app: the authorization code
 * flow with PKCE, a one-time state and a nonce. The client secret never leaves the server.
 */
@Injectable()
export class MicrosoftSignInService {
  private readonly logger = new Logger(MicrosoftSignInService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private settings(): MicrosoftSettings | null {
    const clientId = this.config.get<string>('MICROSOFT_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET')?.trim();
    const redirectUri = this.config.get<string>('MICROSOFT_REDIRECT_URI')?.trim();
    const tenantId = this.config.get<string>('MICROSOFT_TENANT_ID')?.trim();

    return clientId && clientSecret && redirectUri && tenantId
      ? { clientId, clientSecret, redirectUri, tenantId }
      : null;
  }

  private requireSettings(): MicrosoftSettings {
    const settings = this.settings();

    if (!settings) {
      throw new ServiceUnavailableException('Sign in with Microsoft is not set up.');
    }

    return settings;
  }

  isEnabled(): boolean {
    return this.settings() !== null;
  }

  /** Where to send the browser to sign in; remembers this attempt's state for 10 minutes. */
  async authorizeUrl(): Promise<string> {
    const { clientId, redirectUri, tenantId } = this.requireSettings();
    const state = base64url(randomBytes(24));
    const pending: PendingSignIn = {
      nonce: base64url(randomBytes(24)),
      verifier: base64url(randomBytes(32)),
    };

    await this.redis.setWithExpiry(
      `auth:microsoft:${state}`,
      JSON.stringify(pending),
      SIGN_IN_TTL_SECONDS,
    );

    const query = new URLSearchParams({
      client_id: clientId,
      code_challenge: base64url(createHash('sha256').update(pending.verifier).digest()),
      code_challenge_method: 'S256',
      nonce: pending.nonce,
      prompt: 'select_account',
      redirect_uri: redirectUri,
      response_mode: 'query',
      response_type: 'code',
      scope: SCOPE,
      state,
    });

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${query.toString()}`;
  }

  /**
   * Finishes a sign-in: the state must be one this server started (used once), and the code is
   * exchanged with the client secret. The ID token comes straight from Microsoft's token
   * endpoint over TLS, authenticated by our secret, so its signature need not be checked
   * (OpenID Connect Core 3.1.3.7); its issuer, tenant, audience, nonce and expiry are.
   */
  async verifiedEmail(code: string, state: string): Promise<string> {
    const settings = this.requireSettings();
    const key = `auth:microsoft:${state}`;
    const stored = await this.redis.get(key);

    if (!stored || !(await this.redis.delete(key))) {
      throw new UnauthorizedException('This sign-in has expired. Please sign in again.');
    }

    const pending = JSON.parse(stored) as PendingSignIn;
    const response = await fetch(
      `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/token`,
      {
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          code,
          code_verifier: pending.verifier,
          grant_type: 'authorization_code',
          redirect_uri: settings.redirectUri,
          scope: SCOPE,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => null);

    if (!response) {
      throw new ServiceUnavailableException('Microsoft could not be reached. Please try again.');
    }

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_codes?: number[];
      id_token?: string;
    };

    if (!response.ok || !body.id_token) {
      // The error code only (e.g. invalid_client for a wrong or expired secret), never a token.
      this.logger.warn(
        JSON.stringify({
          codes: body.error_codes,
          error: body.error,
          event: 'microsoft_token_refused',
        }),
      );
      throw new UnauthorizedException('Microsoft did not confirm this sign-in. Please try again.');
    }

    return emailFromClaims(decodeJwtClaims(body.id_token), {
      clientId: settings.clientId,
      nonce: pending.nonce,
      tenantId: settings.tenantId,
    });
  }
}
