-- Moeda e câmbio também no orçamento de venda (mesma regra de 0130:
-- valores seguem em BRL; guarda-se a moeda e a taxa BRL por 1 unidade).
-- O pedido gerado a partir do orçamento copia moeda e taxa.

alter table public.sales_quotes
  add column if not exists currency_code text not null default 'BRL',
  add column if not exists exchange_rate numeric(18, 8) not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_quotes_exchange_rate_check'
  ) then
    alter table public.sales_quotes
      add constraint sales_quotes_exchange_rate_check check (exchange_rate > 0);
  end if;
end;
$$;

comment on column public.sales_quotes.exchange_rate is 'BRL por 1 unidade de currency_code. Valores do orçamento seguem em BRL; valor na moeda = valor / taxa.';
