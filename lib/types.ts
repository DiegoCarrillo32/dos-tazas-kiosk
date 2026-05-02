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

export type OrderStatus = "draft" | "parked" | "completed" | "cancelled";
export type PaymentMethod = "card" | "cash" | "sinpe";

export type Order = {
  id: string;
  location_id: string;
  user_id: string | null;
  status: OrderStatus;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  customer_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  order_items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
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
