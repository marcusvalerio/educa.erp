create or replace function public.fn_create_shipment(
  p_company_id uuid, p_sales_order_id uuid, p_warehouse_id uuid, p_items jsonb,
  p_pick_list_id uuid default null, p_expected_ship_date date default null,
  p_delivery_zip_code text default null, p_delivery_state text default null, p_delivery_city text default null,
  p_delivery_neighborhood text default null, p_delivery_address text default null, p_delivery_address_number text default null,
  p_delivery_address_complement text default null, p_notes text default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_shipment public.shipments;
  v_item jsonb;
  v_order_item public.sales_order_items;
  v_qty numeric;
  v_location uuid;
  v_in_open numeric;
  v_free numeric;
  v_reserved_here numeric;
  v_open_here numeric;
  v_has_explicit_address boolean;
begin
  if not public.has_permission(p_company_id, 'shipments.create') then
    raise exception 'Permissão negada (shipments.create).' using errcode = '42501';
  end if;

  -- Trava o pedido: duas criações simultâneas não somam mais que o reservado.
  select * into v_order from public.sales_orders where id = p_sales_order_id and company_id = p_company_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if v_order.status not in ('reserved', 'ready_to_ship', 'partially_shipped') then
    raise exception 'Só é possível criar expedição para um pedido reservado ou pronto para envio (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A expedição precisa de ao menos um item.' using errcode = '22023';
  end if;

  v_has_explicit_address := p_delivery_address is not null or p_delivery_zip_code is not null;

  insert into public.shipments (
    company_id, sales_order_id, customer_id, warehouse_id, pick_list_id, expected_ship_date,
    delivery_zip_code, delivery_state, delivery_city, delivery_neighborhood,
    delivery_address, delivery_address_number, delivery_address_complement,
    notes, created_by
  ) values (
    p_company_id, p_sales_order_id, v_order.customer_id, p_warehouse_id, p_pick_list_id, p_expected_ship_date,
    case when v_has_explicit_address then p_delivery_zip_code else v_order.delivery_zip_code end,
    case when v_has_explicit_address then p_delivery_state else v_order.delivery_state end,
    case when v_has_explicit_address then p_delivery_city else v_order.delivery_city end,
    case when v_has_explicit_address then p_delivery_neighborhood else v_order.delivery_neighborhood end,
    case when v_has_explicit_address then p_delivery_address else v_order.delivery_address end,
    case when v_has_explicit_address then p_delivery_address_number else v_order.delivery_address_number end,
    case when v_has_explicit_address then p_delivery_address_complement else v_order.delivery_address_complement end,
    p_notes, public.current_app_user_id()
  )
  returning * into v_shipment;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from public.sales_order_items
    where id = (v_item->>'sales_order_item_id')::uuid and order_id = p_sales_order_id;
    if not found then
      raise exception 'Um dos itens informados não pertence a este pedido.' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'quantity')::numeric;
    v_location := (v_item->>'location_id')::uuid;

    -- Quanto deste item já está em expedições ABERTAS (inclui itens desta mesma chamada).
    select coalesce(sum(si.quantity), 0) into v_in_open
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id
    where si.sales_order_item_id = v_order_item.id
      and s.status in ('draft', 'ready', 'picking', 'packed', 'ready_to_ship');

    v_free := v_order_item.reserved_quantity - v_order_item.shipped_quantity - v_in_open;
    if v_qty > v_free then
      raise exception 'Não é possível criar a expedição: para o produto %, a quantidade a expedir (%) é maior que o reservado ainda livre para expedição (%).%',
        public.fn_product_label(v_order_item.product_id), public.fn_fmt_qty(v_qty), public.fn_fmt_qty(greatest(v_free, 0)),
        case when v_in_open > 0 then ' ' || public.fn_fmt_qty(v_in_open) || ' já está em outra expedição aberta deste pedido.' else '' end
        using errcode = 'P0001';
    end if;

    -- O estoque precisa estar reservado PARA ESTE PEDIDO no local escolhido.
    select coalesce(sum(sri.quantity - sri.consumed_quantity), 0) into v_reserved_here
    from public.stock_reservation_items sri
    join public.stock_reservations sr on sr.id = sri.reservation_id
    where sr.reference_type = 'sales_order' and sr.reference_id = p_sales_order_id and sr.status = 'active'
      and sr.location_id = v_location and sri.product_id = v_order_item.product_id;

    select coalesce(sum(si.quantity), 0) into v_open_here
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id
    where s.sales_order_id = p_sales_order_id and si.product_id = v_order_item.product_id and si.location_id = v_location
      and s.status in ('draft', 'ready', 'picking', 'packed', 'ready_to_ship');

    if v_qty > v_reserved_here - v_open_here then
      raise exception 'Não é possível criar a expedição: o pedido % não tem reserva suficiente neste local para o produto % (reservado livre aqui: %). Expeça do local onde o estoque foi reservado.',
        v_order.code, public.fn_product_label(v_order_item.product_id), public.fn_fmt_qty(greatest(v_reserved_here - v_open_here, 0))
        using errcode = 'P0001';
    end if;

    insert into public.shipment_items (
      company_id, shipment_id, sales_order_item_id, product_id, location_id, quantity, unit, lot_id, serial_numbers, weight, notes
    ) values (
      p_company_id, v_shipment.id, v_order_item.id, v_order_item.product_id,
      v_location,
      v_qty,
      coalesce(nullif(v_item->>'unit', ''), v_order_item.unit),
      nullif(v_item->>'lot_id', '')::uuid,
      v_item->'serial_numbers',
      nullif(v_item->>'weight', '')::numeric,
      nullif(v_item->>'notes', '')
    );
  end loop;

  return v_shipment;
end;
$$;