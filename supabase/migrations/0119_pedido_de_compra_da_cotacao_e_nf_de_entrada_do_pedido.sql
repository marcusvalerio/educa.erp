-- 0119 — Pedido de compra nasce da solicitação ou da cotação; NF de entrada
-- pelo pedido.
--
-- 1) fn_create_purchase_order_from_quote(cotação): com o fornecedor vencedor
--    escolhido (cotação encerrada), gera o pedido de compra com os itens,
--    preços, condição e frete da proposta vencedora, ligado à cotação e à
--    solicitação de origem. Um pedido por cotação (chamar de novo devolve o
--    mesmo, se não estiver cancelado).
-- 2) fn_register_purchase_order_entry_invoices(pedido): lança a NF de entrada
--    de cada recebimento confirmado do pedido que ainda não tem (0116).
--    Devolve quantas notas o pedido tem.
-- Pode rodar de novo.

create or replace function public.fn_create_purchase_order_from_quote(p_quote_id uuid)
returns public.purchase_orders
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quote public.purchase_quotes;
  v_win public.purchase_quote_suppliers;
  v_order public.purchase_orders;
  v_items jsonb;
begin
  select * into v_quote from public.purchase_quotes where id = p_quote_id;
  if not found then
    raise exception 'Cotação não encontrada.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_quote.company_id, 'purchase_orders.create') then
    raise exception 'Permissão negada (purchase_orders.create).' using errcode = '42501';
  end if;

  select * into v_order from public.purchase_orders
  where company_id = v_quote.company_id and purchase_quote_id = v_quote.id and status <> 'cancelled'
  order by created_at desc limit 1;
  if found then
    return v_order;
  end if;

  select * into v_win from public.purchase_quote_suppliers where quote_id = v_quote.id and status = 'selected' limit 1;
  if not found then
    raise exception 'Escolha o fornecedor vencedor da cotação antes de gerar o pedido.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.purchase_quote_items where quote_supplier_id = v_win.id and quantity > 0 and product_id is null) then
    raise exception 'Na proposta vencedora há item sem produto cadastrado: ligue cada item a um produto para gerar o pedido.' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id', i.product_id,
           'description', coalesce(i.description, p.name),
           'unit', p.unit,
           'quantity', i.quantity,
           'unit_price', i.unit_price,
           'discount', coalesce(i.discount, 0),
           'notes', i.notes) order by i.created_at)
    into v_items
  from public.purchase_quote_items i
  join public.products p on p.id = i.product_id
  where i.quote_supplier_id = v_win.id and i.quantity > 0;
  if v_items is null then
    raise exception 'A proposta vencedora não tem itens com quantidade e preço. Registre a resposta do fornecedor.' using errcode = 'P0001';
  end if;

  v_order := public.fn_create_purchase_order(
    v_quote.company_id, v_win.supplier_id, v_items, v_quote.purchase_request_id, v_quote.id,
    v_win.payment_terms, coalesce(v_win.freight_cost, 0), 0,
    case when v_win.delivery_days is not null then current_date + v_win.delivery_days end,
    'Gerado da cotação ' || v_quote.code);
  return v_order;
end;
$$;
revoke all on function public.fn_create_purchase_order_from_quote(uuid) from public, anon;
grant execute on function public.fn_create_purchase_order_from_quote(uuid) to authenticated;

create or replace function public.fn_register_purchase_order_entry_invoices(p_order_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
  r record;
  n integer := 0;
begin
  select * into v_order from public.purchase_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.purchase_receipts where purchase_order_id = p_order_id and status = 'confirmed') then
    raise exception 'Este pedido ainda não tem recebimento confirmado: a NF de entrada nasce do recebimento.' using errcode = 'P0001';
  end if;
  for r in select id from public.purchase_receipts where purchase_order_id = p_order_id and status = 'confirmed' order by created_at loop
    perform public.fn_register_purchase_entry_invoice(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.fn_register_purchase_order_entry_invoices(uuid) from public, anon;
grant execute on function public.fn_register_purchase_order_entry_invoices(uuid) to authenticated;
