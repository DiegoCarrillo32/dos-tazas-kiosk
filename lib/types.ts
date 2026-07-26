// Database types matching supabase/migrations/00001_initial_schema.sql

export type Location = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfile = {
  id: string;
  location_id: string;
  role: "admin" | "staff";
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  location_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type MenuItem = {
  id: string;
  location_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  available_quantity: number;
  is_active: boolean;
  track_inventory: boolean;
  low_stock_threshold: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  category?: Category;
};

export type Modifier = {
  id: string;
  location_id: string;
  name: string;
  is_multiple: boolean;
  is_required: boolean;
  created_at: string;
  // Joined data
  options?: ModifierOption[];
};

export type ModifierOption = {
  id: string;
  modifier_id: string;
  name: string;
  extra_price: number;
  created_at: string;
};

export type Table = {
  id: string;
  location_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OrderStatus =
  | "draft"
  | "parked"
  | "completed"
  | "cancelled"
  | "refunded";
export type PaymentMethod = "card" | "cash" | "sinpe";

export type LocationSettings = {
  location_id: string;
  currency: string;
  tax_rate: number;
  prices_include_tax: boolean;
  tip_enabled: boolean;
  timezone: string;
  business_legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  created_at: string;
  updated_at: string;
};

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

export type Order = {
  id: string;
  location_id: string;
  user_id: string | null;
  status: OrderStatus;
  table_id: string | null;
  /** Set by complete_order at payment time — the shift whose drawer took the money. */
  shift_id: string | null;
  order_number: number | null;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  discount_amount: number;
  tip_amount: number;
  total_amount: number;
  amount_tendered: number | null;
  change_due: number | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  order_items?: OrderItem[];
  table?: { name: string } | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  notes: string | null;
  created_at: string;
  // Joined data
  menu_item?: MenuItem;
  modifiers?: OrderItemModifier[];
};

export type OrderItemModifier = {
  id: string;
  order_item_id: string;
  modifier_option_id: string;
  name: string;
  extra_price: number;
  created_at: string;
};

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
