-- Fase "RLS / RBAC / Catálogo — rodada 1" — fundação de catálogo.
--
-- Produto continua sendo o item/catálogo — NÃO estoque (sem coluna de
-- saldo aqui; ver comentário em `products.default_location_code`
-- mantido como está). `products.category/subcategory/unit/supplier_id`
-- NÃO são removidos nesta migration — ganham equivalentes relacionais
-- (`category_id`, `brand_id`, `product_suppliers`) e são preenchidos
-- por backfill a partir dos dados existentes, para não quebrar nada em
-- produção. A UI segue usando os campos antigos e ganha, de forma
-- aditiva, os novos seletores (ver src/lib/cadastros/forms.ts) — o
-- corte definitivo fica para a próxima rodada de maturidade.
set search_path to public, extensions;

create extension if not exists ltree with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ==================================================================
-- UNITS — catálogo global (como `permissions`): UN/KG/CX etc. são
-- unidades universais, não dado de uma empresa específica.
-- ==================================================================
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

-- ==================================================================
-- PRODUCT_CATEGORIES — hierárquica via ltree (extensão já disponível
-- no projeto, nunca usada). `path` é mantido por trigger só no INSERT
-- — reparentar uma categoria já criada (e recalcular o path de toda a
-- subárvore) fica para a próxima rodada de maturidade.
-- ==================================================================
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

-- ==================================================================
-- PRODUCT_BRANDS
-- ==================================================================
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

-- ==================================================================
-- PRODUCT_UNITS — embalagens/conversões/código de barras por embalagem
-- (ex.: produto cuja unidade base é UN também vende em CX de 12 UN,
-- com barcode próprio da caixa). `products.unit` continua sendo a
-- unidade comercial padrão do produto — esta tabela é só para
-- embalagens ADICIONAIS, opcional.
-- ==================================================================
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

-- ==================================================================
-- PRODUCT_SUPPLIERS — N:N produto↔fornecedor (substitui a suposição de
-- fornecedor único). `products.supplier_id` é preservado como
-- "fornecedor preferido" de conveniência/legado.
-- ==================================================================
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

-- ==================================================================
-- PRODUCT_PRICES — fundação de preço/custo (sem motor comercial/lista
-- de preços completa). Exclusion constraint (btree_gist) impede dois
-- períodos vigentes sobrepostos do mesmo tipo para o mesmo produto.
-- ==================================================================
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

-- ==================================================================
-- PRODUCTS — colunas relacionais novas (aditivas) + FK de unidade
-- ==================================================================
alter table public.products add column if not exists category_id uuid references public.product_categories(id) on delete restrict;
alter table public.products add column if not exists brand_id uuid references public.product_brands(id) on delete restrict;
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_brand_idx on public.products (brand_id);

-- Todos os valores hoje usados em products.unit já estão no seed de
-- `units` acima (UN/KG/G/L/ML/M/CX/PC/KIT/T) — FK segura, sem órfãos.
alter table public.products
  add constraint products_unit_fkey foreign key (unit) references public.units (code) on delete restrict;

-- ==================================================================
-- BACKFILL — categorias/subcategorias existentes (texto livre) viram
-- linhas reais em product_categories, e products.category_id passa a
-- apontar para elas. products.category/subcategory NÃO são apagados.
-- ==================================================================
do $$
declare
  r record;
  v_cat_id uuid;
begin
  for r in
    select distinct company_id, category
    from public.products
    where category is not null and category <> ''
  loop
    insert into public.product_categories (company_id, code, name)
    values (
      r.company_id,
      upper(left(regexp_replace(r.category, '[^a-zA-Z0-9]+', '_', 'g'), 40)),
      r.category
    )
    on conflict (company_id, code) do nothing;
  end loop;

  for r in
    select distinct company_id, category, subcategory
    from public.products
    where category is not null and category <> ''
      and subcategory is not null and subcategory <> ''
  loop
    select id into v_cat_id from public.product_categories
      where company_id = r.company_id and name = r.category and parent_id is null;
    if v_cat_id is not null then
      insert into public.product_categories (company_id, parent_id, code, name)
      values (
        r.company_id,
        v_cat_id,
        upper(left(regexp_replace(r.category || '_' || r.subcategory, '[^a-zA-Z0-9]+', '_', 'g'), 40)),
        r.subcategory
      )
      on conflict (company_id, code) do nothing;
    end if;
  end loop;
end;
$$;

update public.products p
set category_id = pc.id
from public.product_categories pc
join public.product_categories parent on parent.id = pc.parent_id
where pc.company_id = p.company_id
  and pc.name = p.subcategory
  and parent.name = p.category
  and p.category is not null and p.category <> ''
  and p.subcategory is not null and p.subcategory <> '';

update public.products p
set category_id = pc.id
from public.product_categories pc
where pc.company_id = p.company_id
  and pc.parent_id is null
  and pc.name = p.category
  and p.category_id is null
  and p.category is not null and p.category <> '';

-- BACKFILL — fornecedor único existente vira o primeiro (preferido) de
-- product_suppliers, sem apagar products.supplier_id.
insert into public.product_suppliers (company_id, product_id, supplier_id, is_preferred)
select company_id, id, supplier_id, true
from public.products
where supplier_id is not null
on conflict (company_id, product_id, supplier_id) do nothing;

-- ==================================================================
-- RLS — todas as tabelas novas, sem exceção. `units` é a única com
-- leitura irrestrita (catálogo global sem company_id, mesmo raciocínio
-- de public.permissions); as demais seguem o padrão has_permission().
-- ==================================================================
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

-- product_units/product_suppliers/product_prices são sub-recursos de
-- produto — reaproveitam as permissões products.* em vez de criar um
-- código novo para cada um (evita inflar o catálogo de permissões sem
-- necessidade real nesta rodada).
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
