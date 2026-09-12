-- Fase 13 — Cadastros Mestres Avançados: unidade por produto,
-- segmentação de produto e atributos.

-- ==================================================================
-- PRODUCTS — unidade de compra/venda/produção (seção 13.3), além da
-- unidade de estoque já existente (unit_id, 0007). Nula = "mesma que
-- unit_id" (comportamento atual preservado sem exigir preenchimento).
-- A conversão entre elas é sempre resolvida por fn_convert_unit_quantity
-- (0049) no momento do uso — nenhum fator fixo duplicado aqui.
-- ==================================================================
alter table public.products
  add column if not exists purchase_unit_id uuid references public.units(id) on delete set null,
  add column if not exists sale_unit_id uuid references public.units(id) on delete set null,
  add column if not exists production_unit_id uuid references public.units(id) on delete set null,
  add column if not exists product_segment text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_product_segment_check') then
    alter table public.products
      add constraint products_product_segment_check
      check (product_segment is null or product_segment in ('RESALE', 'RAW_MATERIAL', 'FINISHED_GOOD', 'SERVICE'));
  end if;
end;
$$;

create index if not exists products_purchase_unit_idx on public.products (purchase_unit_id);
create index if not exists products_sale_unit_idx on public.products (sale_unit_id);
create index if not exists products_production_unit_idx on public.products (production_unit_id);
create index if not exists products_segment_idx on public.products (company_id, product_segment);

comment on column public.products.purchase_unit_id is
  'Unidade em que o produto é comprado (ex.: CAIXA). Nula = mesma unit_id (estoque). Conversão via fn_convert_unit_quantity, nunca um fator fixo aqui.';
comment on column public.products.sale_unit_id is
  'Unidade em que o produto é vendido. Nula = mesma unit_id.';
comment on column public.products.production_unit_id is
  'Unidade em que o produto é consumido/produzido (ex.: KG numa ordem que estoca em UN). Nula = mesma unit_id.';
comment on column public.products.product_segment is
  'Classificação comercial/contábil (RESALE/RAW_MATERIAL/FINISHED_GOOD/SERVICE) — seção 13.18. Dimensão DIFERENTE de production_type (0026: purchased/manufactured/both, que descreve ORIGEM/fabricação) — um produto pode ser production_type=''manufactured'' e product_segment=''FINISHED_GOOD'', ou production_type=''purchased'' e product_segment=''RESALE''. Nenhuma coluna substituída.';

-- ==================================================================
-- PRODUCT_ATTRIBUTES / VALUES / ASSIGNMENTS (seção 13.7) — atributos
-- tipados, não um JSON solto e não uma coluna por característica.
-- SELECT usa product_attribute_values (lista fechada); TEXT/NUMBER/
-- BOOLEAN gravam direto em product_attribute_assignments (sem lista
-- fechada — não faz sentido pré-cadastrar todo texto/número possível).
-- ==================================================================
create table if not exists public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  input_type text not null check (input_type in ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.product_attributes
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_attributes_company_status_idx on public.product_attributes (company_id, status);

comment on table public.product_attributes is
  'Característica de produto (Cor, Tamanho, Voltagem, Material...). input_type decide onde o valor é gravado em product_attribute_assignments — nunca uma coluna nova por característica, nunca um JSON sem tipo.';

create table if not exists public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  attribute_id uuid not null,
  value text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (company_id, attribute_id, value),
  unique (id, company_id),
  foreign key (attribute_id, company_id) references public.product_attributes (id, company_id) on delete cascade
);

create index if not exists product_attribute_values_attribute_idx on public.product_attribute_values (attribute_id);

comment on table public.product_attribute_values is
  'Lista fechada de valores possíveis — só usada quando product_attributes.input_type = SELECT (ex.: atributo Cor -> valores Azul/Verde/Vermelho).';

create table if not exists public.product_attribute_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  attribute_id uuid not null,
  value_id uuid,
  value_text text,
  value_number numeric(16, 4),
  value_boolean boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, attribute_id),
  foreign key (attribute_id, company_id) references public.product_attributes (id, company_id) on delete cascade,
  foreign key (value_id, company_id) references public.product_attribute_values (id, company_id) on delete restrict,
  constraint product_attribute_assignments_one_value_check check (
    (case when value_id is not null then 1 else 0 end)
    + (case when value_text is not null then 1 else 0 end)
    + (case when value_number is not null then 1 else 0 end)
    + (case when value_boolean is not null then 1 else 0 end) = 1
  )
);

create trigger set_updated_at before update on public.product_attribute_assignments
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_attribute_assignments_product_idx on public.product_attribute_assignments (product_id);
create index if not exists product_attribute_assignments_attribute_idx on public.product_attribute_assignments (attribute_id);

comment on constraint product_attribute_assignments_one_value_check on public.product_attribute_assignments is
  'Exatamente UM dos quatro campos de valor é preenchido — nunca um JSON solto, nunca ambiguidade sobre qual valor vale.';

-- ==================================================================
-- fn_assign_product_attribute — valida que o valor informado é
-- consistente com attribute.input_type (nunca confia só no CHECK
-- estrutural, que não sabe qual dos quatro campos é o "certo" para
-- este atributo específico) e faz upsert (um atributo por produto,
-- reatribuir substitui o valor anterior).
-- ==================================================================
create or replace function public.fn_assign_product_attribute(
  p_company_id uuid,
  p_product_id uuid,
  p_attribute_id uuid,
  p_value_id uuid default null,
  p_value_text text default null,
  p_value_number numeric default null,
  p_value_boolean boolean default null
)
returns public.product_attribute_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attribute public.product_attributes;
  v_value public.product_attribute_values;
  v_assignment public.product_attribute_assignments;
begin
  if not public.has_permission(p_company_id, 'product_attributes.update') then
    raise exception 'Permissão negada (product_attributes.update).' using errcode = '42501';
  end if;

  select * into v_attribute from public.product_attributes where id = p_attribute_id and company_id = p_company_id;
  if not found then
    raise exception 'Atributo não encontrado.' using errcode = 'P0002';
  end if;

  case v_attribute.input_type
    when 'SELECT' then
      if p_value_id is null then
        raise exception 'Atributo % exige um valor da lista (value_id).', v_attribute.name using errcode = '22023';
      end if;
      select * into v_value from public.product_attribute_values where id = p_value_id and attribute_id = p_attribute_id;
      if not found then
        raise exception 'Valor não pertence a este atributo.' using errcode = 'P0001';
      end if;
      if p_value_text is not null or p_value_number is not null or p_value_boolean is not null then
        raise exception 'Atributo % é SELECT — informe apenas value_id.', v_attribute.name using errcode = '22023';
      end if;
    when 'TEXT' then
      if p_value_text is null or p_value_id is not null or p_value_number is not null or p_value_boolean is not null then
        raise exception 'Atributo % é TEXT — informe apenas value_text.', v_attribute.name using errcode = '22023';
      end if;
    when 'NUMBER' then
      if p_value_number is null or p_value_id is not null or p_value_text is not null or p_value_boolean is not null then
        raise exception 'Atributo % é NUMBER — informe apenas value_number.', v_attribute.name using errcode = '22023';
      end if;
    when 'BOOLEAN' then
      if p_value_boolean is null or p_value_id is not null or p_value_text is not null or p_value_number is not null then
        raise exception 'Atributo % é BOOLEAN — informe apenas value_boolean.', v_attribute.name using errcode = '22023';
      end if;
  end case;

  insert into public.product_attribute_assignments (
    company_id, product_id, attribute_id, value_id, value_text, value_number, value_boolean
  ) values (
    p_company_id, p_product_id, p_attribute_id, p_value_id, p_value_text, p_value_number, p_value_boolean
  )
  on conflict (company_id, product_id, attribute_id) do update
  set value_id = excluded.value_id, value_text = excluded.value_text,
      value_number = excluded.value_number, value_boolean = excluded.value_boolean
  returning * into v_assignment;

  return v_assignment;
end;
$$;

revoke all on function public.fn_assign_product_attribute(uuid, uuid, uuid, uuid, text, numeric, boolean) from public;
grant execute on function public.fn_assign_product_attribute(uuid, uuid, uuid, uuid, text, numeric, boolean) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('product_attributes.view', 'product_attributes', 'view', 'Consultar atributos, valores e atribuições de produto'),
    ('product_attributes.create', 'product_attributes', 'create', 'Criar atributos e valores de atributo'),
    ('product_attributes.update', 'product_attributes', 'update', 'Editar atributos, valores e atribuir valores a produtos')
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
alter table public.product_attributes enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_attribute_assignments enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('product_attributes'), ('product_attribute_values'), ('product_attribute_assignments')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'product_attributes.view'
    );
  end loop;

  -- product_attributes/product_attribute_values: cadastro simples,
  -- CRUD direto via has_permission (mesmo padrão de product_categories).
  for t in
    select * from (values ('product_attributes'), ('product_attribute_values')) as x(table_name)
  loop
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'product_attributes.create'
    );
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'product_attributes.update', 'product_attributes.update'
    );
  end loop;
end;
$$;

comment on table public.product_attribute_assignments is
  'Escrita exclusiva via fn_assign_product_attribute (valida consistência com input_type) — nenhuma policy de insert/update direto para authenticated, só select.';
