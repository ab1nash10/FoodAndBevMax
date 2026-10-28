import { reverse as dnsReverse } from 'node:dns/promises';
import { hostname } from 'node:os';

/**
 * The calling computer's name as DNS knows it, found from the address the request came from.
 * A browser cannot tell us its hostname; on the office network, DNS names each domain PC. Behind
 * NAT or a proxy that is not trusted, the address (and so the name) is the gateway's, not the
 * PC's. Plain DNS only, with a short timeout: an unknown address must not hold the request.
 */
export async function deviceHost(
  address: string | undefined,
  reverse: (ip: string) => Promise<string[]> = dnsReverse,
  timeoutMs = 1_000,
): Promise<{ hostname: string | null; ip: string | null }> {
  const ip = address?.replace(/^::ffff:/, '') ?? null;
  if (!ip) return { hostname: null, ip };
  if (ip === '127.0.0.1' || ip === '::1') return { hostname: hostname(), ip };

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const name = await Promise.race([
    reverse(ip).then(
      (names) => names[0] ?? null,
      () => null,
    ),
    timeout,
  ]);
  clearTimeout(timer);
  return { hostname: name, ip };
}
