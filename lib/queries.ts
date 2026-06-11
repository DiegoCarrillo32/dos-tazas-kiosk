import { createClient } from "@/utils/supabase/client";
import type {
  Category,
  MenuItem,
  Modifier,
  ModifierOption,
  Order,
  OrderItem,
  CartItem,
  PaymentMethod,
  LocationSettings,
  Table,
  UserProfile,
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

export async function cancelOrder(orderId: string): Promise<void> {
  const { error } = await supabase()
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);
  if (error) throw error;
}

// ─── Analytics & History ───────────────────────────────────────────

export async function fetchTodayAnalytics(): Promise<{
  grossRevenue: number;
  totalOrders: number;
  totalItemsSold: number;
  averageOrderValue: number;
}> {
  const locationId = await getLocationId();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabase()
    .from("orders")
    .select("total_amount, order_items(quantity)")
    .eq("location_id", locationId)
    .eq("status", "completed")
    .gte("created_at", todayStart.toISOString());

  if (error) throw error;

  const grossRevenue = (orders ?? []).reduce(
    (sum: number, o: { total_amount: number }) => sum + Number(o.total_amount),
    0
  );
  const totalOrders = (orders ?? []).length;
  const totalItemsSold = (orders ?? []).reduce(
    (sum: number, o: { order_items: { quantity: number }[] }) =>
      sum + (o.order_items ?? []).reduce((s: number, i: { quantity: number }) => s + i.quantity, 0),
    0
  );
  const averageOrderValue = totalOrders > 0 ? grossRevenue / totalOrders : 0;

  return { grossRevenue, totalOrders, totalItemsSold, averageOrderValue };
}

export async function fetchCompletedOrders(
  startDate?: string,
  endDate?: string
): Promise<Order[]> {
  const locationId = await getLocationId();
  let query = supabase()
    .from("orders")
    .select(
      "*, table:tables(name), order_items(*, menu_item:menu_items(name), modifiers:order_item_modifiers(*))"
    )
    .eq("location_id", locationId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (startDate) {
    query = query.gte("created_at", startDate);
  }
  if (endDate) {
    // End of the day
    query = query.lte("created_at", endDate + "T23:59:59.999Z");
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

export async function exportOrdersCSV(
  startDate: string,
  endDate: string
): Promise<string> {
  const orders = await fetchCompletedOrders(startDate, endDate);

  const header = [
    "Order ID",
    "Date",
    "Items",
    "Total Amount",
    "Payment Method",
    "Reference",
    "Customer Name",
    "Customer ID",
    "Customer Email",
  ];
  const rows = orders.map((o) => {
    const itemCount = (o.order_items ?? []).reduce(
      (s: number, i: OrderItem) => s + i.quantity,
      0
    );
    return [
      o.id,
      new Date(o.created_at).toLocaleString(),
      itemCount,
      o.total_amount,
      o.payment_method ?? "",
      o.payment_reference ?? "",
      o.customer_name ?? "",
      o.customer_id ?? "",
      o.customer_email ?? "",
    ]
      .map(csvCell)
      .join(",");
  });

  return [header.map(csvCell).join(","), ...rows].join("\r\n");
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

// ─── Analytics ─────────────────────────────────────────────────────

export type AnalyticsData = {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  revenueByDay: { date: string; revenue: number }[];
  ordersByHour: { hour: string; orders: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
};

export async function fetchAnalyticsData(
  startDate?: string,
  endDate?: string
): Promise<AnalyticsData> {
  const orders = await fetchCompletedOrders(startDate, endDate);

  let totalRevenue = 0;
  const totalOrders = orders.length;

  const revenueByDayMap: Record<string, number> = {};
  const ordersByHourMap: Record<string, number> = {};
  const itemMap: Record<string, { quantity: number; revenue: number }> = {};

  // Initialize hours
  for (let i = 0; i < 24; i++) {
    const hour = i.toString().padStart(2, "0") + ":00";
    ordersByHourMap[hour] = 0;
  }

  orders.forEach((order) => {
    totalRevenue += Number(order.total_amount);

    const date = new Date(order.created_at);
    const dayString = date.toISOString().split("T")[0]; // YYYY-MM-DD
    const hourString = date.getHours().toString().padStart(2, "0") + ":00";

    revenueByDayMap[dayString] = (revenueByDayMap[dayString] || 0) + Number(order.total_amount);
    ordersByHourMap[hourString] += 1;

    (order.order_items || []).forEach((item) => {
      const itemName = item.menu_item?.name || "Unknown Item";
      if (!itemMap[itemName]) {
        itemMap[itemName] = { quantity: 0, revenue: 0 };
      }
      itemMap[itemName].quantity += item.quantity;
      itemMap[itemName].revenue += Number(item.total_price);
    });
  });

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const revenueByDay = Object.entries(revenueByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  const ordersByHour = Object.entries(ordersByHourMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, orders]) => ({ hour, orders }));

  const topItems = Object.entries(itemMap)
    .sort(([, a], [, b]) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(([name, stats]) => ({ name, ...stats }));

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    revenueByDay,
    ordersByHour,
    topItems,
  };
}
