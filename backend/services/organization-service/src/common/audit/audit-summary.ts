/** "18" or "2.5": a quantity as people write it. */
export function qty(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** "Basmati Rice" when the lines are all one item, "3 items" for several. */
export function itemsLabel(lines: Array<{ itemName?: string | null }>): string {
  const names = new Set(lines.map((line) => line.itemName ?? ''));
  const [only] = names;

  return names.size === 1 ? only || '1 item' : `${names.size} items`;
}

export function total(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
