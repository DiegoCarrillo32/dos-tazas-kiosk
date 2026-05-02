-- ============================================================
-- Dos Tazas POS - Seed Data
-- Run AFTER 00001_initial_schema.sql
-- Run AFTER creating your admin user in Supabase Auth
-- ============================================================
-- IMPORTANT: Replace '<YOUR_AUTH_USER_ID>' below with the UUID
-- of the user you created in Supabase Auth → Users tab.
-- ============================================================

-- 1. Create the location
insert into public.locations (id, name, address)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Dos Tazas - San José Centro',
  'Avenida Central, San José, Costa Rica'
);

-- 2. Create the user profile (link auth user → location)
-- ⚠️ REPLACE the ID below with your actual auth user ID!
-- You can find it in Supabase Dashboard → Authentication → Users
insert into public.user_profiles (id, location_id, role, first_name, last_name)
values (
  '<YOUR_AUTH_USER_ID>',
  'a0000000-0000-0000-0000-000000000001',
  'admin',
  'Admin',
  'Dos Tazas'
);

-- 3. Create categories
insert into public.categories (id, location_id, name, sort_order) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Hot Coffee', 0),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Iced Coffee', 1),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Pastries', 2),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Tea', 3);

-- 4. Create menu items
insert into public.menu_items (id, location_id, category_id, name, description, price, available_quantity) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Espresso',       'Single shot of espresso',         1500, 100),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Americano',      'Espresso with hot water',          1800, 100),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Latte',           'Espresso with steamed milk',       2200, 100),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Cappuccino',     'Espresso with foam and milk',      2200, 100),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Mocha',           'Espresso with chocolate and milk', 2500, 100),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Iced Latte',     'Espresso over ice with milk',      2500, 100),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Cold Brew',       'Slow-steeped cold coffee',         2200, 100),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Iced Americano', 'Espresso over ice with water',     2000, 100),
  ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Croissant',      'Buttery flaky pastry',             1500, 30),
  ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Chocolate Chip Cookie', 'Fresh-baked cookie',         1200, 40),
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'Matcha Latte',   'Premium matcha with steamed milk',  2800, 50),
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'Chai Latte',     'Spiced chai with steamed milk',    2500, 50);

-- 5. Create modifiers
insert into public.modifiers (id, location_id, name, is_multiple, is_required) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Milk Type',  false, false),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Size',       false, true),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Extras',     true,  false);

-- 6. Create modifier options
insert into public.modifier_options (id, modifier_id, name, extra_price) values
  -- Milk Type
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Whole Milk',    0),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Oat Milk',    300),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Almond Milk', 300),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'Soy Milk',    200),
  -- Size
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000002', 'Regular',       0),
  ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002', 'Large',       500),
  -- Extras
  ('e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000003', 'Extra Shot',    400),
  ('e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000003', 'Whipped Cream', 200),
  ('e0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000003', 'Vanilla Syrup', 300);

-- 7. Link modifiers to all coffee/tea items (not pastries)
insert into public.menu_item_modifiers (menu_item_id, modifier_id)
select mi.id, mod.id
from public.menu_items mi
cross join public.modifiers mod
where mi.category_id in (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000004'
)
and mi.location_id = 'a0000000-0000-0000-0000-000000000001';
