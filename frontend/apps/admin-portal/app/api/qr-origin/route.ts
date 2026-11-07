import { networkInterfaces } from 'node:os';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
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
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const url = new URL(configuredOrigin || request.url);

  if (!['http:', 'https:'].includes(url.protocol)) {
    return NextResponse.json(
      { message: 'The configured app URL must use HTTP or HTTPS.' },
      { status: 500 },
    );
  }

  if (process.env.NODE_ENV === 'development' && isLoopback(url.hostname)) {
    const address = lanAddress();

    if (address) url.hostname = address;
  }

  return NextResponse.json({ origin: url.origin }, { headers: { 'Cache-Control': 'no-store' } });
}
