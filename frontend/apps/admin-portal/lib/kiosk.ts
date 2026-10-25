import type { KioskMenuItem } from '@aahar/api-client';
import { previewBill } from './pos-pricing';

/** As many of one item as one guest may take at the kiosk (the server allows the same). */
export const MAX_PER_ITEM = 20;

export interface KioskCartLine {
  item: KioskMenuItem;
  quantity: number;
}

/** The cart with `quantity` of the item: 0 takes it off, more than MAX_PER_ITEM stops there. */
export function setQuantity(
  cart: readonly KioskCartLine[],
  item: KioskMenuItem,
  quantity: number,
): KioskCartLine[] {
  const next = Math.min(MAX_PER_ITEM, Math.max(0, quantity));
  const found = cart.some((line) => line.item.id === item.id);

  if (!found) return next > 0 ? [...cart, { item, quantity: next }] : [...cart];

  return cart.flatMap((line) =>
    line.item.id !== item.id ? [line] : next > 0 ? [{ ...line, quantity: next }] : [],
  );
}

export function quantityOf(cart: readonly KioskCartLine[], menuId: string): number {
  return cart.find((line) => line.item.id === menuId)?.quantity ?? 0;
}

/**
 * The cart against a fresh menu: lines keep the menu's latest price; items no longer on sale
 * come off, and their names are returned so the guest can be told.
 */
export function reconcile(
  cart: readonly KioskCartLine[],
  items: readonly KioskMenuItem[],
): { cart: KioskCartLine[]; dropped: string[] } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const dropped = cart.filter((line) => !byId.has(line.item.id)).map((line) => line.item.itemName);
  const kept = cart.flatMap((line) => {
    const item = byId.get(line.item.id);
    return item ? [{ ...line, item }] : [];
  });

  return { cart: kept, dropped };
}

/** What the guest will pay, worked as the counter bills it; the server's total is final. */
export function cartTotals(cart: readonly KioskCartLine[], staffDiscountPercent: number) {
  const totals = previewBill(
    cart.map(({ item, quantity }) => ({
      discountPercent: item.isDiscountable ? staffDiscountPercent : 0,
      gstPercent: item.gstPercent,
      isGstInclusive: item.isGstInclusive,
      quantity,
      unitPrice: item.price,
    })),
  );

  return { ...totals, itemCount: cart.reduce((sum, line) => sum + line.quantity, 0) };
}
