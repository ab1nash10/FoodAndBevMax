'use client';

export function formatProductionQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
