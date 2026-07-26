import { createClient } from "@/utils/supabase/client";
import type {
  Category,
  MenuItem,
  Modifier,
  ModifierOption,
  Order,
  CartItem,
  PaymentMethod,
  LocationSettings,
  Table,
  UserProfile,
  CashMovementType,
  CountedBreakdown,
  SalesSummary,
  ShiftListItem,
  ShiftSummary,
} from "./types";

// ─── Helpers ───────────────────────────────────────────────────────

function supabase() {
  return createClient();
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return null;

  const { data } = await supabase()
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data as UserProfile | null;
}

async function getLocationId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  return profile.location_id;
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

// ─── Modifiers ─────────────────────────────────────────────────────

export async function fetchModifiersForItem(
  menuItemId: string
): Promise<Modifier[]> {
  // Get modifier IDs linked to this menu item
  const { data: links, error: linkError } = await supabase()
    .from("menu_item_modifiers")
    .select("modifier_id")
    .eq("menu_item_id", menuItemId);

  if (linkError) throw linkError;
  if (!links || links.length === 0) return [];

  const modifierIds = links.map((l: { modifier_id: string }) => l.modifier_id);

  const { data, error } = await supabase()
    .from("modifiers")
    .select("*, options:modifier_options(*)")
    .in("id", modifierIds);

  if (error) throw error;
  return (data ?? []) as Modifier[];
}

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

function cartItemsToRpcItems(cartItems: CartItem[]) {
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
    p_table_id: tableId ?? null,
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
}): Promise<void> {
  // complete_order recomputes the total (incl. tip) and validates the
  // cash tendered server-side before marking the order completed.
  const { error } = await supabase().rpc("complete_order", {
    p_order_id: params.orderId,
    p_payment_method: params.paymentMethod,
    p_payment_reference: params.paymentReference,
    p_tip_amount: params.tipAmount ?? 0,
    p_amount_tendered: params.amountTendered ?? null,
    p_customer_name: params.customerName,
    p_customer_id: params.customerId,
    p_customer_email: params.customerEmail,
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
    p_reason: reason ?? null,
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
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

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
 */
function localDayRangeToUtc(
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

// ─── CSV Export ────────────────────────────────────────────────────

// Escape a value for safe inclusion in a CSV cell.
// Wraps in quotes when needed and neutralizes spreadsheet formula injection
// (values beginning with = + - @ tab or CR are treated as formulas by Excel/Sheets).
function csvCell(value: unknown): string {
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

export async function fetchStaffProfiles(): Promise<UserProfile[]> {
  const locationId = await getLocationId();
  const { data, error } = await supabase()
    .from("user_profiles")
    .select("*")
    .eq("location_id", locationId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as UserProfile[];
}

export async function updateStaffRole(
  userId: string,
  role: "admin" | "staff"
): Promise<void> {
  const { error } = await supabase()
    .from("user_profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

export async function removeStaffProfile(userId: string): Promise<void> {
  const { error } = await supabase()
    .from("user_profiles")
    .delete()
    .eq("id", userId);
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
  const locationId = await getLocationId();

  // Create auth user via Supabase admin API (edge function) or sign up
  const { data, error: signUpError } = await supabase().auth.signUp({
    email,
    password,
  });

  if (signUpError) throw signUpError;
  if (!data.user) throw new Error("Failed to create auth user");

  // Create user profile
  const { error: profileError } = await supabase()
    .from("user_profiles")
    .insert({
      id: data.user.id,
      location_id: locationId,
      role,
      first_name: firstName,
      last_name: lastName,
    });

  if (profileError) throw profileError;
}

// ─── Shifts & cash drawer ──────────────────────────────────────────

/** Summary of a shift. Omit `shiftId` for the currently open one. */
export async function fetchShiftSummary(
  shiftId?: string | null
): Promise<ShiftSummary | null> {
  const { data, error } = await supabase().rpc("shift_summary", {
    p_shift_id: shiftId ?? null,
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

export async function openShift(openingFloat: number): Promise<string> {
  const { data, error } = await supabase().rpc("open_shift", {
    p_opening_float: openingFloat,
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
    p_note: params.note ?? null,
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
