-- ============================================================
-- Dos Tazas POS - Admin guard on reporting RPCs
-- Run AFTER 00019_offline_sync.sql
--
-- Problem this fixes:
--   sales_summary() and orders_for_export() are SECURITY DEFINER — they
--   run as the function owner and bypass RLS entirely — and are granted
--   to `authenticated` with no role check at all. Every other
--   admin-only RPC (reverse_completed_order, see
--   00013_order_write_lockdown.sql) checks public.is_admin() before
--   doing anything; these two never got that check when they were
--   written. Any staff JWT can call either directly (bypassing the
--   Admin-only UI gate in app/admin/layout.tsx, which is enforced only
--   client/middleware-side) and read the shop's full financials —
--   orders_for_export additionally returns every customer's fiscal
--   invoice name, cédula and email.
--
--   shift_summary() and recent_shifts() are deliberately left as-is:
--   the Counter's shift banner and the close-drawer flow need them for
--   every staff member, not just admins, and both are already scoped to
--   the caller's own location.
-- ============================================================

create or replace function public.sales_summary(
  p_start date,
  p_end date
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can read sales reports';
  end if;

  v_location_id := public.get_current_location_id();

  select coalesce(timezone, 'America/Costa_Rica') into v_tz
    from public.location_settings where location_id = v_location_id;
  v_tz := coalesce(v_tz, 'America/Costa_Rica');

  -- Local midnight on p_start through the instant before local midnight
  -- after p_end, converted to absolute time for the index-friendly scan.
  v_start := (p_start::timestamp) at time zone v_tz;
  v_end   := ((p_end + 1)::timestamp) at time zone v_tz;

  with scoped as (
    select o.*,
           (o.created_at at time zone v_tz)::date as local_day,
           extract(hour from (o.created_at at time zone v_tz))::int as local_hour
    from public.orders o
    where o.location_id = v_location_id
      and o.created_at >= v_start
      and o.created_at <  v_end
  ),
  sold as (
    select s.id as order_id, s.local_day, oi.menu_item_id, oi.quantity,
           oi.total_price, oi.tax_amount, mi.name as item_name, mi.category_id
    from scoped s
    join public.order_items oi on oi.order_id = s.id
    left join public.menu_items mi on mi.id = oi.menu_item_id
    where s.status = 'completed'
  )
  select jsonb_build_object(
    -- ── Headline figures ──────────────────────────────────────
    'order_count',  (select count(*) from scoped where status = 'completed'),
    'refund_count', (select count(*) from scoped where status = 'refunded'),
    'void_count',   (select count(*) from scoped where status = 'cancelled'),

    -- gross = what customers actually paid (includes IVA and tips)
    'gross_sales',  (select coalesce(sum(total_amount), 0) from scoped where status = 'completed'),
    -- net = ex-IVA sales, the real revenue line
    'net_sales',    (select coalesce(sum(subtotal), 0) from scoped where status = 'completed'),
    'tax_amount',   (select coalesce(sum(tax_amount), 0) from scoped where status = 'completed'),
    -- tips are staff liability, reported separately and never in revenue
    'tip_amount',   (select coalesce(sum(tip_amount), 0) from scoped where status = 'completed'),
    'discount_amount', (select coalesce(sum(discount_amount), 0) from scoped where status = 'completed'),
    'refund_total', (select coalesce(sum(total_amount), 0) from scoped where status = 'refunded'),

    'items_sold',   (select coalesce(sum(quantity), 0) from sold),
    'average_ticket', (
      select case when count(*) > 0 then round(sum(total_amount) / count(*), 2) else 0 end
      from scoped where status = 'completed'
    ),

    -- ── Payment mix (the number reconciliation needs) ─────────
    'by_payment_method', coalesce((
      select jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', cnt)
                       order by total desc)
      from (
        select payment_method as method, sum(total_amount) as total, count(*) as cnt
        from scoped
        where status = 'completed' and payment_method is not null
        group by payment_method
      ) t
    ), '[]'::jsonb),

    -- ── Trends, bucketed on the LOCAL business day ────────────
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', to_char(local_day, 'YYYY-MM-DD'),
               'gross', gross, 'net', net, 'orders', orders)
             order by local_day)
      from (
        select local_day,
               sum(total_amount) as gross,
               sum(subtotal) as net,
               count(*) as orders
        from scoped where status = 'completed'
        group by local_day
      ) d
    ), '[]'::jsonb),

    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', hh, 'orders', orders, 'gross', gross)
                       order by hh)
      from (
        select local_hour as hh, count(*) as orders, sum(total_amount) as gross
        from scoped where status = 'completed'
        group by local_hour
      ) h
    ), '[]'::jsonb),

    -- ── Breakdowns ────────────────────────────────────────────
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'revenue', rev)
                       order by rev desc)
      from (
        select coalesce(c.name, 'Uncategorized') as name,
               sum(sold.quantity) as qty,
               sum(sold.total_price) as rev
        from sold
        left join public.categories c on c.id = sold.category_id
        group by coalesce(c.name, 'Uncategorized')
      ) cat
    ), '[]'::jsonb),

    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'orders', orders, 'gross', gross)
                       order by gross desc)
      from (
        select coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''),
                        'Unknown') as name,
               count(*) as orders,
               sum(s.total_amount) as gross
        from scoped s
        left join public.user_profiles up on up.id = s.user_id
        where s.status = 'completed'
        group by 1
      ) st
    ), '[]'::jsonb),

    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'revenue', rev)
                       order by qty desc)
      from (
        select coalesce(item_name, 'Unknown Item') as name,
               sum(quantity) as qty,
               sum(total_price) as rev
        from sold
        group by coalesce(item_name, 'Unknown Item')
        order by sum(quantity) desc
        limit 10
      ) ti
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.sales_summary(date, date) from public, anon;
grant execute on function public.sales_summary(date, date) to authenticated;


create or replace function public.orders_for_export(
  p_start date,
  p_end date
)
returns table (
  order_number integer,
  order_id uuid,
  local_time timestamp,
  status text,
  table_name text,
  staff_name text,
  item_count bigint,
  subtotal numeric,
  tax_amount numeric,
  discount_amount numeric,
  discount_reason text,
  tip_amount numeric,
  total_amount numeric,
  payment_method text,
  payment_reference text,
  amount_tendered numeric,
  change_due numeric,
  customer_name text,
  customer_id text,
  customer_email text
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_tz text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can export financial reports';
  end if;

  v_location_id := public.get_current_location_id();

  select coalesce(ls.timezone, 'America/Costa_Rica') into v_tz
    from public.location_settings ls where ls.location_id = v_location_id;
  v_tz := coalesce(v_tz, 'America/Costa_Rica');

  return query
  select
    o.order_number,
    o.id,
    (o.created_at at time zone v_tz),
    o.status,
    t.name,
    nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''),
    coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id), 0),
    o.subtotal,
    o.tax_amount,
    o.discount_amount,
    o.discount_reason,
    o.tip_amount,
    o.total_amount,
    o.payment_method,
    o.payment_reference,
    o.amount_tendered,
    o.change_due,
    o.customer_name,
    o.customer_id,
    o.customer_email
  from public.orders o
  left join public.tables t on t.id = o.table_id
  left join public.user_profiles up on up.id = o.user_id
  where o.location_id = v_location_id
    and o.status in ('completed', 'refunded')
    and o.created_at >= (p_start::timestamp) at time zone v_tz
    and o.created_at <  ((p_end + 1)::timestamp) at time zone v_tz
  order by o.created_at;
end;
$$;

revoke execute on function public.orders_for_export(date, date) from public, anon;
grant execute on function public.orders_for_export(date, date) to authenticated;
