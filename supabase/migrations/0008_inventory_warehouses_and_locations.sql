-- Fase 2c — Estoque/WMS: depósitos, endereçamento hierárquico, lotes e
-- números de série.
--
-- Continuação aditiva sobre 0001-0007: nenhuma coluna existente de
-- `warehouse_locations`/`products` é removida ou renomeada. `warehouse`
-- (texto livre) em warehouse_locations é preservado como depreciado —
-- ver comentário na coluna — em favor de `warehouse_id` (FK real).
--
-- Produto continua não sendo estoque (ver 0007): as tabelas aqui são
-- infraestrutura de endereçamento e rastreabilidade. Saldo real só
-- aparece a partir de 0009 (stock_balances/stock_movements).

-- ==================================================================
-- WAREHOUSES (Depósitos/Armazéns)
-- ==================================================================
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'standard' check (type in ('standard', 'virtual')),
  address text,
  city text,
  state text,
  zip_code text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.warehouses
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists warehouses_company_status_idx on public.warehouses (company_id, status);

comment on table public.warehouses is
  'Depósitos/armazéns físicos ou virtuais de uma empresa. warehouse_locations.warehouse_id referencia esta tabela.';
comment on column public.warehouses.type is
  'standard = depósito físico normal. virtual = bucket lógico (ex.: quarentena, avarias) sem endereço físico próprio.';

-- ==================================================================
-- Seed de depósito padrão por empresa (mesmo padrão de
-- fn_seed_company_rbac/fn_seed_company_units).
-- ==================================================================
create or replace function public.fn_seed_company_default_warehouse(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.warehouses (company_id, code, name, type)
  values (p_company_id, 'PRINCIPAL', 'Depósito Principal', 'standard')
  on conflict (company_id, code) do update set company_id = excluded.company_id
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.warehouses where company_id = p_company_id and code = 'PRINCIPAL';
  end if;

  return v_id;
end;
$$;

create or replace function public.fn_seed_company_default_warehouse_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_company_default_warehouse(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists seed_company_default_warehouse on public.companies;
create trigger seed_company_default_warehouse
  after insert on public.companies
  for each row execute procedure public.fn_seed_company_default_warehouse_trigger();

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_default_warehouse(c.id);
  end loop;
end;
$$;

-- ==================================================================
-- WAREHOUSE_LOCATIONS — endereçamento hierárquico (parent_location_id)
-- + vínculo real a um depósito (warehouse_id). Colunas antigas
-- (warehouse texto livre, zone/aisle/rack/level/position) preservadas.
-- ==================================================================
alter table public.warehouse_locations
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict,
  add column if not exists parent_location_id uuid;

alter table public.warehouse_locations
  add constraint warehouse_locations_id_company_id_key unique (id, company_id);

alter table public.warehouse_locations
  add constraint warehouse_locations_parent_fk
  foreign key (parent_location_id, company_id)
  references public.warehouse_locations (id, company_id) on delete restrict;

alter table public.warehouse_locations
  add constraint warehouse_locations_parent_not_self check (parent_location_id is null or parent_location_id <> id);

comment on column public.warehouse_locations.warehouse is
  'Depreciado — ver warehouse_id/warehouses. Mantido por compatibilidade, não é mais a fonte de verdade.';
comment on column public.warehouse_locations.parent_location_id is
  'Endereçamento hierárquico (ex.: depósito -> rua -> prédio -> nível -> posição). Raiz quando null.';

create index if not exists warehouse_locations_warehouse_idx on public.warehouse_locations (warehouse_id);
create index if not exists warehouse_locations_parent_idx on public.warehouse_locations (parent_location_id);

-- Backfill: garante um warehouse por valor distinto já usado em
-- warehouse_locations.warehouse (texto livre), e aponta warehouse_id.
-- Linhas sem texto de depósito caem no depósito padrão da empresa
-- (semeado acima), garantindo warehouse_id sempre preenchido ao final.
insert into public.warehouses (company_id, code, name, type)
select distinct
  wl.company_id,
  upper(regexp_replace(trim(wl.warehouse), '[^a-zA-Z0-9]+', '_', 'g')),
  trim(wl.warehouse),
  'standard'
from public.warehouse_locations wl
where wl.warehouse is not null and trim(wl.warehouse) <> ''
on conflict (company_id, code) do nothing;

update public.warehouse_locations wl
set warehouse_id = w.id
from public.warehouses w
where w.company_id = wl.company_id
  and w.code = upper(regexp_replace(trim(wl.warehouse), '[^a-zA-Z0-9]+', '_', 'g'))
  and wl.warehouse_id is null
  and wl.warehouse is not null and trim(wl.warehouse) <> '';

update public.warehouse_locations wl
set warehouse_id = public.fn_seed_company_default_warehouse(wl.company_id)
where wl.warehouse_id is null;

alter table public.warehouse_locations alter column warehouse_id set not null;

-- ==================================================================
-- PRODUCTS — flag adicional de rastreabilidade por número de série
-- (batch_controlled/expiration_controlled já existiam desde 0002).
-- ==================================================================
alter table public.products
  add column if not exists serial_controlled boolean not null default false;

-- ==================================================================
-- PRODUCT_LOTS (Lotes) — rastreabilidade de lote por produto.
-- ==================================================================
create table if not exists public.product_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  lot_number text not null,
  manufactured_at date,
  expires_at date,
  supplier_id uuid references public.suppliers(id) on delete set null,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, lot_number),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.product_lots
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_lots_company_status_idx on public.product_lots (company_id, status);
create index if not exists product_lots_product_idx on public.product_lots (product_id);
create index if not exists product_lots_expires_idx on public.product_lots (expires_at);

comment on table public.product_lots is
  'Lotes rastreáveis por produto. Usado por stock_balances/stock_movements quando products.batch_controlled = true.';

-- ==================================================================
-- PRODUCT_SERIAL_NUMBERS (Números de série) — rastreabilidade unitária.
-- Vocabulário de status próprio (ciclo de vida do item serializado),
-- diferente do active/inactive das tabelas de cadastro.
-- ==================================================================
create table if not exists public.product_serial_numbers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  serial_number text not null,
  status text not null default 'in_stock' check (status in ('in_stock', 'reserved', 'shipped', 'returned', 'scrapped')),
  current_location_id uuid references public.warehouse_locations(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, serial_number)
);

create trigger set_updated_at before update on public.product_serial_numbers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_serial_numbers_company_idx on public.product_serial_numbers (company_id, status);
create index if not exists product_serial_numbers_product_idx on public.product_serial_numbers (product_id);
create index if not exists product_serial_numbers_location_idx on public.product_serial_numbers (current_location_id);

comment on table public.product_serial_numbers is
  'Números de série rastreados individualmente por produto (products.serial_controlled = true). Registro de rastreabilidade — não participa do cálculo de stock_balances nesta etapa.';

-- ==================================================================
-- PERMISSIONS — novos módulos desta etapa.
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('warehouses.read', 'warehouses', 'read', 'Consultar depósitos'),
    ('warehouses.create', 'warehouses', 'create', 'Criar depósitos'),
    ('warehouses.update', 'warehouses', 'update', 'Editar depósitos'),
    ('warehouses.delete', 'warehouses', 'delete', 'Excluir depósitos'),

    ('product_lots.read', 'product_lots', 'read', 'Consultar lotes de produto'),
    ('product_lots.create', 'product_lots', 'create', 'Criar lotes de produto'),
    ('product_lots.update', 'product_lots', 'update', 'Editar lotes de produto'),
    ('product_lots.delete', 'product_lots', 'delete', 'Excluir lotes de produto'),

    ('product_serial_numbers.read', 'product_serial_numbers', 'read', 'Consultar números de série'),
    ('product_serial_numbers.create', 'product_serial_numbers', 'create', 'Criar números de série'),
    ('product_serial_numbers.update', 'product_serial_numbers', 'update', 'Editar números de série'),
    ('product_serial_numbers.delete', 'product_serial_numbers', 'delete', 'Excluir números de série')
) as v(code, module, action, description)
on conflict (code) do nothing;

-- Re-semeia RBAC das empresas já existentes para que admin/operator/viewer
-- recebam automaticamente as novas permissões (fn_seed_company_rbac é
-- idempotente — on conflict do nothing — e lê o catálogo de permissions
-- dinamicamente, então basta chamá-la de novo).
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
alter table public.warehouses enable row level security;
alter table public.product_lots enable row level security;
alter table public.product_serial_numbers enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('warehouses'),
      ('product_lots'),
      ('product_serial_numbers')
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
end;
$$;
