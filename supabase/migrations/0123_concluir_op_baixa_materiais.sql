-- 0123 — Concluir a ordem de produção dá baixa no material que sobrou reservado.
--
-- Era possível concluir a ordem sem passar por "Consumir materiais": a
-- matéria-prima ficava no estoque e RESERVADA para sempre, mesmo já usada.
-- Agora, ao concluir, todo material reservado e ainda não consumido (nem
-- devolvido ou perdido) é consumido automaticamente ("baixa por
-- apontamento"): sai do estoque, libera a reserva e entra no custo da ordem.
-- As ordens já concluídas com material preso são acertadas agora.
-- Pode rodar de novo.

create or replace function public.fn_backflush_production_materials_internal(p_production_order_id uuid)
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
    v_left := v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity;
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
        status = 'consumed'
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
revoke all on function public.fn_backflush_production_materials_internal(uuid) from public, anon, authenticated;

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
