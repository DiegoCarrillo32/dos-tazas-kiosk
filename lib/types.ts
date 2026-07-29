// App-level types layered on the generated database schema
// (lib/database.types.ts, regenerated from the live project — see its
// header). Table-backed types below are DERIVED from that schema, not
// hand-duplicated: a column renamed or dropped in a migration becomes a
// compile error here instead of a silent runtime mismatch. RPC return
// shapes (ShiftSummary, SalesSummary, ...) and client-only shapes
// (CartItem, ...) further down have no table to derive from and stay
// hand-written.

import type { Tables } from "./database.types";

export type Location = Tables<"locations">;

export type UserProfile = Omit<Tables<"user_profiles">, "role"> & {
  role: "admin" | "staff";
};

/**
 * `sort_order` is nullable in the schema (a bare column default, not a
 * NOT NULL constraint) but every write path here always supplies a
 * number — narrowed back to `number` so callers don't need to guard a
 * case that doesn't happen in practice.
 */
export type Category = Omit<Tables<"categories">, "sort_order"> & {
  sort_order: number;
};

export type MenuItem = Omit<Tables<"menu_items">, "available_quantity"> & {
  /** Same nullable-in-schema, always-populated-in-practice case as Category.sort_order. */
  available_quantity: number;
  // Joined data
  category?: Category;
};

export type Modifier = Tables<"modifiers"> & {
  // Joined data
  options?: ModifierOption[];
};

export type ModifierOption = Tables<"modifier_options">;

export type Table = Omit<Tables<"tables">, "sort_order"> & {
  /** Same nullable-in-schema, always-populated-in-practice case as Category.sort_order. */
  sort_order: number;
};

export type OrderStatus =
  | "draft"
  | "parked"
  | "completed"
  | "cancelled"
  | "refunded";
export type PaymentMethod = "card" | "cash" | "sinpe";

/**
 * How a checkout discount was keyed in. The client sends the type and the
 * raw value ("percent", 10); `complete_order` derives the colón figure, so
 * a tampered client cannot dictate what comes off the till.
 */
export type DiscountType = "percent" | "amount";

export type LocationSettings = Tables<"location_settings">;

// ─── Shifts & cash drawer ──────────────────────────────────────────

export type ShiftStatus = "open" | "closed";
export type CashMovementType = "paid_in" | "paid_out";

/** CRC note and coin denominations, largest first — used by the close-shift counter. */
export const CRC_DENOMINATIONS = [
  20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5,
] as const;

/** Map of denomination → how many of that note/coin were counted. */
export type CountedBreakdown = Record<string, number>;

export type CashMovement = {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  created_at: string;
  created_by_name: string | null;
};

/** Shape returned by the `shift_summary` / `close_shift` RPCs. */
export type ShiftSummary = {
  shift_id: string;
  status: ShiftStatus;
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  opening_float: number;
  cash_sales: number;
  cash_refunds: number;
  paid_in: number;
  paid_out: number;
  expected_cash: number;
  counted_cash: number | null;
  counted_breakdown: CountedBreakdown | null;
  cash_variance: number | null;
  closing_note: string | null;
  movements: CashMovement[];
  sales: {
    order_count: number;
    refund_count: number;
    void_count: number;
    gross_sales: number;
    net_sales: number;
    tax_amount: number;
    tip_amount: number;
    discount_amount: number;
    refund_total: number;
    by_payment_method: Record<string, number>;
  };
};

/** Row shape returned by the `recent_shifts` RPC. */
export type ShiftListItem = {
  id: string;
  status: ShiftStatus;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  expected_cash: number | null;
  counted_cash: number | null;
  cash_variance: number | null;
  closing_note: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  gross_sales: number;
  order_count: number;
};

// ─── Reporting ─────────────────────────────────────────────────────

/** Shape returned by the `sales_summary` RPC (all aggregation done in SQL). */
export type SalesSummary = {
  order_count: number;
  refund_count: number;
  void_count: number;
  /** What customers paid, including IVA and tips. */
  gross_sales: number;
  /** Ex-IVA sales — the real revenue line. */
  net_sales: number;
  tax_amount: number;
  /** Reported separately: a tip is owed to staff, not shop revenue. */
  tip_amount: number;
  discount_amount: number;
  refund_total: number;
  items_sold: number;
  average_ticket: number;
  by_payment_method: { method: PaymentMethod; total: number; count: number }[];
  by_day: { date: string; gross: number; net: number; orders: number }[];
  by_hour: { hour: number; orders: number; gross: number }[];
  by_category: { name: string; quantity: number; revenue: number }[];
  by_staff: { name: string; orders: number; gross: number }[];
  top_items: { name: string; quantity: number; revenue: number }[];
};

/**
 * `shift_id`: set by complete_order at payment time — the shift whose
 * drawer took the money.
 *
 * `discount_amount`: money taken off at checkout, tax included.
 * `subtotal`/`tax_amount` are already net of it (complete_order re-splits
 * the discounted gross), so this is a record of what was given away, not
 * a term to subtract: total_amount = subtotal + tax_amount + tip_amount.
 *
 * `discount_reason`: required whenever discount_amount > 0 — enforced by
 * complete_order.
 *
 * Offline-sync columns (supabase/migrations/00019_offline_sync.sql):
 * `client_uuid` is the idempotency key set by sync_offline_order /
 * sync_offline_payment (null for an order created online); `offline_ref`
 * is the "OFF-A7F3" printed on the provisional receipt, kept for matching
 * after sync; `occurred_at` is when the sale actually happened per the
 * client's reported age, NOT when this row was written; `client_charge`
 * and `sync_warnings` are typed loosely (jsonb in the schema) since
 * nothing live reads their shape beyond length/presence checks.
 */
export type Order = Omit<
  Tables<"orders">,
  "status" | "payment_method" | "client_charge" | "sync_warnings"
> & {
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  client_charge?: Record<string, unknown> | null;
  sync_warnings?: unknown[] | null;
  // Joined data
  order_items?: OrderItem[];
  table?: { name: string } | null;
};

export type OrderItem = Tables<"order_items"> & {
  // Joined data
  menu_item?: MenuItem;
  modifiers?: OrderItemModifier[];
};

export type OrderItemModifier = Tables<"order_item_modifiers">;

// Client-side cart types (not stored in DB directly)
export type CartItem = {
  cartId: string; // unique client-side ID
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
};

export type SelectedModifier = {
  modifierId: string;
  modifierName: string;
  option: ModifierOption;
};
