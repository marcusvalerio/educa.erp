-- 0138 — Adicionar fornecedor a uma cotação aberta (Suprimentos › Cotações).
-- purchase_quote_suppliers só é escrita por funções (0015); não havia uma
-- para convidar outro fornecedor depois de criada a cotação.
-- Idempotente: convidar de novo o mesmo fornecedor não duplica.
create or replace function public.fn_add_purchase_quote_supplier(
  p_quote_id uuid,
  p_supplier_id uuid
)
returns public.purchase_quote_suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.purchase_quotes;
  v_qs public.purchase_quote_suppliers;
begin
  select * into v_quote from public.purchase_quotes where id = p_quote_id;
  if not found then
    raise exception 'Cotação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'purchase_quotes.update') then
    raise exception 'Permissão negada (purchase_quotes.update).' using errcode = '42501';
  end if;

  if v_quote.status not in ('draft', 'sent') then
    raise exception 'Só é possível adicionar fornecedor em uma cotação aberta (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = v_quote.company_id) then
    raise exception 'Fornecedor não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.purchase_quote_suppliers (company_id, quote_id, supplier_id)
  values (v_quote.company_id, v_quote.id, p_supplier_id)
  on conflict (quote_id, supplier_id) do nothing;

  select * into v_qs from public.purchase_quote_suppliers where quote_id = v_quote.id and supplier_id = p_supplier_id;
  return v_qs;
end;
$$;

revoke all on function public.fn_add_purchase_quote_supplier(uuid, uuid) from public;
grant execute on function public.fn_add_purchase_quote_supplier(uuid, uuid) to authenticated;
