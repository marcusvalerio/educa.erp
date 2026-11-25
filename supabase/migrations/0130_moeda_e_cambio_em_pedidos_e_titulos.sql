-- Moeda e câmbio em pedidos de compra/venda e contas a pagar/receber.
-- Regra: TODOS os valores existentes continuam em BRL (moeda funcional —
-- estoque, financeiro e fiscal não mudam). Quando a moeda é estrangeira,
-- guarda-se a moeda e a taxa (BRL por 1 unidade) e o valor na moeda original
-- é derivado (valor_BRL / taxa). Taxa informada manualmente.

alter table public.purchase_orders
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists exchange_rate numeric(18, 8) not null default 1 check (exchange_rate > 0);
alter table public.sales_orders
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists exchange_rate numeric(18, 8) not null default 1 check (exchange_rate > 0);
alter table public.accounts_payable
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists exchange_rate numeric(18, 8) not null default 1 check (exchange_rate > 0);
alter table public.accounts_receivable
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists exchange_rate numeric(18, 8) not null default 1 check (exchange_rate > 0);

comment on column public.purchase_orders.exchange_rate is 'BRL por 1 unidade de currency_code. Valores do pedido seguem em BRL; valor na moeda = valor / taxa.';
comment on column public.sales_orders.exchange_rate is 'BRL por 1 unidade de currency_code. Valores do pedido seguem em BRL; valor na moeda = valor / taxa.';
comment on column public.accounts_payable.exchange_rate is 'Taxa herdada do pedido de compra (via recebimento). original_amount segue em BRL.';
comment on column public.accounts_receivable.exchange_rate is 'Taxa herdada do pedido de venda. original_amount segue em BRL.';

-- Define moeda/taxa de um pedido ainda em rascunho (chamada logo após criar).
create or replace function public.fn_set_order_currency(
  p_kind text, p_order_id uuid, p_currency_code text, p_exchange_rate numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_status text;
  v_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'BRL'));
  v_rate numeric := case when upper(coalesce(p_currency_code, 'BRL')) = 'BRL' then 1 else p_exchange_rate end;
begin
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Moeda inválida.' using errcode = '22023';
  end if;
  if v_rate is null or v_rate <= 0 then
    raise exception 'Informe a taxa de câmbio (maior que zero).' using errcode = '22023';
  end if;
  if p_kind = 'purchase' then
    select company_id, status into v_company, v_status from public.purchase_orders where id = p_order_id;
  elsif p_kind = 'sale' then
    select company_id, status into v_company, v_status from public.sales_orders where id = p_order_id;
  else
    raise exception 'Tipo de pedido inválido.' using errcode = '22023';
  end if;
  if v_company is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_company, case p_kind when 'purchase' then 'purchase_orders.create' else 'sales_orders.create' end) then
    raise exception 'Permissão negada.' using errcode = '42501';
  end if;
  if v_status <> 'draft' then
    raise exception 'A moeda só pode ser definida com o pedido em rascunho.' using errcode = '22023';
  end if;
  if p_kind = 'purchase' then
    update public.purchase_orders set currency_code = v_currency, exchange_rate = v_rate where id = p_order_id;
  else
    update public.sales_orders set currency_code = v_currency, exchange_rate = v_rate where id = p_order_id;
  end if;
end;
$$;
grant execute on function public.fn_set_order_currency(text, uuid, text, numeric) to authenticated;

-- Títulos gerados a partir de pedidos herdam moeda e taxa.
create or replace function public.fn_payable_inherit_currency()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origin_type = 'purchase_receipt' and new.origin_id is not null and new.currency_code = 'BRL' then
    select po.currency_code, po.exchange_rate into new.currency_code, new.exchange_rate
    from public.purchase_receipts r join public.purchase_orders po on po.id = r.purchase_order_id
    where r.id = new.origin_id;
    new.currency_code := coalesce(new.currency_code, 'BRL');
    new.exchange_rate := coalesce(new.exchange_rate, 1);
  end if;
  return new;
end;
$$;
drop trigger if exists inherit_currency on public.accounts_payable;
create trigger inherit_currency before insert on public.accounts_payable
  for each row execute procedure public.fn_payable_inherit_currency();

create or replace function public.fn_receivable_inherit_currency()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origin_type = 'sales_order' and new.origin_id is not null and new.currency_code = 'BRL' then
    select so.currency_code, so.exchange_rate into new.currency_code, new.exchange_rate
    from public.sales_orders so where so.id = new.origin_id;
    new.currency_code := coalesce(new.currency_code, 'BRL');
    new.exchange_rate := coalesce(new.exchange_rate, 1);
  end if;
  return new;
end;
$$;
drop trigger if exists inherit_currency on public.accounts_receivable;
create trigger inherit_currency before insert on public.accounts_receivable
  for each row execute procedure public.fn_receivable_inherit_currency();
