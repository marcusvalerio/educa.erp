-- Fase 8 — Fiscal: evento manual + integração com Compras/Comercial.
--
-- Preparação explícita (seções 17-19/35-37), nunca automática: estas
-- funções só criam um documento fiscal quando CHAMADAS deliberadamente
-- — nenhum trigger gera fiscal_documents só porque um purchase_receipt
-- foi confirmado ou um sales_order foi aprovado (seção 3/4). A conexão
-- sales_order -> shipment -> fiscal_document (seção 19/36) fica
-- preparada estruturalmente (source_type já inclui 'shipment',
-- fiscal_documents já referencia carrier_id/vehicle_id) mas esta etapa
-- só implementa o gerador a partir de sales_order diretamente — o
-- gerador a partir de shipment (quantidade efetivamente expedida) é
-- uma evolução natural, não construída agora (ver docs/FISCAL.md §13).

-- ==================================================================
-- fn_register_fiscal_document_event — logger manual (seção 31), só
-- para os tipos de evento que NÃO são emitidos automaticamente pelo
-- ciclo de vida (0039 já grava CREATED/CALCULATED/AUTHORIZED/REJECTED/
-- CANCELLED em cada função correspondente) — evita um usuário inserir
-- um evento "CREATED" falso fora de ordem.
-- ==================================================================
create or replace function public.fn_register_fiscal_document_event(
  p_fiscal_document_id uuid,
  p_event_type text,
  p_protocol text default null,
  p_status_code text default null,
  p_message text default null,
  p_payload_reference text default null
)
returns public.fiscal_document_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_event public.fiscal_document_events;
begin
  if p_event_type not in ('CONTINGENCY', 'CORRECTION_LETTER', 'OTHER', 'DENIED') then
    raise exception 'Tipo de evento inválido para registro manual: % (CREATED/CALCULATED/AUTHORIZED/REJECTED/CANCELLED são gravados automaticamente pelo ciclo de vida do documento).', p_event_type using errcode = '22023';
  end if;

  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_document_events.create') then
    raise exception 'Permissão negada (fiscal_document_events.create).' using errcode = '42501';
  end if;

  insert into public.fiscal_document_events (
    company_id, fiscal_document_id, event_type, protocol, status_code, message, payload_reference, created_by
  ) values (
    v_document.company_id, p_fiscal_document_id, p_event_type, p_protocol, p_status_code, p_message, p_payload_reference, public.current_app_user_id()
  )
  returning * into v_event;

  if p_event_type = 'DENIED' then
    update public.fiscal_documents set status = 'DENIED' where id = p_fiscal_document_id;
  elsif p_event_type = 'CONTINGENCY' then
    update public.fiscal_documents set status = 'CONTINGENCY' where id = p_fiscal_document_id and status not in ('CANCELLED', 'AUTHORIZED');
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_document_events', v_event.id, 'EVENT',
    null, jsonb_build_object('fiscal_document_id', p_fiscal_document_id, 'event_type', p_event_type));

  return v_event;
end;
$$;

revoke all on function public.fn_register_fiscal_document_event(uuid, text, text, text, text, text) from public;
grant execute on function public.fn_register_fiscal_document_event(uuid, text, text, text, text, text) to authenticated;

-- ==================================================================
-- fn_create_fiscal_document_from_purchase_receipt — documento de
-- ENTRADA (seção 18). Só a partir de um recebimento CONFIRMADO (mesmo
-- evento apropriado usado por fn_generate_accounts_payable_from_purchase_receipt,
-- Financeiro 0032) — nunca de um pedido em aberto. Idempotente via
-- fn_create_fiscal_document (índice único por origem, 0039); se o
-- documento já existir, só devolve — não duplica itens.
-- ==================================================================
create or replace function public.fn_create_fiscal_document_from_purchase_receipt(
  p_purchase_receipt_id uuid,
  p_fiscal_establishment_id uuid,
  p_operation_nature_id uuid,
  p_notes text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
  v_document public.fiscal_documents;
  v_item record;
begin
  select * into v_receipt from public.purchase_receipts where id = p_purchase_receipt_id;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receipt.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  if v_receipt.status <> 'confirmed' then
    raise exception 'Só é possível gerar documento fiscal a partir de um recebimento confirmado (status atual: %).', v_receipt.status using errcode = 'P0001';
  end if;

  v_document := public.fn_create_fiscal_document(
    p_company_id => v_receipt.company_id,
    p_fiscal_establishment_id => p_fiscal_establishment_id,
    p_type => 'NFE',
    p_direction => 'ENTRADA',
    p_operation_nature_id => p_operation_nature_id,
    p_supplier_id => v_receipt.supplier_id,
    p_issue_date => v_receipt.received_at::date,
    p_source_type => 'purchase_receipt',
    p_source_id => v_receipt.id,
    p_notes => p_notes
  );

  if v_document.status = 'DRAFT' and not exists (select 1 from public.fiscal_document_items where fiscal_document_id = v_document.id) then
    for v_item in
      select ri.product_id, ri.accepted_quantity, ri.unit, poi.unit_price, ri.id as receipt_item_id
      from public.purchase_receipt_items ri
      join public.purchase_order_items poi on poi.id = ri.purchase_order_item_id
      where ri.receipt_id = p_purchase_receipt_id and ri.accepted_quantity > 0
    loop
      perform public.fn_add_fiscal_document_item(
        p_fiscal_document_id => v_document.id,
        p_product_id => v_item.product_id,
        p_quantity => v_item.accepted_quantity,
        p_unit_price => v_item.unit_price,
        p_unit => v_item.unit,
        p_source_reference_type => 'purchase_receipt_item',
        p_source_reference_id => v_item.receipt_item_id
      );
    end loop;
  end if;

  return v_document;
end;
$$;

-- ==================================================================
-- fn_create_fiscal_document_from_sales_order — documento de SAÍDA
-- (seção 19). Ponte provisória usando o pedido diretamente: quando o
-- item já tem shipped_quantity (expedido, 0024), usa essa quantidade;
-- senão usa ordered_quantity - cancelled_quantity. Uma evolução futura
-- a partir de shipment (quantidade exata daquela expedição específica,
-- permitindo múltiplos documentos por pedido parcialmente expedido)
-- fica preparada mas não implementada nesta etapa (ver cabeçalho do
-- arquivo).
-- ==================================================================
create or replace function public.fn_create_fiscal_document_from_sales_order(
  p_sales_order_id uuid,
  p_fiscal_establishment_id uuid,
  p_operation_nature_id uuid,
  p_notes text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_document public.fiscal_documents;
  v_item record;
  v_qty numeric;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  if v_order.status in ('draft', 'pending_approval', 'cancelled') then
    raise exception 'Só é possível gerar documento fiscal a partir de um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  v_document := public.fn_create_fiscal_document(
    p_company_id => v_order.company_id,
    p_fiscal_establishment_id => p_fiscal_establishment_id,
    p_type => 'NFE',
    p_direction => 'SAIDA',
    p_operation_nature_id => p_operation_nature_id,
    p_customer_id => v_order.customer_id,
    p_carrier_id => v_order.carrier_id,
    p_source_type => 'sales_order',
    p_source_id => v_order.id,
    p_notes => p_notes
  );

  if v_document.status = 'DRAFT' and not exists (select 1 from public.fiscal_document_items where fiscal_document_id = v_document.id) then
    for v_item in select * from public.sales_order_items where order_id = p_sales_order_id
    loop
      v_qty := case when v_item.shipped_quantity > 0 then v_item.shipped_quantity else v_item.ordered_quantity - v_item.cancelled_quantity end;
      if v_qty > 0 then
        perform public.fn_add_fiscal_document_item(
          p_fiscal_document_id => v_document.id,
          p_product_id => v_item.product_id,
          p_quantity => v_qty,
          p_unit_price => v_item.unit_price,
          p_unit => v_item.unit,
          p_discount => coalesce(v_item.discount, 0),
          p_source_reference_type => 'sales_order_item',
          p_source_reference_id => v_item.id
        );
      end if;
    end loop;
  end if;

  return v_document;
end;
$$;

revoke all on function public.fn_create_fiscal_document_from_purchase_receipt(uuid, uuid, uuid, text) from public;
revoke all on function public.fn_create_fiscal_document_from_sales_order(uuid, uuid, uuid, text) from public;
grant execute on function public.fn_create_fiscal_document_from_purchase_receipt(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.fn_create_fiscal_document_from_sales_order(uuid, uuid, uuid, text) to authenticated;
