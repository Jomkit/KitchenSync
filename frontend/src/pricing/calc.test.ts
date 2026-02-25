import { describe, expect, it } from "vitest";

import {
  calcGrandTotalCents,
  calcPresetTipCents,
  calcSubtotalCents,
  calcTaxCents,
  parseCurrencyInputToCents,
} from "./calc";

describe("pricing math", () => {
  it("calculates subtotal from line qty and unit cents", () => {
    const subtotal = calcSubtotalCents([
      { qty: 2, unitPriceCents: 1299 },
      { qty: 1, unitPriceCents: 899 },
    ]);
    expect(subtotal).toBe(3497);
  });

  it("calculates tax with rounding", () => {
    expect(calcTaxCents(3497, 8)).toBe(280);
  });

  it("calculates preset tip on subtotal", () => {
    expect(calcPresetTipCents(3497, 15)).toBe(525);
    expect(calcPresetTipCents(3497, 20)).toBe(699);
    expect(calcPresetTipCents(3497, 25)).toBe(874);
  });

  it("parses custom currency input to cents and clamps invalid values", () => {
    expect(parseCurrencyInputToCents("4.75")).toBe(475);
    expect(parseCurrencyInputToCents("-1")).toBe(0);
    expect(parseCurrencyInputToCents("x")).toBe(0);
    expect(parseCurrencyInputToCents("")).toBe(0);
  });

  it("calculates grand total from subtotal tax and tip", () => {
    expect(calcGrandTotalCents(3497, 280, 525)).toBe(4302);
  });
});
