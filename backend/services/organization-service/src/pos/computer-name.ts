/** A computer's name as Windows may show it: compared without its domain, in any case. */
export function computerName(name: string | null | undefined): string {
  return (name ?? '').trim().split('.')[0]!.toLowerCase();
}
