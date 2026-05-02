-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- LOCATIONS
create table public.locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.locations enable row level security;

-- USERS PROFILES (extends auth.users)
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) not null,
  role text check (role in ('admin', 'staff')) default 'staff' not null,
  first_name text,
  last_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.user_profiles enable row level security;
create index idx_user_profiles_location_id on public.user_profiles(location_id);

-- CATEGORIES
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references public.locations(id) not null,
  name text not null,
  sort_order integer default 0,
  created_at timestamptz default now() not null
);
alter table public.categories enable row level security;
create index idx_categories_location_id on public.categories(location_id);

-- MENU ITEMS
create table public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references public.locations(id) not null,
  category_id uuid references public.categories(id),
  name text not null,
  description text,
  price numeric(10,2) not null,
  available_quantity integer default 0,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.menu_items enable row level security;
create index idx_menu_items_location_id on public.menu_items(location_id);
create index idx_menu_items_category_id on public.menu_items(category_id);

-- MODIFIERS
create table public.modifiers (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references public.locations(id) not null,
  name text not null,
  is_multiple boolean default false not null,
  is_required boolean default false not null,
  created_at timestamptz default now() not null
);
alter table public.modifiers enable row level security;
create index idx_modifiers_location_id on public.modifiers(location_id);

-- MODIFIER OPTIONS
create table public.modifier_options (
  id uuid primary key default uuid_generate_v4(),
  modifier_id uuid references public.modifiers(id) on delete cascade not null,
  name text not null,
  extra_price numeric(10,2) default 0.00 not null,
  created_at timestamptz default now() not null
);
alter table public.modifier_options enable row level security;
create index idx_modifier_options_modifier_id on public.modifier_options(modifier_id);

-- MENU ITEM MODIFIER MAP (Many to Many)
create table public.menu_item_modifiers (
  menu_item_id uuid references public.menu_items(id) on delete cascade not null,
  modifier_id uuid references public.modifiers(id) on delete cascade not null,
  primary key (menu_item_id, modifier_id)
);
alter table public.menu_item_modifiers enable row level security;

-- ORDERS
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references public.locations(id) not null,
  user_id uuid references public.user_profiles(id),
  status text check (status in ('draft', 'parked', 'completed', 'cancelled')) default 'draft' not null,
  total_amount numeric(10,2) default 0.00 not null,
  payment_method text check (payment_method in ('card', 'cash', 'sinpe', null)),
  payment_reference text,
  customer_name text,
  customer_id text,
  customer_email text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.orders enable row level security;
create index idx_orders_location_id on public.orders(location_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_created_at on public.orders(created_at);

-- ORDER ITEMS
create table public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade not null,
  menu_item_id uuid references public.menu_items(id) not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  notes text,
  created_at timestamptz default now() not null
);
alter table public.order_items enable row level security;
create index idx_order_items_order_id on public.order_items(order_id);

-- ORDER ITEM MODIFIERS
create table public.order_item_modifiers (
  id uuid primary key default uuid_generate_v4(),
  order_item_id uuid references public.order_items(id) on delete cascade not null,
  modifier_option_id uuid references public.modifier_options(id) not null,
  name text not null, -- denormalized for history
  extra_price numeric(10,2) default 0.00 not null, -- denormalized
  created_at timestamptz default now() not null
);
alter table public.order_item_modifiers enable row level security;
create index idx_order_item_modifiers_order_item_id on public.order_item_modifiers(order_item_id);


-- ROW LEVEL SECURITY (RLS) POLICIES

-- Helper function to get current user location
create or function public.get_current_location_id()
returns uuid
language sql security definer stable
as $$
  select location_id from public.user_profiles where id = auth.uid();
$$;

-- Locations: Users can only see their own location
create policy "Users can view their assigned location" on public.locations
  for select to authenticated
  using (id = public.get_current_location_id());

-- User Profiles: Users can see profiles in their location
create policy "Users can view profiles in their location" on public.user_profiles
  for select to authenticated
  using (location_id = public.get_current_location_id());

create policy "Users can update their own profile" on public.user_profiles
  for update to authenticated
  using (id = auth.uid());

-- RLS template for location-bound tables
-- We apply this to: categories, menu_items, modifiers, modifier_options (via join), orders, order_items
create policy "Location bound select" on public.categories for select to authenticated using (location_id = public.get_current_location_id());
create policy "Location bound select" on public.menu_items for select to authenticated using (location_id = public.get_current_location_id());
create policy "Location bound select" on public.modifiers for select to authenticated using (location_id = public.get_current_location_id());
create policy "Location bound select" on public.orders for select to authenticated using (location_id = public.get_current_location_id());

create policy "Modifier options select" on public.modifier_options for select to authenticated
using (modifier_id in (select id from public.modifiers where location_id = public.get_current_location_id()));

create policy "Menu item modifiers select" on public.menu_item_modifiers for select to authenticated
using (menu_item_id in (select id from public.menu_items where location_id = public.get_current_location_id()));

create policy "Order items select" on public.order_items for select to authenticated
using (order_id in (select id from public.orders where location_id = public.get_current_location_id()));

create policy "Order item modifiers select" on public.order_item_modifiers for select to authenticated
using (order_item_id in (select id from public.order_items where order_id in (select id from public.orders where location_id = public.get_current_location_id())));

-- Mutations (Insert, Update, Delete) are allowed for authenticated users for their location
-- For simplicity, staff and admin can both mutate orders. In a real app, you might restrict deletes to admins.

-- Orders mutations
create policy "Location bound insert" on public.orders for insert to authenticated with check (location_id = public.get_current_location_id());
create policy "Location bound update" on public.orders for update to authenticated using (location_id = public.get_current_location_id());
create policy "Location bound delete" on public.orders for delete to authenticated using (location_id = public.get_current_location_id());

-- Order Items mutations
create policy "Order items insert" on public.order_items for insert to authenticated with check (order_id in (select id from public.orders where location_id = public.get_current_location_id()));
create policy "Order items update" on public.order_items for update to authenticated using (order_id in (select id from public.orders where location_id = public.get_current_location_id()));
create policy "Order items delete" on public.order_items for delete to authenticated using (order_id in (select id from public.orders where location_id = public.get_current_location_id()));

-- Order Item Modifiers mutations
create policy "Order item modifiers insert" on public.order_item_modifiers for insert to authenticated with check (order_item_id in (select id from public.order_items where order_id in (select id from public.orders where location_id = public.get_current_location_id())));

-- Menu management (categories, menu_items, modifiers) usually restricted to admins
create policy "Admin only insert" on public.categories for insert to authenticated with check (public.get_current_location_id() = location_id and (select role from public.user_profiles where id = auth.uid()) = 'admin');
create policy "Admin only update" on public.categories for update to authenticated using (public.get_current_location_id() = location_id and (select role from public.user_profiles where id = auth.uid()) = 'admin');

create policy "Admin only insert" on public.menu_items for insert to authenticated with check (public.get_current_location_id() = location_id and (select role from public.user_profiles where id = auth.uid()) = 'admin');
create policy "Admin only update" on public.menu_items for update to authenticated using (public.get_current_location_id() = location_id and (select role from public.user_profiles where id = auth.uid()) = 'admin');

-- Automatically handle updated_at
create extension if not exists moddatetime schema extensions;

create trigger handle_updated_at before update on public.locations
  for each row execute procedure moddatetime (updated_at);
create trigger handle_updated_at before update on public.user_profiles
  for each row execute procedure moddatetime (updated_at);
create trigger handle_updated_at before update on public.menu_items
  for each row execute procedure moddatetime (updated_at);
create trigger handle_updated_at before update on public.orders
  for each row execute procedure moddatetime (updated_at);

-- Set up Realtime for orders
alter publication supabase_realtime add table public.orders;
