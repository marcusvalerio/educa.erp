-- NF-e do pedido de venda: o rascunho de uma tentativa anterior com outra
-- natureza (ex.: cliente sem UF na 1ª tentativa → CFOP interestadual) era
-- reaproveitado e a emissão recusava "CFOP 6102 é interestadual, mas o cliente
-- é da mesma UF". Rascunho nunca numerado com natureza diferente é descartado.
create or replace function public.fn_create_fiscal_document_from_sales_order(p_sales_order_id uuid, p_fiscal_establishment_id uuid, p_operation_nature_id uuid, p_notes text default null)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
  -- Sem estoque não se fatura: o pedido precisa estar reservado (ou já em
  -- separação/expedição). Reserva parcial ou nenhuma: reserve antes.
  if v_order.status not in ('reserved', 'picking', 'ready_to_ship', 'partially_shipped', 'shipped', 'completed') then
    raise exception 'Reserve o estoque do pedido antes de faturar: sem estoque reservado não há o que vender (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  -- Rascunho de uma tentativa anterior que nunca virou nota (sem número nem
  -- chave), mas com outra natureza: por exemplo, criado quando o cliente ainda
  -- não tinha UF e a venda parecia interestadual (CFOP 6xxx). Descarta para
  -- gerar de novo com a natureza certa, em vez de reaproveitar o CFOP errado.
  delete from public.fiscal_documents
   where source_type = 'sales_order' and source_id = v_order.id and status = 'DRAFT'
     and number is null and access_key is null
     and operation_nature_id is distinct from p_operation_nature_id;

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

    update public.fiscal_documents
       set freight_amount = coalesce(v_order.freight_cost, 0),
           freight_mode = case when coalesce(v_order.freight_cost, 0) > 0 then 'EMITENTE' else coalesce(freight_mode, 'SEM_FRETE') end
     where id = v_document.id
    returning * into v_document;
  end if;

  return v_document;
end;
$function$;
