import type { CartItem, DiscountType, PaymentMethod } from "@/lib/types";
import type { ClientCharge } from "@/lib/pricing";

/**
 * `create_order`: park a cart, no payment yet.
 * `create_and_pay`: park + pay in one shot (a takeaway rung up and paid
 *   entirely offline). Starts life as `create_order` and gets promoted in
 *   place by `attachPayment` if the cashier pays before reconnecting —
 *   never a second queued entry, so it's still exactly one `client_uuid`.
 * `pay_order`: payment for an order that already exists on the server
 *   (created online, connection dropped before checkout).
 * `open_shift`: the one non-order action allowed offline (see 00019's
 *   header — complete_order refuses payment with no shift open).
 */
export type OutboxKind = "create_order" | "create_and_pay" | "pay_order" | "open_shift";

export type OutboxStatus = "pending" | "inflight" | "done" | "failed" | "blocked";

/** Mirrors the RPCs' `items jsonb` shape — see lib/queries.ts cartItemsToRpcItems. */
export type RpcItem = {
  menu_item_id: string;
  quantity: number;
  modifier_option_ids: string[];
};

/** Snake_case to match sync_offline_order/sync_offline_payment's p_payment jsonb. */
export type OfflinePaymentPayload = {
  payment_method: PaymentMethod;
  payment_reference: string | null;
  tip_amount: number;
  amount_tendered: number | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
  discount_type: DiscountType | null;
  discount_value: number;
  discount_reason: string | null;
};

/** What the queue panel needs to render a row without touching the network. */
export type OfflineOrderSnapshot = {
  offlineRef: string;
  tableName: string | null;
  itemCount: number;
  lines: { name: string; quantity: number; modifiers: string[] }[];
  totalAmount: number;
  currency: string;
};

export type OutboxEntry = {
  /** === the client_uuid sent to the RPC. One key, no ambiguity. */
  id: string;
  seq: number;
  kind: OutboxKind;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  /** ms epoch when first queued — becomes p_client_age_seconds at drain time. */
  queuedAtEpochMs: number;
  /** Device wall clock at queue time. Forensics only; never trusted for bucketing. */
  occurredAtIso: string;
  /** "OFF-A7F3" — deterministic from `id`, printed on the provisional receipt. */
  offlineRef: string;
  deviceId: string;
  /**
   * The location this entry was queued AT (supabase/migrations 00023,
   * 00028) — stamped once at enqueue time by outbox.ts's
   * getActiveLocationId(), never updated afterward. Draining into a
   * DIFFERENT location than this is refused, both client-side
   * (lib/offline/sync.ts) and server-side (sync_offline_order /
   * sync_offline_payment's p_location_id check) — the idempotency key is
   * (location_id, client_uuid), so a mis-drain would produce a second
   * order rather than a clean replay. `null` for an entry queued before
   * this column existed, or if location resolution failed entirely at
   * enqueue time — treated as a wildcard (always allowed to drain), since
   * losing a paid sale is worse than a theoretical mis-location on what
   * was, for that device, always a single-location install.
   */
  locationId: string | null;
  /** Set on a pay_order entry once we know which server order it targets. */
  serverOrderId: string | null;
  expectedShiftId: string | null;

  items?: RpcItem[];
  tableId?: string | null;
  payment?: OfflinePaymentPayload;
  clientCharge?: ClientCharge;
  openingFloat?: number;

  snapshot: OfflineOrderSnapshot;
  lastError: string | null;
  lastErrorCode: string | null;
  result: {
    orderId: string;
    orderNumber: number | null;
    status: "parked" | "completed";
    discrepancy: number;
    warnings: unknown[];
  } | null;
};

export type EnqueueCartInput = {
  cartItems: CartItem[];
  tableId: string | null;
  tableName: string | null;
  currency: string;
};
