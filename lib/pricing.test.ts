import { describe, expect, it } from "vitest";
import { changeDue, priceCart, priceCheckout, round2 } from "./pricing";
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
