-- ============================================================
-- Phase 4 — offline outbox location stamping (server side)
-- ============================================================
-- lib/offline/ queues sales in IndexedDB with no location on the entry.
-- A device that switches location (Phase 3) mid-outage could otherwise
-- drain its queue into the wrong shop — and because the idempotency key
-- is (location_id, client_uuid), a mis-drain into B followed by a
-- corrected drain into A produces TWO orders, not a replay. This is the
-- server-side belt to the client-side stamp (lib/offline/outbox.ts): even
-- if a client bug ever sent a stale/wrong p_location_id, this raises
-- rather than silently accepting a cross-location write.
--
-- A new trailing parameter changes the function's identity for
-- PostgREST's overload resolution (00018's header documents this same
-- trap), so both are dropped before being re-created rather than a plain
-- CREATE OR REPLACE.
--
-- Verified against prod (rolled back): a mismatched p_location_id raises
-- P0001; a matching or null p_location_id (backward-compatible for a
-- not-yet-upgraded client) both proceed normally.

drop function if exists public.sync_offline_order(
  uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb
);

create or replace function public.sync_offline_order(
  p_client_uuid uuid,
  p_items jsonb,
  p_offline_ref text default null,
  p_device_id text default null,
  p_table_id uuid default null,
  p_client_age_seconds numeric default 0,
  p_expected_shift_id uuid default null,
  p_payment jsonb default null,
  p_client_charge jsonb default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_location_id uuid;
  v_existing public.orders;
  v_age numeric;
  v_occurred timestamptz;
  v_table_id uuid;
  v_shift_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_tax_rate numeric(5,4);
  v_warnings jsonb := '[]'::jsonb;
  v_gross numeric(10,2);
  v_tax numeric(10,2);
  v_math jsonb;
  v_server_total numeric(10,2);
  v_client_total numeric(10,2);
  v_charged_gross numeric(10,2);
  v_tax_final numeric(10,2);
  v_subtotal_final numeric(10,2);
  v_total_final numeric(10,2);
  v_discrepancy numeric(10,2);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_client_uuid is null then
    raise exception 'client_uuid is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order has no items';
  end if;

  v_location_id := public.get_current_location_id();

  -- Phase 4: reject a queued sale stamped for a location other than the
  -- one the caller is CURRENTLY at. P0001 is classified "permanent" by
  -- lib/offline/sync.ts's classifyError, so this lands the entry in
  -- `failed` — visible and manually retryable once the device switches
  -- back — rather than burning the attempt budget or silently landing
  -- the sale in the wrong shop's books.
  if p_location_id is not null and p_location_id <> v_location_id then
    raise exception 'This queued sale belongs to another location. Switch back to it to send.'
      using errcode = 'P0001';
  end if;

  -- ── Replay short-circuit — the primary dedup. A replay is always a
  -- clean success, never an error: the entire client retry story depends
  -- on this being true. ─────────────────────────────────────────────
  select * into v_existing from public.orders
    where location_id = v_location_id and client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'replayed', true,
      'total_amount', v_existing.total_amount,
      'server_total_amount', v_existing.server_total_amount,
      'discrepancy', coalesce(v_existing.sync_discrepancy, 0),
      'warnings', coalesce(v_existing.sync_warnings, '[]'::jsonb)
    );
  end if;

  -- ── Reconstruct occurrence time from an AGE, not a device timestamp —
  -- immune to clock skew. Clamp to 48h so a wildly wrong device clock
  -- can't land a sale in the far past or future. ─────────────────────
  v_age := least(greatest(coalesce(p_client_age_seconds, 0), 0), 172800);
  if v_age <> coalesce(p_client_age_seconds, 0) then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'clock_clamped', 'sent', p_client_age_seconds);
  end if;
  v_occurred := now() - make_interval(secs => v_age);

  -- ── Table-tab collision: two devices parked a tab on the same table
  -- while both offline. Pre-checked rather than caught off the unique
  -- index, so it stays distinguishable from the client_uuid race below.
  -- Only relevant when this will end up 'parked' — a create-and-pay never
  -- touches that status, so it can't trip the partial index at all.
  -- Deliberately NOT merged into the existing tab: silently absorbing one
  -- table's items into another's bill is worse than two tickets a human
  -- reconciles. ───────────────────────────────────────────────────────
  v_table_id := p_table_id;
  if p_table_id is not null and p_payment is null and exists (
    select 1 from public.orders
     where table_id = p_table_id and status = 'parked' and location_id = v_location_id
  ) then
    v_table_id := null;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'table_tab_conflict', 'table_id', p_table_id);
  end if;

  if v_table_id is not null and not exists (
    select 1 from public.tables where id = v_table_id and location_id = v_location_id
  ) then
    v_table_id := null;
    v_warnings := v_warnings || jsonb_build_object('code', 'table_missing');
  end if;

  -- ── Shift: current_shift_id() may legitimately be null (device
  -- reopened the next morning with nobody having opened a shift yet).
  -- Never raise — warn, and let the order land with shift_id null rather
  -- than losing the sale. ─────────────────────────────────────────────
  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    v_warnings := v_warnings || jsonb_build_object('code', 'no_shift_at_sync');
  elsif p_expected_shift_id is not null and p_expected_shift_id <> v_shift_id then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'shift_changed', 'expected', p_expected_shift_id, 'actual', v_shift_id);
  end if;

  select coalesce(tax_rate, 0.13) into v_tax_rate
    from public.location_settings where location_id = v_location_id;
  v_tax_rate := coalesce(v_tax_rate, 0.13);

  -- ── Insert. Status stays 'draft' until we know whether this ends
  -- 'parked' or 'completed' below — never passing through 'parked' at
  -- all for a create-and-pay, so the partial unique index above is never
  -- at risk of tripping on a sale that's about to be paid anyway.
  -- The insert itself is the second dedup layer: if two concurrent drains
  -- both slipped past the replay check above, the unique index on
  -- (location_id, client_uuid) catches the loser here. ────────────────
  begin
    insert into public.orders (
      location_id, user_id, status, order_number, tax_rate, total_amount,
      table_id, client_uuid, device_id, offline_ref, occurred_at, created_at
    )
    values (
      v_location_id, auth.uid(), 'draft',
      public.next_order_number(v_location_id, v_occurred),
      v_tax_rate, 0,
      v_table_id, p_client_uuid, p_device_id, p_offline_ref, v_occurred, v_occurred
    )
    returning id into v_order_id;
  exception when unique_violation then
    select * into v_existing from public.orders
      where location_id = v_location_id and client_uuid = p_client_uuid;
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'replayed', true,
      'total_amount', v_existing.total_amount,
      'server_total_amount', v_existing.server_total_amount,
      'discrepancy', coalesce(v_existing.sync_discrepancy, 0),
      'warnings', coalesce(v_existing.sync_warnings, '[]'::jsonb)
    );
  end;

  v_warnings := public._insert_priced_items(v_order_id, p_items, v_location_id, false, v_warnings);
  perform public._recompute_order_totals(v_order_id);

  select subtotal, tax_amount into v_gross, v_tax from public.orders where id = v_order_id;
  v_gross := v_gross + v_tax;

  if p_payment is null then
    -- Park only — nothing was charged yet.
    update public.orders
      set status = 'parked', synced_at = now(), sync_warnings = v_warnings
      where id = v_order_id;

    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (v_order_id, v_location_id, 'offline_sync', auth.uid(), null,
        jsonb_build_object('offline_ref', p_offline_ref, 'device_id', p_device_id, 'warnings', v_warnings));

    select order_number, total_amount into v_order_number, v_total_final
      from public.orders where id = v_order_id;
    return jsonb_build_object(
      'order_id', v_order_id, 'order_number', v_order_number, 'status', 'parked',
      'replayed', false, 'total_amount', v_total_final, 'server_total_amount', v_total_final,
      'discrepancy', 0, 'warnings', v_warnings
    );
  end if;

  -- ── Payment attached — the lenient checkout. Same discount/IVA/tip
  -- math as complete_order, but every guard below is a warning: the
  -- customer already paid and left with the coffee. ───────────────────
  v_reason := nullif(trim(coalesce(p_payment->>'discount_reason', '')), '');
  if coalesce((p_payment->>'discount_value')::numeric, 0) > 0
     and v_reason is null and (p_payment->>'discount_type') is not null then
    v_reason := '(offline: no reason recorded)';
    v_warnings := v_warnings || jsonb_build_object('code', 'discount_reason_missing');
  end if;

  if p_payment->>'payment_method' not in ('card', 'cash', 'sinpe') then
    raise exception 'Invalid payment method';
  end if;
  if p_payment->>'payment_method' = 'sinpe'
     and coalesce(p_payment->>'payment_reference', '') = '' then
    v_warnings := v_warnings || jsonb_build_object('code', 'sinpe_reference_missing');
  end if;

  v_math := public._price_checkout(
    v_gross, v_tax, p_payment->>'discount_type',
    (p_payment->>'discount_value')::numeric, (p_payment->>'tip_amount')::numeric,
    false, v_warnings
  );
  v_warnings := v_math->'warnings';
  v_server_total := (v_math->>'total_amount')::numeric;

  v_client_total := coalesce((p_client_charge->>'totalAmount')::numeric, v_server_total);

  if p_payment->>'payment_method' = 'cash' then
    if (p_payment->>'amount_tendered') is null
       or (p_payment->>'amount_tendered')::numeric < v_client_total then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'tendered_short', 'tendered', p_payment->>'amount_tendered', 'total', v_client_total);
    end if;
  end if;

  -- Reconcile what the till actually took against what server-authoritative
  -- pricing says it should have been. total_amount = what was charged (see
  -- header note); server_total_amount + sync_discrepancy carry the server's
  -- opinion so nothing is silently lost.
  if abs(v_server_total - v_client_total) >= 0.01 then
    v_charged_gross  := v_client_total - (v_math->>'tip_amount')::numeric;
    v_tax_final      := case when v_gross > 0 then round(v_tax * v_charged_gross / v_gross, 2) else 0 end;
    v_subtotal_final := v_charged_gross - v_tax_final;
    v_total_final    := v_client_total;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'total_mismatch', 'server', v_server_total, 'client', v_client_total);
  else
    v_subtotal_final := (v_math->>'subtotal')::numeric;
    v_tax_final      := (v_math->>'tax_amount')::numeric;
    v_total_final    := v_server_total;
  end if;
  v_discrepancy := round(v_server_total - v_total_final, 2);

  update public.orders
    set status = 'completed',
        shift_id = v_shift_id,
        payment_method = p_payment->>'payment_method',
        payment_reference = p_payment->>'payment_reference',
        tip_amount = (v_math->>'tip_amount')::numeric,
        subtotal = v_subtotal_final,
        tax_amount = v_tax_final,
        discount_amount = (v_math->>'discount_amount')::numeric,
        discount_reason = case when (v_math->>'discount_amount')::numeric > 0 then v_reason else null end,
        total_amount = v_total_final,
        server_total_amount = v_server_total,
        sync_discrepancy = v_discrepancy,
        client_charge = p_client_charge,
        amount_tendered = case when p_payment->>'payment_method' = 'cash'
                            then (p_payment->>'amount_tendered')::numeric else null end,
        change_due = case when p_payment->>'payment_method' = 'cash'
                       then round(coalesce((p_payment->>'amount_tendered')::numeric, 0) - v_total_final, 2)
                       else null end,
        customer_name = p_payment->>'customer_name',
        customer_id = p_payment->>'customer_id',
        customer_email = p_payment->>'customer_email',
        synced_at = now(),
        sync_warnings = v_warnings
    where id = v_order_id;

  update public.menu_items mi
    set available_quantity = greatest(0, mi.available_quantity - oi.qty)
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items where order_id = v_order_id group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id and mi.track_inventory = true;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (v_order_id, v_location_id, 'offline_sync', auth.uid(), v_reason,
      jsonb_build_object(
        'client_charge', p_client_charge, 'server_total', v_server_total,
        'warnings', v_warnings, 'offline_ref', p_offline_ref, 'device_id', p_device_id
      ));

  if v_discrepancy <> 0 or jsonb_array_length(v_warnings) > 0 then
    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (v_order_id, v_location_id, 'sync_discrepancy', auth.uid(), null,
        jsonb_build_object(
          'server_total', v_server_total, 'charged_total', v_total_final,
          'discrepancy', v_discrepancy, 'warnings', v_warnings
        ));
  end if;

  select order_number into v_order_number from public.orders where id = v_order_id;
  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'status', 'completed',
    'replayed', false, 'total_amount', v_total_final, 'server_total_amount', v_server_total,
    'discrepancy', v_discrepancy, 'warnings', v_warnings
  );
end;
$function$;

revoke execute on function public.sync_offline_order(uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.sync_offline_order(uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────

drop function if exists public.sync_offline_payment(
  uuid, uuid, numeric, uuid, jsonb, jsonb
);

create or replace function public.sync_offline_payment(
  p_order_id uuid,
  p_client_uuid uuid,
  p_client_age_seconds numeric default 0,
  p_expected_shift_id uuid default null,
  p_payment jsonb default null,
  p_client_charge jsonb default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_location_id uuid;
  v_order public.orders;
  v_shift_id uuid;
  v_gross numeric(10,2);
  v_tax numeric(10,2);
  v_math jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_server_total numeric(10,2);
  v_client_total numeric(10,2);
  v_charged_gross numeric(10,2);
  v_tax_final numeric(10,2);
  v_subtotal_final numeric(10,2);
  v_total_final numeric(10,2);
  v_discrepancy numeric(10,2);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_client_uuid is null then
    raise exception 'client_uuid is required';
  end if;
  if p_payment is null then
    raise exception 'Payment details are required';
  end if;

  v_location_id := public.get_current_location_id();

  -- Phase 4: same guard as sync_offline_order — see its header comment.
  if p_location_id is not null and p_location_id <> v_location_id then
    raise exception 'This queued sale belongs to another location. Switch back to it to send.'
      using errcode = 'P0001';
  end if;

  select * into v_order from public.orders
    where id = p_order_id and location_id = v_location_id;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Our own replay.
  if v_order.client_uuid = p_client_uuid then
    return jsonb_build_object(
      'order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
      'replayed', true, 'total_amount', v_order.total_amount,
      'server_total_amount', v_order.server_total_amount,
      'discrepancy', coalesce(v_order.sync_discrepancy, 0),
      'warnings', coalesce(v_order.sync_warnings, '[]'::jsonb)
    );
  end if;

  -- Someone else already paid this order — offline, on another device.
  -- Money was genuinely taken twice in the real world; say so loudly
  -- rather than silently succeeding a second time.
  if v_order.status = 'completed' then
    return jsonb_build_object(
      'conflict', 'already_paid', 'order_id', v_order.id,
      'order_number', v_order.order_number, 'paid_total', v_order.total_amount
    );
  end if;
  if v_order.status <> 'parked' then
    return jsonb_build_object('conflict', 'not_parked', 'order_id', v_order.id, 'status', v_order.status);
  end if;

  v_shift_id := public.current_shift_id();
  if v_shift_id is null then
    v_warnings := v_warnings || jsonb_build_object('code', 'no_shift_at_sync');
  elsif p_expected_shift_id is not null and p_expected_shift_id <> v_shift_id then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'shift_changed', 'expected', p_expected_shift_id, 'actual', v_shift_id);
  end if;

  v_gross := coalesce(nullif(v_order.subtotal, 0), v_order.total_amount, 0) + v_order.tax_amount;
  v_tax := v_order.tax_amount;

  v_reason := nullif(trim(coalesce(p_payment->>'discount_reason', '')), '');
  if coalesce((p_payment->>'discount_value')::numeric, 0) > 0
     and v_reason is null and (p_payment->>'discount_type') is not null then
    v_reason := '(offline: no reason recorded)';
    v_warnings := v_warnings || jsonb_build_object('code', 'discount_reason_missing');
  end if;

  if p_payment->>'payment_method' not in ('card', 'cash', 'sinpe') then
    raise exception 'Invalid payment method';
  end if;
  if p_payment->>'payment_method' = 'sinpe'
     and coalesce(p_payment->>'payment_reference', '') = '' then
    v_warnings := v_warnings || jsonb_build_object('code', 'sinpe_reference_missing');
  end if;

  v_math := public._price_checkout(
    v_gross, v_tax, p_payment->>'discount_type',
    (p_payment->>'discount_value')::numeric, (p_payment->>'tip_amount')::numeric,
    false, v_warnings
  );
  v_warnings := v_math->'warnings';
  v_server_total := (v_math->>'total_amount')::numeric;
  v_client_total := coalesce((p_client_charge->>'totalAmount')::numeric, v_server_total);

  if p_payment->>'payment_method' = 'cash' then
    if (p_payment->>'amount_tendered') is null
       or (p_payment->>'amount_tendered')::numeric < v_client_total then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'tendered_short', 'tendered', p_payment->>'amount_tendered', 'total', v_client_total);
    end if;
  end if;

  if abs(v_server_total - v_client_total) >= 0.01 then
    v_charged_gross  := v_client_total - (v_math->>'tip_amount')::numeric;
    v_tax_final      := case when v_gross > 0 then round(v_tax * v_charged_gross / v_gross, 2) else 0 end;
    v_subtotal_final := v_charged_gross - v_tax_final;
    v_total_final    := v_client_total;
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'total_mismatch', 'server', v_server_total, 'client', v_client_total);
  else
    v_subtotal_final := (v_math->>'subtotal')::numeric;
    v_tax_final      := (v_math->>'tax_amount')::numeric;
    v_total_final    := v_server_total;
  end if;
  v_discrepancy := round(v_server_total - v_total_final, 2);

  update public.orders
    set status = 'completed',
        shift_id = v_shift_id,
        client_uuid = p_client_uuid,
        payment_method = p_payment->>'payment_method',
        payment_reference = p_payment->>'payment_reference',
        tip_amount = (v_math->>'tip_amount')::numeric,
        subtotal = v_subtotal_final,
        tax_amount = v_tax_final,
        discount_amount = (v_math->>'discount_amount')::numeric,
        discount_reason = case when (v_math->>'discount_amount')::numeric > 0 then v_reason else null end,
        total_amount = v_total_final,
        server_total_amount = v_server_total,
        sync_discrepancy = v_discrepancy,
        client_charge = p_client_charge,
        amount_tendered = case when p_payment->>'payment_method' = 'cash'
                            then (p_payment->>'amount_tendered')::numeric else null end,
        change_due = case when p_payment->>'payment_method' = 'cash'
                       then round(coalesce((p_payment->>'amount_tendered')::numeric, 0) - v_total_final, 2)
                       else null end,
        customer_name = p_payment->>'customer_name',
        customer_id = p_payment->>'customer_id',
        customer_email = p_payment->>'customer_email',
        synced_at = now(),
        sync_warnings = v_warnings
    where id = p_order_id;

  update public.menu_items mi
    set available_quantity = greatest(0, mi.available_quantity - oi.qty)
    from (
      select menu_item_id, sum(quantity) as qty
      from public.order_items where order_id = p_order_id group by menu_item_id
    ) oi
    where mi.id = oi.menu_item_id and mi.track_inventory = true;

  insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
    values (p_order_id, v_location_id, 'offline_sync', auth.uid(), v_reason,
      jsonb_build_object('client_charge', p_client_charge, 'server_total', v_server_total, 'warnings', v_warnings));

  if v_discrepancy <> 0 or jsonb_array_length(v_warnings) > 0 then
    insert into public.order_audit (order_id, location_id, action, actor_id, reason, order_snapshot)
      values (p_order_id, v_location_id, 'sync_discrepancy', auth.uid(), null,
        jsonb_build_object(
          'server_total', v_server_total, 'charged_total', v_total_final,
          'discrepancy', v_discrepancy, 'warnings', v_warnings
        ));
  end if;

  return jsonb_build_object(
    'order_id', p_order_id, 'order_number', v_order.order_number, 'status', 'completed',
    'replayed', false, 'total_amount', v_total_final, 'server_total_amount', v_server_total,
    'discrepancy', v_discrepancy, 'warnings', v_warnings
  );
end;
$function$;

revoke execute on function public.sync_offline_payment(uuid, uuid, numeric, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.sync_offline_payment(uuid, uuid, numeric, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

-- Rollback:
--   drop function public.sync_offline_order(uuid, jsonb, text, text, uuid, numeric, uuid, jsonb, jsonb, uuid);
--   drop function public.sync_offline_payment(uuid, uuid, numeric, uuid, jsonb, jsonb, uuid);
--   -- re-create both with the pre-Phase-4 9-arg / 6-arg signatures (see 00019).
