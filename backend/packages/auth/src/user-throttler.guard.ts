import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Counts a signed-in user's requests per user instead of per address: staff behind one hospital
 * network share a public IP, so a per-IP limit let a few open dashboards lock out the whole site.
 * Register it after JwtAuthGuard so `request.user` is set; public routes (sign-in, OTP) have no
 * user and stay limited per IP.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    const userId = (request.user as { id?: unknown } | undefined)?.id;

    return typeof userId === 'string' && userId !== ''
      ? Promise.resolve(`user:${userId}`)
      : super.getTracker(request);
  }
}
