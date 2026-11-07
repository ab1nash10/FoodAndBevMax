import { networkInterfaces } from 'node:os';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.startsWith('127.') ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function isWildcard(hostname: string): boolean {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]';
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);

  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
      (octets[0] === 192 && octets[1] === 168))
  );
}

function lanAddress(): string | null {
  const addresses = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address)
    .filter(isPrivateIpv4);

  return (
    addresses.find((address) => address.startsWith('192.168.')) ??
    addresses.find((address) => address.startsWith('10.')) ??
    addresses[0] ??
    null
  );
}

export function GET(request: Request) {
  const configuredOrigin = process.env.APP_PUBLIC_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  const requestUrl = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    requestUrl.host;
  const protocol =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().replace(/:$/, '') ||
    requestUrl.protocol.replace(/:$/, '');
  let url: URL;

  try {
    url = new URL(configuredOrigin || `${protocol}://${host}`);
  } catch {
    return NextResponse.json(
      { message: 'Restaurant QR links are not configured with a reachable site address.' },
      { status: 503 },
    );
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (process.env.NODE_ENV !== 'development' && isWildcard(url.hostname))
  ) {
    return NextResponse.json(
      { message: 'Restaurant QR links are not configured with a reachable site address.' },
      { status: 503 },
    );
  }

  if (
    process.env.NODE_ENV === 'development' &&
    (isLoopback(url.hostname) || isWildcard(url.hostname))
  ) {
    const address = lanAddress();

    if (address) url.hostname = address;
  }

  if (isLoopback(url.hostname) || isWildcard(url.hostname)) {
    return NextResponse.json(
      { message: 'Restaurant QR links are not configured with a reachable site address.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ origin: url.origin }, { headers: { 'Cache-Control': 'no-store' } });
}
