export interface PricedInput {
  /** Staff discount on this line, 0 when the item is not discountable. */
  discountPercent?: number;
  gstPercent: number;
  isGstInclusive: boolean;
  quantity: number;
  unitPrice: number;
}

/**
 * The till's preview of a bill, worked the way the server bills it (organization-service
 * pos-pricing.ts): in paise, GST as CGST + SGST rounded each, an inclusive price keeping its
 * total, a staff discount off the taxable value before GST, the total rounded to the rupee. The
 * saved bill is always the server's.
 */
export function previewBill(inputs: readonly PricedInput[]) {
  let subtotal = 0;
  let discountTotal = 0;
  let gstTotal = 0;

  for (const { discountPercent = 0, gstPercent, isGstInclusive, quantity, unitPrice } of inputs) {
    const gross = Math.round(unitPrice * 100) * quantity;
    const rate = Math.round(gstPercent * 100);
    const listGst =
      2 *
      Math.round(isGstInclusive ? (gross * rate) / (2 * (10_000 + rate)) : (gross * rate) / 20_000);
    const listTaxable = isGstInclusive ? gross - listGst : gross;
    const discount = Math.round((listTaxable * Math.round(discountPercent * 100)) / 10_000);

    subtotal += listTaxable;
    discountTotal += discount;
    gstTotal += discount ? 2 * Math.round(((listTaxable - discount) * rate) / 20_000) : listGst;
  }

  const exact = subtotal - discountTotal + gstTotal;
  const grand = Math.round(exact / 100) * 100;

  return {
    discountTotal: discountTotal / 100,
    grandTotal: grand / 100,
    gstTotal: gstTotal / 100,
    roundOff: (grand - exact) / 100,
    subtotal: subtotal / 100,
  };
}
