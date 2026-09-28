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

      perform public.fn_post_stock_movement(
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
