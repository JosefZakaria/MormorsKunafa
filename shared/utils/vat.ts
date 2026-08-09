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
