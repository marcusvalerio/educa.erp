-- Correções dos testadores (26/11):
-- 1) Frete do pedido de compra entra no título a pagar do 1º recebimento.
-- 2) Pedido de venda e orçamento não podem ter total negativo (desconto > itens).
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
  -- Frete do pedido entra no título do 1º recebimento (antes ficava fora de todos os títulos).
  if coalesce(v_order.freight_cost, 0) > 0 and not exists (
    select 1 from public.accounts_payable ap join public.purchase_receipts r on r.id = ap.origin_id
     where ap.company_id = v_receipt.company_id and ap.origin_type = 'purchase_receipt'
       and r.purchase_order_id = v_order.id and r.id <> v_receipt.id) then
    v_amount := v_amount + v_order.freight_cost;
  end if;
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

alter table public.sales_orders drop constraint if exists sales_orders_total_non_negative;
alter table public.sales_orders add constraint sales_orders_total_non_negative check (total_amount >= 0) not valid;
alter table public.sales_quotes drop constraint if exists sales_quotes_total_non_negative;
alter table public.sales_quotes add constraint sales_quotes_total_non_negative check (total_amount >= 0) not valid;
