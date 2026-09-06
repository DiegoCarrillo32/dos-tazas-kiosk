import { describe, expect, it } from "vitest";
import { tenderSuggestions } from "@/app/pos/counter/_components/PaymentSection";
import {
  changeDue,
  discountBase,
  priceCart,
  priceCheckout,
  round2,
  selectionToRpcItems,
} from "./pricing";
import type { CartItem, MenuItem, ModifierOption } from "./types";

// These cases are pinned against the server arithmetic they mirror:
//   supabase/migrations/00013_order_write_lockdown.sql  _insert_priced_items
//   supabase/migrations/00018_order_discounts.sql       complete_order (149-187)
// A change here that isn't matched server-side is exactly the kind of
// drift an offline sale could silently charge a real customer for.

function menuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    location_id: "loc-1",
    category_id: null,
    name: "Latte",
    description: null,
    price: 1200,
    available_quantity: 100,
    is_active: true,
    track_inventory: false,
    low_stock_threshold: 0,
    is_available: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function option(overrides: Partial<ModifierOption> = {}): ModifierOption {
  return {
    id: "opt-1",
    modifier_id: "mod-1",
    name: "Oat milk",
    extra_price: 300,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItem: menuItem(),
    quantity: 1,
    selectedModifiers: [],
    ...overrides,
  };
}

describe("round2", () => {
  it("rounds to the nearest cent", () => {
    expect(round2(10)).toBe(10);
    expect(round2(10.126)).toBe(10.13);
    expect(round2(10.124)).toBe(10.12);
  });

  it("matches JS floating-point rounding at the .005 boundary — same trap Postgres's own binary-float paths avoid, but our round2 does not", () => {
    // 1.005 is not exactly representable in binary; Math.round(100.499999...) rounds down.
    // Documented here as a known, accepted limitation of the client mirror rather than
    // a bug someone "fixes" later without realizing round2 must match `round(n,2)`'s
    // *actual* numeric(10,2) semantics, not naive expectation.
    expect(round2(1.005)).toBe(1);
  });
});

describe("priceCart — IVA-inclusive pricing (prices_include_tax = true)", () => {
  const ctx = { taxRate: 0.13, pricesIncludeTax: true };

  it("prices a single line with no modifiers", () => {
    const priced = priceCart([cartItem()], ctx);
    // unitPrice = 1200, lineTotal = 1200
    // tax = 1200 - 1200/1.13 = 1200 - 1061.9469... = 138.0530... -> round2 = 138.05
    expect(priced.lines[0].unitPrice).toBe(1200);
    expect(priced.lines[0].lineTotal).toBe(1200);
    expect(priced.lines[0].taxAmount).toBe(138.05);
    expect(priced.lines[0].totalPrice).toBe(1200); // inclusive: total_price = lineTotal
    expect(priced.totalAmount).toBe(1200);
    expect(priced.taxAmount).toBe(138.05);
    expect(priced.subtotal).toBe(round2(1200 - 138.05));
  });

  it("adds modifier extra_price into unit price before tax split", () => {
    const item = cartItem({
      selectedModifiers: [
        { modifierId: "mod-1", modifierName: "Milk", option: option({ extra_price: 300 }) },
      ],
    });
    const priced = priceCart([item], ctx);
    expect(priced.lines[0].unitPrice).toBe(1500);
    expect(priced.lines[0].lineTotal).toBe(1500);
    expect(priced.lines[0].totalPrice).toBe(1500);
  });

  it("sums multiple modifiers on one line", () => {
    const item = cartItem({
      selectedModifiers: [
        { modifierId: "mod-1", modifierName: "Milk", option: option({ id: "o1", extra_price: 300 }) },
        { modifierId: "mod-2", modifierName: "Syrup", option: option({ id: "o2", extra_price: 250 }) },
      ],
    });
    const priced = priceCart([item], ctx);
    expect(priced.lines[0].unitPrice).toBe(1750);
    expect(priced.lines[0].modifiers).toHaveLength(2);
  });

  it("multiplies unit price by quantity for the line total", () => {
    const priced = priceCart([cartItem({ quantity: 3 })], ctx);
    expect(priced.lines[0].lineTotal).toBe(3600);
    expect(priced.lines[0].totalPrice).toBe(3600);
  });

  it("sums multiple distinct lines into order totals", () => {
    const priced = priceCart(
      [
        cartItem({ cartId: "a", menuItem: menuItem({ id: "m1", price: 1200 }) }),
        cartItem({ cartId: "b", menuItem: menuItem({ id: "m2", price: 800 }), quantity: 2 }),
      ],
      ctx
    );
    // line1 total 1200, line2 total 1600 -> gross 2800
    expect(priced.totalAmount).toBe(2800);
    expect(priced.subtotal + priced.taxAmount).toBe(priced.totalAmount);
  });

  it("handles an odd-cent unit price without drifting off the SQL's per-assignment rounding", () => {
    // price + extras produces a fraction; unitPrice must round BEFORE multiplying by qty,
    // exactly like the numeric(10,2) column assignment in _insert_priced_items.
    const item = cartItem({
      menuItem: menuItem({ price: 1033.333 }),
      quantity: 3,
      selectedModifiers: [
        { modifierId: "mod-1", modifierName: "Milk", option: option({ extra_price: 66.666 }) },
      ],
    });
    const priced = priceCart([item], ctx);
    // unitPrice = round2(1033.333 + 66.666) = round2(1099.999) = 1100.00
    expect(priced.lines[0].unitPrice).toBe(1100);
    // lineTotal = round2(1100 * 3) = 3300 (not 3299.997 * something)
    expect(priced.lines[0].lineTotal).toBe(3300);
  });
});

describe("priceCart — IVA-exclusive pricing (prices_include_tax = false)", () => {
  const ctx = { taxRate: 0.13, pricesIncludeTax: false };

  it("adds tax on top of the line total rather than splitting it out", () => {
    const priced = priceCart([cartItem()], ctx);
    // lineTotal = 1200, tax = round2(1200*0.13) = 156, totalPrice = 1200+156 = 1356
    expect(priced.lines[0].lineTotal).toBe(1200);
    expect(priced.lines[0].taxAmount).toBe(156);
    expect(priced.lines[0].totalPrice).toBe(1356);
    expect(priced.totalAmount).toBe(1356);
    expect(priced.subtotal).toBe(1200);
  });

  it("still holds subtotal + tax == total for multiple lines", () => {
    const priced = priceCart(
      [
        cartItem({ cartId: "a", quantity: 2 }),
        cartItem({ cartId: "b", menuItem: menuItem({ id: "m2", price: 950 }) }),
      ],
      ctx
    );
    expect(round2(priced.subtotal + priced.taxAmount)).toBe(priced.totalAmount);
  });
});

describe("priceCheckout — discount + IVA re-split + tip (mirrors complete_order 149-187)", () => {
  it("passes gross through unchanged with no discount and no tip", () => {
    const math = priceCheckout({ gross: 1200, tax: 138.05, discountType: null, discountValue: 0, tip: 0 });
    expect(math.discountAmount).toBe(0);
    expect(math.subtotal).toBe(1200 - 138.05);
    expect(math.taxAmount).toBe(138.05);
    expect(math.totalAmount).toBe(1200);
    expect(math.discountExceedsGross).toBe(false);
  });

  it("applies a percent discount and re-splits tax proportionally", () => {
    // gross 1200, tax 138.05 (13% IVA-inclusive on a 1200 item), 10% discount
    const math = priceCheckout({ gross: 1200, tax: 138.05, discountType: "percent", discountValue: 10, tip: 0 });
    // discount = round2(1200 * 10/100) = 120
    expect(math.discountAmount).toBe(120);
    const discountedGross = 1200 - 120; // 1080
    const expectedTax = round2((138.05 * discountedGross) / 1200);
    expect(math.taxAmount).toBe(expectedTax);
    expect(math.subtotal).toBe(round2(discountedGross - expectedTax));
    expect(math.totalAmount).toBe(discountedGross);
  });

  it("clamps a percent discount over 100 to 100", () => {
    const math = priceCheckout({ gross: 1000, tax: 115, discountType: "percent", discountValue: 150, tip: 0 });
    expect(math.discountAmount).toBe(1000);
    expect(math.totalAmount).toBe(0);
    expect(math.discountExceedsGross).toBe(false); // capped at gross exactly, not over
  });

  it("applies a flat amount discount", () => {
    const math = priceCheckout({ gross: 1200, tax: 138.05, discountType: "amount", discountValue: 200, tip: 0 });
    expect(math.discountAmount).toBe(200);
    expect(math.totalAmount).toBe(1000);
  });

  it("flags but caps a flat discount that exceeds the order total", () => {
    const math = priceCheckout({ gross: 1200, tax: 138.05, discountType: "amount", discountValue: 5000, tip: 0 });
    expect(math.discountExceedsGross).toBe(true);
    expect(math.discountAmount).toBe(1200); // capped, never negative total
    expect(math.totalAmount).toBe(0);
  });

  it("adds the tip on top of the discounted total, not the pre-discount gross", () => {
    const math = priceCheckout({ gross: 1200, tax: 138.05, discountType: "percent", discountValue: 10, tip: 150 });
    expect(math.preTipTotal).toBe(1080);
    expect(math.totalAmount).toBe(1230);
  });

  it("treats a negative tip as zero", () => {
    const math = priceCheckout({ gross: 1000, tax: 115, discountType: null, discountValue: 0, tip: -50 });
    expect(math.tipAmount).toBe(0);
    expect(math.totalAmount).toBe(1000);
  });

  it("treats a negative discount value as zero", () => {
    const math = priceCheckout({ gross: 1000, tax: 115, discountType: "amount", discountValue: -50, tip: 0 });
    expect(math.discountAmount).toBe(0);
    expect(math.totalAmount).toBe(1000);
  });

  it("ignores discount fields entirely when discountType is null even if a value is set", () => {
    const math = priceCheckout({ gross: 1000, tax: 115, discountType: null, discountValue: 500, tip: 0 });
    expect(math.discountAmount).toBe(0);
    expect(math.totalAmount).toBe(1000);
  });

  it("handles a zero-gross order without dividing by zero", () => {
    const math = priceCheckout({ gross: 0, tax: 0, discountType: "percent", discountValue: 10, tip: 0 });
    expect(math.discountAmount).toBe(0);
    expect(math.totalAmount).toBe(0);
    expect(Number.isFinite(math.taxAmount)).toBe(true);
  });

  it("keeps subtotal + tax + tip == total for a combined discount+tip case", () => {
    const math = priceCheckout({ gross: 3456.78, tax: 397.66, discountType: "amount", discountValue: 333.33, tip: 200 });
    expect(round2(math.subtotal + math.taxAmount + math.tipAmount)).toBe(math.totalAmount);
  });
});

describe("discountBase — the lines a discount is aimed at (mirrors _resolve_discount_scope)", () => {
  // A ₡2.500 latte (×2) and a ₡1.500 pastry, IVA-inclusive at 13%.
  const lines = [
    { id: "latte", quantity: 2, total_price: 5000, tax_amount: 575.22 },
    { id: "pastry", quantity: 1, total_price: 1500, tax_amount: 172.57 },
  ];

  it("is empty when nothing is selected", () => {
    expect(discountBase(lines, {})).toEqual({ gross: 0, tax: 0, unitCount: 0, lineCount: 0 });
  });

  it("takes a whole line", () => {
    const base = discountBase(lines, { pastry: 1 });
    expect(base).toEqual({ gross: 1500, tax: 172.57, unitCount: 1, lineCount: 1 });
  });

  it("prorates a single unit out of a multi-unit line", () => {
    // The free coffee case: one of two lattes.
    const base = discountBase(lines, { latte: 1 });
    expect(base.gross).toBe(2500);
    expect(base.tax).toBe(round2(575.22 / 2));
    expect(base.unitCount).toBe(1);
  });

  it("clamps a stale quantity to the line's own, so the base cannot inflate", () => {
    expect(discountBase(lines, { pastry: 9 }).gross).toBe(1500);
    expect(discountBase(lines, { latte: 99 }).gross).toBe(5000);
  });

  it("clamps a zero or negative quantity up to one unit", () => {
    expect(discountBase(lines, { latte: 0 }).unitCount).toBe(1);
    expect(discountBase(lines, { latte: -3 }).unitCount).toBe(1);
  });

  it("sums several lines", () => {
    const base = discountBase(lines, { latte: 1, pastry: 1 });
    expect(base.gross).toBe(4000);
    expect(base.lineCount).toBe(2);
    expect(base.unitCount).toBe(2);
  });

  it("sends the same clamped quantities to the RPC that it priced", () => {
    expect(selectionToRpcItems(lines, { latte: 99, pastry: 1 })).toEqual([
      { order_item_id: "latte", quantity: 2 },
      { order_item_id: "pastry", quantity: 1 },
    ]);
  });
});

describe("priceCheckout — item-scoped discounts (mirrors _price_checkout in 00030)", () => {
  // Order: one ₡2.500 latte + one ₡1.500 pastry = ₡4.000 gross,
  // IVA-inclusive at 13% → ₡460.18 tax (287.61 + 172.57).
  const GROSS = 4000;
  const TAX = 460.18;
  const LATTE_GROSS = 2500;
  const LATTE_TAX = 287.61;

  it("comps one line entirely and leaves the rest of the tab whole", () => {
    const math = priceCheckout({
      gross: GROSS,
      tax: TAX,
      baseGross: LATTE_GROSS,
      baseTax: LATTE_TAX,
      discountType: "percent",
      discountValue: 100,
      tip: 0,
    });
    expect(math.discountAmount).toBe(LATTE_GROSS);
    expect(math.totalAmount).toBe(1500);
    // Only the latte's IVA came off — the pastry still owes Hacienda its own.
    expect(math.taxAmount).toBe(round2(TAX - LATTE_TAX));
    expect(math.discountExceedsGross).toBe(false);
  });

  it("takes a percentage of the selected line only", () => {
    const math = priceCheckout({
      gross: GROSS,
      tax: TAX,
      baseGross: LATTE_GROSS,
      baseTax: LATTE_TAX,
      discountType: "percent",
      discountValue: 10,
      tip: 0,
    });
    expect(math.discountAmount).toBe(250);
    expect(math.totalAmount).toBe(3750);
    expect(math.taxAmount).toBe(round2(TAX - LATTE_TAX + round2((LATTE_TAX * 2250) / LATTE_GROSS)));
  });

  it("caps a flat amount at the selected line, not at the order", () => {
    const math = priceCheckout({
      gross: GROSS,
      tax: TAX,
      baseGross: LATTE_GROSS,
      baseTax: LATTE_TAX,
      discountType: "amount",
      discountValue: 3000,
      tip: 0,
    });
    // ₡3.000 is under the ₡4.000 order but over the ₡2.500 line it names.
    expect(math.discountExceedsGross).toBe(true);
    expect(math.discountAmount).toBe(LATTE_GROSS);
    expect(math.totalAmount).toBe(1500);
  });

  it("keeps subtotal + tax + tip == total with a scoped discount and a tip", () => {
    const math = priceCheckout({
      gross: GROSS,
      tax: TAX,
      baseGross: LATTE_GROSS,
      baseTax: LATTE_TAX,
      discountType: "percent",
      discountValue: 100,
      tip: 200,
    });
    expect(round2(math.subtotal + math.taxAmount + math.tipAmount)).toBe(math.totalAmount);
    expect(math.totalAmount).toBe(1700);
  });

  it("reproduces the whole-order figures exactly when the base is the whole order", () => {
    // The regression lock: passing the base explicitly must not shift a
    // colón against the pre-00030 arithmetic.
    for (const [type, value] of [
      ["percent", 10],
      ["percent", 100],
      ["amount", 333.33],
      ["amount", 5000],
    ] as const) {
      const plain = priceCheckout({ gross: 3456.78, tax: 397.66, discountType: type, discountValue: value, tip: 200 });
      const scoped = priceCheckout({
        gross: 3456.78,
        tax: 397.66,
        baseGross: 3456.78,
        baseTax: 397.66,
        discountType: type,
        discountValue: value,
        tip: 200,
      });
      expect(scoped).toEqual(plain);
    }
  });

  it("ignores a base larger than the order rather than trusting it", () => {
    const math = priceCheckout({
      gross: 1000,
      tax: 115,
      baseGross: 99999,
      baseTax: 99999,
      discountType: "percent",
      discountValue: 100,
      tip: 0,
    });
    expect(math.discountAmount).toBe(1000);
    expect(math.totalAmount).toBe(0);
  });

  it("handles a zero base without dividing by zero", () => {
    const math = priceCheckout({
      gross: 4000,
      tax: 460.18,
      baseGross: 0,
      baseTax: 0,
      discountType: "percent",
      discountValue: 100,
      tip: 0,
    });
    expect(math.discountAmount).toBe(0);
    expect(math.totalAmount).toBe(4000);
    expect(Number.isFinite(math.taxAmount)).toBe(true);
  });
});

describe("changeDue", () => {
  it("computes change owed when tendered exceeds the total", () => {
    expect(changeDue(1230, 1500)).toBe(270);
  });

  it("returns a negative value when tendered is short (caller must block on this)", () => {
    expect(changeDue(1230, 1000)).toBe(-230);
  });

  it("returns zero for exact change", () => {
    expect(changeDue(1230, 1230)).toBe(0);
  });
});

describe("tenderSuggestions", () => {
  it("offers the notes a customer would hand over for a small order", () => {
    // ₡1,500 → the ₡2,000 note, then ₡5,000 and ₡10,000.
    expect(tenderSuggestions(1500)).toEqual([2000, 5000, 10000]);
  });

  it("still offers chips above ₡10,000 — the old hardcoded list offered none", () => {
    // A round ₡12,000 needs no "next ₡1,000" chip: that IS the total, and
    // the Exact button already covers it.
    expect(tenderSuggestions(12000)).toEqual([15000, 20000]);
    expect(tenderSuggestions(12500)).toEqual([13000, 15000, 20000]);
  });

  it("includes the ₡20,000 note, which was missing entirely", () => {
    expect(tenderSuggestions(15500)).toContain(20000);
  });

  it("never suggests less than the total", () => {
    for (const total of [900, 4300, 9999, 21000, 47500]) {
      for (const s of tenderSuggestions(total)) expect(s).toBeGreaterThan(total);
    }
  });

  it("never repeats an amount", () => {
    // A total that is already a round 1,000 makes several rules agree.
    const s = tenderSuggestions(5000);
    expect(new Set(s).size).toBe(s.length);
  });

  it("returns nothing for a zero or nonsense total", () => {
    expect(tenderSuggestions(0)).toEqual([]);
    expect(tenderSuggestions(NaN)).toEqual([]);
  });
});
