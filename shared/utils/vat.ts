export type ReceiptVatRate = 6 | 12;

export function receiptVatRate(orderType: unknown): ReceiptVatRate {
  return String(orderType ?? '').trim().toLowerCase() === 'eat-here' ? 12 : 6;
}

export function includedVatFromGrossOre(
  grossOre: number,
  orderType: unknown
): { rate: ReceiptVatRate; vatOre: number } {
  const safeGrossOre = Number.isFinite(grossOre) && grossOre > 0 ? Math.round(grossOre) : 0;
  const rate = receiptVatRate(orderType);
  return {
    rate,
    vatOre: Math.round((safeGrossOre * rate) / (100 + rate)),
  };
}

/**
 * Prefer the immutable values captured when payment was verified. Legacy rows
 * have no snapshot and deliberately fall back to the current calculation so
 * they stay readable while remaining identifiable for accounting review.
 */
export function includedVatForReceipt(
  grossOre: number,
  orderType: unknown,
  snapshotRate: unknown,
  snapshotVatOre: unknown
): { rate: ReceiptVatRate; vatOre: number } {
  const rate = Number(snapshotRate);
  const vatOre = Number(snapshotVatOre);
  const safeGrossOre = Number.isFinite(grossOre) && grossOre > 0 ? Math.round(grossOre) : 0;
  if (
    (rate === 6 || rate === 12)
    && Number.isSafeInteger(vatOre)
    && vatOre >= 0
    && vatOre <= safeGrossOre
  ) {
    return { rate, vatOre };
  }
  return includedVatFromGrossOre(grossOre, orderType);
}
