-- Fase 10 — Custos: integrações com Compras, Logística, Estoque
-- (transferência/ajuste/contagem) e Produção.
--
-- Nenhuma função de negócio aqui passa a chamar fn_post_stock_movement
-- de forma diferente do que já fazia — só passam a também chamar
-- public.fn_register_cost_movement (0043) logo depois, com o
-- stock_movement recém-postado. create or replace nunca edita as
-- migrations originais (0010/0012/0018/0024/0029).

alter table public.stock_transfer_items add column if not exists unit_cost_snapshot numeric(14, 6);
comment on column public.stock_transfer_items.unit_cost_snapshot is
  'Custo médio do produto na origem no momento da expedição (fn_ship_transfer) — usado como o custo de entrada no destino (fn_receive_transfer), garantindo que a transferência não gera lucro/perda (seção 7).';

alter table public.production_order_materials add column if not exists consumed_cost numeric(18, 4) not null default 0;
comment on column public.production_order_materials.consumed_cost is
  'Custo acumulado do que já foi efetivamente consumido desta linha (soma de cost_movements.total_cost dos ISSUE gerados por fn_consume_production_material) — nunca decrementado.';

alter table public.production_orders add column if not exists material_cost numeric(18, 4) not null default 0;
comment on column public.production_orders.material_cost is
  'Custo total de matéria-prima consumida na ordem até o momento (soma de production_order_materials.consumed_cost) — base do custo do produto acabado (seção 9/10). Trabalho/máquina/energia/rateio indireto NÃO são calculados nesta etapa (sem infraestrutura própria) — extensibilidade preparada, não inventada.';

-- ==================================================================
-- fn_confirm_purchase_receipt — create or replace (0018): após cada
-- RECEIPT, registra o custo de aquisição (seção 6 — derivado do
-- RECEBIMENTO confirmado, nunca do pedido isolado) via
-- fn_register_cost_movement, usando o unit_price do item do pedido
-- (mesmo valor já usado como p_unit_cost do movimento de estoque).
-- ==================================================================
create or replace function public.fn_confirm_purchase_receipt(
  p_receipt_id uuid,
  p_idempotency_key text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
  v_order public.purchase_orders;
  v_item record;
  v_order_item public.purchase_order_items;
  v_remaining numeric;
  v_product public.products;
  v_lot_id uuid;
  v_serial text;
  v_serial_count integer;
  v_total_ordered numeric;
  v_total_received numeric;
  v_total_cancelled numeric;
  v_new_status text;
  v_movement public.stock_movements;
begin
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receipt.company_id, 'purchase_receipts.confirm') then
    raise exception 'Permissão negada (purchase_receipts.confirm).' using errcode = '42501';
  end if;

  if v_receipt.status <> 'draft' then
    raise exception 'Só é possível confirmar um recebimento em rascunho (status atual: %).', v_receipt.status using errcode = 'P0001';
  end if;

  select * into v_order from public.purchase_orders where id = v_receipt.purchase_order_id for update;
  if v_order.status in ('cancelled', 'closed') then
    raise exception 'Pedido no status % não pode mais receber.', v_order.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.purchase_receipt_items where receipt_id = p_receipt_id
  loop
    select * into v_order_item from public.purchase_order_items where id = v_item.purchase_order_item_id for update;

    v_remaining := v_order_item.ordered_quantity - v_order_item.received_quantity - v_order_item.cancelled_quantity;
    if v_item.accepted_quantity > v_remaining then
      raise exception 'Item %: quantidade aceita (%) excede o saldo pendente do pedido (%).', v_item.product_id, v_item.accepted_quantity, v_remaining using errcode = 'P0001';
    end if;

    if v_item.accepted_quantity > 0 then
      select * into v_product from public.products where id = v_item.product_id;

      v_lot_id := v_item.lot_id;
      if v_lot_id is null and v_product.batch_controlled and v_item.lot_number is not null then
        insert into public.product_lots (company_id, product_id, lot_number, expires_at)
        values (v_receipt.company_id, v_item.product_id, v_item.lot_number, v_item.expires_at)
        on conflict (company_id, product_id, lot_number)
        do update set expires_at = coalesce(excluded.expires_at, public.product_lots.expires_at)
        returning id into v_lot_id;
      end if;

      if v_product.serial_controlled then
        v_serial_count := coalesce(jsonb_array_length(v_item.serial_numbers), 0);
        if v_serial_count <> v_item.accepted_quantity::integer then
          raise exception 'Item %: produto controla número de série — informe exatamente % série(s) para a quantidade aceita (recebido %).', v_item.product_id, v_item.accepted_quantity::integer, v_serial_count using errcode = 'P0001';
        end if;
      end if;

      v_movement := public.fn_post_stock_movement(
        p_company_id => v_receipt.company_id,
        p_product_id => v_item.product_id,
        p_location_id => v_item.destination_location_id,
        p_movement_type => 'RECEIPT',
        p_quantity => v_item.accepted_quantity,
        p_lot_id => v_lot_id,
        p_unit_cost => v_order_item.unit_price,
        p_reference_type => 'PURCHASE_RECEIPT',
        p_reference_id => v_receipt.id,
        p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':' || v_item.id::text else null end,
        p_created_by => public.current_app_user_id()
      );

      perform public.fn_register_cost_movement(
        p_stock_movement_id => v_movement.id,
        p_unit_cost => v_order_item.unit_price,
        p_source_type => 'purchase_receipt_item',
        p_source_id => v_item.id
      );

      if v_product.serial_controlled then
        for v_serial in select value from jsonb_array_elements_text(v_item.serial_numbers) as s(value)
        loop
          insert into public.product_serial_numbers (company_id, product_id, serial_number, status, current_location_id)
          values (v_receipt.company_id, v_item.product_id, v_serial, 'in_stock', v_item.destination_location_id);
        end loop;
      end if;

      update public.purchase_order_items
      set received_quantity = received_quantity + v_item.accepted_quantity
      where id = v_order_item.id;
    end if;
  end loop;

  select coalesce(sum(ordered_quantity), 0), coalesce(sum(received_quantity), 0), coalesce(sum(cancelled_quantity), 0)
  into v_total_ordered, v_total_received, v_total_cancelled
  from public.purchase_order_items where order_id = v_order.id;

  if v_total_received + v_total_cancelled >= v_total_ordered then
    v_new_status := 'received';
  else
    v_new_status := 'partially_received';
  end if;

  update public.purchase_orders set status = v_new_status where id = v_order.id;

  if v_order.purchase_request_id is not null then
    perform public.fn_sync_purchase_request_status(v_order.purchase_request_id);
  end if;

  update public.purchase_receipts set status = 'confirmed' where id = p_receipt_id
  returning * into v_receipt;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receipt.company_id, public.current_app_user_id(), 'system', 'purchase_receipts', v_receipt.id, 'CONFIRM',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'confirmed', 'purchase_order_status', v_new_status));

  return v_receipt;
end;
$$;

-- ==================================================================
-- fn_ship_shipment — create or replace (0024): após o ISSUE de cada
-- item (a saída de venda, seção 8), registra o custo — quantidade ×
-- custo médio ATUAL vira o custo da mercadoria vendida (COGS). RELEASE
-- não gera custo (não altera valor, só a reserva).
-- ==================================================================
create or replace function public.fn_ship_shipment(
  p_shipment_id uuid,
  p_idempotency_key text default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_order public.sales_orders;
  v_item record;
  v_order_item public.sales_order_items;
  v_available_to_ship numeric;
  v_total_ordered numeric;
  v_total_shipped numeric;
  v_total_cancelled numeric;
  v_new_status text;
  v_movement public.stock_movements;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.ship') then
    raise exception 'Permissão negada (shipments.ship).' using errcode = '42501';
  end if;

  if v_shipment.status <> 'ready_to_ship' then
    raise exception 'Só é possível expedir uma expedição pronta para envio (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  select * into v_order from public.sales_orders where id = v_shipment.sales_order_id for update;
  if v_order.status in ('cancelled', 'completed') then
    raise exception 'Pedido no status % não pode ser expedido.', v_order.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.shipment_items where shipment_id = p_shipment_id
  loop
    select * into v_order_item from public.sales_order_items where id = v_item.sales_order_item_id for update;

    v_available_to_ship := v_order_item.reserved_quantity - v_order_item.shipped_quantity;
    if v_item.quantity > v_available_to_ship then
      raise exception 'Item %: quantidade a expedir (%) excede o saldo reservado disponível (%).', v_item.product_id, v_item.quantity, v_available_to_ship using errcode = 'P0001';
    end if;

    v_movement := public.fn_post_stock_movement(
      p_company_id => v_shipment.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_item.location_id,
      p_movement_type => 'ISSUE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'SHIPMENT',
      p_reference_id => v_shipment.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':issue:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_source_type => 'shipment_item',
      p_source_id => v_item.id
    );

    perform public.fn_post_stock_movement(
      p_company_id => v_shipment.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_item.location_id,
      p_movement_type => 'RELEASE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'SHIPMENT',
      p_reference_id => v_shipment.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':release:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    update public.sales_order_items set shipped_quantity = shipped_quantity + v_item.quantity where id = v_order_item.id;

    if v_item.serial_numbers is not null and jsonb_array_length(v_item.serial_numbers) > 0 then
      update public.product_serial_numbers
      set status = 'shipped', current_location_id = null
      where company_id = v_shipment.company_id and product_id = v_item.product_id
        and serial_number in (select jsonb_array_elements_text(v_item.serial_numbers));
    end if;
  end loop;

  select coalesce(sum(ordered_quantity), 0), coalesce(sum(shipped_quantity), 0), coalesce(sum(cancelled_quantity), 0)
  into v_total_ordered, v_total_shipped, v_total_cancelled
  from public.sales_order_items where order_id = v_order.id;

  v_new_status := case when v_total_shipped + v_total_cancelled >= v_total_ordered then 'shipped' else 'partially_shipped' end;
  update public.sales_orders set status = v_new_status where id = v_order.id;

  update public.shipments set status = 'shipped', shipped_at = now() where id = p_shipment_id
  returning * into v_shipment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id, 'SHIP',
    jsonb_build_object('status', 'ready_to_ship'), jsonb_build_object('status', 'shipped', 'sales_order_status', v_new_status));

  return v_shipment;
end;
$$;

-- ==================================================================
-- fn_ship_transfer / fn_receive_transfer — create or replace (0010):
-- a saída na origem grava o custo médio vigente lá (COGS interno) E
-- fotografa esse custo em stock_transfer_items.unit_cost_snapshot; a
-- entrada no destino usa exatamente esse valor fotografado como custo
-- de entrada — a transferência nunca cria lucro nem perda (seção 7).
-- ==================================================================
create or replace function public.fn_ship_transfer(
  p_transfer_id uuid,
  p_idempotency_key text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.stock_transfers;
  v_item record;
  v_movement public.stock_movements;
  v_cost public.cost_movements;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_transfer.company_id, 'stock.transfer') then
    raise exception 'Permissão negada (stock.transfer).' using errcode = '42501';
  end if;

  if v_transfer.status <> 'draft' then
    raise exception 'Só é possível expedir uma transferência em rascunho (status atual: %).', v_transfer.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    v_movement := public.fn_post_stock_movement(
      p_company_id => v_transfer.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_transfer.from_location_id,
      p_movement_type => 'TRANSFER_OUT',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_transfer',
      p_reference_id => v_transfer.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':out:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    v_cost := public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_source_type => 'stock_transfer_item',
      p_source_id => v_item.id
    );

    update public.stock_transfer_items
    set unit_cost_snapshot = coalesce(v_cost.unit_cost, unit_cost_snapshot, 0)
    where id = v_item.id;
  end loop;

  update public.stock_transfers
  set status = 'in_transit', shipped_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_transfer.company_id, public.current_app_user_id(), 'system',
    'stock_transfers', v_transfer.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'in_transit')
  );

  return v_transfer;
end;
$$;

create or replace function public.fn_receive_transfer(
  p_transfer_id uuid,
  p_idempotency_key text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.stock_transfers;
  v_item public.stock_transfer_items;
  v_movement public.stock_movements;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_transfer.company_id, 'stock.transfer') then
    raise exception 'Permissão negada (stock.transfer).' using errcode = '42501';
  end if;

  if v_transfer.status <> 'in_transit' then
    raise exception 'Só é possível receber uma transferência em trânsito (status atual: %).', v_transfer.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    v_movement := public.fn_post_stock_movement(
      p_company_id => v_transfer.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_transfer.to_location_id,
      p_movement_type => 'TRANSFER_IN',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_transfer',
      p_reference_id => v_transfer.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':in:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_unit_cost => coalesce(v_item.unit_cost_snapshot, 0),
      p_source_type => 'stock_transfer_item',
      p_source_id => v_item.id
    );
  end loop;

  update public.stock_transfers
  set status = 'completed', received_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_transfer.company_id, public.current_app_user_id(), 'system',
    'stock_transfers', v_transfer.id, 'UPDATE',
    jsonb_build_object('status', 'in_transit'), jsonb_build_object('status', 'completed')
  );

  return v_transfer;
end;
$$;

-- ==================================================================
-- fn_post_adjustment / fn_close_count — create or replace (0012):
-- ajustes/contagens passam a ter consequência econômica quando o valor
-- é informado (seção 12) — ADJUSTMENT_IN usa stock_adjustment_items.unit_cost
-- quando informado (senão o custo médio atual, sem alterar valorização);
-- ADJUSTMENT_OUT sempre usa o custo médio atual (COGS de ajuste).
-- ==================================================================
create or replace function public.fn_post_adjustment(
  p_adjustment_id uuid,
  p_idempotency_key text default null
)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment public.stock_adjustments;
  v_item record;
  v_movement public.stock_movements;
begin
  select * into v_adjustment from public.stock_adjustments where id = p_adjustment_id;
  if not found then
    raise exception 'Ajuste não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_adjustment.company_id, 'stock.approve') then
    raise exception 'Permissão negada (stock.approve).' using errcode = '42501';
  end if;

  if v_adjustment.status <> 'draft' then
    raise exception 'Só é possível efetivar um ajuste em rascunho (status atual: %).', v_adjustment.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_adjustment_items where adjustment_id = p_adjustment_id
  loop
    v_movement := public.fn_post_stock_movement(
      p_company_id => v_adjustment.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_adjustment.location_id,
      p_movement_type => case when v_item.quantity_delta > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
      p_quantity => abs(v_item.quantity_delta),
      p_lot_id => v_item.lot_id,
      p_unit_cost => v_item.unit_cost,
      p_reference_type => 'stock_adjustment',
      p_reference_id => v_adjustment.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_unit_cost => v_item.unit_cost,
      p_source_type => 'stock_adjustment_item',
      p_source_id => v_item.id
    );
  end loop;

  update public.stock_adjustments
  set status = 'posted', posted_by = public.current_app_user_id(), posted_at = now()
  where id = p_adjustment_id
  returning * into v_adjustment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_adjustment.company_id, public.current_app_user_id(), 'system',
    'stock_adjustments', v_adjustment.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'posted')
  );

  return v_adjustment;
end;
$$;

create or replace function public.fn_close_count(p_count_id uuid)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count public.stock_counts;
  v_item record;
  v_movement public.stock_movements;
begin
  select * into v_count from public.stock_counts where id = p_count_id;
  if not found then
    raise exception 'Contagem não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_count.company_id, 'stock.approve') then
    raise exception 'Permissão negada (stock.approve).' using errcode = '42501';
  end if;

  if v_count.status <> 'counting' then
    raise exception 'Só é possível fechar uma contagem aberta (status atual: %).', v_count.status using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.stock_count_items
    where count_id = p_count_id and status = 'counted' and variance is distinct from 0
  loop
    v_movement := public.fn_post_stock_movement(
      p_company_id => v_count.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_item.location_id,
      p_movement_type => case when v_item.variance > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
      p_quantity => abs(v_item.variance),
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_count',
      p_reference_id => v_count.id,
      p_idempotency_key => 'count:close:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_source_type => 'stock_count_item',
      p_source_id => v_item.id
    );
  end loop;

  update public.stock_counts
  set status = 'closed', closed_by = public.current_app_user_id(), closed_at = now()
  where id = p_count_id
  returning * into v_count;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_count.company_id, public.current_app_user_id(), 'system',
    'stock_counts', v_count.id, 'UPDATE',
    jsonb_build_object('status', 'counting'), jsonb_build_object('status', 'closed')
  );

  return v_count;
end;
$$;

-- ==================================================================
-- fn_consume_production_material — create or replace (0029): o ISSUE
-- de consumo passa a gerar custo (seção 9 — base do custo do produto
-- acabado), acumulado em production_order_materials.consumed_cost e em
-- production_orders.material_cost. RELEASE (a segunda chamada, sempre
-- pela mesma quantidade) não gera custo.
-- ==================================================================
create or replace function public.fn_consume_production_material(
  p_production_order_material_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_serial_numbers jsonb default null,
  p_idempotency_key text default null
)
returns public.production_order_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_material public.production_order_materials;
  v_order public.production_orders;
  v_available_to_consume numeric;
  v_existing public.stock_movements;
  v_movement public.stock_movements;
  v_cost public.cost_movements;
  v_cost_amount numeric := 0;
begin
  select * into v_material from public.production_order_materials where id = p_production_order_material_id for update;
  if not found then
    raise exception 'Material da ordem de produção não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_order from public.production_orders where id = v_material.production_order_id for update;

  if not public.has_permission(v_order.company_id, 'production_materials.consume') then
    raise exception 'Permissão negada (production_materials.consume).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key || ':issue';
    if found then
      return v_material;
    end if;
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível consumir material de uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade consumida deve ser maior que zero.' using errcode = '22023';
  end if;

  v_available_to_consume := v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity;
  if p_quantity > v_available_to_consume then
    raise exception 'Quantidade a consumir (%) excede o saldo reservado e ainda não utilizado deste material (%).', p_quantity, v_available_to_consume using errcode = 'P0001';
  end if;

  v_movement := public.fn_post_stock_movement(
    p_company_id => v_order.company_id,
    p_product_id => v_material.component_product_id,
    p_location_id => v_order.consumption_location_id,
    p_movement_type => 'ISSUE',
    p_quantity => p_quantity,
    p_lot_id => coalesce(p_lot_id, v_material.lot_id),
    p_reference_type => 'PRODUCTION_ORDER',
    p_reference_id => v_order.id,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':issue' else null end,
    p_created_by => public.current_app_user_id()
  );

  v_cost := public.fn_register_cost_movement(
    p_stock_movement_id => v_movement.id,
    p_source_type => 'production_order',
    p_source_id => v_order.id
  );
  v_cost_amount := coalesce(v_cost.total_cost, 0);

  perform public.fn_post_stock_movement(
    p_company_id => v_order.company_id,
    p_product_id => v_material.component_product_id,
    p_location_id => v_order.consumption_location_id,
    p_movement_type => 'RELEASE',
    p_quantity => p_quantity,
    p_lot_id => coalesce(p_lot_id, v_material.lot_id),
    p_reference_type => 'PRODUCTION_ORDER',
    p_reference_id => v_order.id,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':release' else null end,
    p_created_by => public.current_app_user_id()
  );

  update public.production_order_materials
  set consumed_quantity = consumed_quantity + p_quantity,
      consumed_cost = consumed_cost + v_cost_amount,
      lot_id = coalesce(p_lot_id, lot_id),
      serial_numbers = coalesce(serial_numbers, '[]'::jsonb) || coalesce(p_serial_numbers, '[]'::jsonb),
      status = case
        when consumed_quantity + p_quantity + returned_quantity + scrapped_quantity >= reserved_quantity then 'consumed'
        else status
      end
  where id = p_production_order_material_id
  returning * into v_material;

  update public.production_orders set material_cost = material_cost + v_cost_amount where id = v_order.id;

  if p_serial_numbers is not null and jsonb_array_length(p_serial_numbers) > 0 then
    update public.product_serial_numbers
    set status = 'consumed', current_location_id = null
    where company_id = v_order.company_id and product_id = v_material.component_product_id
      and serial_number in (select jsonb_array_elements_text(p_serial_numbers));
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_order_materials', v_material.id, 'CONSUME',
    null, jsonb_build_object('quantity', p_quantity, 'production_order_id', v_order.id, 'cost', v_cost_amount));

  return v_material;
end;
$$;

-- ==================================================================
-- fn_register_production_output — create or replace (0029): o
-- PRODUCTION_IN passa a receber um custo calculado (seção 10) — o
-- custo total de material acumulado na ordem dividido pela quantidade
-- total já produzida (incluindo esta chamada), recalculado a cada
-- chamada (mesmo espírito de custo médio móvel, agora no nível da
-- ordem). Só custo de material — trabalho/máquina/rateio indireto não
-- têm infraestrutura própria ainda (seção 9, "não inventar").
-- ==================================================================
create or replace function public.fn_register_production_output(
  p_production_order_id uuid,
  p_produced_quantity numeric default 0,
  p_rejected_quantity numeric default 0,
  p_lot_number text default null,
  p_serial_numbers jsonb default null,
  p_idempotency_key text default null
)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_product public.products;
  v_lot_id uuid;
  v_existing public.stock_movements;
  v_serial_count integer;
  v_serial text;
  v_movement public.stock_movements;
  v_unit_cost numeric;
  v_total_produced_after numeric;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.update') then
    raise exception 'Permissão negada (production_orders.update).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_order;
    end if;
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível registrar produção de uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if coalesce(p_produced_quantity, 0) < 0 or coalesce(p_rejected_quantity, 0) < 0 then
    raise exception 'Quantidades não podem ser negativas.' using errcode = '22023';
  end if;

  if coalesce(p_produced_quantity, 0) = 0 and coalesce(p_rejected_quantity, 0) = 0 then
    raise exception 'Informe ao menos uma quantidade produzida ou rejeitada.' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = v_order.product_id;

  if p_produced_quantity > 0 then
    if v_product.batch_controlled then
      if p_lot_number is null or trim(p_lot_number) = '' then
        raise exception 'Produto controla lote — informe o número do lote produzido.' using errcode = '22023';
      end if;
      insert into public.product_lots (company_id, product_id, lot_number, manufactured_at)
      values (v_order.company_id, v_order.product_id, trim(p_lot_number), current_date)
      on conflict (company_id, product_id, lot_number) do nothing;

      select id into v_lot_id from public.product_lots
      where company_id = v_order.company_id and product_id = v_order.product_id and lot_number = trim(p_lot_number);
    end if;

    if v_product.serial_controlled then
      v_serial_count := coalesce(jsonb_array_length(p_serial_numbers), 0);
      if v_serial_count <> p_produced_quantity::integer then
        raise exception 'Produto controla número de série — informe exatamente % série(s) para a quantidade produzida.', p_produced_quantity::integer using errcode = 'P0001';
      end if;
    end if;

    v_total_produced_after := v_order.produced_quantity + p_produced_quantity;
    v_unit_cost := case when v_total_produced_after > 0 then round(v_order.material_cost / v_total_produced_after, 6) else 0 end;

    v_movement := public.fn_post_stock_movement(
      p_company_id => v_order.company_id,
      p_product_id => v_order.product_id,
      p_location_id => v_order.output_location_id,
      p_movement_type => 'PRODUCTION_IN',
      p_quantity => p_produced_quantity,
      p_lot_id => v_lot_id,
      p_unit_cost => v_unit_cost,
      p_reference_type => 'PRODUCTION_ORDER',
      p_reference_id => v_order.id,
      p_idempotency_key => p_idempotency_key,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_unit_cost => v_unit_cost,
      p_source_type => 'production_order',
      p_source_id => v_order.id
    );

    if v_product.serial_controlled and v_serial_count > 0 then
      for v_serial in select jsonb_array_elements_text(p_serial_numbers)
      loop
        insert into public.product_serial_numbers (company_id, product_id, serial_number, status, current_location_id)
        values (v_order.company_id, v_order.product_id, v_serial, 'in_stock', v_order.output_location_id)
        on conflict (company_id, product_id, serial_number) do nothing;
      end loop;
    end if;
  end if;

  update public.production_orders
  set produced_quantity = produced_quantity + coalesce(p_produced_quantity, 0),
      rejected_quantity = rejected_quantity + coalesce(p_rejected_quantity, 0)
  where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'UPDATE',
    null, jsonb_build_object('produced_quantity', p_produced_quantity, 'rejected_quantity', p_rejected_quantity));

  return v_order;
end;
$$;

-- ==================================================================
-- fn_register_production_scrap — create or replace (0029): quando
-- material_id está presente (perda de matéria-prima já reservada), o
-- ISSUE gerado também vira custo rastreável (seção 11) — nunca
-- apagado, sempre um cost_movement vinculado à ordem.
-- ==================================================================
create or replace function public.fn_register_production_scrap(
  p_production_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_reason text,
  p_material_id uuid default null,
  p_lot_id uuid default null,
  p_idempotency_key text default null
)
returns public.production_scrap
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_material public.production_order_materials;
  v_available_to_scrap numeric;
  v_existing public.production_scrap;
  v_movement public.stock_movements;
  v_scrap public.production_scrap;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_scrap.create') then
    raise exception 'Permissão negada (production_scrap.create).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.production_scrap
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade perdida deve ser maior que zero.' using errcode = '22023';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Informe o motivo da perda/refugo.' using errcode = '22023';
  end if;

  if p_material_id is not null then
    select * into v_material from public.production_order_materials where id = p_material_id and production_order_id = p_production_order_id for update;
    if not found then
      raise exception 'Material da ordem de produção não encontrado.' using errcode = 'P0002';
    end if;

    v_available_to_scrap := v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity;
    if p_quantity > v_available_to_scrap then
      raise exception 'Quantidade perdida (%) excede o saldo reservado e ainda não utilizado deste material (%).', p_quantity, v_available_to_scrap using errcode = 'P0001';
    end if;

    v_movement := public.fn_post_stock_movement(
      p_company_id => v_order.company_id,
      p_product_id => v_material.component_product_id,
      p_location_id => v_order.consumption_location_id,
      p_movement_type => 'ISSUE',
      p_quantity => p_quantity,
      p_lot_id => coalesce(p_lot_id, v_material.lot_id),
      p_reference_type => 'PRODUCTION_SCRAP',
      p_reference_id => p_production_order_id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':issue' else null end,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_source_type => 'production_scrap',
      p_source_id => p_production_order_id
    );

    perform public.fn_post_stock_movement(
      p_company_id => v_order.company_id,
      p_product_id => v_material.component_product_id,
      p_location_id => v_order.consumption_location_id,
      p_movement_type => 'RELEASE',
      p_quantity => p_quantity,
      p_lot_id => coalesce(p_lot_id, v_material.lot_id),
      p_reference_type => 'PRODUCTION_SCRAP',
      p_reference_id => p_production_order_id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':release' else null end,
      p_created_by => public.current_app_user_id()
    );

    update public.production_order_materials
    set scrapped_quantity = scrapped_quantity + p_quantity
    where id = p_material_id;
  end if;

  insert into public.production_scrap (
    company_id, production_order_id, material_id, product_id, quantity, unit_id, reason, lot_id,
    stock_movement_issue_id, idempotency_key, recorded_by
  ) values (
    v_order.company_id, p_production_order_id, p_material_id, p_product_id, p_quantity, p_unit_id, trim(p_reason), p_lot_id,
    v_movement.id, p_idempotency_key, public.current_app_user_id()
  )
  returning * into v_scrap;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_scrap', v_scrap.id, 'SCRAP',
    null, jsonb_build_object('production_order_id', p_production_order_id, 'quantity', p_quantity, 'reason', p_reason));

  return v_scrap;
end;
$$;
