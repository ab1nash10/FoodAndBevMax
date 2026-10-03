import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Liveness/readiness probe for the portal.
 *
 * It deliberately checks nothing downstream: the portal renders and calls the APIs from the
 * browser, so a backend outage should not take the portal's pods out of service as well.
 */
export function GET() {
  return NextResponse.json({
    service: 'admin-portal',
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
  });
}
