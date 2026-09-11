-- Fase 4 — Comercial: fundação (vendedores, tabelas de preço, condições
-- de pagamento, extensão de customers).
--
-- Nota: o pedido desta etapa lista `product_prices` entre as estruturas
-- já existentes — na branch claude/rls-rbac-catalogo-fase2b essa tabela
-- não existe (só products.cost_price/sale_price/min_price, colunas
-- simples sem conceito de vigência, adicionadas em 0007). "Tabela de
-- preço com vigência/prioridade" (pedido explícito da seção 6) é
-- construída aqui do zero (price_lists/price_list_items) porque não há
-- nada equivalente para reaproveitar nesta branch — não é duplicação.
--
-- customers já existe (0002) com credit_limit e um campo payment_terms
-- (texto livre). NÃO criada uma segunda tabela de clientes — só
-- extensão aditiva, mesmo padrão de products.category/unit ->
-- category_id/unit_id em 0007 (coluna antiga preservada, depreciada).

-- ==================================================================
-- SALES_REPRESENTATIVES (Vendedores/Representantes)
-- ==================================================================
create sequence if not exists public.sales_representatives_code_seq;

create table if not exists public.sales_representatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  document text,
  email text,
  phone text,
  commission_percentage numeric(5, 2) check (commission_percentage is null or (commission_percentage >= 0 and commission_percentage <= 100)),
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_code before insert on public.sales_representatives
  for each row execute procedure public.fn_generate_code('VEN', 'public.sales_representatives_code_seq');
create trigger set_updated_at before update on public.sales_representatives
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists sales_representatives_company_status_idx on public.sales_representatives (company_id, status);

comment on table public.sales_representatives is
  'Vendedores/representantes comerciais. Cálculo financeiro de comissão não implementado nesta etapa — commission_percentage é só o parâmetro, pronto para uma futura apuração.';

-- ==================================================================
-- PRICE_LISTS / PRICE_LIST_ITEMS (Tabelas de preço)
-- ==================================================================
create sequence if not exists public.price_lists_code_seq;

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  valid_from date,
  valid_until date,
  priority integer not null default 0,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (valid_from is null or valid_until is null or valid_from <= valid_until)
);

create trigger set_code before insert on public.price_lists
  for each row execute procedure public.fn_generate_code('TAB', 'public.price_lists_code_seq');
create trigger set_updated_at before update on public.price_lists
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists price_lists_company_status_idx on public.price_lists (company_id, status);

comment on table public.price_lists is
  'Tabelas de preço com vigência (valid_from/valid_until) e prioridade (maior primeiro, para resolver conflito quando um cliente/segmento se enquadra em mais de uma). Preço padrão do produto (products.sale_price) continua sendo o fallback quando nenhuma tabela se aplica.';
comment on column public.price_lists.priority is
  'Maior valor = maior prioridade. Usado por uma futura resolução automática de "qual tabela vale para este cliente" quando mais de uma se aplica — não implementada nesta etapa (a API de pedido/orçamento recebe price_list_id explicitamente).';

create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  price_list_id uuid not null,
  product_id uuid not null,
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (price_list_id, product_id),
  foreign key (price_list_id, company_id) references public.price_lists (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade
);

create trigger set_updated_at before update on public.price_list_items
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists price_list_items_price_list_idx on public.price_list_items (price_list_id);
create index if not exists price_list_items_product_idx on public.price_list_items (product_id);

-- ==================================================================
-- PAYMENT_TERMS / PAYMENT_TERM_INSTALLMENTS (Condições de pagamento)
-- ==================================================================
create sequence if not exists public.payment_terms_code_seq;

create table if not exists public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  installments_count integer not null default 1 check (installments_count > 0),
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_code before insert on public.payment_terms
  for each row execute procedure public.fn_generate_code('COND', 'public.payment_terms_code_seq');
create trigger set_updated_at before update on public.payment_terms
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists payment_terms_company_status_idx on public.payment_terms (company_id, status);

comment on table public.payment_terms is
  'Condições comerciais de pagamento (ex.: "30/60/90"). installments_count é redundante com count(payment_term_installments) por desenho — mantido para leitura rápida em listagens sem join. Geração de parcelas reais para o Financeiro (Contas a Receber) não implementada nesta etapa.';

create table if not exists public.payment_term_installments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_term_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  days_after integer not null default 0 check (days_after >= 0),
  percentage numeric(5, 2) not null check (percentage > 0 and percentage <= 100),
  created_at timestamptz not null default now(),
  unique (payment_term_id, installment_number),
  foreign key (payment_term_id, company_id) references public.payment_terms (id, company_id) on delete cascade
);

create index if not exists payment_term_installments_term_idx on public.payment_term_installments (payment_term_id);

comment on column public.payment_term_installments.days_after is
  'Dias após a data de referência do documento (ex.: emissão da fatura) em que esta parcela vence. Vencimento real só existe quando o Financeiro gerar o título — aqui é só o parâmetro.';

-- fn_create_payment_term / fn_update_payment_term — únicas formas de
-- escrever installments: garantem, em uma função só, que a soma dos
-- percentuais fecha em 100% (com tolerância de arredondamento) antes
-- de gravar qualquer linha. update substitui os installments por
-- completo (delete + reinsert), mesmo padrão de
-- fn_add_quote_supplier_response (0015).
create or replace function public.fn_create_payment_term(
  p_company_id uuid,
  p_code text,
  p_name text,
  p_installments jsonb,
  p_notes text default null
)
returns public.payment_terms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_term public.payment_terms;
  v_item jsonb;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if not public.has_permission(p_company_id, 'payment_terms.create') then
    raise exception 'Permissão negada (payment_terms.create).' using errcode = '42501';
  end if;

  if p_installments is null or jsonb_array_length(p_installments) = 0 then
    raise exception 'Informe ao menos uma parcela.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    v_total := v_total + (v_item->>'percentage')::numeric;
  end loop;
  if abs(v_total - 100) > 0.05 then
    raise exception 'A soma dos percentuais das parcelas deve ser 100%% (informado: %).', v_total using errcode = '22023';
  end if;

  insert into public.payment_terms (company_id, code, name, installments_count, notes)
  values (p_company_id, nullif(p_code, ''), p_name, jsonb_array_length(p_installments), p_notes)
  returning * into v_term;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    v_count := v_count + 1;
    insert into public.payment_term_installments (company_id, payment_term_id, installment_number, days_after, percentage)
    values (p_company_id, v_term.id, v_count, coalesce((v_item->>'days_after')::integer, 0), (v_item->>'percentage')::numeric);
  end loop;

  return v_term;
end;
$$;

create or replace function public.fn_update_payment_term(
  p_payment_term_id uuid,
  p_name text,
  p_installments jsonb,
  p_notes text default null,
  p_status text default null
)
returns public.payment_terms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_term public.payment_terms;
  v_item jsonb;
  v_total numeric := 0;
  v_count integer := 0;
begin
  select * into v_term from public.payment_terms where id = p_payment_term_id;
  if not found then
    raise exception 'Condição de pagamento não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_term.company_id, 'payment_terms.update') then
    raise exception 'Permissão negada (payment_terms.update).' using errcode = '42501';
  end if;

  if p_installments is not null and jsonb_array_length(p_installments) > 0 then
    for v_item in select * from jsonb_array_elements(p_installments)
    loop
      v_total := v_total + (v_item->>'percentage')::numeric;
    end loop;
    if abs(v_total - 100) > 0.05 then
      raise exception 'A soma dos percentuais das parcelas deve ser 100%% (informado: %).', v_total using errcode = '22023';
    end if;

    delete from public.payment_term_installments where payment_term_id = p_payment_term_id;
    for v_item in select * from jsonb_array_elements(p_installments)
    loop
      v_count := v_count + 1;
      insert into public.payment_term_installments (company_id, payment_term_id, installment_number, days_after, percentage)
      values (v_term.company_id, p_payment_term_id, v_count, coalesce((v_item->>'days_after')::integer, 0), (v_item->>'percentage')::numeric);
    end loop;
  end if;

  update public.payment_terms
  set name = coalesce(p_name, name),
      notes = coalesce(p_notes, notes),
      status = coalesce(p_status, status),
      installments_count = case when p_installments is not null and jsonb_array_length(p_installments) > 0 then v_count else installments_count end
  where id = p_payment_term_id
  returning * into v_term;

  return v_term;
end;
$$;

revoke all on function public.fn_create_payment_term(uuid, text, text, jsonb, text) from public;
revoke all on function public.fn_update_payment_term(uuid, text, jsonb, text, text) from public;
grant execute on function public.fn_create_payment_term(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.fn_update_payment_term(uuid, text, jsonb, text, text) to authenticated;

-- ==================================================================
-- CUSTOMERS — extensão aditiva. payment_terms (texto livre) segue
-- depreciada — default_payment_terms_id é a fonte de verdade daqui em
-- diante, mesmo padrão de products.unit/category em 0007.
-- ==================================================================
alter table public.customers
  add column if not exists default_sales_representative_id uuid references public.sales_representatives(id) on delete set null,
  add column if not exists default_price_list_id uuid references public.price_lists(id) on delete set null,
  add column if not exists default_payment_terms_id uuid references public.payment_terms(id) on delete set null,
  add column if not exists segment text,
  add column if not exists commercial_status text not null default 'active' check (commercial_status in ('active', 'credit_hold', 'blocked'));

create index if not exists customers_sales_representative_idx on public.customers (default_sales_representative_id);
create index if not exists customers_price_list_idx on public.customers (default_price_list_id);

comment on column public.customers.payment_terms is
  'Depreciado — ver default_payment_terms_id/payment_terms. Mantido por compatibilidade, não é mais a fonte de verdade.';
comment on column public.customers.commercial_status is
  'Situação comercial (diferente de status: um cliente pode estar "active" no cadastro e "credit_hold" no comercial — ex.: inadimplência). Enforcement em aprovação de pedido é preparado para o Financeiro, não implementado nesta etapa.';
comment on column public.customers.credit_limit is
  'Já existia desde 0002 — reaproveitado como "limite de crédito" do Comercial, nenhuma coluna nova necessária.';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('sales_representatives.read', 'sales_representatives', 'read', 'Consultar vendedores/representantes'),
    ('sales_representatives.create', 'sales_representatives', 'create', 'Criar vendedores/representantes'),
    ('sales_representatives.update', 'sales_representatives', 'update', 'Editar vendedores/representantes'),

    ('price_lists.read', 'price_lists', 'read', 'Consultar tabelas de preço'),
    ('price_lists.create', 'price_lists', 'create', 'Criar tabelas de preço'),
    ('price_lists.update', 'price_lists', 'update', 'Editar tabelas de preço e seus itens'),
    ('price_lists.delete', 'price_lists', 'delete', 'Excluir tabelas de preço'),

    ('payment_terms.view', 'payment_terms', 'view', 'Consultar condições de pagamento'),
    ('payment_terms.create', 'payment_terms', 'create', 'Criar condições de pagamento'),
    ('payment_terms.update', 'payment_terms', 'update', 'Editar condições de pagamento')
) as v(code, module, action, description)
on conflict (code) do nothing;

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_rbac(c.id);
  end loop;
end;
$$;

-- ==================================================================
-- RLS
-- ==================================================================
alter table public.sales_representatives enable row level security;
alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;
alter table public.payment_terms enable row level security;
alter table public.payment_term_installments enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('sales_representatives')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.read'
    );
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.create'
    );
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.update', t.table_name || '.update'
    );
    -- Sem policy de delete: sales_representatives não tem permissão
    -- .delete (pedido explícito só lista view/create/update) — exclusão
    -- fica indisponível por padrão, sem precisar inventar uma
    -- permissão que ninguém concede.
  end loop;
end;
$$;

drop policy if exists price_lists_select on public.price_lists;
create policy price_lists_select on public.price_lists
  for select to authenticated using (public.has_permission(company_id, 'price_lists.read'));
drop policy if exists price_lists_insert on public.price_lists;
create policy price_lists_insert on public.price_lists
  for insert to authenticated with check (public.has_permission(company_id, 'price_lists.create'));
drop policy if exists price_lists_update on public.price_lists;
create policy price_lists_update on public.price_lists
  for update to authenticated using (public.has_permission(company_id, 'price_lists.update')) with check (public.has_permission(company_id, 'price_lists.update'));
drop policy if exists price_lists_delete on public.price_lists;
create policy price_lists_delete on public.price_lists
  for delete to authenticated using (public.has_permission(company_id, 'price_lists.delete'));

drop policy if exists price_list_items_select on public.price_list_items;
create policy price_list_items_select on public.price_list_items
  for select to authenticated using (public.has_permission(company_id, 'price_lists.read'));
drop policy if exists price_list_items_insert on public.price_list_items;
create policy price_list_items_insert on public.price_list_items
  for insert to authenticated with check (public.has_permission(company_id, 'price_lists.update'));
drop policy if exists price_list_items_update on public.price_list_items;
create policy price_list_items_update on public.price_list_items
  for update to authenticated using (public.has_permission(company_id, 'price_lists.update')) with check (public.has_permission(company_id, 'price_lists.update'));
drop policy if exists price_list_items_delete on public.price_list_items;
create policy price_list_items_delete on public.price_list_items
  for delete to authenticated using (public.has_permission(company_id, 'price_lists.update'));

-- payment_terms/payment_term_installments: só select direto — escrita
-- exclusiva via fn_create_payment_term/fn_update_payment_term (garante
-- a soma de 100% nas parcelas).
drop policy if exists payment_terms_select on public.payment_terms;
create policy payment_terms_select on public.payment_terms
  for select to authenticated using (public.has_permission(company_id, 'payment_terms.view'));
drop policy if exists payment_term_installments_select on public.payment_term_installments;
create policy payment_term_installments_select on public.payment_term_installments
  for select to authenticated using (public.has_permission(company_id, 'payment_terms.view'));
