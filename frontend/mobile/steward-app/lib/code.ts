/**
 * The six digits in a guest's delivery QR ("fandb-delivery:482913", drawn on their order page);
 * null for any other QR, so a bed's ordering QR or a payment QR is never taken for a code.
 */
export function codeFromScan(data: string): string | null {
  return /^fandb-delivery:(\d{6})$/.exec(data.trim())?.[1] ?? null;
}
