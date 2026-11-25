import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from './lib/content-security-policy';

/**
 * Every page request gets a fresh nonce in its Content-Security-Policy. Next reads it from the
 * request's header and puts it on its own inline scripts, so script-src needs no 'unsafe-inline'
 * and an injected <script> cannot run. Pages render per request for it (app/layout.tsx).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const { pathname } = request.nextUrl;
  const policy = contentSecurityPolicy(
    nonce,
    pathname === '/order' || pathname.startsWith('/order/'),
  );
  const headers = new Headers(request.headers);

  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set('Content-Security-Policy', policy);

  return response;
}

export const config = {
  matcher: [
    // Pages only: not route handlers, Next's static files, or files under public/.
    '/((?!api/|_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)',
  ],
};
