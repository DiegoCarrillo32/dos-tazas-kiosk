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
export const PRICING_VERSION = "2026-09-05-a";

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
  /**
   * A keyed discount that overshoots what it applies to (the selected
   * lines, or the whole order when nothing is selected). Checkout should
   * be blocked, not silently zeroed.
   */
  discountExceedsGross: boolean;
};

/**
 * Mirrors `complete_order`'s discount / IVA-re-split / tip arithmetic
 * (00030_item_scoped_discounts.sql — `_price_checkout`) exactly. The server
 * is what actually charges — any drift here would quote the customer a total
 * the till never takes.
 *
 * @param gross list price of the order, IVA included (subtotal + taxAmount
 *   from `priceCart`).
 * @param tax   the IVA component of `gross`.
 * @param baseGross the slice of `gross` the discount is taken on — the
 *   selected lines when the cashier targets specific items, otherwise the
 *   whole order. Defaults to `gross`, which reproduces 00018's whole-order
 *   arithmetic term for term.
 * @param baseTax the IVA component of `baseGross`.
 */
export function priceCheckout(input: {
  gross: number;
  tax: number;
  discountType: DiscountType | null;
  discountValue: number;
  tip: number;
  baseGross?: number;
  baseTax?: number;
}): CheckoutMath {
  const gross = Math.max(0, input.gross || 0);
  const tax = Math.max(0, input.tax || 0);
  const tip = Math.max(0, input.tip || 0);
  const discountInput = Math.max(0, input.discountValue || 0);
  const baseGross = Math.min(Math.max(0, input.baseGross ?? gross), gross);
  const baseTax = Math.min(Math.max(0, input.baseTax ?? tax), tax);

  let discountAmount = 0;
  if (input.discountType && discountInput > 0) {
    discountAmount =
      input.discountType === "percent"
        ? round2((baseGross * Math.min(discountInput, 100)) / 100)
        : round2(discountInput);
  }

  // A keyed amount can overshoot what it applies to; the caller shows it
  // capped but blocks checkout rather than silently charging zero
  // (00018:160-161).
  const discountExceedsGross = discountAmount > baseGross;
  const cappedDiscount = Math.min(discountAmount, baseGross);

  // Prices are IVA-inclusive, so a discount takes the tax inside it down
  // too: the IVA owed is the IVA on what the customer actually paid, not on
  // the list price. Only the IVA inside the discounted lines moves —
  // comping a coffee must not reduce the tax owed on the sandwich beside
  // it — so the tax outside the base (tax - baseTax) is carried through
  // untouched and the base's own tax is re-split in the original
  // proportion (00018:178-183, generalised in 00030).
  const discountedGross = gross - cappedDiscount;
  const taxDue =
    cappedDiscount > 0 && baseGross > 0
      ? round2(tax - baseTax + round2((baseTax * (baseGross - cappedDiscount)) / baseGross))
      : tax;
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

/**
 * The lines a discount is aimed at, and what they are worth — the client
 * mirror of `_resolve_discount_scope`
 * (00030_item_scoped_discounts.sql). Rounds at the same points the SQL
 * does, so the base shown on the Counter is the base the server derives.
 *
 * `selection` maps an order_item id to how many of its units are covered;
 * a line absent from the map is not discounted. Quantities are clamped
 * into [1, line quantity] exactly as the SQL clamps them, so a stale
 * selection can never inflate the base.
 */
export function discountBase(
  items: DiscountableLine[],
  selection: Record<string, number>
): { gross: number; tax: number; unitCount: number; lineCount: number } {
  let gross = 0;
  let tax = 0;
  let unitCount = 0;
  let lineCount = 0;

  for (const item of items) {
    const requested = selection[item.id];
    if (requested == null) continue;
    const lineQty = Math.max(1, Number(item.quantity) || 1);
    const qty = Math.min(Math.max(1, Math.floor(requested)), lineQty);
    gross += round2((Number(item.total_price) || 0) * qty / lineQty);
    tax += round2((Number(item.tax_amount) || 0) * qty / lineQty);
    unitCount += qty;
    lineCount += 1;
  }

  return { gross: round2(gross), tax: round2(tax), unitCount, lineCount };
}

/** The `order_items` fields `discountBase` needs — a structural subset of OrderItem. */
export type DiscountableLine = {
  id: string;
  quantity: number;
  total_price: number | string;
  tax_amount: number | string;
};

/** What `complete_order`'s `p_discount_items` expects. */
export type DiscountItemRef = { order_item_id: string; quantity: number };

/** The selection, in the shape the RPC takes. Order-independent; the server re-sorts. */
export function selectionToRpcItems(
  items: DiscountableLine[],
  selection: Record<string, number>
): DiscountItemRef[] {
  return items
    .filter((item) => selection[item.id] != null)
    .map((item) => {
      const lineQty = Math.max(1, Number(item.quantity) || 1);
      return {
        order_item_id: item.id,
        quantity: Math.min(Math.max(1, Math.floor(selection[item.id])), lineQty),
      };
    });
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
