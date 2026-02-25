export const TAX_RATE_PERCENT = 8;
export const TIP_PRESETS = [15, 20, 25] as const;

export type CartLinePricing = {
  qty: number;
  unitPriceCents: number;
};

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function calcSubtotalCents(lines: CartLinePricing[]): number {
  return lines.reduce((total, line) => total + line.qty * line.unitPriceCents, 0);
}

export function calcTaxCents(subtotalCents: number, taxRatePercent: number): number {
  return Math.round((subtotalCents * taxRatePercent) / 100);
}

export function calcPresetTipCents(subtotalCents: number, tipPercent: number): number {
  return Math.round((subtotalCents * tipPercent) / 100);
}

export function parseCurrencyInputToCents(rawValue: string): number {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function calcGrandTotalCents(subtotalCents: number, taxCents: number, tipCents: number): number {
  return subtotalCents + taxCents + tipCents;
}
