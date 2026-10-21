-- 0108 — Venda só com estoque e conta a pagar automática na compra.
--
-- Encontrado no Grupo 1 (21/10): a NF-e saía de um pedido sem estoque
-- separado/expedido e o recebimento confirmado da compra não gerava a
-- conta a pagar (foi lançada à mão).
--   1) Faturar (gerar a NF-e do pedido) exige o pedido com estoque
--      reservado — ou já em separação/expedição.
--   2) Recebimento confirmado gera a conta a pagar sozinho (uma por
--      recebimento, valor = quantidades aceitas × preço do pedido), com
--      parcelas pela condição do pedido de compra: "30/60/90" vira 3
--      parcelas; "à vista" vence no dia; sem condição, 30 dias. Quem
--      confirma não precisa da permissão do financeiro: é o sistema.
--      Recebimentos já confirmados não são tocados (podem ter conta manual).
--   3) Devoluções pela tela: devolução de cliente (entra no estoque) e
--      devolução a fornecedor (sai do estoque), com motivo.
-- Pode rodar de novo.

-- ------------------------------------------------------------------ 1
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

-- ------------------------------------------------------------------ 2
create or replace function public.fn_purchase_terms_days(p_terms text)
returns integer[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_terms, '') ~ '\d' then (select array_agg(m[1]::integer order by ord) from regexp_matches(p_terms, '(\d+)', 'g') with ordinality as t(m, ord) where m[1]::integer <= 720)
    when lower(coalesce(p_terms, '')) like '%vista%' then array[0]
    else array[30]
  end
$$;

create or replace function public.fn_payable_from_receipt_internal(p_receipt_id uuid)
returns public.accounts_payable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
  v_order public.purchase_orders;
  v_payable public.accounts_payable;
  v_amount numeric;
  v_days integer[];
  v_n integer;
  v_part numeric;
  v_sum numeric := 0;
  v_base date;
begin
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found or v_receipt.status <> 'confirmed' then
    return null;
  end if;
  select * into v_payable from public.accounts_payable
   where company_id = v_receipt.company_id and origin_type = 'purchase_receipt' and origin_id = v_receipt.id;
  if found then
    return v_payable;
  end if;
  select coalesce(sum(ri.accepted_quantity * poi.unit_price), 0) into v_amount
    from public.purchase_receipt_items ri
    join public.purchase_order_items poi on poi.id = ri.purchase_order_item_id
   where ri.receipt_id = v_receipt.id and ri.accepted_quantity > 0;
  if v_amount <= 0 then
    return null;
  end if;
  select * into v_order from public.purchase_orders where id = v_receipt.purchase_order_id;
  v_days := coalesce(public.fn_purchase_terms_days(v_order.payment_terms), array[30]);
  v_n := array_length(v_days, 1);
  v_base := coalesce(v_receipt.received_at::date, current_date);

  insert into public.accounts_payable (company_id, supplier_id, description, origin_type, origin_id, document_reference,
    original_amount, issue_date, due_date, notes)
  values (v_receipt.company_id, v_receipt.supplier_id, 'Compra ' || coalesce(v_order.code, '') || ' — recebimento ' || v_receipt.code,
    'purchase_receipt', v_receipt.id, v_receipt.document_number, round(v_amount, 2), v_base, v_base + v_days[1],
    case when v_order.payment_terms is not null then 'Condição: ' || v_order.payment_terms end)
  returning * into v_payable;

  for i in 1..v_n loop
    v_part := case when i = v_n then round(v_amount, 2) - v_sum else round(v_amount / v_n, 2) end;
    v_sum := v_sum + v_part;
    insert into public.accounts_payable_installments (company_id, payable_id, installment_number, due_date, amount)
    values (v_receipt.company_id, v_payable.id, i, v_base + v_days[i], v_part);
  end loop;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receipt.company_id, public.current_app_user_id(), 'system', 'accounts_payable', v_payable.id, 'CREATE',
    null, jsonb_build_object('origin_type', 'purchase_receipt', 'origin_id', v_receipt.id, 'original_amount', round(v_amount, 2), 'installments', v_n));
  return v_payable;
end;
$$;

create or replace function public.fn_trg_payable_on_receipt_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'confirmed' and OLD.status is distinct from 'confirmed' then
    perform public.fn_payable_from_receipt_internal(NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists payable_on_receipt_confirmed on public.purchase_receipts;
create trigger payable_on_receipt_confirmed
  after update of status on public.purchase_receipts
  for each row execute procedure public.fn_trg_payable_on_receipt_confirmed();

revoke all on function public.fn_payable_from_receipt_internal(uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_payable_on_receipt_confirmed() from public, anon, authenticated;
revoke all on function public.fn_purchase_terms_days(text) from public, anon;
grant execute on function public.fn_purchase_terms_days(text) to authenticated;
revoke execute on function public.fn_create_fiscal_document_from_sales_order(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.fn_create_fiscal_document_from_sales_order(uuid, uuid, uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------------ 3
create or replace function public.fn_register_stock_return(p_company_id uuid, p_product_id uuid, p_location_id uuid, p_quantity numeric, p_direction text, p_notes text default null)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_in boolean := upper(coalesce(p_direction, '')) = 'IN';
begin
  if upper(coalesce(p_direction, '')) not in ('IN', 'OUT') then
    raise exception 'Informe se é devolução de cliente (IN) ou a fornecedor (OUT).' using errcode = '22023';
  end if;
  if not public.has_permission(p_company_id, case when v_in then 'stock.create' else 'stock.adjust' end) then
    raise exception 'Permissão negada (%).', case when v_in then 'stock.create' else 'stock.adjust' end using errcode = '42501';
  end if;
  if coalesce(trim(p_notes), '') = '' then
    raise exception 'Informe o motivo da devolução.' using errcode = '22023';
  end if;
  return public.fn_post_stock_movement(
    p_company_id => p_company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => case when v_in then 'RETURN_IN' else 'RETURN_OUT' end,
    p_quantity => p_quantity,
    p_reference_type => 'manual',
    p_notes => p_notes,
    p_created_by => public.current_app_user_id()
  );
end;
$$;
revoke all on function public.fn_register_stock_return(uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.fn_register_stock_return(uuid, uuid, uuid, numeric, text, text) to authenticated;
