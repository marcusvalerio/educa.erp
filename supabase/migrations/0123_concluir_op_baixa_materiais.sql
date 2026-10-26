-- 0123 — Material da produção baixado no apontamento e na conclusão;
-- reservas de pedidos expedidos encerradas.
--
-- 1) Era possível apontar e concluir a ordem sem "Consumir materiais": a
--    matéria-prima ficava no estoque e RESERVADA para sempre, e o produto
--    pronto entrava com custo zero. Agora ("baixa por apontamento"):
--      * ao apontar a produção, o material proporcional ao que já foi
--        produzido/perdido sai do estoque antes de custear o produto pronto;
--      * ao concluir, todo o reservado que sobrou é baixado.
--    Quem consome pelo botão continua igual (nada é baixado duas vezes).
--    Ordens já concluídas com material preso são acertadas agora.
-- 2) A expedição baixava o estoque e liberava o saldo reservado, mas a
--    reserva do pedido continuava "ativa" na tela de reservas. Pedido
--    expedido/concluído agora encerra (consome) as reservas; as antigas são
--    acertadas.
-- Pode rodar de novo.

drop function if exists public.fn_backflush_production_materials_internal(uuid);
create or replace function public.fn_backflush_production_materials_internal(p_production_order_id uuid, p_fraction numeric default 1)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_material public.production_order_materials;
  v_left numeric;
  v_movement public.stock_movements;
  v_cost public.cost_movements;
  v_total numeric := 0;
begin
  select * into v_order from public.production_orders where id = p_production_order_id;
  for v_material in select * from public.production_order_materials where production_order_id = p_production_order_id order by created_at loop
    -- Alvo: fração do reservado (1 = tudo); nunca além do que ainda resta.
    v_left := least(
      round(v_material.reserved_quantity * least(greatest(coalesce(p_fraction, 1), 0), 1), 4) - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity,
      v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity);
    continue when v_left <= 0;

    perform public.fn_post_stock_movement(
      p_company_id => v_order.company_id, p_product_id => v_material.component_product_id, p_location_id => v_order.consumption_location_id,
      p_movement_type => 'RELEASE', p_quantity => v_left, p_lot_id => v_material.lot_id,
      p_reference_type => 'PRODUCTION_ORDER', p_reference_id => v_order.id,
      p_idempotency_key => 'backflush:' || v_material.id || ':release:' || v_material.consumed_quantity, p_created_by => public.current_app_user_id());
    v_movement := public.fn_post_stock_movement(
      p_company_id => v_order.company_id, p_product_id => v_material.component_product_id, p_location_id => v_order.consumption_location_id,
      p_movement_type => 'ISSUE', p_quantity => v_left, p_lot_id => v_material.lot_id,
      p_reference_type => 'PRODUCTION_ORDER', p_reference_id => v_order.id,
      p_idempotency_key => 'backflush:' || v_material.id || ':issue:' || v_material.consumed_quantity, p_created_by => public.current_app_user_id());
    v_cost := public.fn_register_cost_movement(p_stock_movement_id => v_movement.id, p_source_type => 'production_order', p_source_id => v_order.id);

    update public.production_order_materials
    set consumed_quantity = consumed_quantity + v_left,
        consumed_cost = consumed_cost + coalesce(v_cost.total_cost, 0),
        status = case when consumed_quantity + v_left + returned_quantity + scrapped_quantity >= reserved_quantity then 'consumed' else status end
    where id = v_material.id;
    update public.production_orders set material_cost = material_cost + coalesce(v_cost.total_cost, 0) where id = v_order.id;
    v_total := v_total + v_left;

    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_order.company_id, public.current_app_user_id(), 'system', 'production_order_materials', v_material.id, 'CONSUME',
      null, jsonb_build_object('quantity', v_left, 'production_order_id', v_order.id, 'cost', coalesce(v_cost.total_cost, 0), 'via', 'baixa automática na conclusão'));
  end loop;
  return v_total;
end;
$$;
revoke all on function public.fn_backflush_production_materials_internal(uuid, numeric) from public, anon, authenticated;

-- Apontamento: baixa o material proporcional antes de custear o produto pronto.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.fn_register_production_output'::regproc) into v_def;
  if position('fn_backflush_production_materials_internal' in v_def) = 0 then
    v_def := replace(v_def,
      $a$  select * into v_product from public.products where id = v_order.product_id;$a$,
      $b$  -- 0123: material proporcional ao produzido/perdido sai do estoque antes de custear.
  perform public.fn_backflush_production_materials_internal(p_production_order_id,
    (v_order.produced_quantity + v_order.rejected_quantity + coalesce(p_produced_quantity, 0) + coalesce(p_rejected_quantity, 0)) / nullif(v_order.planned_quantity, 0));
  select * into v_order from public.production_orders where id = p_production_order_id;

  select * into v_product from public.products where id = v_order.product_id;$b$);
    if position('fn_backflush_production_materials_internal' in v_def) = 0 then
      raise exception 'fn_register_production_output: ponto de inserção não encontrado';
    end if;
    execute v_def;
  end if;
end;
$$;

create or replace function public.fn_complete_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.complete') then
    raise exception 'Permissão negada (production_orders.complete).' using errcode = '42501';
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível concluir uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  -- Material reservado que não passou por "Consumir materiais" é baixado agora.
  perform public.fn_backflush_production_materials_internal(p_production_order_id);

  update public.production_orders
  set status = 'completed', finished_at = now()
  where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'COMPLETE',
    jsonb_build_object('status', 'in_progress'), jsonb_build_object('status', 'completed', 'produced_quantity', v_order.produced_quantity, 'rejected_quantity', v_order.rejected_quantity));

  return v_order;
end;
$$;

-- Ordens já concluídas com material preso na reserva.
do $$
declare
  r record;
begin
  for r in
    select distinct o.id from public.production_orders o
    join public.production_order_materials m on m.production_order_id = o.id
    where o.status = 'completed' and m.reserved_quantity - m.consumed_quantity - m.returned_quantity - m.scrapped_quantity > 0
  loop
    perform public.fn_backflush_production_materials_internal(r.id);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ 2) reservas
create or replace function public.fn_trg_consume_reservations_on_order_shipped()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status in ('shipped', 'completed') and OLD.status is distinct from NEW.status then
    update public.stock_reservations
    set status = 'consumed', consumed_at = coalesce(consumed_at, now())
    where reference_type = 'sales_order' and reference_id = NEW.id and status = 'active';
  end if;
  return NEW;
end;
$$;
revoke all on function public.fn_trg_consume_reservations_on_order_shipped() from public, anon, authenticated;

drop trigger if exists consume_reservations_on_order_shipped on public.sales_orders;
create trigger consume_reservations_on_order_shipped
  after update of status on public.sales_orders
  for each row execute function public.fn_trg_consume_reservations_on_order_shipped();

update public.stock_reservations r
set status = 'consumed', consumed_at = coalesce(r.consumed_at, s.updated_at)
from public.sales_orders s
where r.reference_type = 'sales_order' and r.reference_id = s.id and r.status = 'active' and s.status in ('shipped', 'completed');

-- ------------------------------------------------------------------ 3) expedição duplicada
-- Uma expedição não pode pedir mais do que o pedido ainda tem reservado e não
-- expedido, somando as outras expedições em aberto do mesmo item. Antes dava
-- para criar uma segunda expedição de um pedido já expedido; ela nunca saía
-- ("quantidade a expedir excede o saldo reservado disponível (0)").
create or replace function public.fn_guard_shipment_item_quantity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.sales_order_items;
  v_open numeric;
  v_left numeric;
begin
  select * into v_item from public.sales_order_items where id = NEW.sales_order_item_id;
  if not found then
    return NEW;
  end if;
  select coalesce(sum(si.quantity), 0) into v_open
  from public.shipment_items si join public.shipments s on s.id = si.shipment_id
  where si.sales_order_item_id = NEW.sales_order_item_id and si.id <> NEW.id
    and s.status not in ('shipped', 'in_transit', 'delivered', 'completed', 'cancelled');
  v_left := v_item.reserved_quantity - v_item.shipped_quantity - v_open;
  if NEW.quantity > v_left then
    raise exception 'Este item já está todo expedido ou em outra expedição em aberto (disponível para expedir: %). Confira em Logística › Expedição.', greatest(v_left, 0) using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;
revoke all on function public.fn_guard_shipment_item_quantity() from public, anon, authenticated;

drop trigger if exists guard_shipment_item_quantity on public.shipment_items;
create trigger guard_shipment_item_quantity
  before insert on public.shipment_items
  for each row execute function public.fn_guard_shipment_item_quantity();

-- Expedições em aberto de pedidos já totalmente expedidos: canceladas.
update public.shipments s
set status = 'cancelled'
where s.status in ('draft', 'ready', 'packed', 'ready_to_ship', 'picking')
  and exists (select 1 from public.sales_orders o where o.id = s.sales_order_id and o.status in ('shipped', 'completed'))
  and not exists (
    select 1 from public.shipment_items si join public.sales_order_items oi on oi.id = si.sales_order_item_id
    where si.shipment_id = s.id and oi.reserved_quantity - oi.shipped_quantity > 0);
