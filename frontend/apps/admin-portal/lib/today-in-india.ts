/**
 * Today's date at the hospitals (IST), as YYYY-MM-DD. Its own file so that code needing only the
 * date (the shell's prefetch) does not pull in the whole POS module, QR codes and all.
 */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
