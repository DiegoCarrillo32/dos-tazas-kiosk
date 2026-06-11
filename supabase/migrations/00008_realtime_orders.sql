-- ============================================================
-- Dos Tazas POS - Realtime on orders
-- Run AFTER 00007_complete_order_subtotal_fallback.sql
--
-- Adds the orders table to the supabase_realtime publication so the
-- Counter's parked-orders queue updates live (no manual refresh).
-- Realtime postgres_changes still respect RLS, so each client only
-- receives changes for its own location's orders.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
