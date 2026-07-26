-- ============================================================
-- Dos Tazas POS - Server-side sales reporting
-- Run AFTER 00014_shifts_and_cash_drawer.sql
--
-- Fixes three related analytics bugs by moving aggregation into SQL:
--
--  * Day bucketing was done with JS toISOString() (UTC) while the hour
--    chart used getHours() (local). Costa Rica is UTC-6, so every sale
--    after 6pm local was credited to the NEXT calendar day, and the two
--    charts on the same screen disagreed. Verified against a live order:
--    created_at 2026-06-28 01:47Z is 2026-06-27 19:47 in San Jose, but
--    the app charted it on 2026-06-28 at hour 19:00.
--
--  * Report date ranges were compared against 'YYYY-MM-DD' strings
--    parsed as UTC, so a "today" report dropped this evening's sales and
--    included last night's.
--
--  * Tips were summed into revenue. A tip is a liability owed to staff,
--    not shop income, and is now reported separately from net sales.
--
-- Everything below buckets on (created_at at time zone <location tz>),
-- so a "day" means a real business day in San Jose.
-- ============================================================


-- ============================================================
-- Business timezone
-- ============================================================

alter table public.location_settings
  add column if not exists timezone text default 'America/Costa_Rica' not null;


-- ============================================================
-- sales_summary — one call powering the whole analytics page
--
-- p_start / p_end are inclusive LOCAL business dates.
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


-- ============================================================
-- orders_for_export — flat rows for the accounting CSV
--
-- Uses the same local-day window as sales_summary so an exported range
-- always matches what the analytics page showed for that range.
-- ============================================================

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


-- ============================================================
-- recent_shifts — shift history for the cash page
-- ============================================================

create or replace function public.recent_shifts(p_limit integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

  return coalesce((
    select jsonb_agg(row order by (row->>'opened_at') desc)
    from (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'opened_at', s.opened_at,
        'closed_at', s.closed_at,
        'opening_float', s.opening_float,
        'expected_cash', s.expected_cash,
        'counted_cash', s.counted_cash,
        'cash_variance', s.cash_variance,
        'closing_note', s.closing_note,
        'opened_by_name', nullif(trim(coalesce(ob.first_name,'') || ' ' || coalesce(ob.last_name,'')), ''),
        'closed_by_name', nullif(trim(coalesce(cb.first_name,'') || ' ' || coalesce(cb.last_name,'')), ''),
        'gross_sales', coalesce((
          select sum(o.total_amount) from public.orders o
          where o.shift_id = s.id and o.status = 'completed'), 0),
        'order_count', coalesce((
          select count(*) from public.orders o
          where o.shift_id = s.id and o.status = 'completed'), 0)
      ) as row
      from public.shifts s
      left join public.user_profiles ob on ob.id = s.opened_by
      left join public.user_profiles cb on cb.id = s.closed_by
      where s.location_id = v_location_id
      order by s.opened_at desc
      limit greatest(1, least(coalesce(p_limit, 30), 200))
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.recent_shifts(integer) from public, anon;
grant execute on function public.recent_shifts(integer) to authenticated;
