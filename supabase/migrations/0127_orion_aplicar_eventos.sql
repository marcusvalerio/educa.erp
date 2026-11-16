-- ==================================================================
-- 0127 — Integração ORION: eventos ORION → ATLAS e estoque (fase 3 do
-- contrato, docs/INTEGRACAO-ATLAS-ORION.md §3.5, §3.6, §5).
--
--   * guarda ESTOQUE_GERENCIADO_PELO_ORION em fn_post_stock_movement
--     (só passa quando o movimento vem de um evento do ORION, marcado por
--     `set local app.orion_apply = 'on'`);
--   * fn_reserve_sales_order_stock só muda o status e
--     fn_complete_production_order não faz backflush em empresa ORION;
--   * fn_orion_receive_event: inbox com idempotência pelo id do envelope,
--     ordem por agregado, e aplicação de cada tipo por fn_orion_apply_*;
--   * carga inicial (stock.initial_snapshot) e reconciliação diária
--     (stock.balance_snapshot → orion_reconciliation_*).
--
-- As funções de negócio existentes (fn_confirm_purchase_receipt,
-- fn_consume_production_material, fn_post_adjustment …) exigem um usuário
-- com permissão (has_permission/auth.uid()); o evento chega sem usuário.
-- Por isso a aplicação reaproveita as peças internas que elas usam —
-- fn_post_stock_movement (saldo, idempotência) e fn_register_cost_movement
-- (custo médio, como 0044) — e grava os mesmos registros de documento.
-- ==================================================================

-- ------------------------------------------------------------ guarda
create or replace function public.fn_post_stock_movement(p_company_id uuid, p_product_id uuid, p_location_id uuid, p_movement_type text, p_quantity numeric, p_lot_id uuid DEFAULT NULL::uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lot_key uuid := coalesce(p_lot_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_existing public.stock_movements;
  v_movement public.stock_movements;
  v_on_hand numeric;
  v_reserved numeric;
  v_delta_on_hand numeric := 0;
  v_delta_reserved numeric := 0;
begin
  -- 0127: empresa com ORION — o estoque físico é do armazém; o saldo fiscal
  -- só muda pelos eventos do ORION (fn_orion_apply_*).
  if public.fn_stock_managed_by_orion(p_company_id) and not public.fn_orion_applying() then
    raise exception 'ESTOQUE_GERENCIADO_PELO_ORION: o estoque desta empresa é movimentado pelo ORION.WMS.' using errcode = 'P0001';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade do movimento deve ser maior que zero.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  case p_movement_type
    when 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'PRODUCTION_IN' then
      v_delta_on_hand := p_quantity;
    when 'ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'RETURN_OUT', 'PRODUCTION_OUT' then
      v_delta_on_hand := -p_quantity;
    when 'RESERVATION' then
      v_delta_reserved := p_quantity;
    when 'RELEASE' then
      v_delta_reserved := -p_quantity;
    else
      raise exception 'Tipo de movimento inválido: %', p_movement_type using errcode = '22023';
  end case;

  insert into public.stock_balances (company_id, product_id, location_id, lot_id, on_hand, reserved)
  values (p_company_id, p_product_id, p_location_id, p_lot_id, 0, 0)
  on conflict (company_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do nothing;

  select on_hand, reserved into v_on_hand, v_reserved
  from public.stock_balances
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key
  for update;

  if v_delta_on_hand < 0 and (v_on_hand + v_delta_on_hand) < 0 then
    raise exception 'Saldo insuficiente: disponível % em estoque, solicitado %.', v_on_hand, p_quantity using errcode = 'P0001';
  end if;

  if v_delta_on_hand < 0 and (v_on_hand + v_delta_on_hand) < v_reserved then
    raise exception 'Saída de % bloqueada: % unidade(s) estão reservadas neste local e não podem ser comprometidas.', p_quantity, v_reserved using errcode = 'P0001';
  end if;

  if v_delta_reserved > 0 and (v_reserved + v_delta_reserved) > (v_on_hand + v_delta_on_hand) then
    raise exception 'Reserva de % excede o saldo disponível.', p_quantity using errcode = 'P0001';
  end if;

  if v_delta_reserved < 0 and (v_reserved + v_delta_reserved) < 0 then
    raise exception 'Liberação de % excede a quantidade reservada (%).', p_quantity, v_reserved using errcode = 'P0001';
  end if;

  update public.stock_balances
  set on_hand = on_hand + v_delta_on_hand,
      reserved = reserved + v_delta_reserved,
      updated_at = now()
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key;

  begin
    insert into public.stock_movements (
      company_id, product_id, location_id, lot_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, notes, idempotency_key, created_by
    ) values (
      p_company_id, p_product_id, p_location_id, p_lot_id, p_movement_type, p_quantity, p_unit_cost,
      p_reference_type, p_reference_id, p_notes, p_idempotency_key, p_created_by
    )
    returning * into v_movement;
  exception
    when unique_violation then
      update public.stock_balances
      set on_hand = on_hand - v_delta_on_hand,
          reserved = reserved - v_delta_reserved,
          updated_at = now()
      where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
        and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key;

      select * into v_existing from public.stock_movements
      where company_id = p_company_id and idempotency_key = p_idempotency_key;
      if found then
        return v_existing;
      end if;
      raise;
  end;

  return v_movement;
end;
$function$;

-- Reserva: em empresa ORION só muda o status ("liberado para separação").
alter function public.fn_reserve_sales_order_stock(uuid, uuid, text) rename to fn_reserve_sales_order_stock_atlas;
revoke all on function public.fn_reserve_sales_order_stock_atlas(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.fn_reserve_sales_order_stock(p_order_id uuid, p_location_id uuid, p_idempotency_key text default null)
returns public.sales_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
begin
  select * into v_order from public.sales_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;
  if not public.fn_stock_managed_by_orion(v_order.company_id) then
    return public.fn_reserve_sales_order_stock_atlas(p_order_id, p_location_id, p_idempotency_key);
  end if;
  if not public.has_permission(v_order.company_id, 'sales_orders.reserve') then
    raise exception 'Permissão negada (sales_orders.reserve).' using errcode = '42501';
  end if;
  if v_order.status not in ('approved', 'reservation_pending') then
    raise exception 'Só é possível liberar para separação um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;
  update public.sales_orders set status = 'reserved' where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;
grant execute on function public.fn_reserve_sales_order_stock(uuid, uuid, text) to authenticated, service_role;

-- Conclusão da OP: sem backflush em empresa ORION (o consumo já veio por
-- production.materials_delivered).
alter function public.fn_complete_production_order(uuid) rename to fn_complete_production_order_atlas;
revoke all on function public.fn_complete_production_order_atlas(uuid) from public, anon, authenticated;

create or replace function public.fn_complete_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.production_orders;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;
  if not public.fn_stock_managed_by_orion(v_order.company_id) then
    return public.fn_complete_production_order_atlas(p_production_order_id);
  end if;
  if not public.has_permission(v_order.company_id, 'production_orders.complete') then
    raise exception 'Permissão negada (production_orders.complete).' using errcode = '42501';
  end if;
  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível concluir uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;
  update public.production_orders set status = 'completed', finished_at = now()
  where id = p_production_order_id returning * into v_order;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'COMPLETE',
    jsonb_build_object('status', 'in_progress'), jsonb_build_object('status', 'completed', 'produced_quantity', v_order.produced_quantity, 'backflush', false));
  return v_order;
end;
$$;
grant execute on function public.fn_complete_production_order(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ reconciliação
create table if not exists public.orion_snapshot_chunks (
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null,
  chunk integer not null,
  chunks integer not null,
  reason text,
  taken_at timestamptz,
  as_of_event_id uuid,
  items jsonb not null,
  received_at timestamptz not null default now(),
  primary key (company_id, snapshot_id, chunk)
);

create table if not exists public.orion_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_id uuid not null,
  reason text,
  taken_at timestamptz,
  as_of_event_id uuid,
  status text not null default 'completed' check (status in ('waiting_events','completed')),
  total_items integer not null default 0,
  divergent_items integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, snapshot_id)
);

create table if not exists public.orion_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.orion_reconciliation_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  lot_code text,
  warehouse_id uuid not null,
  atlas_qty numeric not null,
  orion_qty numeric not null,
  delta numeric not null
);
create index if not exists orion_reconciliation_items_run_idx on public.orion_reconciliation_items (run_id);

alter table public.orion_snapshot_chunks enable row level security;
alter table public.orion_reconciliation_runs enable row level security;
alter table public.orion_reconciliation_items enable row level security;
drop policy if exists orion_reconciliation_runs_select on public.orion_reconciliation_runs;
create policy orion_reconciliation_runs_select on public.orion_reconciliation_runs for select to authenticated
  using (public.has_permission(company_id, 'orion.integration.view'));
drop policy if exists orion_reconciliation_items_select on public.orion_reconciliation_items;
create policy orion_reconciliation_items_select on public.orion_reconciliation_items for select to authenticated
  using (public.has_permission(company_id, 'orion.integration.view'));
revoke all on public.orion_snapshot_chunks, public.orion_reconciliation_runs, public.orion_reconciliation_items from anon, authenticated;
grant select on public.orion_reconciliation_runs, public.orion_reconciliation_items to authenticated;
grant all on public.orion_snapshot_chunks, public.orion_reconciliation_runs, public.orion_reconciliation_items to service_role;

-- ------------------------------------------------------------ apoio à aplicação
create or replace function public.fn_orion_fail(p_message text)
returns void language plpgsql as $$
begin
  raise exception 'ORION_UNKNOWN_REFERENCE: %', p_message using errcode = 'P0001';
end;
$$;

create or replace function public.fn_orion_location(p_company_id uuid, p_warehouse_id uuid)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v uuid;
begin
  select integration_location_id into v from public.orion_warehouse_map
  where company_id = p_company_id and warehouse_id = coalesce(p_warehouse_id, public.fn_orion_default_warehouse(p_company_id));
  if v is null then
    perform public.fn_orion_fail('depósito sem mapeamento ORION');
  end if;
  return v;
end;
$$;

create or replace function public.fn_orion_location_by_code(p_company_id uuid, p_code text)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v uuid;
begin
  if p_code is null then
    return public.fn_orion_location(p_company_id, null);
  end if;
  select integration_location_id into v from public.orion_warehouse_map where company_id = p_company_id and orion_warehouse_code = p_code;
  if v is null then
    perform public.fn_orion_fail('depósito ORION ' || p_code || ' sem mapeamento');
  end if;
  return v;
end;
$$;

create or replace function public.fn_orion_product(p_company_id uuid, p_product_id uuid)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_product_id is null or not exists (select 1 from public.products where id = p_product_id and company_id = p_company_id) then
    perform public.fn_orion_fail('produto ' || coalesce(p_product_id::text, '(vazio)') || ' não encontrado');
  end if;
  return p_product_id;
end;
$$;

create or replace function public.fn_orion_lot(p_company_id uuid, p_product_id uuid, p_lot_code text, p_expires date default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid;
begin
  if p_lot_code is null or p_lot_code = '' then return null; end if;
  select id into v from public.product_lots where company_id = p_company_id and product_id = p_product_id and lot_number = p_lot_code;
  if v is null then
    insert into public.product_lots (company_id, product_id, lot_number, expires_at, notes)
    values (p_company_id, p_product_id, p_lot_code, p_expires, 'Criado por evento do ORION')
    on conflict (company_id, product_id, lot_number) do nothing
    returning id into v;
    if v is null then
      select id into v from public.product_lots where company_id = p_company_id and product_id = p_product_id and lot_number = p_lot_code;
    end if;
  end if;
  return v;
end;
$$;

-- Movimento + custo médio (mesma integração de custo de 0044).
create or replace function public.fn_orion_move(
  p_company_id uuid, p_product_id uuid, p_location_id uuid, p_type text, p_qty numeric, p_lot_id uuid,
  p_unit_cost numeric, p_ref_type text, p_ref_id uuid, p_key text, p_notes text default null
) returns public.cost_movements
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mov public.stock_movements;
begin
  v_mov := public.fn_post_stock_movement(
    p_company_id => p_company_id, p_product_id => p_product_id, p_location_id => p_location_id,
    p_movement_type => p_type, p_quantity => p_qty, p_lot_id => p_lot_id, p_unit_cost => p_unit_cost,
    p_reference_type => p_ref_type, p_reference_id => p_ref_id, p_notes => p_notes, p_idempotency_key => p_key);
  return public.fn_register_cost_movement(p_stock_movement_id => v_mov.id, p_unit_cost => p_unit_cost,
    p_source_type => 'orion_event', p_source_id => p_ref_id);
end;
$$;

create or replace function public.fn_orion_avg_cost(p_company_id uuid, p_product_id uuid, p_location_id uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select case when sum(quantity) > 0 then round(sum(total_value) / sum(quantity), 6) end
     from public.product_cost_balances where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id),
    (select cost_price from public.products where id = p_product_id), 0);
$$;

create or replace function public.fn_orion_sales_order(p_company_id uuid, p_id text)
returns public.sales_orders language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.sales_orders;
begin
  select * into v from public.sales_orders where id = p_id::uuid and company_id = p_company_id for update;
  if not found then
    perform public.fn_orion_fail('pedido de venda ' || coalesce(p_id, '(vazio)') || ' não encontrado');
  end if;
  return v;
end;
$$;

create or replace function public.fn_orion_recalc_sales_status(p_order_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ordered numeric; v_shipped numeric; v_cancelled numeric; v_status text;
begin
  select coalesce(sum(ordered_quantity), 0), coalesce(sum(shipped_quantity), 0), coalesce(sum(cancelled_quantity), 0)
  into v_ordered, v_shipped, v_cancelled from public.sales_order_items where order_id = p_order_id;
  select status into v_status from public.sales_orders where id = p_order_id;
  if v_shipped > 0 then
    v_status := case when v_shipped + v_cancelled >= v_ordered then 'shipped' else 'partially_shipped' end;
  elsif v_cancelled >= v_ordered and v_ordered > 0 then
    v_status := 'cancelled';
  end if;
  update public.sales_orders set status = v_status where id = p_order_id and status is distinct from v_status;
  return v_status;
end;
$$;

-- ------------------------------------------------------------ aplicação por tipo
create or replace function public.fn_orion_apply_outbound_status(p_company_id uuid, p_event_id uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
begin
  v_order := public.fn_orion_sales_order(p_company_id, p_payload ->> 'atlas_sales_order_id');
  if p_type = 'outbound.accepted' then
    update public.sales_orders set wms_status = 'accepted', wms_last_error = null,
      wms_details = wms_details || jsonb_build_object('orion_outbound_code', p_payload ->> 'code')
    where id = v_order.id;
  elsif p_type = 'outbound.picking_started' then
    update public.sales_orders set wms_status = 'picking',
      status = case when status in ('approved','reservation_pending','reserved') then 'picking' else status end,
      wms_details = wms_details || jsonb_build_object('wave', p_payload ->> 'wave')
    where id = v_order.id;
  elsif p_type = 'outbound.ready_to_invoice' then
    update public.sales_orders set wms_status = 'ready_to_invoice',
      status = case when status in ('approved','reservation_pending','reserved','picking') then 'ready_to_ship' else status end,
      wms_details = wms_details || jsonb_build_object('ready_to_invoice', p_payload - 'atlas_sales_order_id')
    where id = v_order.id;
  elsif p_type = 'outbound.cancelled' then
    if v_order.status = 'cancelled' then
      update public.sales_orders set wms_status = 'cancelled' where id = v_order.id;
    else
      -- Cancelamento partiu do armazém: o pedido comercial continua.
      update public.sales_orders set wms_status = 'cancelled',
        status = case when status in ('reservation_pending','reserved','picking','ready_to_ship') then 'approved' else status end,
        wms_last_error = 'Armazém cancelou a saída: ' || coalesce(p_payload ->> 'reason', 'sem motivo informado')
      where id = v_order.id;
    end if;
  elsif p_type = 'export.packed' then
    update public.sales_orders set wms_details = wms_details || jsonb_build_object('export', p_payload - 'atlas_sales_order_id')
    where id = v_order.id;
  end if;
end;
$$;

create or replace function public.fn_orion_apply_outbound_line_cancelled(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
  v_item public.sales_order_items;
  v_qty numeric := (p_payload ->> 'cancelled_qty')::numeric;
begin
  v_order := public.fn_orion_sales_order(p_company_id, p_payload ->> 'atlas_sales_order_id');
  select * into v_item from public.sales_order_items where id = (p_payload ->> 'atlas_line_id')::uuid and order_id = v_order.id for update;
  if not found then
    perform public.fn_orion_fail('linha ' || coalesce(p_payload ->> 'atlas_line_id', '') || ' não encontrada no pedido');
  end if;
  update public.sales_order_items
  set cancelled_quantity = cancelled_quantity + least(v_qty, greatest(ordered_quantity - shipped_quantity - cancelled_quantity, 0))
  where id = v_item.id;
  update public.sales_orders set wms_last_error = 'Armazém cancelou ' || v_qty || ' un. de uma linha: ' || coalesce(p_payload ->> 'reason', '')
  where id = v_order.id;
  perform public.fn_orion_recalc_sales_status(v_order.id);
end;
$$;

create or replace function public.fn_orion_apply_outbound_shipped(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
  v_line jsonb;
  v_lot jsonb;
  v_item public.sales_order_items;
  v_loc uuid;
  v_wh uuid;
  v_shipment uuid;
  v_qty numeric;
  v_lot_id uuid;
begin
  v_order := public.fn_orion_sales_order(p_company_id, p_payload ->> 'atlas_sales_order_id');
  v_wh := public.fn_orion_default_warehouse(p_company_id);
  v_loc := public.fn_orion_location(p_company_id, v_wh);

  insert into public.shipments (company_id, code, sales_order_id, customer_id, warehouse_id, status, shipped_at, notes,
    delivery_zip_code, delivery_state, delivery_city, delivery_address, delivery_address_number)
  values (p_company_id, left('ORION-' || coalesce(p_payload ->> 'shipment', p_event_id::text), 60), v_order.id, v_order.customer_id, v_wh, 'shipped',
    coalesce((p_payload ->> 'shipped_at')::timestamptz, now()),
    concat_ws(' · ', 'Expedido pelo ORION ' || coalesce(p_payload ->> 'code', ''), p_payload ->> 'carrier', p_payload ->> 'vehicle_plate'),
    v_order.delivery_zip_code, v_order.delivery_state, v_order.delivery_city, v_order.delivery_address, v_order.delivery_address_number)
  on conflict (company_id, code) do update set updated_at = now()
  returning id into v_shipment;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb)) loop
    v_qty := coalesce((v_line ->> 'shipped_qty')::numeric, 0);
    continue when v_qty <= 0;
    select * into v_item from public.sales_order_items where id = (v_line ->> 'atlas_line_id')::uuid and order_id = v_order.id for update;
    if not found then
      perform public.fn_orion_fail('linha ' || coalesce(v_line ->> 'atlas_line_id', '') || ' não encontrada no pedido');
    end if;
    if jsonb_array_length(coalesce(v_line -> 'lots', '[]'::jsonb)) = 0 then
      perform public.fn_orion_move(p_company_id, v_item.product_id, v_loc, 'ISSUE', v_qty, null, null,
        'SHIPMENT', v_shipment, p_event_id || ':' || v_item.id || ':-');
      insert into public.shipment_items (company_id, shipment_id, sales_order_item_id, product_id, location_id, quantity, unit)
      values (p_company_id, v_shipment, v_item.id, v_item.product_id, v_loc, v_qty, v_item.unit);
    else
      for v_lot in select * from jsonb_array_elements(v_line -> 'lots') loop
        v_lot_id := public.fn_orion_lot(p_company_id, v_item.product_id, v_lot ->> 'lot_code');
        perform public.fn_orion_move(p_company_id, v_item.product_id, v_loc, 'ISSUE', (v_lot ->> 'quantity')::numeric, v_lot_id, null,
          'SHIPMENT', v_shipment, p_event_id || ':' || v_item.id || ':' || coalesce(v_lot ->> 'lot_code', '-'));
        insert into public.shipment_items (company_id, shipment_id, sales_order_item_id, product_id, location_id, quantity, unit, lot_id)
        values (p_company_id, v_shipment, v_item.id, v_item.product_id, v_loc, (v_lot ->> 'quantity')::numeric, v_item.unit, v_lot_id);
      end loop;
    end if;
    update public.sales_order_items set shipped_quantity = shipped_quantity + v_qty where id = v_item.id;
  end loop;

  update public.sales_orders set wms_status = 'shipped', wms_last_error = null,
    fiscal_access_key = coalesce(fiscal_access_key, p_payload ->> 'access_key')
  where id = v_order.id;
  perform public.fn_orion_recalc_sales_status(v_order.id);
end;
$$;

create or replace function public.fn_orion_apply_receipt_completed(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_po public.purchase_orders;
  v_item jsonb;
  v_lot jsonb;
  v_poi public.purchase_order_items;
  v_receipt uuid;
  v_loc uuid;
  v_first boolean;
  v_lot_id uuid;
  v_qty numeric;
  v_unit_cost numeric;
  v_total_ordered numeric;
  v_total_received numeric;
begin
  select * into v_po from public.purchase_orders where id = (p_payload ->> 'atlas_purchase_order_id')::uuid and company_id = p_company_id for update;
  if not found then
    perform public.fn_orion_fail('pedido de compra ' || coalesce(p_payload ->> 'atlas_purchase_order_id', '') || ' não encontrado');
  end if;
  v_loc := public.fn_orion_location(p_company_id, null);

  insert into public.purchase_receipts (company_id, purchase_order_id, supplier_id, received_at, status, notes,
    document_type, document_number, access_key)
  values (p_company_id, v_po.id, v_po.supplier_id, coalesce((p_payload ->> 'completed_at')::timestamptz, now()), 'draft',
    'Recebido no ORION ' || coalesce(p_payload ->> 'code', ''),
    case when p_payload ? 'invoice_access_key' then 'NFE' end, p_payload ->> 'invoice_number', p_payload ->> 'invoice_access_key')
  returning id into v_receipt;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) loop
    select * into v_poi from public.purchase_order_items where id = (v_item ->> 'atlas_line_id')::uuid and order_id = v_po.id for update;
    if not found then
      perform public.fn_orion_fail('linha ' || coalesce(v_item ->> 'atlas_line_id', '') || ' não encontrada no pedido de compra');
    end if;
    v_unit_cost := round(v_poi.unit_price - case when v_poi.ordered_quantity > 0 then coalesce(v_poi.discount, 0) / v_poi.ordered_quantity else 0 end, 6);
    v_first := true;
    if jsonb_array_length(coalesce(v_item -> 'lots', '[]'::jsonb)) = 0 then
      v_item := v_item || jsonb_build_object('lots', jsonb_build_array(jsonb_build_object('lot_code', null, 'quantity', v_item -> 'accepted_qty')));
    end if;
    for v_lot in select * from jsonb_array_elements(v_item -> 'lots') loop
      v_qty := coalesce((v_lot ->> 'quantity')::numeric, 0);
      v_lot_id := public.fn_orion_lot(p_company_id, v_poi.product_id, v_lot ->> 'lot_code', (v_lot ->> 'expiration_date')::date);
      if v_qty > 0 or (v_first and coalesce((v_item ->> 'rejected_qty')::numeric, 0) > 0) then
        insert into public.purchase_receipt_items (company_id, receipt_id, purchase_order_item_id, product_id, quantity_received, unit,
          destination_location_id, lot_id, lot_number, expires_at, accepted_quantity, rejected_quantity, conference_status, divergence_type)
        values (p_company_id, v_receipt, v_poi.id, v_poi.product_id,
          v_qty + case when v_first then coalesce((v_item ->> 'rejected_qty')::numeric, 0) else 0 end,
          v_poi.unit, v_loc, v_lot_id, v_lot ->> 'lot_code', (v_lot ->> 'expiration_date')::date, v_qty,
          case when v_first then coalesce((v_item ->> 'rejected_qty')::numeric, 0) else 0 end,
          case when v_first and coalesce((v_item ->> 'rejected_qty')::numeric, 0) > 0 then 'divergent' else 'matched' end,
          case when v_first and coalesce((v_item ->> 'rejected_qty')::numeric, 0) > 0 then 'quality' else 'none' end);
      end if;
      if v_qty > 0 then
        perform public.fn_orion_move(p_company_id, v_poi.product_id, v_loc, 'RECEIPT', v_qty, v_lot_id, v_unit_cost,
          'PURCHASE_RECEIPT', v_receipt, p_event_id || ':' || v_poi.id || ':' || coalesce(v_lot ->> 'lot_code', '-'));
      end if;
      v_first := false;
    end loop;
    update public.purchase_order_items set received_quantity = received_quantity + coalesce((v_item ->> 'accepted_qty')::numeric, 0)
    where id = v_poi.id;
  end loop;

  -- Confirmar dispara contas a pagar e NF de entrada (0116/0119), como no fluxo do ATLAS.
  update public.purchase_receipts set status = 'confirmed' where id = v_receipt;

  select coalesce(sum(ordered_quantity - cancelled_quantity), 0), coalesce(sum(received_quantity), 0)
  into v_total_ordered, v_total_received from public.purchase_order_items where order_id = v_po.id;
  update public.purchase_orders set
    status = case when v_total_received >= v_total_ordered then 'received' else 'partially_received' end,
    wms_status = case when v_total_received >= v_total_ordered then 'received' else wms_status end
  where id = v_po.id;
end;
$$;

create or replace function public.fn_orion_apply_purchase_info(p_company_id uuid, p_event_id uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_po uuid;
begin
  select id into v_po from public.purchase_orders where id = (p_payload ->> 'atlas_purchase_order_id')::uuid and company_id = p_company_id;
  if v_po is null then
    perform public.fn_orion_fail('pedido de compra ' || coalesce(p_payload ->> 'atlas_purchase_order_id', '') || ' não encontrado');
  end if;
  if p_type = 'divergence.registered' then
    update public.purchase_orders set
      wms_details = jsonb_set(wms_details, '{divergences}', coalesce(wms_details -> 'divergences', '[]'::jsonb) || jsonb_build_array(p_payload - 'atlas_purchase_order_id')),
      wms_last_error = 'Divergência no recebimento: ' || coalesce(p_payload ->> 'kind', '') || ' (' || coalesce(p_payload ->> 'sku', '') || ')'
    where id = v_po;
    insert into public.audit_logs (company_id, actor_label, entity, entity_id, action, new_data)
    values (p_company_id, 'orion', 'purchase_orders', v_po, 'EVENT', jsonb_build_object('orion_event', p_type, 'event_id', p_event_id, 'payload', p_payload));
  else -- import.cleared
    update public.purchase_orders set wms_details = wms_details || jsonb_build_object('import', p_payload - 'atlas_purchase_order_id')
    where id = v_po;
    update public.purchase_receipts set notes = concat_ws(' · ', notes, 'Desembaraço ' || coalesce(p_payload #>> '{declaration,type}', '') || ' ' || coalesce(p_payload #>> '{declaration,number}', ''))
    where purchase_order_id = v_po and company_id = p_company_id;
  end if;
end;
$$;

create or replace function public.fn_orion_apply_customer_return(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item jsonb;
  v_product uuid;
  v_lot uuid;
  v_loc uuid := public.fn_orion_location(p_company_id, null);
  v_cost numeric;
  v_restock numeric;
  v_scrap numeric;
  v_so uuid := nullif(p_payload ->> 'atlas_sales_order_id', '')::uuid;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) loop
    v_product := public.fn_orion_product(p_company_id, (v_item ->> 'atlas_product_id')::uuid);
    v_lot := public.fn_orion_lot(p_company_id, v_product, v_item ->> 'lot_code');
    v_cost := public.fn_orion_avg_cost(p_company_id, v_product, v_loc);
    v_restock := coalesce((v_item ->> 'restocked_qty')::numeric, 0);
    v_scrap := coalesce((v_item ->> 'scrapped_qty')::numeric, 0);
    if v_restock > 0 then
      perform public.fn_orion_move(p_company_id, v_product, v_loc, 'RETURN_IN', v_restock, v_lot, v_cost,
        'CUSTOMER_RETURN', v_so, p_event_id || ':' || v_product || ':' || coalesce(v_item ->> 'lot_code', '-') || ':restock',
        'Devolução ' || coalesce(p_payload ->> 'code', ''));
    end if;
    if v_scrap > 0 then
      perform public.fn_orion_move(p_company_id, v_product, v_loc, 'RETURN_IN', v_scrap, v_lot, v_cost,
        'CUSTOMER_RETURN', v_so, p_event_id || ':' || v_product || ':' || coalesce(v_item ->> 'lot_code', '-') || ':scrap-in');
      perform public.fn_orion_move(p_company_id, v_product, v_loc, 'ADJUSTMENT_OUT', v_scrap, v_lot, null,
        'CUSTOMER_RETURN', v_so, p_event_id || ':' || v_product || ':' || coalesce(v_item ->> 'lot_code', '-') || ':scrap-out',
        'return_scrap');
    end if;
  end loop;
end;
$$;

create or replace function public.fn_orion_apply_adjustments(p_company_id uuid, p_event_id uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item jsonb;
  v_product uuid;
  v_lot uuid;
  v_loc uuid;
  v_delta numeric;
  v_adj uuid;
  v_reason text;
  v_items jsonb := coalesce(p_payload -> 'adjustments', p_payload -> 'items', '[]'::jsonb);
begin
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_product := public.fn_orion_product(p_company_id, (v_item ->> 'atlas_product_id')::uuid);
    v_loc := public.fn_orion_location_by_code(p_company_id, v_item ->> 'orion_warehouse_code');
    v_lot := public.fn_orion_lot(p_company_id, v_product, v_item ->> 'lot_code');
    v_delta := (v_item ->> 'delta')::numeric;
    v_reason := coalesce(v_item ->> 'reason', p_payload ->> 'reason', 'orion');
    continue when v_delta = 0;
    select id into v_adj from public.stock_adjustments where company_id = p_company_id and code = left('ORION-' || coalesce(p_payload ->> 'code', p_event_id::text) || '-' || (select code from public.warehouse_locations where id = v_loc), 60);
    if v_adj is null then
      insert into public.stock_adjustments (company_id, code, location_id, reason_code, notes, status, posted_at)
      values (p_company_id, left('ORION-' || coalesce(p_payload ->> 'code', p_event_id::text) || '-' || (select code from public.warehouse_locations where id = v_loc), 60),
        v_loc, v_reason, concat_ws(' · ', 'Ajuste do ORION ' || coalesce(p_payload ->> 'code', ''), p_payload ->> 'notes', p_payload ->> 'approved_by'), 'posted', now())
      returning id into v_adj;
    end if;
    insert into public.stock_adjustment_items (company_id, adjustment_id, product_id, lot_id, quantity_delta)
    values (p_company_id, v_adj, v_product, v_lot, v_delta);
    perform public.fn_orion_move(p_company_id, v_product, v_loc, case when v_delta > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
      abs(v_delta), v_lot, case when v_delta > 0 then public.fn_orion_avg_cost(p_company_id, v_product, v_loc) end,
      'STOCK_ADJUSTMENT', v_adj, p_event_id || ':' || v_product || ':' || coalesce(v_item ->> 'lot_code', '-') || ':' || coalesce(v_item ->> 'orion_warehouse_code', '-'),
      v_reason);
  end loop;
end;
$$;

create or replace function public.fn_orion_apply_stock_transferred(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from uuid := public.fn_orion_location_by_code(p_company_id, p_payload ->> 'from_orion_warehouse_code');
  v_to uuid := public.fn_orion_location_by_code(p_company_id, p_payload ->> 'to_orion_warehouse_code');
  v_item jsonb;
  v_product uuid;
  v_lot uuid;
  v_cost public.cost_movements;
  v_transfer uuid;
  v_key text;
begin
  if v_from = v_to then
    return; -- mesmo depósito ATLAS: nada fiscal a fazer
  end if;
  insert into public.stock_transfers (company_id, code, from_location_id, to_location_id, status, notes, shipped_at, received_at)
  values (p_company_id, left('ORION-' || coalesce(p_payload ->> 'code', p_event_id::text), 60), v_from, v_to, 'completed',
    'Transferência do ORION ' || coalesce(p_payload ->> 'code', ''), now(), now())
  returning id into v_transfer;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) loop
    v_product := public.fn_orion_product(p_company_id, (v_item ->> 'atlas_product_id')::uuid);
    v_lot := public.fn_orion_lot(p_company_id, v_product, v_item ->> 'lot_code');
    v_key := p_event_id || ':' || v_product || ':' || coalesce(v_item ->> 'lot_code', '-');
    v_cost := public.fn_orion_move(p_company_id, v_product, v_from, 'TRANSFER_OUT', (v_item ->> 'quantity')::numeric, v_lot, null,
      'STOCK_TRANSFER', v_transfer, v_key || ':out');
    perform public.fn_orion_move(p_company_id, v_product, v_to, 'TRANSFER_IN', (v_item ->> 'quantity')::numeric, v_lot, v_cost.unit_cost,
      'STOCK_TRANSFER', v_transfer, v_key || ':in');
    insert into public.stock_transfer_items (company_id, transfer_id, product_id, lot_id, quantity, unit_cost_snapshot)
    values (p_company_id, v_transfer, v_product, v_lot, (v_item ->> 'quantity')::numeric, v_cost.unit_cost);
  end loop;
end;
$$;

create or replace function public.fn_orion_production_order(p_company_id uuid, p_id text)
returns public.production_orders language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.production_orders;
begin
  select * into v from public.production_orders where id = p_id::uuid and company_id = p_company_id for update;
  if not found then
    perform public.fn_orion_fail('ordem de produção ' || coalesce(p_id, '') || ' não encontrada');
  end if;
  return v;
end;
$$;

create or replace function public.fn_orion_apply_production(p_company_id uuid, p_event_id uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_op public.production_orders;
  v_mat public.production_order_materials;
  v_item jsonb;
  v_items jsonb;
  v_loc uuid;
  v_lot uuid;
  v_qty numeric;
  v_cost public.cost_movements;
  v_unit_cost numeric;
begin
  v_op := public.fn_orion_production_order(p_company_id, p_payload ->> 'atlas_production_order_id');
  if p_type = 'production.output_received' then
    v_loc := public.fn_orion_location(p_company_id, coalesce(
      (select warehouse_id from public.orion_warehouse_map where company_id = p_company_id and warehouse_id = v_op.target_warehouse_id), null));
    v_qty := (p_payload ->> 'quantity')::numeric;
    v_lot := public.fn_orion_lot(p_company_id, v_op.product_id, p_payload ->> 'lot_code', (p_payload ->> 'expiration_date')::date);
    v_unit_cost := case when v_op.produced_quantity + v_qty > 0 then round(v_op.material_cost / (v_op.produced_quantity + v_qty), 6) else 0 end;
    perform public.fn_orion_move(p_company_id, v_op.product_id, v_loc, 'PRODUCTION_IN', v_qty, v_lot, v_unit_cost,
      'PRODUCTION_ORDER', v_op.id, p_event_id || ':output');
    update public.production_orders set produced_quantity = produced_quantity + v_qty,
      status = case when status in ('released','materials_reserved','planned') then 'in_progress' else status end,
      started_at = coalesce(started_at, now())
    where id = v_op.id;
    return;
  end if;

  v_loc := public.fn_orion_location(p_company_id, coalesce(
    (select warehouse_id from public.orion_warehouse_map where company_id = p_company_id and warehouse_id = v_op.source_warehouse_id), null));
  v_items := case when p_type = 'production.materials_delivered' then coalesce(p_payload -> 'items', '[]'::jsonb) else jsonb_build_array(p_payload) end;
  for v_item in select * from jsonb_array_elements(v_items) loop
    select * into v_mat from public.production_order_materials
    where id = (v_item ->> 'atlas_material_id')::uuid and production_order_id = v_op.id for update;
    if not found then
      perform public.fn_orion_fail('material ' || coalesce(v_item ->> 'atlas_material_id', '') || ' não encontrado na OP');
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_lot := public.fn_orion_lot(p_company_id, v_mat.component_product_id, v_item ->> 'lot_code');
    if p_type = 'production.materials_delivered' then
      v_cost := public.fn_orion_move(p_company_id, v_mat.component_product_id, v_loc, 'ISSUE', v_qty, v_lot, null,
        'PRODUCTION_ORDER', v_op.id, p_event_id || ':' || v_mat.id || ':' || coalesce(v_item ->> 'lot_code', '-'));
      update public.production_order_materials set
        reserved_quantity = greatest(reserved_quantity, consumed_quantity + v_qty + returned_quantity + scrapped_quantity),
        consumed_quantity = consumed_quantity + v_qty,
        consumed_cost = consumed_cost + coalesce(v_cost.total_cost, 0),
        status = case when consumed_quantity + v_qty >= planned_quantity then 'consumed' else 'partial' end
      where id = v_mat.id;
      update public.production_orders set material_cost = material_cost + coalesce(v_cost.total_cost, 0),
        status = case when status in ('released','materials_reserved','planned') then 'in_progress' else status end,
        started_at = coalesce(started_at, now())
      where id = v_op.id;
    else -- production.leftovers_returned
      v_unit_cost := case when v_mat.consumed_quantity > 0 then round(v_mat.consumed_cost / v_mat.consumed_quantity, 6) else 0 end;
      v_cost := public.fn_orion_move(p_company_id, v_mat.component_product_id, v_loc, 'RETURN_IN', v_qty, v_lot, v_unit_cost,
        'PRODUCTION_ORDER', v_op.id, p_event_id || ':' || v_mat.id || ':return');
      update public.production_order_materials set
        consumed_quantity = greatest(consumed_quantity - v_qty, 0),
        consumed_cost = greatest(consumed_cost - coalesce(v_cost.total_cost, 0), 0),
        status = 'partial'
      where id = v_mat.id;
      update public.production_orders set material_cost = greatest(material_cost - coalesce(v_cost.total_cost, 0), 0) where id = v_op.id;
    end if;
  end loop;
end;
$$;

create or replace function public.fn_orion_apply_document_rejected(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_table text := case p_payload ->> 'atlas_document_type' when 'sales_order' then 'sales_orders'
    when 'purchase_order' then 'purchase_orders' when 'production_order' then 'production_orders' end;
  v_msg text := coalesce(p_payload #>> '{error,message}', p_payload #>> '{error,code}', 'Documento recusado pelo armazém');
  v_n integer;
begin
  if v_table is null then
    return; -- cadastros recusados ficam só no inbox/painel
  end if;
  execute format('update public.%I set wms_status = ''rejected'', wms_last_error = $1 where id = $2 and company_id = $3', v_table)
    using v_msg, (p_payload ->> 'atlas_document_id')::uuid, p_company_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    perform public.fn_orion_fail('documento ' || coalesce(p_payload ->> 'atlas_document_id', '') || ' não encontrado');
  end if;
  insert into public.audit_logs (company_id, actor_label, entity, entity_id, action, new_data)
  values (p_company_id, 'orion', v_table, (p_payload ->> 'atlas_document_id')::uuid, 'REJECT',
    jsonb_build_object('orion_event', 'document.rejected', 'event_id', p_event_id, 'error', p_payload -> 'error', 'atlas_event_id', p_payload -> 'atlas_event_id'));
end;
$$;

-- Reconciliação de um snapshot completo (todas as partes recebidas).
create or replace function public.fn_orion_reconcile(p_company_id uuid, p_snapshot_id uuid)
returns public.orion_reconciliation_runs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_head public.orion_snapshot_chunks;
  v_run public.orion_reconciliation_runs;
  v_waiting boolean;
begin
  select * into v_head from public.orion_snapshot_chunks where company_id = p_company_id and snapshot_id = p_snapshot_id order by chunk limit 1;
  if (select count(*) from public.orion_snapshot_chunks where company_id = p_company_id and snapshot_id = p_snapshot_id) < v_head.chunks then
    return null;
  end if;
  v_waiting := v_head.as_of_event_id is not null and not exists (
    select 1 from public.integration_inbox where event_id = v_head.as_of_event_id and company_id = p_company_id and status in ('applied','ignored'));

  insert into public.orion_reconciliation_runs (company_id, snapshot_id, reason, taken_at, as_of_event_id, status)
  values (p_company_id, p_snapshot_id, v_head.reason, v_head.taken_at, v_head.as_of_event_id, case when v_waiting then 'waiting_events' else 'completed' end)
  on conflict (company_id, snapshot_id) do update set status = excluded.status, created_at = now()
  returning * into v_run;
  delete from public.orion_reconciliation_items where run_id = v_run.id;
  if v_waiting then
    return v_run;
  end if;

  insert into public.orion_reconciliation_items (run_id, company_id, product_id, lot_code, warehouse_id, atlas_qty, orion_qty, delta)
  select v_run.id, p_company_id, coalesce(o.product_id, a.product_id), coalesce(o.lot_code, a.lot_code), coalesce(o.warehouse_id, a.warehouse_id),
    coalesce(a.qty, 0), coalesce(o.qty, 0), coalesce(o.qty, 0) - coalesce(a.qty, 0)
  from (
    select (i ->> 'atlas_product_id')::uuid as product_id, nullif(i ->> 'lot_code', '') as lot_code, m.warehouse_id,
      sum((i ->> 'on_hand')::numeric) as qty
    from public.orion_snapshot_chunks c
    cross join lateral jsonb_array_elements(c.items) i
    join public.orion_warehouse_map m on m.company_id = c.company_id and m.orion_warehouse_code = i ->> 'orion_warehouse_code'
    where c.company_id = p_company_id and c.snapshot_id = p_snapshot_id
    group by 1, 2, 3
  ) o
  full join (
    select b.product_id, l.lot_number as lot_code, m.warehouse_id, sum(b.on_hand) as qty
    from public.stock_balances b
    join public.orion_warehouse_map m on m.company_id = b.company_id and m.integration_location_id = b.location_id
    left join public.product_lots l on l.id = b.lot_id
    where b.company_id = p_company_id and b.on_hand <> 0
    group by 1, 2, 3
  ) a on a.product_id = o.product_id and a.lot_code is not distinct from o.lot_code and a.warehouse_id = o.warehouse_id;

  update public.orion_reconciliation_runs set
    total_items = (select count(*) from public.orion_reconciliation_items where run_id = v_run.id),
    divergent_items = (select count(*) from public.orion_reconciliation_items where run_id = v_run.id and delta <> 0)
  where id = v_run.id returning * into v_run;

  if v_run.divergent_items = 0 and v_run.reason = 'initial_load' then
    update public.orion_integrations set status = 'active', updated_at = now() where company_id = p_company_id and status = 'activating';
  end if;
  return v_run;
end;
$$;

create or replace function public.fn_orion_apply_balance_snapshot(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.orion_snapshot_chunks (company_id, snapshot_id, chunk, chunks, reason, taken_at, as_of_event_id, items)
  values (p_company_id, (p_payload ->> 'snapshot_id')::uuid, coalesce((p_payload ->> 'chunk')::int, 1), coalesce((p_payload ->> 'chunks')::int, 1),
    p_payload ->> 'reason', (p_payload ->> 'taken_at')::timestamptz, nullif(p_payload ->> 'as_of_event_id', '')::uuid,
    coalesce(p_payload -> 'items', '[]'::jsonb))
  on conflict (company_id, snapshot_id, chunk) do update set items = excluded.items, received_at = now();
  perform public.fn_orion_reconcile(p_company_id, (p_payload ->> 'snapshot_id')::uuid);
end;
$$;

-- Reavalia reconciliações que esperavam eventos (chamada após cada evento aplicado).
create or replace function public.fn_orion_resume_reconciliations(p_company_id uuid, p_event_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select snapshot_id from public.orion_reconciliation_runs
           where company_id = p_company_id and status = 'waiting_events' and as_of_event_id = p_event_id loop
    perform public.fn_orion_reconcile(p_company_id, r.snapshot_id);
  end loop;
end;
$$;

-- ------------------------------------------------------------ entrada (inbox)
create or replace function public.fn_orion_dispatch(p_company_id uuid, p_event_id uuid, p_type text, p_payload jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  case p_type
    when 'outbound.accepted', 'outbound.picking_started', 'outbound.ready_to_invoice', 'outbound.cancelled', 'export.packed' then
      perform public.fn_orion_apply_outbound_status(p_company_id, p_event_id, p_type, p_payload);
    when 'outbound.line_cancelled' then perform public.fn_orion_apply_outbound_line_cancelled(p_company_id, p_event_id, p_payload);
    when 'outbound.shipped' then perform public.fn_orion_apply_outbound_shipped(p_company_id, p_event_id, p_payload);
    when 'document.rejected' then perform public.fn_orion_apply_document_rejected(p_company_id, p_event_id, p_payload);
    when 'receipt.completed' then perform public.fn_orion_apply_receipt_completed(p_company_id, p_event_id, p_payload);
    when 'divergence.registered', 'import.cleared' then perform public.fn_orion_apply_purchase_info(p_company_id, p_event_id, p_type, p_payload);
    when 'customer_return.completed' then perform public.fn_orion_apply_customer_return(p_company_id, p_event_id, p_payload);
    when 'inventory.approved', 'stock.adjusted' then perform public.fn_orion_apply_adjustments(p_company_id, p_event_id, p_type, p_payload);
    when 'stock.transferred' then perform public.fn_orion_apply_stock_transferred(p_company_id, p_event_id, p_payload);
    when 'production.materials_delivered', 'production.leftovers_returned', 'production.output_received' then
      perform public.fn_orion_apply_production(p_company_id, p_event_id, p_type, p_payload);
    when 'stock.balance_snapshot' then perform public.fn_orion_apply_balance_snapshot(p_company_id, p_event_id, p_payload);
    when 'dock.appointment_created' then return 'ignored';
    else return 'ignored';
  end case;
  return 'applied';
end;
$$;

-- Recebe um envelope já autenticado (HMAC verificado pelo servidor) da
-- empresa p_company_id. Devolve {http, body} no formato de §3.4.
create or replace function public.fn_orion_receive_event(p_company_id uuid, p_envelope jsonb, p_reprocess boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := (p_envelope ->> 'id')::uuid;
  v_type text := p_envelope ->> 'type';
  v_agg_type text := p_envelope #>> '{aggregate,type}';
  v_agg_id uuid := (p_envelope #>> '{aggregate,id}')::uuid;
  v_seq bigint := (p_envelope #>> '{aggregate,sequence}')::bigint;
  v_payload jsonb := coalesce(p_envelope -> 'payload', '{}'::jsonb);
  v_hash text := md5((p_envelope - 'attempt' - 'created_at')::text);
  v_existing public.integration_inbox;
  v_last bigint;
  v_result text;
  v_err text;
begin
  if (p_envelope ->> 'atlas_company_id')::uuid is distinct from p_company_id then
    return jsonb_build_object('http', 403, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
      'error', jsonb_build_object('code', 'company_mismatch', 'message', 'Envelope de outra empresa.', 'retryable', false)));
  end if;
  if public.fn_orion_integration_status(p_company_id) is null or public.fn_orion_integration_status(p_company_id) in ('pending','disabled') then
    return jsonb_build_object('http', 403, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
      'error', jsonb_build_object('code', 'company_not_linked', 'message', 'Empresa sem vínculo ativo com o ORION.', 'retryable', false)));
  end if;

  select * into v_existing from public.integration_inbox where event_id = v_id for update;
  if found then
    if v_existing.company_id <> p_company_id or (not p_reprocess and v_existing.envelope_hash is distinct from v_hash) then
      return jsonb_build_object('http', 400, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
        'error', jsonb_build_object('code', 'idempotency_conflict', 'message', 'Mesmo id com conteúdo diferente.', 'retryable', false)));
    end if;
    if v_existing.status in ('applied','ignored') then
      return jsonb_build_object('http', 200, 'body', jsonb_build_object('status', 'accepted', 'event_id', v_id, 'duplicate', true));
    end if;
  end if;

  -- Ordem por agregado (§3.5). O primeiro evento visto de um agregado é
  -- aceito com qualquer sequência (o ORION numera também eventos que não
  -- vêm ao ATLAS); depois disso, lacuna ⇒ out_of_order.
  if v_seq is not null then
    select max(aggregate_seq) into v_last from public.integration_inbox
    where company_id = p_company_id and aggregate_type = v_agg_type and aggregate_id = v_agg_id
      and status in ('applied','ignored') and event_id <> v_id;
    if v_last is not null and v_seq <= v_last then
      insert into public.integration_inbox (event_id, company_id, event_type, aggregate_type, aggregate_id, aggregate_seq, payload, envelope_hash, status, attempts, last_error, applied_at)
      values (v_id, p_company_id, v_type, v_agg_type, v_agg_id, v_seq, v_payload, v_hash, 'ignored', 1, 'obsoleto: sequência ' || v_seq || ' ≤ ' || v_last, now())
      on conflict (event_id) do update set status = 'ignored', last_error = excluded.last_error, applied_at = now();
      return jsonb_build_object('http', 200, 'body', jsonb_build_object('status', 'accepted', 'event_id', v_id, 'duplicate', true));
    end if;
    if v_last is not null and v_seq > v_last + 1 and v_type not in ('stock.balance_snapshot') then
      return jsonb_build_object('http', 409, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
        'error', jsonb_build_object('code', 'out_of_order', 'message', 'Evento fora de ordem para o agregado.', 'retryable', true,
          'expected_sequence', v_last + 1)));
    end if;
  end if;

  insert into public.integration_inbox (event_id, company_id, event_type, aggregate_type, aggregate_id, aggregate_seq, payload, envelope_hash, status, attempts)
  values (v_id, p_company_id, v_type, v_agg_type, v_agg_id, v_seq, v_payload, v_hash, 'received', 1)
  on conflict (event_id) do update set attempts = public.integration_inbox.attempts + 1, status = 'received';

  begin
    perform set_config('app.orion_apply', 'on', true);
    v_result := public.fn_orion_dispatch(p_company_id, v_id, v_type, v_payload);
    perform set_config('app.orion_apply', '', true);
  exception when others then
    perform set_config('app.orion_apply', '', true);
    v_err := sqlerrm;
    update public.integration_inbox set status = 'failed', last_error = left(v_err, 2000) where event_id = v_id;
    insert into public.audit_logs (company_id, actor_label, entity, entity_id, action, new_data)
    values (p_company_id, 'orion.event_failed', 'integration_inbox', v_id, 'FAIL', jsonb_build_object('type', v_type, 'error', left(v_err, 500)));
    return jsonb_build_object('http', 422, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
      'error', jsonb_build_object('code', 'unknown_reference',
        'message', regexp_replace(left(v_err, 500), '^ORION_UNKNOWN_REFERENCE: ', ''), 'retryable', false)));
  end;

  update public.integration_inbox set status = v_result, applied_at = now(), last_error = null where event_id = v_id;
  update public.orion_integrations set last_inbound_success_at = now() where company_id = p_company_id;
  perform public.fn_orion_resume_reconciliations(p_company_id, v_id);
  if v_result = 'ignored' then
    return jsonb_build_object('http', 200, 'body', jsonb_build_object('status', 'ignored', 'event_id', v_id, 'duplicate', false));
  end if;
  return jsonb_build_object('http', 202, 'body', jsonb_build_object('status', 'accepted', 'event_id', v_id, 'duplicate', false));
end;
$$;
revoke all on function public.fn_orion_receive_event(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.fn_orion_receive_event(uuid, jsonb, boolean) to service_role;

-- Painel: reaplicar um evento de entrada que falhou.
create or replace function public.fn_orion_inbox_reprocess(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.integration_inbox;
begin
  select * into v_row from public.integration_inbox where event_id = p_event_id;
  if not found then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_row.company_id, 'orion.integration.manage') then
    raise exception 'Permissão negada (orion.integration.manage).' using errcode = '42501';
  end if;
  if v_row.status <> 'failed' then
    raise exception 'Só eventos com falha podem ser reprocessados.' using errcode = 'P0001';
  end if;
  return public.fn_orion_receive_event(v_row.company_id, jsonb_build_object(
    'id', v_row.event_id, 'type', v_row.event_type, 'atlas_company_id', v_row.company_id,
    'aggregate', jsonb_build_object('type', v_row.aggregate_type, 'id', v_row.aggregate_id, 'sequence', v_row.aggregate_seq),
    'payload', v_row.payload), true);
end;
$$;
grant execute on function public.fn_orion_inbox_reprocess(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ carga inicial (§5.3)
create or replace function public.fn_orion_initial_snapshot(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_int public.orion_integrations;
  m record;
  b record;
  v_snapshot uuid;
  v_items jsonb;
  v_chunk integer;
  v_chunks integer;
  v_total integer;
  v_cost public.cost_movements;
  v_sent integer := 0;
begin
  if not public.has_permission(p_company_id, 'orion.integration.manage') then
    raise exception 'Permissão negada (orion.integration.manage).' using errcode = '42501';
  end if;
  select * into v_int from public.orion_integrations where company_id = p_company_id for update;
  if not found or v_int.status <> 'activating' then
    raise exception 'A carga inicial só é feita com a integração em ativação.' using errcode = 'P0001';
  end if;
  if v_int.cutover_at is not null then
    raise exception 'A carga inicial já foi feita em %.', v_int.cutover_at using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.orion_warehouse_map where company_id = p_company_id) then
    raise exception 'Mapeie ao menos um depósito antes da carga inicial.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.orion_user_access where company_id = p_company_id and status = 'active' and orion_role = 'admin') then
    raise exception 'Libere ao menos um administrador do ORION antes da carga inicial.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.integration_outbox where company_id = p_company_id and status in ('pending','failed')) then
    raise exception 'A carga de cadastros ainda não terminou sem erros (há eventos pendentes ou falhos).' using errcode = 'P0001';
  end if;

  perform set_config('app.orion_apply', 'on', true);
  -- Transfere o saldo de todos os locais de cada depósito para ORION-<depósito>.
  for m in select * from public.orion_warehouse_map where company_id = p_company_id loop
    for b in
      select sb.* from public.stock_balances sb
      join public.warehouse_locations wl on wl.id = sb.location_id
      where sb.company_id = p_company_id and wl.warehouse_id = m.warehouse_id and sb.location_id <> m.integration_location_id and sb.on_hand > 0
    loop
      if b.reserved > 0 then
        perform public.fn_post_stock_movement(p_company_id => p_company_id, p_product_id => b.product_id, p_location_id => b.location_id,
          p_movement_type => 'RELEASE', p_quantity => b.reserved, p_lot_id => b.lot_id, p_reference_type => 'orion_cutover',
          p_idempotency_key => 'orion_cutover:release:' || b.id);
      end if;
      v_cost := public.fn_orion_move(p_company_id, b.product_id, b.location_id, 'TRANSFER_OUT', b.on_hand, b.lot_id, null,
        'orion_cutover', p_company_id, 'orion_cutover:out:' || b.id);
      perform public.fn_orion_move(p_company_id, b.product_id, m.integration_location_id, 'TRANSFER_IN', b.on_hand, b.lot_id, v_cost.unit_cost,
        'orion_cutover', p_company_id, 'orion_cutover:in:' || b.id);
    end loop;
  end loop;
  perform set_config('app.orion_apply', '', true);
  update public.orion_integrations set cutover_at = now(), updated_at = now() where company_id = p_company_id;

  -- stock.initial_snapshot por depósito, em partes de até 1000 itens.
  for m in select om.*, w.code as wh_code from public.orion_warehouse_map om join public.warehouses w on w.id = om.warehouse_id
           where om.company_id = p_company_id order by om.orion_warehouse_code loop
    v_snapshot := gen_random_uuid();
    select count(*) into v_total from public.stock_balances where company_id = p_company_id and location_id = m.integration_location_id and on_hand > 0;
    v_chunks := greatest(ceil(v_total / 1000.0)::int, 1);
    for v_chunk in 1..v_chunks loop
      select coalesce(jsonb_agg(jsonb_build_object('atlas_product_id', x.product_id, 'product_code', x.code, 'lot_code', x.lot_number,
          'expiration_date', x.expires_at, 'quantity', x.on_hand, 'unit_cost', x.avg_cost) order by x.code, x.lot_number), '[]'::jsonb)
      into v_items
      from (
        select sb.product_id, p.code, l.lot_number, l.expires_at, sb.on_hand,
          public.fn_orion_avg_cost(p_company_id, sb.product_id, m.integration_location_id) as avg_cost
        from public.stock_balances sb join public.products p on p.id = sb.product_id
        left join public.product_lots l on l.id = sb.lot_id
        where sb.company_id = p_company_id and sb.location_id = m.integration_location_id and sb.on_hand > 0
        order by p.code, l.lot_number nulls first, sb.id
        offset (v_chunk - 1) * 1000 limit 1000
      ) x;
      perform public.fn_orion_enqueue(p_company_id, 'stock.initial_snapshot', 'stock_snapshot', v_snapshot, jsonb_build_object(
        'snapshot_id', v_snapshot, 'taken_at', public.fn_orion_iso(now()), 'chunk', v_chunk, 'chunks', v_chunks,
        'atlas_warehouse_id', m.warehouse_id, 'receiving_location', m.orion_warehouse_code || '/REC', 'items', v_items));
      v_sent := v_sent + 1;
    end loop;
  end loop;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, new_data)
  values (p_company_id, public.current_app_user_id(), 'orion.initial_snapshot', 'orion_integrations', p_company_id, 'EXPORT',
    jsonb_build_object('messages', v_sent));
  return jsonb_build_object('messages', v_sent, 'cutover_at', public.fn_orion_iso(now()));
end;
$$;
grant execute on function public.fn_orion_initial_snapshot(uuid) to authenticated, service_role;

-- Documento no ATLAS (GET /documents/{type}/{id}, §3.6).
create or replace function public.fn_orion_document_state(p_company_id uuid, p_type text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_type = 'sales_order' then
    select jsonb_build_object('atlas_document_type', p_type, 'atlas_id', id, 'number', code, 'status', status, 'wms_status', wms_status,
      'wms_last_error', wms_last_error, 'lines', public.fn_orion_sales_order_lines(id)) into v
    from public.sales_orders where id = p_id and company_id = p_company_id;
  elsif p_type = 'purchase_order' then
    select jsonb_build_object('atlas_document_type', p_type, 'atlas_id', id, 'number', code, 'status', status, 'wms_status', wms_status,
      'wms_last_error', wms_last_error) into v
    from public.purchase_orders where id = p_id and company_id = p_company_id;
  elsif p_type = 'production_order' then
    select jsonb_build_object('atlas_document_type', p_type, 'atlas_id', id, 'number', code, 'status', status, 'wms_status', wms_status,
      'wms_last_error', wms_last_error) into v
    from public.production_orders where id = p_id and company_id = p_company_id;
  end if;
  return v;
end;
$$;
revoke all on function public.fn_orion_document_state(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_orion_document_state(uuid, text, uuid) to service_role;

-- Internas: nunca chamáveis por usuários.
do $$
declare f text;
begin
  foreach f in array array[
    'fn_orion_fail(text)', 'fn_orion_location(uuid,uuid)', 'fn_orion_location_by_code(uuid,text)', 'fn_orion_product(uuid,uuid)',
    'fn_orion_lot(uuid,uuid,text,date)', 'fn_orion_move(uuid,uuid,uuid,text,numeric,uuid,numeric,text,uuid,text,text)',
    'fn_orion_avg_cost(uuid,uuid,uuid)', 'fn_orion_sales_order(uuid,text)', 'fn_orion_recalc_sales_status(uuid)',
    'fn_orion_apply_outbound_status(uuid,uuid,text,jsonb)', 'fn_orion_apply_outbound_line_cancelled(uuid,uuid,jsonb)',
    'fn_orion_apply_outbound_shipped(uuid,uuid,jsonb)', 'fn_orion_apply_receipt_completed(uuid,uuid,jsonb)',
    'fn_orion_apply_purchase_info(uuid,uuid,text,jsonb)', 'fn_orion_apply_customer_return(uuid,uuid,jsonb)',
    'fn_orion_apply_adjustments(uuid,uuid,text,jsonb)', 'fn_orion_apply_stock_transferred(uuid,uuid,jsonb)',
    'fn_orion_production_order(uuid,text)', 'fn_orion_apply_production(uuid,uuid,text,jsonb)',
    'fn_orion_apply_document_rejected(uuid,uuid,jsonb)', 'fn_orion_reconcile(uuid,uuid)',
    'fn_orion_apply_balance_snapshot(uuid,uuid,jsonb)', 'fn_orion_resume_reconciliations(uuid,uuid)',
    'fn_orion_dispatch(uuid,uuid,text,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
