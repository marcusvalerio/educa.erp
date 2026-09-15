-- Fase 16 — Ativos (parte 1): categorias, locais físicos e o cadastro
-- de ativos com hierarquia (máquina -> motor/painel/bomba).
--
-- Inspeção prévia: warehouse_locations (0002/0008/0013) é ESTOQUE
-- (onde fica mercadoria) — asset_locations é ONDE O ATIVO ESTÁ
-- INSTALADO (planta/setor/linha), conceito diferente, não duplicado:
-- "ATIVO NÃO É ESTOQUE" é levado ao pé da letra também no cadastro de
-- localização. cost_centers (0031) e suppliers (0002) são reaproveitados
-- como referência, nunca recriados.

create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create trigger set_updated_at before update on public.asset_categories
  for each row execute procedure extensions.moddatetime(updated_at);

create table if not exists public.asset_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  parent_id uuid,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (parent_id, company_id) references public.asset_locations (id, company_id) on delete set null
);

create trigger set_updated_at before update on public.asset_locations
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.asset_locations is
  'Localização FÍSICA de instalação de um ativo (planta/setor/linha) — não confundir com warehouse_locations (endereço de estoque). Hierárquica (parent_id), mesma técnica anticiclo de product_categories (0049).';

create or replace function public.fn_guard_asset_location_hierarchy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_depth integer := 0;
begin
  if NEW.parent_id is null then
    return NEW;
  end if;
  if NEW.parent_id = NEW.id then
    raise exception 'Um local não pode ser seu próprio local pai.' using errcode = 'P0001';
  end if;
  v_current := NEW.parent_id;
  while v_current is not null loop
    if v_current = NEW.id then
      raise exception 'Ciclo de hierarquia detectado em asset_locations.' using errcode = 'P0001';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Hierarquia de locais excede a profundidade máxima suportada (100 níveis).' using errcode = 'P0001';
    end if;
    select parent_id into v_current from public.asset_locations where id = v_current;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists guard_asset_location_hierarchy on public.asset_locations;
create trigger guard_asset_location_hierarchy
  before insert or update of parent_id on public.asset_locations
  for each row execute procedure public.fn_guard_asset_location_hierarchy();

-- ==================================================================
-- ASSETS (seção 16.1) — código/patrimônio, hierarquia pai/sub-ativo
-- (máquina -> motor/painel/bomba), mesma técnica anticiclo.
-- ==================================================================
create sequence if not exists public.assets_code_seq;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  description text not null,
  category_id uuid references public.asset_categories(id) on delete set null,
  manufacturer text,
  model text,
  serial_number text,
  location_id uuid references public.asset_locations(id) on delete set null,
  parent_asset_id uuid,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED')),
  acquisition_date date,
  acquisition_cost numeric(18, 2),
  supplier_id uuid references public.suppliers(id) on delete set null,
  warranty_expiration date,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (parent_asset_id, company_id) references public.assets (id, company_id) on delete set null
);

create trigger generate_asset_code before insert on public.assets
  for each row execute procedure public.fn_generate_code('AST', 'public.assets_code_seq');
create trigger set_updated_at before update on public.assets
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists assets_company_status_idx on public.assets (company_id, status);
create index if not exists assets_parent_idx on public.assets (company_id, parent_asset_id);
create index if not exists assets_category_idx on public.assets (company_id, category_id);

create or replace function public.fn_guard_asset_hierarchy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_depth integer := 0;
begin
  if NEW.parent_asset_id is null then
    return NEW;
  end if;
  if NEW.parent_asset_id = NEW.id then
    raise exception 'Um ativo não pode ser seu próprio ativo pai.' using errcode = 'P0001';
  end if;
  v_current := NEW.parent_asset_id;
  while v_current is not null loop
    if v_current = NEW.id then
      raise exception 'Ciclo de hierarquia detectado em assets (ativo/sub-ativo).' using errcode = 'P0001';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Hierarquia de ativos excede a profundidade máxima suportada (100 níveis).' using errcode = 'P0001';
    end if;
    select parent_asset_id into v_current from public.assets where id = v_current;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists guard_asset_hierarchy on public.assets;
create trigger guard_asset_hierarchy
  before insert or update of parent_asset_id on public.assets
  for each row execute procedure public.fn_guard_asset_hierarchy();

comment on table public.assets is
  'Ativo físico (máquina, veículo, equipamento). ATIVO NÃO É ESTOQUE: nenhuma linha aqui representa quantidade em um local de armazenagem — a ligação com estoque só existe indiretamente via consumo de peças de manutenção (0057, sempre por fn_post_stock_movement). parent_asset_id permite sub-ativos (motor/painel/bomba de uma máquina).';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('asset_categories.view', 'asset_categories', 'view', 'Consultar categorias de ativo'),
    ('asset_categories.create', 'asset_categories', 'create', 'Criar categorias de ativo'),
    ('asset_categories.update', 'asset_categories', 'update', 'Editar categorias de ativo'),
    ('asset_locations.view', 'asset_locations', 'view', 'Consultar locais de ativo'),
    ('asset_locations.create', 'asset_locations', 'create', 'Criar locais de ativo'),
    ('asset_locations.update', 'asset_locations', 'update', 'Editar locais de ativo'),
    ('assets.view', 'assets', 'view', 'Consultar ativos'),
    ('assets.create', 'assets', 'create', 'Criar ativos'),
    ('assets.update', 'assets', 'update', 'Editar ativos')
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
-- RLS — cadastro simples, CRUD via has_permission.
-- ==================================================================
alter table public.asset_categories enable row level security;
alter table public.asset_locations enable row level security;
alter table public.assets enable row level security;

do $$
declare
  t record;
begin
  for t in select * from (values ('asset_categories'), ('asset_locations'), ('assets')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))', t.table_name, t.table_name, t.table_name || '.view');
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))', t.table_name, t.table_name, t.table_name || '.create');
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))', t.table_name, t.table_name, t.table_name || '.update', t.table_name || '.update');
  end loop;
end;
$$;
