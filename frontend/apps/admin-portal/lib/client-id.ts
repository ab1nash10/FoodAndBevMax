/**
 * An id the browser makes for an order before sending it, so a retry is the same order. Browsers
 * give crypto.randomUUID only on https or localhost; a phone or kiosk on a plain http address
 * gets 16 random bytes instead (getRandomValues works everywhere).
 */
export function newClientId(): string {
  return (
    globalThis.crypto.randomUUID?.() ??
    Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  );
}
