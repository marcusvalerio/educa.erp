-- 0115 — Expedir (e consumir reserva/material) com o estoque exato.
--
-- Ao expedir um pedido, o sistema dava a SAÍDA antes de LIBERAR a reserva do
-- próprio pedido. Como a saída não pode deixar o saldo abaixo do reservado,
-- quem tinha em estoque exatamente o que reservou não conseguia expedir
-- ("Saída de N bloqueada: N unidade(s) estão reservadas..."). O mesmo valia
-- para consumir reserva, consumir material da produção e registrar refugo.
-- Correção: primeiro libera a reserva, depois dá a saída. O resto das
-- funções não muda. Pode rodar de novo.

CREATE OR REPLACE FUNCTION public.fn_ship_shipment(p_shipment_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS shipments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.fn_consume_reservation(p_reservation_id uuid)
 RETURNS stock_reservations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_reservation public.stock_reservations;
  v_item record;
begin
  select * into v_reservation from public.stock_reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_reservation.company_id, 'stock.update') then
    raise exception 'Permissão negada (stock.update).' using errcode = '42501';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'Só é possível consumir uma reserva ativa (status atual: %).', v_reservation.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_reservation_items where reservation_id = p_reservation_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_reservation.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_reservation.location_id,
      p_movement_type => 'RELEASE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_reservation',
      p_reference_id => v_reservation.id,
      p_idempotency_key => 'reservation:consume-release:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );
    perform public.fn_post_stock_movement(
      p_company_id => v_reservation.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_reservation.location_id,
      p_movement_type => 'ISSUE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_reservation',
      p_reference_id => v_reservation.id,
      p_idempotency_key => 'reservation:consume-issue:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_reservations
  set status = 'consumed', consumed_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_reservation.company_id, public.current_app_user_id(), 'system',
    'stock_reservations', v_reservation.id, 'UPDATE',
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'consumed')
  );

  return v_reservation;
end;
$function$;


CREATE OR REPLACE FUNCTION public.fn_consume_production_material(p_production_order_material_id uuid, p_quantity numeric, p_lot_id uuid DEFAULT NULL::uuid, p_serial_numbers jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text)
 RETURNS production_order_materials
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.fn_register_production_scrap(p_production_order_id uuid, p_product_id uuid, p_quantity numeric, p_unit_id uuid, p_reason text, p_material_id uuid DEFAULT NULL::uuid, p_lot_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS production_scrap
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
