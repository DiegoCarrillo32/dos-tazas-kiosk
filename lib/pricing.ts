/**
 * Client-side mirror of the server's pricing arithmetic.
 *
 * The server (supabase/migrations/00013_order_write_lockdown.sql —
 * `_insert_priced_items` / `_recompute_order_totals` — and
 * 00018_order_discounts.sql — `complete_order`) is the only place that ever
 * actually charges anyone: the client never sends prices, only
 * {menu_item_id, quantity, modifier_option_ids} (see `cartItemsToRpcItems`
 * in lib/queries.ts). This module exists so that:
 *
 *   1. The Counter page can show a total that matches what `complete_order`
 *      is about to charge, without duplicating the arithmetic inline.
 *   2. An offline sale (lib/offline/*) can compute a *provisional* charge
 *      with no network at all, close enough to the server's eventual
 *      figure that a mismatch is the rare case, not the common one.
 *
 * Every intermediate value the server declares as `numeric(10,2)` rounds at
 * that assignment, not only where the SQL calls `round(...)` explicitly —
 * PL/pgSQL coerces on assignment. This module rounds at exactly the same
 * points so it can't silently drift by a colón on odd modifier sums.
 */

import type { CartItem, DiscountType } from "./types";

/** Round to cents the way Postgres `round(n, 2)` does on the server side. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stamped into `client_charge.pricing_version` when an offline sale syncs,
 * so a future change to this file's arithmetic is visible in the audit
 * trail rather than silently reinterpreting old offline sales. Bump it
 * whenever the rounding or formulas below change.
 */
export const PRICING_VERSION = "2026-07-28-a";

export type PricingContext = {
  /** `location_settings.tax_rate`, e.g. 0.13 for 13% IVA. */
  taxRate: number;
  /** `location_settings.prices_include_tax`. */
  pricesIncludeTax: boolean;
};

export type PricedLine = {
  cartId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  /** menu_item.price + sum(modifier extra_price), rounded — order_items.unit_price */
  unitPrice: number;
  /** unit_price * quantity, rounded — the pre-tax-adjustment line value */
  lineTotal: number;
  /** order_items.tax_amount for this line */
  taxAmount: number;
  /** order_items.total_price for this line */
  totalPrice: number;
  modifiers: { optionId: string; name: string; extraPrice: number }[];
};

export type PricedOrder = {
  lines: PricedLine[];
  /** sum(total_price - tax_amount) — mirrors _recompute_order_totals */
  subtotal: number;
  /** sum(tax_amount) */
  taxAmount: number;
  /** sum(total_price) — subtotal + taxAmount */
  totalAmount: number;
};

/**
 * Mirrors `_insert_priced_items` + `_recompute_order_totals`. Read-only —
 * this never asserts stock/availability; those are the server's job (and,
 * offline, the server's job to *warn* about rather than block on — see
 * decision 3 in the offline-sync plan).
 */
export function priceCart(cart: CartItem[], ctx: PricingContext): PricedOrder {
  const taxRate = ctx.taxRate;
  const inclusive = ctx.pricesIncludeTax;

  const lines: PricedLine[] = cart.map((item) => {
    const modifiers = item.selectedModifiers.map((m) => ({
      optionId: m.option.id,
      name: `${m.modifierName}: ${m.option.name}`,
      extraPrice: Number(m.option.extra_price) || 0,
    }));
    const unitExtra = modifiers.reduce((s, m) => s + m.extraPrice, 0);

    // numeric(10,2) coercion at every assignment — 00013:138,139
    const unitPrice = round2(Number(item.menuItem.price) + unitExtra);
    const lineTotal = round2(unitPrice * item.quantity);
    const taxAmount = inclusive
      ? round2(lineTotal - lineTotal / (1 + taxRate)) // 00013:140
      : round2(lineTotal * taxRate); // 00013:141
    const totalPrice = inclusive ? lineTotal : round2(lineTotal + taxAmount); // 00013:146

    return {
      cartId: item.cartId,
      menuItemId: item.menuItem.id,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      taxAmount,
      totalPrice,
      modifiers,
    };
  });

  // _recompute_order_totals: subtotal = sum(total_price - tax_amount)
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const totalAmount = round2(lines.reduce((s, l) => s + l.totalPrice, 0));
  const subtotal = round2(totalAmount - taxAmount);

  return { lines, subtotal, taxAmount, totalAmount };
}

export type CheckoutMath = {
  discountAmount: number;
  /** net of discount — order.subtotal */
  subtotal: number;
  /** net of discount — order.tax_amount */
  taxAmount: number;
  tipAmount: number;
  /** subtotal + taxAmount, before tip */
  preTipTotal: number;
  /** subtotal + taxAmount + tip — what's actually due */
  totalAmount: number;
  /** A keyed discount that overshoots the order. Checkout should be blocked, not silently zeroed. */
  discountExceedsGross: boolean;
};

/**
 * Mirrors `complete_order`'s discount / IVA-re-split / tip arithmetic
 * (00018_order_discounts.sql:149-187) exactly. The server is what actually
 * charges — any drift here would quote the customer a total the till never
 * takes.
 *
 * @param gross list price of the order, IVA included (subtotal + taxAmount
 *   from `priceCart`) — the base a discount comes off.
 * @param tax   the IVA component of `gross`.
 */
export function priceCheckout(input: {
  gross: number;
  tax: number;
  discountType: DiscountType | null;
  discountValue: number;
  tip: number;
}): CheckoutMath {
  const gross = Math.max(0, input.gross || 0);
  const tax = Math.max(0, input.tax || 0);
  const tip = Math.max(0, input.tip || 0);
  const discountInput = Math.max(0, input.discountValue || 0);

  let discountAmount = 0;
  if (input.discountType && discountInput > 0) {
    discountAmount =
      input.discountType === "percent"
        ? round2((gross * Math.min(discountInput, 100)) / 100)
        : round2(discountInput);
  }

  // A keyed amount can overshoot the order; the caller shows it capped but
  // blocks checkout rather than silently charging zero (00018:160-161).
  const discountExceedsGross = discountAmount > gross;
  const cappedDiscount = Math.min(discountAmount, gross);

  // Prices are IVA-inclusive, so a discount takes the tax inside it down
  // too: the IVA owed is the IVA on what the customer actually paid, not on
  // the list price. Split the discounted gross in the original proportion
  // (00018:178-183).
  const discountedGross = gross - cappedDiscount;
  const taxDue =
    cappedDiscount > 0 && gross > 0 ? round2((tax * discountedGross) / gross) : tax;
  const netDue = round2(discountedGross - taxDue);

  const preTipTotal = discountedGross;
  const totalAmount = round2(preTipTotal + tip);

  return {
    discountAmount: cappedDiscount,
    subtotal: netDue,
    taxAmount: taxDue,
    tipAmount: tip,
    preTipTotal,
    totalAmount,
    discountExceedsGross,
  };
}

export function changeDue(total: number, tendered: number): number {
  return round2((tendered || 0) - total);
}

/**
 * The full breakdown of what was actually charged, for the outbox to carry
 * as `client_charge` at sync time (see the offline-sync plan, §1b: the
 * charged figure — not the server's re-priced figure — is what lands in
 * `orders.total_amount`, so the drawer reconciles against reality).
 */
export type ClientCharge = {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  totalAmount: number;
  amountTendered: number | null;
  changeDue: number | null;
  pricingVersion: string;
};

export function toClientCharge(
  math: CheckoutMath,
  tendered: number | null
): ClientCharge {
  return {
    subtotal: math.subtotal,
    taxAmount: math.taxAmount,
    discountAmount: math.discountAmount,
    tipAmount: math.tipAmount,
    totalAmount: math.totalAmount,
    amountTendered: tendered,
    changeDue: tendered != null ? changeDue(math.totalAmount, tendered) : null,
    pricingVersion: PRICING_VERSION,
  };
}
