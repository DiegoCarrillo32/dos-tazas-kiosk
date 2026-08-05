import { createClient, createEphemeralClient } from "@/utils/supabase/client";
import type {
  Category,
  MenuItem,
  Modifier,
  ModifierOption,
  Order,
  CartItem,
  PaymentMethod,
  DiscountType,
  LocationSettings,
  Table,
  UserProfile,
  StaffMember,
  SessionContext,
  CashMovementType,
  CountedBreakdown,
  SalesSummary,
  ShiftListItem,
  ShiftSummary,
} from "./types";
import type { Json } from "./database.types";

// ─── Helpers ───────────────────────────────────────────────────────

// Memoized rather than constructed per call: createClient() sets up its own
// auth-refresh timer, so calling this at every query call site (as before)
// spawned one per site. One client per tab is what @supabase/ssr expects.
let _client: ReturnType<typeof createClient> | null = null;
function supabase() {
  return (_client ??= createClient());
}

const PROFILE_CACHE_KEY = "dostazas.cachedProfile";

function readCachedProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: UserProfile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full or unavailable — the cache is a convenience, not a
    // requirement, so just skip it rather than fail the caller.
  }
}

let profileMemo: UserProfile | null = null;

/**
 * `auth.getUser()` and the profile select are both network calls, so both
 * fail offline even when the caller already has everything they need
 * cached. Fall back to `getSession()` (a cookie read, no network) to
 * confirm there's still a logged-in user, then to a locally cached
 * profile — but only if it belongs to THAT same session's user, so a
 * device that switched accounts never serves the previous person's
 * location.
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  if (profileMemo) return profileMemo;

  try {
    const {
      data: { user },
    } = await supabase().auth.getUser();
    if (user) {
      const { data } = await supabase()
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        profileMemo = data as UserProfile;
        writeCachedProfile(profileMemo);
        return profileMemo;
      }
    }
  } catch {
    // Offline or Supabase unreachable — fall through to the cached profile.
  }

  try {
    const {
      data: { session },
    } = await supabase().auth.getSession();
    const cached = readCachedProfile();
    if (session && cached && cached.id === session.user.id) {
      profileMemo = cached;
      return profileMemo;
    }
  } catch {
    // getSession() is a local cookie read and shouldn't throw, but if the
    // client itself can't be reached, there's nothing left to try.
  }

  return null;
}

/**
 * Clear the in-memory and localStorage profile cache. Call on logout —
 * without this, `getCurrentProfile`'s offline fallback can hand the NEXT
 * cashier on a shared kiosk the PREVIOUS one's cached profile (and so
 * their location_id/role) for as long as `profileMemo` survives, which is
 * until a hard reload — a client-side `router.push` to /login doesn't
 * reset module state.
 */
export function resetProfileCache(): void {
  profileMemo = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/**
 * The location every client read/write filters by. Prefers
 * `active_location_id` (supabase/migrations/00023) — the location a user
 * has switched to (Phase 3) — falling back to `location_id` for a cached
 * profile from before that column existed. Mirrors, on the client, what
 * `get_current_location_id()` resolves server-side for RLS; this value is
 * a UX filter only; RLS is the real security boundary and isn't affected
 * by what this returns.
 */
export async function getLocationId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  return profile.active_location_id ?? profile.location_id;
}

// ─── Categories ────────────────────────────────────────────────────

export async function fetchCategories(): Promise<Category[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("categories")
    .select("*")
    .eq("location_id", locationId)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []) as Category[];
}

// ─── Menu Items ────────────────────────────────────────────────────

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("menu_items")
    .select("*, category:categories(*)")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as MenuItem[];
}

export async function fetchAllMenuItems(): Promise<MenuItem[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("menu_items")
    .select("*, category:categories(*)")
    .eq("location_id", locationId)
    .order("name");

  if (error) throw error;
  return (data ?? []) as MenuItem[];
}

export async function createMenuItem(
  item: Omit<MenuItem, "id" | "created_at" | "updated_at" | "category">
): Promise<MenuItem> {
  const { data, error } = await supabase()
    .from("menu_items")
    .insert(item)
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function updateMenuItem(
  id: string,
  updates: Partial<Omit<MenuItem, "id" | "created_at" | "updated_at" | "category">>
): Promise<MenuItem> {
  const { data, error } = await supabase()
    .from("menu_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase().from("menu_items").delete().eq("id", id);
  if (error) throw error;
}

// ─── Categories CRUD ───────────────────────────────────────────────

export async function createCategory(
  category: Omit<Category, "id" | "created_at">
): Promise<Category> {
  const { data, error } = await supabase()
    .from("categories")
    .insert(category)
    .select()
    .single();

  if (error) throw error;
  return data as Category;
}

export async function updateCategory(
  id: string,
  updates: Partial<Pick<Category, "name" | "sort_order">>
): Promise<Category> {
  const { data, error } = await supabase()
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase().from("categories").delete().eq("id", id);
  if (error) throw error;
}

// ─── Modifiers ─────────────────────────────────────────────────────

/**
 * Fetch every menu-item → modifier link for the location in a single query and
 * return it as a `menuItemId → modifierId[]` map. Combined with
 * `fetchAllModifiers`, this lets the POS resolve a product's modifiers from an
 * in-memory cache (no per-tap network round-trips).
 */
export async function fetchMenuItemModifierMap(): Promise<
  Record<string, string[]>
> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("menu_item_modifiers")
    .select("menu_item_id, modifier_id, menu_items!inner(location_id)")
    .eq("menu_items.location_id", locationId);

  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as { menu_item_id: string; modifier_id: string }[]) {
    (map[row.menu_item_id] ??= []).push(row.modifier_id);
  }
  return map;
}

export async function fetchAllModifiers(): Promise<Modifier[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("modifiers")
    .select("*, options:modifier_options(*)")
    .eq("location_id", locationId)
    .order("name");

  if (error) throw error;
  return (data ?? []) as Modifier[];
}

export async function createModifier(mod: {
  location_id: string;
  name: string;
  is_multiple: boolean;
  is_required: boolean;
}): Promise<Modifier> {
  const { data, error } = await supabase()
    .from("modifiers")
    .insert(mod)
    .select()
    .single();
  if (error) throw error;
  return data as Modifier;
}

export async function updateModifier(
  id: string,
  updates: { name?: string; is_multiple?: boolean; is_required?: boolean }
): Promise<void> {
  const { error } = await supabase()
    .from("modifiers")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteModifier(id: string): Promise<void> {
  const { error } = await supabase().from("modifiers").delete().eq("id", id);
  if (error) throw error;
}

// ─── Modifier Options ──────────────────────────────────────────────


export async function createModifierOption(opt: {
  modifier_id: string;
  name: string;
  extra_price: number;
}): Promise<ModifierOption> {
  const { data, error } = await supabase()
    .from("modifier_options")
    .insert(opt)
    .select()
    .single();
  if (error) throw error;
  return data as ModifierOption;
}

export async function updateModifierOption(
  id: string,
  updates: { name?: string; extra_price?: number }
): Promise<void> {
  const { error } = await supabase()
    .from("modifier_options")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteModifierOption(id: string): Promise<void> {
  const { error } = await supabase()
    .from("modifier_options")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─── Menu Item ↔ Modifier Links ────────────────────────────────────

export async function fetchMenuItemModifierLinks(
  menuItemId: string
): Promise<string[]> {
  const { data, error } = await supabase()
    .from("menu_item_modifiers")
    .select("modifier_id")
    .eq("menu_item_id", menuItemId);
  if (error) throw error;
  return (data ?? []).map((d: { modifier_id: string }) => d.modifier_id);
}

export async function setMenuItemModifiers(
  menuItemId: string,
  modifierIds: string[]
): Promise<void> {
  // Delete existing links
  const { error: delErr } = await supabase()
    .from("menu_item_modifiers")
    .delete()
    .eq("menu_item_id", menuItemId);
  if (delErr) throw delErr;

  // Insert new links
  if (modifierIds.length > 0) {
    const rows = modifierIds.map((modId) => ({
      menu_item_id: menuItemId,
      modifier_id: modId,
    }));
    const { error: insErr } = await supabase()
      .from("menu_item_modifiers")
      .insert(rows);
    if (insErr) throw insErr;
  }
}

// ─── Orders ────────────────────────────────────────────────────────

export function cartItemsToRpcItems(cartItems: CartItem[]) {
  // The client only sends item/quantity/option IDs — never prices — so
  // server-side pricing cannot be tampered with.
  return cartItems.map((item) => ({
    menu_item_id: item.menuItem.id,
    quantity: item.quantity,
    modifier_option_ids: item.selectedModifiers.map((m) => m.option.id),
  }));
}

export async function createOrder(
  cartItems: CartItem[],
  tableId?: string | null
): Promise<string> {
  const { data, error } = await supabase().rpc("create_order", {
    items: cartItemsToRpcItems(cartItems),
    // The generated RPC arg types model a `default null` SQL parameter as
    // optional (`T | undefined`), not `T | null` — omitting the key here
    // has PostgREST send no value at all, which the SQL default resolves
    // to null anyway, so this is behaviorally identical to passing null.
    p_table_id: tableId ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

// Append items to an existing open tab (parked order on a table).
export async function appendToOrder(
  orderId: string,
  cartItems: CartItem[]
): Promise<void> {
  const { error } = await supabase().rpc("append_to_order", {
    p_order_id: orderId,
    items: cartItemsToRpcItems(cartItems),
  });
  if (error) throw error;
}

export async function fetchParkedOrders(): Promise<Order[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("orders")
    .select(
      "*, table:tables(name), order_items(*, menu_item:menu_items(name), modifiers:order_item_modifiers(*))"
    )
    .eq("location_id", locationId)
    .eq("status", "parked")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function completeOrder(params: {
  orderId: string;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  tipAmount?: number;
  amountTendered?: number | null;
  customerName: string | null;
  customerId: string | null;
  customerEmail: string | null;
  discountType?: DiscountType | null;
  discountValue?: number;
  discountReason?: string | null;
}): Promise<void> {
  // complete_order recomputes the total (discount, IVA re-split, tip) and
  // validates the cash tendered server-side before marking the order
  // completed. The discount goes over as type + raw value, never as a
  // finished amount — the server derives the figure and refuses one
  // without a reason.
  const { error } = await supabase().rpc("complete_order", {
    p_order_id: params.orderId,
    p_payment_method: params.paymentMethod,
    // See createOrder's comment above — these RPC args are `default null`
    // in SQL but typed `| undefined` (not `| null`) by the generator, so
    // `?? undefined` here is a type-level formality, not a behavior change.
    p_payment_reference: params.paymentReference ?? undefined,
    p_tip_amount: params.tipAmount ?? 0,
    p_amount_tendered: params.amountTendered ?? undefined,
    p_customer_name: params.customerName ?? undefined,
    p_customer_id: params.customerId ?? undefined,
    p_customer_email: params.customerEmail ?? undefined,
    p_discount_type: params.discountType ?? undefined,
    p_discount_value: params.discountValue ?? 0,
    p_discount_reason: params.discountReason ?? undefined,
  });
  if (error) throw error;
}

/**
 * Void an UNPAID order (draft/parked). Goes through the `void_order` RPC
 * rather than a direct table write so the action is audited with a reason
 * and cannot be pointed at an order that already took money.
 */
export async function voidOrder(
  orderId: string,
  reason?: string | null
): Promise<void> {
  const { error } = await supabase().rpc("void_order", {
    p_order_id: orderId,
    p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

/**
 * Reverse a COMPLETED order (admin only). Restores stock and removes the
 * sale from the shift's expected cash.
 */
export async function refundOrder(
  orderId: string,
  reason?: string | null
): Promise<void> {
  const { error } = await supabase().rpc("reverse_completed_order", {
    p_order_id: orderId,
    p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

/**
 * Replay an order that was built and/or paid entirely offline
 * (`supabase/migrations/00019_offline_sync.sql`, `sync_offline_order`).
 * `p_client_uuid` is the idempotency key: calling this twice with the same
 * value is a clean no-op — `replayed: true` and the original result, never
 * a duplicate order. `null` payment parks only; a payment attached prices
 * and charges in the same call.
 */
export async function syncOfflineOrder(params: {
  clientUuid: string;
  items: ReturnType<typeof cartItemsToRpcItems>;
  offlineRef: string | null;
  deviceId: string;
  tableId: string | null;
  clientAgeSeconds: number;
  expectedShiftId: string | null;
  payment: SyncPaymentPayload | null;
  clientCharge: unknown;
  /**
   * The location this entry was queued at (lib/offline/outbox.ts). The
   * server-side belt to lib/offline/sync.ts's own mismatch check —
   * supabase/migrations/00028 raises P0001 if this doesn't match the
   * caller's current location. `null` (a pre-Phase-4 entry) is a
   * wildcard, matched by no RPC-side check at all.
   */
  locationId: string | null;
}): Promise<SyncRpcResult> {
  const { data, error } = await supabase().rpc("sync_offline_order", {
    p_client_uuid: params.clientUuid,
    p_items: params.items,
    // `?? undefined` on the `default null` args — see createOrder's
    // comment. `clientCharge` is `unknown` (forensics payload, never
    // parsed back) rather than `null`-able, so it needs a cast to the
    // RPC's jsonb `Json` param type instead.
    p_offline_ref: params.offlineRef ?? undefined,
    p_device_id: params.deviceId,
    p_table_id: params.tableId ?? undefined,
    p_client_age_seconds: params.clientAgeSeconds,
    p_expected_shift_id: params.expectedShiftId ?? undefined,
    p_payment: params.payment,
    p_client_charge: params.clientCharge as Json,
    p_location_id: params.locationId ?? undefined,
  });
  if (error) throw error;
  return data as SyncRpcResult;
}

/**
 * Replay a payment for an order that was created ONLINE but paid during an
 * outage (`sync_offline_payment`). Idempotency reuses `orders.client_uuid`
 * — null on an online-created order, so setting it here is free. If a
 * second device already paid the same order offline, this returns a
 * `conflict: "already_paid"` response rather than double-charging or
 * raising — see the migration header for why that's loud, not silent.
 */
export async function syncOfflinePayment(params: {
  orderId: string;
  clientUuid: string;
  clientAgeSeconds: number;
  expectedShiftId: string | null;
  payment: SyncPaymentPayload;
  clientCharge: unknown;
  /** See syncOfflineOrder's `locationId` doc. */
  locationId: string | null;
}): Promise<SyncRpcResult | SyncRpcConflict> {
  const { data, error } = await supabase().rpc("sync_offline_payment", {
    p_order_id: params.orderId,
    p_client_uuid: params.clientUuid,
    p_client_age_seconds: params.clientAgeSeconds,
    p_expected_shift_id: params.expectedShiftId ?? undefined,
    p_payment: params.payment,
    p_client_charge: params.clientCharge as Json,
    p_location_id: params.locationId ?? undefined,
  });
  if (error) throw error;
  return data as SyncRpcResult | SyncRpcConflict;
}

export type SyncPaymentPayload = {
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

export type SyncRpcResult = {
  order_id: string;
  order_number: number | null;
  status: "parked" | "completed";
  replayed: boolean;
  total_amount: number;
  server_total_amount: number | null;
  discrepancy: number;
  warnings: unknown[];
};

export type SyncRpcConflict = {
  conflict: "already_paid" | "not_parked";
  order_id: string;
  order_number?: number | null;
  paid_total?: number;
  status?: string;
};

// ─── Analytics & History ───────────────────────────────────────────

/**
 * Today's headline figures for the admin dashboard.
 *
 * Delegates to `sales_summary` so "today" means today in the shop's
 * timezone — the same business day the analytics page and the Z-report
 * use — rather than the browser's idea of midnight.
 */
export async function fetchTodayAnalytics(): Promise<{
  grossRevenue: number;
  netSales: number;
  tipAmount: number;
  totalOrders: number;
  totalItemsSold: number;
  averageOrderValue: number;
}> {
  const today = await currentBusinessDate();
  const summary = await fetchSalesSummary(today, today);

  return {
    grossRevenue: Number(summary.gross_sales) || 0,
    netSales: Number(summary.net_sales) || 0,
    tipAmount: Number(summary.tip_amount) || 0,
    totalOrders: Number(summary.order_count) || 0,
    totalItemsSold: Number(summary.items_sold) || 0,
    averageOrderValue: Number(summary.average_ticket) || 0,
  };
}

/** Today's date (YYYY-MM-DD) in the shop's timezone. */
export async function currentBusinessDate(): Promise<string> {
  const timeZone = await getTimeZone();
  // en-CA formats as YYYY-MM-DD, which is exactly the shape the RPCs want.
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

/**
 * Convert an inclusive local business-date range into the absolute UTC
 * instants that bound it.
 *
 * The previous implementation compared `created_at` against bare
 * "YYYY-MM-DD" strings, which Postgres reads as UTC midnight. Costa Rica is
 * UTC-6, so a one-day report silently dropped that evening's sales (they are
 * already "tomorrow" in UTC) and pulled in the previous evening's instead.
 * Building the bounds from the local timezone fixes the window.
 *
 * Exported for lib/queries.test.ts — this is exactly the UTC-6 boundary
 * bug described above, worth pinning down directly.
 */
export function localDayRangeToUtc(
  startDate: string,
  endDate: string,
  timeZone: string
): { from: string; to: string } {
  // Offset (in minutes) of the target zone at the given instant.
  const offsetMinutes = (date: Date): number => {
    const asUtc = new Date(
      date.toLocaleString("en-US", { timeZone: "UTC" })
    ).getTime();
    const asZoned = new Date(
      date.toLocaleString("en-US", { timeZone })
    ).getTime();
    return (asUtc - asZoned) / 60000;
  };

  const localMidnight = (day: string, addDays = 0): string => {
    const [y, m, d] = day.split("-").map(Number);
    // Start from the naive UTC instant, then correct by the zone's offset
    // at (approximately) that moment.
    const naive = Date.UTC(y, m - 1, d + addDays, 0, 0, 0, 0);
    const off = offsetMinutes(new Date(naive));
    return new Date(naive + off * 60000).toISOString();
  };

  return { from: localMidnight(startDate), to: localMidnight(endDate, 1) };
}

async function getTimeZone(): Promise<string> {
  const settings = await fetchLocationSettings();
  return settings?.timezone || "America/Costa_Rica";
}

/**
 * Completed + refunded orders in an inclusive local date range.
 * Both statuses are returned so History shows reversals rather than
 * silently dropping them.
 */
export async function fetchCompletedOrders(
  startDate?: string,
  endDate?: string,
  limit = 200
): Promise<Order[]> {
  const locationId = await getLocationId();
  let query = supabase()
    .from("orders")
    .select(
      "*, table:tables(name), order_items(*, menu_item:menu_items(name), modifiers:order_item_modifiers(*))"
    )
    .eq("location_id", locationId)
    .in("status", ["completed", "refunded"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (startDate && endDate) {
    const { from, to } = localDayRangeToUtc(
      startDate,
      endDate,
      await getTimeZone()
    );
    query = query.gte("created_at", from).lt("created_at", to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Order[];
}

/**
 * Orders an offline sync flagged for a human: the till charged something
 * different from what server-authoritative pricing said (sync_discrepancy),
 * or a guard was downgraded to a warning instead of blocking the sale
 * (sync_warnings) — a sold-out item, a stock guard, a missing discount
 * reason. Without this view the entire flagging apparatus in
 * 00019_offline_sync.sql writes to a table nobody reads.
 */
export async function fetchOfflineSyncFlags(limit = 200): Promise<Order[]> {
  const locationId = await getLocationId();
  // sync_discrepancy/sync_warnings comparisons on a jsonb column don't
  // round-trip cleanly through PostgREST's .or() filter string, and the
  // volume here is inherently small (only ever synced offline orders), so
  // filtering client-side after a bounded, most-recent-first fetch is the
  // more robust choice over a fragile filter string.
  const { data, error } = await supabase()
    .from("orders")
    .select(
      "*, table:tables(name), order_items(*, menu_item:menu_items(name), modifiers:order_item_modifiers(*))"
    )
    .eq("location_id", locationId)
    .not("synced_at", "is", null)
    .order("synced_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as Order[]).filter(
    (o) => Number(o.sync_discrepancy ?? 0) !== 0 || (o.sync_warnings?.length ?? 0) > 0
  );
}

// ─── CSV Export ────────────────────────────────────────────────────

// Escape a value for safe inclusion in a CSV cell.
// Wraps in quotes when needed and neutralizes spreadsheet formula injection
// (values beginning with = + - @ tab or CR are treated as formulas by Excel/Sheets).
// Exported for lib/queries.test.ts.
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

type ExportRow = {
  order_number: number | null;
  order_id: string;
  local_time: string;
  status: string;
  table_name: string | null;
  staff_name: string | null;
  item_count: number;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_reason: string | null;
  tip_amount: number;
  total_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  amount_tendered: number | null;
  change_due: number | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
};

/**
 * Full accounting export. The previous version emitted only
 * id/date/count/total/method, which is not enough to reconcile a day or
 * file IVA — the money breakdown (net, IVA, discount, tip) and the cash
 * detail (tendered, change) were all missing.
 *
 * Timestamps come back already converted to the shop's local timezone by
 * `orders_for_export`, so the CSV matches what the analytics page showed.
 */
export async function exportOrdersCSV(
  startDate: string,
  endDate: string
): Promise<string> {
  const { data, error } = await supabase().rpc("orders_for_export", {
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw error;
  const rows = (data ?? []) as ExportRow[];

  const header = [
    "Order #",
    "Order ID",
    "Date/Time",
    "Status",
    "Table",
    "Staff",
    "Items",
    "Subtotal (net)",
    "IVA",
    "Discount",
    "Discount Reason",
    "Tip",
    "Total",
    "Payment Method",
    "Reference",
    "Tendered",
    "Change",
    "Customer Name",
    "Customer ID",
    "Customer Email",
  ];

  const body = rows.map((r) =>
    [
      r.order_number ?? "",
      r.order_id,
      r.local_time?.replace("T", " ").slice(0, 19) ?? "",
      r.status,
      r.table_name ?? "",
      r.staff_name ?? "",
      r.item_count,
      r.subtotal,
      r.tax_amount,
      r.discount_amount,
      r.discount_reason ?? "",
      r.tip_amount,
      r.total_amount,
      r.payment_method ?? "",
      r.payment_reference ?? "",
      r.amount_tendered ?? "",
      r.change_due ?? "",
      r.customer_name ?? "",
      r.customer_id ?? "",
      r.customer_email ?? "",
    ]
      .map(csvCell)
      .join(",")
  );

  return [header.map(csvCell).join(","), ...body].join("\r\n");
}

/** Z-report style CSV: one row per shift with the reconciliation figures. */
export async function exportShiftsCSV(): Promise<string> {
  const shifts = await fetchRecentShifts(200);

  const header = [
    "Opened",
    "Closed",
    "Opened By",
    "Closed By",
    "Status",
    "Opening Float",
    "Orders",
    "Gross Sales",
    "Expected Cash",
    "Counted Cash",
    "Variance",
    "Note",
  ];

  const body = shifts.map((s) =>
    [
      new Date(s.opened_at).toLocaleString("es-CR"),
      s.closed_at ? new Date(s.closed_at).toLocaleString("es-CR") : "",
      s.opened_by_name ?? "",
      s.closed_by_name ?? "",
      s.status,
      s.opening_float,
      s.order_count,
      s.gross_sales,
      s.expected_cash ?? "",
      s.counted_cash ?? "",
      s.cash_variance ?? "",
      s.closing_note ?? "",
    ]
      .map(csvCell)
      .join(",")
  );

  return [header.map(csvCell).join(","), ...body].join("\r\n");
}

// ─── Tables ────────────────────────────────────────────────────────

export async function fetchTables(): Promise<Table[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("tables")
    .select("*")
    .eq("location_id", locationId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Table[];
}

export async function createTable(name: string): Promise<Table> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("tables")
    .insert({ location_id: locationId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Table;
}

export async function updateTable(
  id: string,
  updates: { name?: string; sort_order?: number }
): Promise<void> {
  const { error } = await supabase().from("tables").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteTable(id: string): Promise<void> {
  const { error } = await supabase().from("tables").delete().eq("id", id);
  if (error) throw error;
}

// ─── Locations & Session ────────────────────────────────────────────
//
// All writes go through SECURITY DEFINER RPCs (supabase/migrations/00026)
// rather than table access — `locations` and `location_members` have no
// INSERT/UPDATE/DELETE RLS policies at all, matching the orders
// write-lockdown pattern (00013). There is deliberately no delete path:
// a location is archived, never deleted, from this app.

/**
 * Current role/location + every location the caller belongs to. Powers
 * the location switcher; the login landing hub and layout role gates
 * still read `user_profiles` directly for now (see app/page.tsx,
 * app/admin/layout.tsx) — both are equivalent for a single-location
 * account, and switch over once an area-manager scenario needs it.
 */
export async function fetchSessionContext(): Promise<SessionContext | null> {
  const { data, error } = await supabase().rpc("session_context");
  if (error) throw error;
  return (data as SessionContext | null) ?? null;
}

/**
 * Switches the active location and returns the fresh session context.
 * This is a low-level RPC call only — `useSwitchLocation` (lib/hooks.ts)
 * is the real entry point and handles the full teardown (profile cache,
 * query cache, offline shell) a switch requires; don't call this directly
 * from a component.
 */
export async function switchLocation(locationId: string): Promise<SessionContext> {
  const { data, error } = await supabase().rpc("switch_location", {
    p_location_id: locationId,
  });
  if (error) throw error;
  return data as SessionContext;
}

export async function createLocation(params: {
  name: string;
  address?: string | null;
  copyMenuFrom?: string | null;
}): Promise<string> {
  const { data, error } = await supabase().rpc("create_location", {
    p_name: params.name,
    p_address: params.address ?? undefined,
    p_copy_menu_from: params.copyMenuFrom ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function updateLocation(
  id: string,
  name: string,
  address?: string | null
): Promise<void> {
  const { error } = await supabase().rpc("update_location", {
    p_location_id: id,
    p_name: name,
    p_address: address ?? undefined,
  });
  if (error) throw error;
}

export async function archiveLocation(id: string): Promise<void> {
  const { error } = await supabase().rpc("archive_location", { p_location_id: id });
  if (error) throw error;
}

export async function restoreLocation(id: string): Promise<void> {
  const { error } = await supabase().rpc("restore_location", { p_location_id: id });
  if (error) throw error;
}

// ─── Location Settings ─────────────────────────────────────────────

export async function fetchLocationSettings(): Promise<LocationSettings | null> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("location_settings")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error) throw error;
  return data as LocationSettings | null;
}

export async function updateLocationSettings(
  updates: Partial<
    Omit<LocationSettings, "location_id" | "created_at" | "updated_at">
  >
): Promise<void> {
  const locationId = await getLocationId();
  // Upsert so the row is created on first save if the seed didn't run.
  const { error } = await supabase()
    .from("location_settings")
    .upsert({ location_id: locationId, ...updates });
  if (error) throw error;
}

// ─── Staff Management ──────────────────────────────────────────────
//
// Sourced from `location_members` (supabase/migrations/00023), not
// `user_profiles` directly — the roster is "who belongs to THIS
// location", and role/membership date are per-location facts. Writes go
// through the membership RPCs (00026) rather than table writes, matching
// the write-lockdown pattern used everywhere else with a SECURITY
// DEFINER boundary (00013).

type StaffRow = {
  role: string;
  created_at: string;
  user_profiles: { id: string; first_name: string | null; last_name: string | null } | null;
};

export async function fetchStaffProfiles(): Promise<StaffMember[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("location_members")
    .select("role, created_at, user_profiles!location_members_user_id_fkey(id, first_name, last_name)")
    .eq("location_id", locationId)
    .order("created_at");

  if (error) throw error;
  return ((data ?? []) as unknown as StaffRow[])
    .filter((row) => row.user_profiles)
    .map((row) => ({
      id: row.user_profiles!.id,
      role: row.role as "admin" | "staff",
      first_name: row.user_profiles!.first_name,
      last_name: row.user_profiles!.last_name,
      created_at: row.created_at,
    }));
}

export async function updateStaffRole(
  userId: string,
  role: "admin" | "staff"
): Promise<void> {
  const locationId = await getLocationId();
  const { error } = await supabase().rpc("set_location_membership", {
    p_user_id: userId,
    p_location_id: locationId,
    p_role: role,
  });
  if (error) throw error;
}

/** Revokes access to the active location only — other memberships (if any) are untouched. */
export async function removeStaffMember(userId: string): Promise<void> {
  const locationId = await getLocationId();
  const { error } = await supabase().rpc("remove_location_membership", {
    p_user_id: userId,
    p_location_id: locationId,
  });
  if (error) throw error;
}

/** Grants an existing account (one with a profile already, elsewhere) access to the active location. */
export async function addStaffMemberByEmail(
  email: string,
  role: "admin" | "staff"
): Promise<void> {
  const { error } = await supabase().rpc("add_member_by_email", {
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
}

export async function updateOwnProfile(updates: {
  first_name?: string;
  last_name?: string;
}): Promise<void> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase()
    .from("user_profiles")
    .update(updates)
    .eq("id", user.id);
  if (error) throw error;
}

export async function inviteStaffMember(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: "admin" | "staff"
): Promise<void> {
  // auth.signUp on the admin's own client would replace their session
  // with the brand-new staff account the moment it succeeds — a
  // throwaway client with no persisted session (see createEphemeralClient)
  // keeps this call from ever touching what the admin is logged in as.
  const { data, error: signUpError } = await createEphemeralClient().auth.signUp({
    email,
    password,
  });

  if (signUpError) throw signUpError;
  if (!data.user) throw new Error("Failed to create auth user");

  // provision_staff_member (00026) creates the profile + membership in
  // one transaction, and — unlike the old direct upsert — refuses to
  // touch an id that already has a profile, so a duplicate email can't
  // repoint an existing account at this location.
  const { error: profileError } = await supabase().rpc("provision_staff_member", {
    p_user_id: data.user.id,
    p_first_name: firstName,
    // No SQL default on p_last_name (see 00026) — pass "" rather than
    // undefined; the RPC's `nullif(p_last_name, '')` turns that into
    // null, same as an omitted last name always meant here.
    p_last_name: lastName || "",
    p_role: role,
  });

  if (profileError) {
    // The auth user now exists with no profile row — say so plainly.
    // Re-running the invite with the same email is the fix: signUp on an
    // existing (unconfirmed) email is idempotent, and this RPC recovers
    // cleanly as long as the profile still doesn't exist.
    throw new Error(
      `Auth account created but the staff profile failed to save (${profileError.message}). Invite this email again to finish setup.`
    );
  }
}

// ─── Shifts & cash drawer ──────────────────────────────────────────

/** Summary of a shift. Omit `shiftId` for the currently open one. */
export async function fetchShiftSummary(
  shiftId?: string | null
): Promise<ShiftSummary | null> {
  const { data, error } = await supabase().rpc("shift_summary", {
    p_shift_id: shiftId ?? undefined,
  });
  if (error) throw error;
  return (data as ShiftSummary | null) ?? null;
}

export async function fetchRecentShifts(limit = 30): Promise<ShiftListItem[]> {
  const { data, error } = await supabase().rpc("recent_shifts", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ShiftListItem[];
}

export async function openShift(
  openingFloat: number,
  clientUuid?: string | null
): Promise<string> {
  const { data, error } = await supabase().rpc("open_shift", {
    p_opening_float: openingFloat,
    p_client_uuid: clientUuid ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function closeShift(params: {
  countedCash: number;
  countedBreakdown?: CountedBreakdown | null;
  note?: string | null;
}): Promise<ShiftSummary> {
  const { data, error } = await supabase().rpc("close_shift", {
    p_counted_cash: params.countedCash,
    p_counted_breakdown: params.countedBreakdown ?? null,
    p_note: params.note ?? undefined,
  });
  if (error) throw error;
  return data as ShiftSummary;
}

export async function recordCashMovement(params: {
  type: CashMovementType;
  amount: number;
  reason: string;
}): Promise<void> {
  const { error } = await supabase().rpc("record_cash_movement", {
    p_type: params.type,
    p_amount: params.amount,
    p_reason: params.reason,
  });
  if (error) throw error;
}

// ─── Analytics ─────────────────────────────────────────────────────

/**
 * Sales figures for an inclusive local date range.
 *
 * All aggregation happens in SQL (`sales_summary`), which buckets on the
 * shop's local business day rather than UTC. The previous client-side
 * version mixed UTC day bucketing with local hour bucketing, so every sale
 * after 6pm was credited to the following day, and it shipped every order
 * and line item to the browser to reduce them there.
 */
export async function fetchSalesSummary(
  startDate: string,
  endDate: string
): Promise<SalesSummary> {
  const { data, error } = await supabase().rpc("sales_summary", {
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw error;
  return data as SalesSummary;
}
