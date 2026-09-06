-- ============================================================
-- Dos Tazas POS - Refunds stop rewriting the past
-- Run AFTER 00031_menu_item_archive.sql
--
-- Problem this fixes:
--   reverse_completed_order (00013:281-330) refunds by mutating the sale
--   in place -- `update orders set status = 'refunded'` -- and nothing
--   else. It records no refund date, writes no reversing row, and leaves
--   created_at and shift_id pointing at the ORIGINAL sale. Three things
--   follow, and all three are wrong:
--
--   1. Reports change retroactively. Every reporting query filters on
--      `status = 'completed'`, so a refund issued today silently removes
--      the order from LAST WEEK's order_count, net_sales, by_day,
--      by_category and top_items. Last week's printed report can no
--      longer be reproduced.
--
--   2. The drawer closes short on cross-shift refunds. shift_summary
--      deducts cash refunds with `where o.shift_id = v_shift.id`
--      (00014:263-267). Refunding a previous shift's order takes cash out
--      of TODAY's till but charges it to that earlier shift -- whose
--      expected_cash was already snapshotted at close (00014:328) and so
--      never moves. Today's shift still counts the money as present and
--      closes short by exactly the refund.
--
--   3. There is no way to report refunds by the date they happened. The
--      only record of that instant is order_audit.created_at
--      (00013:198-211), a table nothing in the app has ever read.
--
--   The fix is to stamp WHEN and WHERE the reversal happened, then let
--   the reporting split "the shift that sold it" from "the shift that
--   refunded it". Backfilled rows get refund_shift_id = shift_id, which
--   makes every pre-existing shift report byte-identical to today.
-- ============================================================

-- ── 1. Columns ─────────────────────────────────────────────
alter table public.orders
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_shift_id uuid references public.shifts(id) on delete set null;

create index if not exists idx_orders_refunded_at
  on public.orders(location_id, refunded_at) where refunded_at is not null;

create index if not exists idx_orders_refund_shift
  on public.orders(refund_shift_id) where refund_shift_id is not null;


-- ── 2. Backfill from order_audit ───────────────────────────
-- order_audit has held the true refund instant all along. Where an order
-- somehow has no audit row, fall back to updated_at so refunded_at is
-- never null for a refunded order (the reporting in 00033 relies on it).
update public.orders o
   set refunded_at = coalesce(
         (select max(oa.created_at) from public.order_audit oa
           where oa.order_id = o.id and oa.action = 'refund'),
         o.updated_at,
         o.created_at
       ),
       refund_shift_id = o.shift_id
 where o.status = 'refunded'
   and o.refunded_at is null;


-- ── 3. reverse_completed_order — stamp the reversal ────────
-- Body is 00013:281-330 term for term, plus refunded_at/refund_shift_id.
-- current_shift_id() (00014:106) resolves the open shift at the caller's
-- active location, or null when the drawer is closed -- in which case the
-- refund is simply unattributed rather than mis-attributed.
create or replace function public.reverse_completed_order(
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can refund a completed order';
  end if;

  v_location_id := public.get_current_location_id();

  select * into v_order from public.orders
    where id = p_order_id and location_id = v_location_id;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'Only a completed order can be refunded (status: %)', v_order.status;
  end if;

  update public.orders
     set status = 'refunded',
         refunded_at = now(),
         refund_shift_id = public.current_shift_id()
   where id = p_order_id;

  -- Put the stock back that complete_order took out.
  update public.menu_items mi
    set available_quantity = mi.available_quantity + oi.qty
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items
      where order_id = p_order_id
      group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id
      and mi.track_inventory = true;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (p_order_id, v_location_id, 'refund', auth.uid(), nullif(p_reason, ''), to_jsonb(v_order));
end;
$$;

revoke execute on function public.reverse_completed_order(uuid, text) from public, anon;
grant execute on function public.reverse_completed_order(uuid, text) to authenticated;


-- ── 4. shift_summary — sold here vs refunded here ──────────
-- Body is 00014:232-337 term for term with one idea added: an order
-- belongs to the shift that RANG it, and its reversal belongs to the
-- shift that PAID IT BACK. So:
--
--   * a sale rung in this shift counts as a sale here, even if a later
--     shift refunded it (`v_sold_here`)
--   * a sale rung AND refunded in this same shift nets to nothing, as
--     before
--   * a refund paid out here counts here, whichever shift sold it
--     (`v_refunded_here`)
--
-- For every pre-migration row refund_shift_id = shift_id (see the
-- backfill above), so v_sold_here is false and v_refunded_here is true
-- exactly where the old `status = ...` filters were -- closed shifts
-- report precisely what they reported before.
create or replace function public.shift_summary(p_shift_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_shift public.shifts;
  v_sales jsonb;
  v_movements jsonb;
  v_expected numeric(10,2);
  v_cash_sales numeric(10,2);
  v_cash_refunds numeric(10,2);
  v_paid_in numeric(10,2);
  v_paid_out numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location_id := public.get_current_location_id();

  select * into v_shift from public.shifts
    where id = coalesce(p_shift_id, public.current_shift_id())
      and location_id = v_location_id;
  if not found then
    return null;
  end if;

  with scoped as (
    select o.*,
           -- Rung up in this shift and not handed back during it.
           (o.shift_id = v_shift.id
            and (o.status = 'completed'
                 or (o.status = 'refunded' and o.refund_shift_id is distinct from v_shift.id))
           ) as sold_here,
           -- Paid back out of this shift's drawer.
           (o.status = 'refunded' and o.refund_shift_id = v_shift.id) as refunded_here
    from public.orders o
    where o.shift_id = v_shift.id or o.refund_shift_id = v_shift.id
  )
  select
    coalesce(sum(total_amount) filter (where sold_here and payment_method = 'cash'), 0),
    coalesce(sum(total_amount) filter (where refunded_here and payment_method = 'cash'), 0),
    jsonb_build_object(
      'order_count',   count(*) filter (where sold_here),
      'refund_count',  count(*) filter (where refunded_here),
      'void_count',    count(*) filter (where shift_id = v_shift.id and status = 'cancelled'),
      'gross_sales',   coalesce(sum(total_amount)    filter (where sold_here), 0),
      'net_sales',     coalesce(sum(subtotal)        filter (where sold_here), 0),
      'tax_amount',    coalesce(sum(tax_amount)      filter (where sold_here), 0),
      'tip_amount',    coalesce(sum(tip_amount)      filter (where sold_here), 0),
      'discount_amount', coalesce(sum(discount_amount) filter (where sold_here), 0),
      'refund_total',  coalesce(sum(total_amount)    filter (where refunded_here), 0),
      'by_payment_method', coalesce((
        select jsonb_object_agg(pm, amt) from (
          select payment_method as pm, sum(total_amount) as amt
          from scoped
          where sold_here and payment_method is not null
          group by payment_method
        ) s
      ), '{}'::jsonb)
    )
  into v_cash_sales, v_cash_refunds, v_sales
  from scoped;

  select
    coalesce(sum(amount) filter (where type = 'paid_in'), 0),
    coalesce(sum(amount) filter (where type = 'paid_out'), 0)
  into v_paid_in, v_paid_out
  from public.cash_movements where shift_id = v_shift.id;

  v_expected := v_shift.opening_float + v_cash_sales - v_cash_refunds + v_paid_in - v_paid_out;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cm.id,
    'type', cm.type,
    'amount', cm.amount,
    'reason', cm.reason,
    'created_at', cm.created_at,
    'created_by_name', trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, ''))
  ) order by cm.created_at), '[]'::jsonb)
  into v_movements
  from public.cash_movements cm
  left join public.user_profiles up on up.id = cm.created_by
  where cm.shift_id = v_shift.id;

  return jsonb_build_object(
    'shift_id',       v_shift.id,
    'status',         v_shift.status,
    'opened_at',      v_shift.opened_at,
    'closed_at',      v_shift.closed_at,
    'opened_by_name', (select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
                         from public.user_profiles where id = v_shift.opened_by),
    'closed_by_name', (select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
                         from public.user_profiles where id = v_shift.closed_by),
    'opening_float',  v_shift.opening_float,
    'cash_sales',     v_cash_sales,
    'cash_refunds',   v_cash_refunds,
    'paid_in',        v_paid_in,
    'paid_out',       v_paid_out,
    -- For a closed shift, report the expected figure snapshotted at close
    -- rather than recomputing it, so a reprinted Z-report never drifts.
    'expected_cash',  coalesce(v_shift.expected_cash, v_expected),
    'counted_cash',   v_shift.counted_cash,
    'counted_breakdown', v_shift.counted_breakdown,
    'cash_variance',  v_shift.cash_variance,
    'closing_note',   v_shift.closing_note,
    'movements',      v_movements,
    'sales',          v_sales
  );
end;
$$;

revoke execute on function public.shift_summary(uuid) from public, anon;
grant execute on function public.shift_summary(uuid) to authenticated;


-- ── 5. recent_shifts — same "sold here" rule ───────────────
-- The cash page's shift list computed gross_sales/order_count with the
-- same `status = 'completed'` filter shift_summary used, so a later
-- refund silently shrank a closed shift's row. Body is 00015:289-334
-- term for term with that one predicate replaced.
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
          where o.shift_id = s.id
            and (o.status = 'completed'
                 or (o.status = 'refunded' and o.refund_shift_id is distinct from s.id))), 0),
        'order_count', coalesce((
          select count(*) from public.orders o
          where o.shift_id = s.id
            and (o.status = 'completed'
                 or (o.status = 'refunded' and o.refund_shift_id is distinct from s.id))), 0),
        'refund_total', coalesce((
          select sum(o.total_amount) from public.orders o
          where o.refund_shift_id = s.id and o.status = 'refunded'), 0)
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


-- ============================================================
-- Rollback: re-run 00014's shift_summary, 00015's recent_shifts
-- and 00013's reverse_completed_order, then
--   drop index if exists public.idx_orders_refunded_at;
--   drop index if exists public.idx_orders_refund_shift;
--   alter table public.orders drop column if exists refunded_at;
--   alter table public.orders drop column if exists refund_shift_id;
-- ============================================================
