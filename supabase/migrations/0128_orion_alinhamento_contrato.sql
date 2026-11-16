-- =============================================================================
-- 0128 — Integração ORION: alinhamento do contrato (docs/INTEGRACAO-ATLAS-ORION.md)
--
--   * outbound.line_cancelled / outbound.cancelled com origin = 'atlas' são o
--     eco de um cancelamento que partiu do ATLAS (sales_order.line_cancelled /
--     sales_order.cancelled): o ATLAS registra o estado do armazém mas NÃO
--     soma a quantidade cancelada de novo (contagem dupla) nem reabre o pedido.
--   * receipt.completed: purchase_order_status (snake_case) — o nome antigo
--     purchaseOrderStatus é aceito pela validação de entrada (só informativo).
-- =============================================================================

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
  if coalesce(p_payload ->> 'origin', 'orion') = 'atlas' then
    -- Eco do cancelamento feito no ATLAS: a quantidade já foi descontada aqui.
    update public.sales_orders set
      wms_details = wms_details || jsonb_build_object('last_line_cancel_ack', jsonb_build_object(
        'atlas_line_id', p_payload ->> 'atlas_line_id', 'atlas_event_id', p_payload ->> 'atlas_event_id', 'orion_event_id', p_event_id))
    where id = v_order.id;
    return;
  end if;
  update public.sales_order_items
  set cancelled_quantity = cancelled_quantity + least(v_qty, greatest(ordered_quantity - shipped_quantity - cancelled_quantity, 0))
  where id = v_item.id;
  update public.sales_orders set wms_last_error = 'Armazém cancelou ' || v_qty || ' un. de uma linha: ' || coalesce(p_payload ->> 'reason', '')
  where id = v_order.id;
  perform public.fn_orion_recalc_sales_status(v_order.id);
end;
$$;

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
    if v_order.status = 'cancelled' or coalesce(p_payload ->> 'origin', 'orion') = 'atlas' then
      -- Eco do cancelamento do ATLAS: só registra o estado do armazém.
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
