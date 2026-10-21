import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerOptions } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

/** The throttler that caps what one network address may send while signed out. */
export const ADDRESS_THROTTLER = 'address';

/**
 * Sign-in traffic from one address: a hospital's staff reach the API from one public address,
 * so a shift change (hundreds signing in, then renewing their sessions together 30 minutes
 * later) must fit. Only signed-out requests count towards it; per-identity limits (see
 * UserThrottlerGuard) are what stop guessing.
 */
export function addressThrottler(limit = 3_000): ThrottlerOptions {
  return {
    limit,
    name: ADDRESS_THROTTLER,
    skipIf: (context) =>
      Boolean(context.switchToHttp().getRequest<{ user?: { id?: string } }>().user?.id),
    ttl: 60_000,
  };
}

/**
 * Counts a signed-in user's requests per user instead of per address: staff behind one hospital
 * network share a public IP, so a per-IP limit let a few open dashboards lock out the whole site.
 * Register it after JwtAuthGuard so `request.user` is set.
 *
 * Signed-out sign-in requests are counted per identity they act on (the mobile number, the
 * email, the session being renewed), so ten failed OTP guesses lock that number, not the
 * hospital, and a shift's worth of sign-ins from one address goes through. The address itself
 * is still capped by the ADDRESS_THROTTLER. Anything else signed out (TV boards, order pushes)
 * stays per address.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    const userId = (request.user as { id?: unknown } | undefined)?.id;

    if (typeof userId === 'string' && userId !== '') {
      return Promise.resolve(`user:${userId}`);
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

    if (text(body.mobile)) return Promise.resolve(`mobile:${text(body.mobile)}`);
    if (text(body.email)) return Promise.resolve(`email:${text(body.email).toLowerCase()}`);
    // The token itself, hashed: its claims are unverified here, so a forged one cannot borrow
    // (and use up) someone else's bucket.
    if (text(body.refreshToken)) {
      const hash = createHash('sha256').update(text(body.refreshToken)).digest('hex');

      return Promise.resolve(`session:${hash.slice(0, 32)}`);
    }

    return super.getTracker(request);
  }

  protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name !== ADDRESS_THROTTLER) {
      return super.generateKey(context, suffix, name);
    }

    const request = context.switchToHttp().getRequest<{ ip?: string; ips?: string[] }>();

    return super.generateKey(context, request.ips?.[0] ?? request.ip ?? suffix, name);
  }
}
