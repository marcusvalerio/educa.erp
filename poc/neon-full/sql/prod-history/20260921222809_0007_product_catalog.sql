create or replace function public.fn_slug(p_text text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(p_text)), '[^a-z0-9]+', '-', 'g'), '');
$$;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.product_categories(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  check (parent_id is null or parent_id <> id)
);

create or replace trigger set_updated_at before update on public.product_categories
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_categories_company_status_idx on public.product_categories (company_id, status);
create index if not exists product_categories_parent_idx on public.product_categories (parent_id);

comment on table public.product_categories is
  'Categorias de produto, hierárquicas via parent_id (categoria -> subcategoria). Substitui os campos livres products.category/subcategory, mantidos por compatibilidade.';

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create or replace trigger set_updated_at before update on public.product_brands
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_brands_company_status_idx on public.product_brands (company_id, status);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  fractionable boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create or replace trigger set_updated_at before update on public.units
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists units_company_status_idx on public.units (company_id, status);

comment on table public.units is
  'Unidades de medida por empresa. fractionable=false para unidades contáveis (UN, CX) onde quantidade fracionária não faz sentido na UI.';

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_unit_id uuid not null references public.units(id) on delete cascade,
  to_unit_id uuid not null references public.units(id) on delete cascade,
  factor numeric(14, 6) not null check (factor > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, from_unit_id, to_unit_id),
  check (from_unit_id <> to_unit_id)
);

create or replace trigger set_updated_at before update on public.unit_conversions
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists unit_conversions_company_idx on public.unit_conversions (company_id);

comment on table public.unit_conversions is
  '1 <from_unit> = <factor> <to_unit>. Ex.: CX -> UN, factor 12 ("1 CX = 12 UN").';

create or replace function public.fn_seed_company_units(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.units (company_id, code, name, fractionable)
  select p_company_id, v.code, v.name, v.fractionable
  from (values
    ('UN', 'Unidade', false),
    ('KG', 'Quilograma', true),
    ('G', 'Grama', true),
    ('L', 'Litro', true),
    ('ML', 'Mililitro', true),
    ('M', 'Metro', true),
    ('CM', 'Centímetro', true),
    ('CX', 'Caixa', false),
    ('FD', 'Fardo', false),
    ('PAL', 'Pallet', false)
  ) as v(code, name, fractionable)
  on conflict (company_id, code) do nothing;
end;
$$;

create or replace function public.fn_seed_company_units_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_company_units(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists seed_company_units on public.companies;
create trigger seed_company_units
  after insert on public.companies
  for each row execute procedure public.fn_seed_company_units_trigger();

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_units(c.id);
  end loop;
end;
$$;

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete restrict,
  add column if not exists brand_id uuid references public.product_brands(id) on delete restrict,
  add column if not exists unit_id uuid references public.units(id) on delete restrict,
  add column if not exists cost_price numeric(14, 4) check (cost_price is null or cost_price >= 0),
  add column if not exists sale_price numeric(14, 4) check (sale_price is null or sale_price >= 0),
  add column if not exists min_price numeric(14, 4) check (min_price is null or min_price >= 0);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_brand_idx on public.products (brand_id);
create index if not exists products_unit_idx on public.products (unit_id);

comment on column public.products.category is 'Depreciado — ver category_id/product_categories. Mantido por compatibilidade, não é mais a fonte de verdade.';
comment on column public.products.subcategory is 'Depreciado — ver category_id/product_categories (subcategoria = categoria filha).';
comment on column public.products.unit is 'Depreciado — ver unit_id/units. Mantido em sincronia (código da unidade) para compatibilidade de leitura.';

create table if not exists public.product_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_sku text,
  cost numeric(14, 4) check (cost is null or cost >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  is_preferred boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, supplier_id)
);

create or replace trigger set_updated_at before update on public.product_suppliers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_suppliers_product_idx on public.product_suppliers (product_id);
create index if not exists product_suppliers_supplier_idx on public.product_suppliers (supplier_id);

create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null,
  is_primary boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, barcode)
);

create or replace trigger set_updated_at before update on public.product_barcodes
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_barcodes_product_idx on public.product_barcodes (product_id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  sku text,
  barcode text,
  attributes jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, variant_name)
);

create unique index if not exists product_variants_sku_key on public.product_variants (company_id, sku) where sku is not null;
create or replace trigger set_updated_at before update on public.product_variants
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_variants_product_idx on public.product_variants (product_id);

comment on table public.product_variants is
  'Base para variantes de produto (ex.: tamanho, cor). Estrutura criada nesta etapa; fluxo de uso na UI fica para um ciclo futuro.';

alter table public.product_categories enable row level security;
alter table public.product_brands enable row level security;
alter table public.units enable row level security;
alter table public.unit_conversions enable row level security;
alter table public.product_suppliers enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.product_variants enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('product_categories'),
      ('product_brands'),
      ('units'),
      ('unit_conversions'),
      ('product_suppliers')
    ) as x(table_name)
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
    execute format('drop policy if exists %I_delete on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.delete'
    );
  end loop;

  for t in
    select * from (values
      ('product_barcodes'),
      ('product_variants')
    ) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'products.read'
    );
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'products.update'
    );
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'products.update', 'products.update'
    );
    execute format('drop policy if exists %I_delete on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'products.update'
    );
  end loop;
end;
$$;
