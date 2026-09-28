set search_path to public, extensions;

create extension if not exists ltree with schema extensions;
create extension if not exists btree_gist with schema extensions;

create table if not exists public.units (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.units is
  'Catálogo global de unidades de medida. Não é por empresa — infraestrutura compartilhada, como public.permissions.';

insert into public.units (code, name) values
  ('UN', 'Unidade'),
  ('KG', 'Quilograma'),
  ('G', 'Grama'),
  ('L', 'Litro'),
  ('ML', 'Mililitro'),
  ('M', 'Metro'),
  ('CM', 'Centímetro'),
  ('CX', 'Caixa'),
  ('PC', 'Peça'),
  ('KIT', 'Kit'),
  ('T', 'Tonelada'),
  ('FD', 'Fardo'),
  ('PAL', 'Pallet')
on conflict (code) do nothing;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.product_categories(id) on delete restrict,
  code text not null,
  name text not null,
  path extensions.ltree,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create or replace function public.fn_set_product_category_path()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_parent public.product_categories%rowtype;
begin
  if NEW.parent_id is null then
    NEW.path := text2ltree(replace(NEW.id::text, '-', '_'));
    return NEW;
  end if;

  select * into v_parent from public.product_categories where id = NEW.parent_id;
  if v_parent.id is null then
    raise exception 'Categoria pai inválida.';
  end if;
  if v_parent.company_id <> NEW.company_id then
    raise exception 'Categoria pai pertence a outra empresa.';
  end if;

  NEW.path := v_parent.path || text2ltree(replace(NEW.id::text, '-', '_'));
  return NEW;
end;
$$;

create trigger set_path before insert on public.product_categories
  for each row execute procedure public.fn_set_product_category_path();
create trigger set_updated_at before update on public.product_categories
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_categories_path_gist_idx on public.product_categories using gist (path);
create index if not exists product_categories_company_status_idx on public.product_categories (company_id, status);
create index if not exists product_categories_parent_idx on public.product_categories (parent_id);

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create trigger set_updated_at before update on public.product_brands
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_brands_company_status_idx on public.product_brands (company_id, status);

create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit_code text not null references public.units(code) on delete restrict,
  conversion_factor numeric(18, 6) not null default 1 check (conversion_factor > 0),
  barcode text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, unit_code)
);

comment on column public.product_units.conversion_factor is
  'Quantas unidades base (products.unit) equivalem a 1 desta embalagem. Ex.: 1 CX = 12 UN -> conversion_factor = 12.';

create trigger set_updated_at before update on public.product_units
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_units_product_idx on public.product_units (product_id);

create table if not exists public.product_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_sku text,
  cost numeric(14, 4),
  lead_time_days integer,
  is_preferred boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, supplier_id)
);

create trigger set_updated_at before update on public.product_suppliers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_suppliers_product_idx on public.product_suppliers (product_id);
create index if not exists product_suppliers_supplier_idx on public.product_suppliers (supplier_id);

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price_type text not null check (price_type in ('cost', 'sale', 'minimum')),
  amount numeric(14, 4) not null check (amount >= 0),
  currency text not null default 'BRL',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  exclude using gist (
    product_id with =,
    price_type with =,
    tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') with &&
  )
);

create trigger set_updated_at before update on public.product_prices
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_prices_product_idx on public.product_prices (product_id, price_type);

alter table public.products add column if not exists category_id uuid references public.product_categories(id) on delete restrict;
alter table public.products add column if not exists brand_id uuid references public.product_brands(id) on delete restrict;
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_brand_idx on public.products (brand_id);

alter table public.products
  add constraint products_unit_fkey foreign key (unit) references public.units (code) on delete restrict;

alter table public.units enable row level security;
create policy units_select_authenticated on public.units for select to authenticated using (true);

alter table public.product_categories enable row level security;
create policy product_categories_select on public.product_categories for select to authenticated using (public.has_permission(company_id, 'categories.read'));
create policy product_categories_insert on public.product_categories for insert to authenticated with check (public.has_permission(company_id, 'categories.create'));
create policy product_categories_update on public.product_categories for update to authenticated using (public.has_permission(company_id, 'categories.update')) with check (public.has_permission(company_id, 'categories.update'));
create policy product_categories_delete on public.product_categories for delete to authenticated using (public.has_permission(company_id, 'categories.delete'));

alter table public.product_brands enable row level security;
create policy product_brands_select on public.product_brands for select to authenticated using (public.has_permission(company_id, 'brands.read'));
create policy product_brands_insert on public.product_brands for insert to authenticated with check (public.has_permission(company_id, 'brands.create'));
create policy product_brands_update on public.product_brands for update to authenticated using (public.has_permission(company_id, 'brands.update')) with check (public.has_permission(company_id, 'brands.update'));
create policy product_brands_delete on public.product_brands for delete to authenticated using (public.has_permission(company_id, 'brands.delete'));

alter table public.product_units enable row level security;
create policy product_units_select on public.product_units for select to authenticated using (public.has_permission(company_id, 'products.read'));
create policy product_units_insert on public.product_units for insert to authenticated with check (public.has_permission(company_id, 'products.update'));
create policy product_units_update on public.product_units for update to authenticated using (public.has_permission(company_id, 'products.update')) with check (public.has_permission(company_id, 'products.update'));
create policy product_units_delete on public.product_units for delete to authenticated using (public.has_permission(company_id, 'products.update'));

alter table public.product_suppliers enable row level security;
create policy product_suppliers_select on public.product_suppliers for select to authenticated using (public.has_permission(company_id, 'products.read'));
create policy product_suppliers_insert on public.product_suppliers for insert to authenticated with check (public.has_permission(company_id, 'products.update'));
create policy product_suppliers_update on public.product_suppliers for update to authenticated using (public.has_permission(company_id, 'products.update')) with check (public.has_permission(company_id, 'products.update'));
create policy product_suppliers_delete on public.product_suppliers for delete to authenticated using (public.has_permission(company_id, 'products.update'));

alter table public.product_prices enable row level security;
create policy product_prices_select on public.product_prices for select to authenticated using (public.has_permission(company_id, 'products.read'));
create policy product_prices_insert on public.product_prices for insert to authenticated with check (public.has_permission(company_id, 'products.update'));
create policy product_prices_update on public.product_prices for update to authenticated using (public.has_permission(company_id, 'products.update')) with check (public.has_permission(company_id, 'products.update'));
create policy product_prices_delete on public.product_prices for delete to authenticated using (public.has_permission(company_id, 'products.update'));
