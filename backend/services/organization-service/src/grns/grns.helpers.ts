import { toDateOnly } from '../common/values';

export function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(3));
}

export function isExpiredForAcceptance(expiryDate: Date): boolean {
  const today = toDateOnly(new Date());

  return toDateOnly(expiryDate) < today;
}
