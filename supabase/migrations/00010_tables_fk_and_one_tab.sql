-- ============================================================
-- Dos Tazas POS - Table FK hardening
-- Run AFTER 00009_tables.sql
--
-- Review fixes:
--  * orders.table_id was ON DELETE NO ACTION, so any table ever used by
--    an order could not be deleted. Switch to ON DELETE SET NULL — a
--    deleted table's orders become takeaway/unlabeled rather than blocking.
--  * Guarantee at most one open (parked) tab per table.
-- ============================================================

alter table public.orders drop constraint orders_table_id_fkey;
alter table public.orders
  add constraint orders_table_id_fkey
  foreign key (table_id) references public.tables(id) on delete set null;

-- At most one open tab per table (completed/historical orders are unaffected).
create unique index orders_one_open_tab_per_table
  on public.orders (table_id)
  where status = 'parked' and table_id is not null;
