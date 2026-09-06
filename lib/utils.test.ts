import { describe, expect, it } from "vitest";
import { formatMoney, isZeroMoney, normalizeText } from "./utils";

describe("isZeroMoney", () => {
  // Why this exists: close_shift rounds only the counted side of the drawer
  // (00014:381) while expected_cash keeps the centimos left over from the IVA
  // split, so a till that reconciled to the colón lands on a variance like
  // 0.37 — which formatMoney prints as "₡0" while `variance !== 0` painted it
  // red. See components/ZReport.tsx and app/admin/cash/page.tsx.
  it("treats a sub-colón residue as zero, the way CRC is displayed", () => {
    expect(isZeroMoney(0.37)).toBe(true);
    expect(isZeroMoney(-0.37)).toBe(true);
    expect(formatMoney(0.37, "CRC")).toBe("₡0");
  });

  it("still flags a real shortfall of one colón", () => {
    expect(isZeroMoney(1)).toBe(false);
    expect(isZeroMoney(-1)).toBe(false);
  });

  it("survives the numeric(10,2) round-trip artifact", () => {
    expect(isZeroMoney(0.0000000002)).toBe(true);
  });

  it("uses cent precision for non-CRC currencies", () => {
    expect(isZeroMoney(0.37, "USD")).toBe(false);
    expect(isZeroMoney(0.001, "USD")).toBe(true);
  });

  it("is false for a missing figure — an open drawer has no variance yet", () => {
    expect(isZeroMoney(null)).toBe(false);
    expect(isZeroMoney(undefined)).toBe(false);
  });
});

describe("normalizeText", () => {
  it("matches accented names from an unaccented search", () => {
    expect(normalizeText("Café Latté")).toBe("cafe latte");
  });
});
