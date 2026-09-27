export interface RequestContextLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

// `request.ip` already honours the one proxy hop trusted in configureSecurityBaseline. Reading
// X-Forwarded-For here directly took its first entry, which the client writes, so audit logs
// recorded whatever address the caller chose.
export function getIpAddress(request: RequestContextLike): string | undefined {
  return request.ip;
}
