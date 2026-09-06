-- ============================================================
-- Dos Tazas POS - sales_summary rev 2: one revenue basis, and
-- reports that stop changing after the fact
-- Run AFTER 00032_refund_accounting.sql
--
-- Problems this fixes:
--
-- 1. FOUR different revenue bases were shown side by side as if they
--    were comparable:
--      * net_sales        -> sum(orders.subtotal)      ex-IVA, ex-tip, net of discount
--      * average_ticket   -> sum(total_amount)/count   INCLUDING IVA and tips
--      * by_staff.gross   -> sum(total_amount)         INCLUDING tips, so a
--                                                      server who is tipped more
--                                                      outranks one who sold more
--      * by_category /    -> sum(order_items.total_price)  IVA-inclusive AND
--        top_items.revenue                                 gross of discounts
--    So `sum(by_category.revenue)` reconciled to neither net_sales nor
--    gross_sales, and Gross - IVA never equalled Net (off by the tips).
--
--    Every breakdown now reports ex-IVA, discount-apportioned revenue
--    that sums to net_sales, and keeps the old list-price figure beside
--    it as `gross_revenue` so nothing is lost.
--
--    The apportionment respects discount_scope (00030:426-432): an
--    item-scoped discount is split across only the lines it was taken
--    against, weighted by the discounted quantity, exactly as
--    _resolve_discount_scope computed the base.
--
-- 2. A refund rewrote history. Every figure filtered `status =
--    'completed'`, so refunding today removed the sale from LAST WEEK's
--    numbers. Sales are now counted in the period they were RUNG
--    (status in completed/refunded), and refunds in the period they were
--    PAID BACK (orders.refunded_at, added in 00032) -- so a closed
--    period's report reproduces. `net_sales_after_refunds` carries the
--    netted figure for whoever wants it.
--
-- 3. by_day and by_hour skipped empty buckets, so a closed day made the
--    revenue line interpolate straight across it and a closed hour
--    vanished from the axis. Both are now gap-filled.
--
-- 4. by_hour reported RANGE TOTALS under the label "Productive Hours",
--    which means something different over 1 day than over 30. It now
--    also carries a per-operating-day average.
--
-- New breakdowns: previous_period (for period-over-period deltas),
-- by_weekday, basket size, by_discount_reason, by_refund_reason,
-- by_modifier (attach counts) and never_sold (dead menu weight).
--
-- Deliberately NOT added: margin/profit. menu_items has no cost column
-- (00001:48-59, 00006:13-16), so COGS cannot be derived from this schema.
--
-- Unchanged and deliberately so: the is_admin() guard (00020:42-44) and
-- the location-timezone day bucketing (00020:48-73, which fixed the
-- UTC-6 off-by-one documented at 00015:5-22).
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
  v_span integer;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
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

  -- The immediately preceding window of equal length, for deltas.
  v_span       := (p_end - p_start) + 1;
  v_prev_start := ((p_start - v_span)::timestamp) at time zone v_tz;
  v_prev_end   := v_start;

  with scoped as (
    select o.*,
           (o.created_at at time zone v_tz)::date         as local_day,
           extract(hour   from (o.created_at at time zone v_tz))::int as local_hour,
           extract(isodow from (o.created_at at time zone v_tz))::int as local_dow
    from public.orders o
    where o.location_id = v_location_id
      and o.created_at >= v_start
      and o.created_at <  v_end
  ),

  -- A sale belongs to the period it was RUNG UP in, whether or not a
  -- later period handed the money back. That is what makes a closed
  -- period's report reproducible.
  sale as (
    select * from scoped where status in ('completed', 'refunded')
  ),

  -- A refund belongs to the period the money left the till.
  refunded as (
    select o.*
    from public.orders o
    where o.location_id = v_location_id
      and o.refunded_at >= v_start
      and o.refunded_at <  v_end
  ),

  -- ── Line-level revenue on the net basis ──────────────────
  -- discount_scope names the exact lines and units an item-scoped
  -- discount was taken against (00030:426-432); a null scope means the
  -- whole order was the base.
  scope_items as (
    select s.id as order_id,
           (elem->>'order_item_id')::uuid as order_item_id,
           (elem->>'quantity')::int       as scope_qty
    from sale s
    cross join lateral jsonb_array_elements(coalesce(s.discount_scope->'items', '[]'::jsonb)) elem
  ),

  lines as (
    select s.id as order_id,
           s.local_day,
           oi.id           as order_item_id,
           oi.menu_item_id,
           oi.quantity,
           oi.total_price,
           oi.tax_amount,
           (oi.total_price - oi.tax_amount) as line_net_list,
           -- How much of this line the discount was taken against.
           case
             when s.discount_scope is null then (oi.total_price - oi.tax_amount)
             else (oi.total_price - oi.tax_amount)
                  * coalesce(si.scope_qty, 0)::numeric / nullif(oi.quantity, 0)
           end as base_net,
           mi.name        as item_name,
           mi.category_id
    from sale s
    join public.order_items oi on oi.order_id = s.id
    left join public.menu_items mi on mi.id = oi.menu_item_id
    left join scope_items si on si.order_id = s.id and si.order_item_id = oi.id
  ),

  order_base as (
    select order_id,
           sum(base_net)      as base_net_total,
           sum(line_net_list) as list_net_total
    from lines group by order_id
  ),

  -- (list_net_total - subtotal) is the order's whole ex-IVA discount:
  -- subtotal is already discount-net (00030:225-230) while the lines
  -- keep their list prices. Splitting it across the base lines in
  -- proportion to base_net makes sum(line_net) = sum(orders.subtotal)
  -- by construction -- which is exactly the reconciliation the old
  -- report could not do.
  sold as (
    select l.order_id, l.local_day, l.menu_item_id, l.quantity,
           l.item_name, l.category_id, l.order_item_id,
           l.line_net_list as line_gross,
           l.line_net_list
             - case
                 when ob.base_net_total > 0
                 then (ob.list_net_total - s.subtotal) * l.base_net / ob.base_net_total
                 else 0
               end as line_net
    from lines l
    join order_base ob on ob.order_id = l.order_id
    join sale s        on s.id        = l.order_id
  ),

  -- Days the shop actually rang something up. Averaging "orders per
  -- hour" over calendar days would punish a shop for being closed on
  -- Mondays.
  operating as (
    select count(distinct local_day)::numeric as days from sale
  ),

  -- ── Previous window, for the delta chips ─────────────────
  prev as (
    select o.* from public.orders o
    where o.location_id = v_location_id
      and o.created_at >= v_prev_start
      and o.created_at <  v_prev_end
      and o.status in ('completed', 'refunded')
  ),
  prev_items as (
    select coalesce(sum(oi.quantity), 0) as qty
    from prev p join public.order_items oi on oi.order_id = p.id
  )

  select jsonb_build_object(
    -- ── Headline figures ──────────────────────────────────────
    'order_count',  (select count(*) from sale),
    'refund_count', (select count(*) from refunded),
    'void_count',   (select count(*) from scoped where status = 'cancelled'),

    -- gross = what customers actually paid (includes IVA and tips)
    'gross_sales',  (select coalesce(sum(total_amount), 0) from sale),
    -- net = ex-IVA, discount-net sales; the real revenue line
    'net_sales',    (select coalesce(sum(subtotal), 0) from sale),
    -- ...and the same net after subtracting what was handed back
    'net_sales_after_refunds',
      (select coalesce(sum(subtotal), 0) from sale)
      - (select coalesce(sum(subtotal), 0) from refunded),
    'tax_amount',   (select coalesce(sum(tax_amount), 0) from sale),
    -- tips are staff liability, reported separately and never in revenue
    'tip_amount',   (select coalesce(sum(tip_amount), 0) from sale),
    'discount_amount', (select coalesce(sum(discount_amount), 0) from sale),
    'refund_total', (select coalesce(sum(total_amount), 0) from refunded),

    'items_sold',   (select coalesce(sum(quantity), 0) from sold),
    -- Kept tip-inclusive for every existing caller; average_ticket_net
    -- is the like-for-like companion to net_sales.
    'average_ticket', (
      select case when count(*) > 0 then round(sum(total_amount) / count(*), 2) else 0 end
      from sale
    ),
    'average_ticket_net', (
      select case when count(*) > 0 then round(sum(subtotal + tax_amount) / count(*), 2) else 0 end
      from sale
    ),
    'operating_days', (select days from operating),

    'basket', jsonb_build_object(
      'avg_items_per_order', (
        select case when (select count(*) from sale) > 0
               then round(coalesce(sum(quantity), 0)::numeric / (select count(*) from sale), 2)
               else 0 end from sold),
      'avg_lines_per_order', (
        select case when (select count(*) from sale) > 0
               then round(count(*)::numeric / (select count(*) from sale), 2)
               else 0 end from sold)
    ),

    'previous_period', jsonb_build_object(
      'order_count', (select count(*) from prev),
      'net_sales',   (select coalesce(sum(subtotal), 0) from prev),
      'gross_sales', (select coalesce(sum(total_amount), 0) from prev),
      'items_sold',  (select qty from prev_items),
      'average_ticket_net', (
        select case when count(*) > 0 then round(sum(subtotal + tax_amount) / count(*), 2) else 0 end
        from prev
      ),
      -- Gap-filled and the same length as by_day, so the chart can pair
      -- them off by index: element i is the day i days into the previous
      -- window, which is the like-for-like comparison point.
      'by_day', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', to_char(d.day, 'YYYY-MM-DD'),
                 'net',  coalesce(x.net, 0))
               order by d.day)
        from generate_series((p_start - v_span)::timestamp,
                             (p_start - 1)::timestamp, interval '1 day') d(day)
        left join (
          select (created_at at time zone v_tz)::date as local_day,
                 sum(subtotal) as net
          from prev group by 1
        ) x on x.local_day = d.day::date
      ), '[]'::jsonb)
    ),

    -- ── Payment mix (the number reconciliation needs) ─────────
    'by_payment_method', coalesce((
      select jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', cnt)
                       order by total desc)
      from (
        select payment_method as method, sum(total_amount) as total, count(*) as cnt
        from sale
        where payment_method is not null
        group by payment_method
      ) t
    ), '[]'::jsonb),

    -- ── Trends, bucketed on the LOCAL business day, gap-filled ─
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date',   to_char(d.day, 'YYYY-MM-DD'),
               'gross',  coalesce(x.gross, 0),
               'net',    coalesce(x.net, 0),
               'orders', coalesce(x.orders, 0))
             order by d.day)
      from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d(day)
      left join (
        select local_day,
               sum(total_amount) as gross,
               sum(subtotal)     as net,
               count(*)          as orders
        from sale group by local_day
      ) x on x.local_day = d.day::date
    ), '[]'::jsonb),

    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hour',       h.hh,
               'orders',     coalesce(x.orders, 0),
               'gross',      coalesce(x.gross, 0),
               'net',        coalesce(x.net, 0),
               -- Per operating day, so the shape means the same thing
               -- over a one-day range and a thirty-day one.
               'avg_orders', round(coalesce(x.orders, 0) / greatest((select days from operating), 1), 2),
               'avg_net',    round(coalesce(x.net, 0)    / greatest((select days from operating), 1), 2))
             order by h.hh)
      from generate_series(0, 23) h(hh)
      left join (
        select local_hour as hh, count(*) as orders,
               sum(total_amount) as gross, sum(subtotal) as net
        from sale group by local_hour
      ) x on x.hh = h.hh
    ), '[]'::jsonb),

    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dow',     w.dw,
               'orders',  coalesce(x.orders, 0),
               'net',     coalesce(x.net, 0),
               'days',    coalesce(x.days, 0),
               'avg_net', round(coalesce(x.net, 0) / greatest(coalesce(x.days, 0), 1), 2))
             order by w.dw)
      from generate_series(1, 7) w(dw)
      left join (
        select local_dow as dw, count(*) as orders, sum(subtotal) as net,
               count(distinct local_day) as days
        from sale group by local_dow
      ) x on x.dw = w.dw
    ), '[]'::jsonb),

    -- ── Breakdowns, all on the net basis ──────────────────────
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'quantity', qty,
               'revenue', round(rev, 2), 'gross_revenue', round(gross, 2))
             order by rev desc)
      from (
        select coalesce(c.name, 'Uncategorized') as name,
               sum(sold.quantity)   as qty,
               sum(sold.line_net)   as rev,
               sum(sold.line_gross) as gross
        from sold
        left join public.categories c on c.id = sold.category_id
        group by coalesce(c.name, 'Uncategorized')
      ) cat
    ), '[]'::jsonb),

    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'orders', orders, 'net', net, 'tips', tips,
               -- kept so nothing reading `gross` breaks
               'gross', gross)
             order by net desc)
      from (
        select coalesce(nullif(trim(coalesce(up.first_name,'') || ' ' || coalesce(up.last_name,'')), ''),
                        'Unknown') as name,
               count(*)                  as orders,
               sum(s.subtotal)           as net,
               sum(s.tip_amount)         as tips,
               sum(s.total_amount)       as gross
        from sale s
        left join public.user_profiles up on up.id = s.user_id
        group by 1
      ) st
    ), '[]'::jsonb),

    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'quantity', qty,
               'revenue', round(rev, 2), 'gross_revenue', round(gross, 2))
             order by qty desc)
      from (
        select coalesce(item_name, 'Unknown Item') as name,
               sum(quantity)   as qty,
               sum(line_net)   as rev,
               sum(line_gross) as gross
        from sold
        group by coalesce(item_name, 'Unknown Item')
        order by sum(quantity) desc
        limit 50
      ) ti
    ), '[]'::jsonb),

    -- Attach counts only. extra_price is already folded into
    -- order_items.unit_price (00005:238), so summing it here would
    -- double-count the revenue it contributed.
    'by_modifier', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', qty) order by qty desc)
      from (
        select oim.name, sum(sold.quantity) as qty
        from sold
        join public.order_item_modifiers oim on oim.order_item_id = sold.order_item_id
        group by oim.name
        order by sum(sold.quantity) desc
        limit 15
      ) m
    ), '[]'::jsonb),

    'by_discount_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt, 'total', total)
                       order by total desc)
      from (
        select coalesce(nullif(trim(discount_reason), ''), 'Unspecified') as reason,
               count(*) as cnt, sum(discount_amount) as total
        from sale where discount_amount > 0
        group by 1
      ) d
    ), '[]'::jsonb),

    'by_refund_reason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt, 'total', total)
                       order by total desc)
      from (
        select coalesce(nullif(trim(oa.reason), ''), 'Unspecified') as reason,
               count(*) as cnt, sum(r.total_amount) as total
        from refunded r
        left join lateral (
          select reason from public.order_audit
           where order_id = r.id and action = 'refund'
           order by created_at desc limit 1
        ) oa on true
        group by 1
      ) d
    ), '[]'::jsonb),

    -- Dead menu weight: on the menu, orderable, and nobody bought one.
    'never_sold', coalesce((
      select jsonb_agg(jsonb_build_object('name', mi.name, 'price', mi.price)
                       order by mi.name)
      from public.menu_items mi
      where mi.location_id = v_location_id
        and mi.is_active = true
        and mi.archived_at is null
        and not exists (select 1 from sold where sold.menu_item_id = mi.id)
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.sales_summary(date, date) from public, anon;
grant execute on function public.sales_summary(date, date) to authenticated;


-- ============================================================
-- Rollback: re-run 00020_reporting_rpc_admin_guard.sql, which holds the
-- previous definition of sales_summary in full.
-- ============================================================
