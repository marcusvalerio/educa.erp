-- Clientes e fornecedores internacionais (importação / exportação).
-- Novo tipo 'foreign' (Estrangeiro): documento passa a ser o Tax ID/VAT do país,
-- sem validação de CPF/CNPJ. País (ISO 3166-1 alfa-2) e moeda padrão (ISO 4217).

alter table public.suppliers drop constraint if exists suppliers_type_check;
alter table public.suppliers add constraint suppliers_type_check
  check (type in ('individual', 'company', 'foreign'));
alter table public.customers drop constraint if exists customers_type_check;
alter table public.customers add constraint customers_type_check
  check (type in ('individual', 'company', 'foreign'));

alter table public.suppliers
  add column if not exists country_code text not null default 'BR',
  add column if not exists currency_code text not null default 'BRL';
alter table public.customers
  add column if not exists country_code text not null default 'BR',
  add column if not exists currency_code text not null default 'BRL';

comment on column public.suppliers.country_code is 'País do fornecedor (ISO 3166-1 alfa-2). BR = nacional.';
comment on column public.suppliers.currency_code is 'Moeda padrão de negociação (ISO 4217).';
comment on column public.customers.country_code is 'País do cliente (ISO 3166-1 alfa-2). BR = nacional.';
comment on column public.customers.currency_code is 'Moeda padrão de negociação (ISO 4217).';
