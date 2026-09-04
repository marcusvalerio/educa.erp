-- Fase 2 — Banco de dados definitivo
-- Tabelas dos 8 cadastros da Fase 4, mapeando os campos já existentes
-- nos formulários (src/lib/cadastros/{types,forms}.ts) para colunas
-- snake_case. Nomes de campo que existem na interface mas não constavam
-- da lista mínima do enunciado (ex.: rg do motorista, renavam do
-- veículo, login/departamento do usuário) foram preservados para não
-- quebrar a UI. Campos sugeridos no enunciado sem equivalente na
-- interface atual (ex.: telefone do usuário, "volume" do produto) foram
-- omitidos — nada os preencheria.
--
-- Colunas `code` em entidades que não têm campo de código no formulário
-- (customers, suppliers, carriers, drivers, vehicles, users) são
-- geradas automaticamente por trigger, substituindo o id (UUID) que a
-- Fase 4 usava como "código" legível. Produtos e locais de estoque já
-- pedem o código no formulário, então mantêm entrada manual.

create or replace function public.fn_generate_code()
returns trigger
language plpgsql
as $$
declare
  prefix text := TG_ARGV[0];
  seq_name text := TG_ARGV[1];
  next_val bigint;
begin
  if NEW.code is null or NEW.code = '' then
    execute format('select nextval(%L)', seq_name) into next_val;
    NEW.code := prefix || '-' || lpad(next_val::text, 4, '0');
  end if;
  return NEW;
end;
$$;

-- ==================================================================
-- SUPPLIERS (Fornecedores)
-- ==================================================================
create sequence if not exists public.suppliers_code_seq;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  type text not null default 'company' check (type in ('individual', 'company')),
  legal_name text not null,
  trade_name text,
  document text not null,
  state_registration text,
  email text,
  phone text,
  contact_name text,
  zip_code text,
  state text,
  city text,
  neighborhood text,
  address text,
  address_number text,
  address_complement text,
  average_delivery_days integer,
  payment_terms text,
  supplier_category text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, document)
);

create trigger set_code before insert on public.suppliers
  for each row execute procedure public.fn_generate_code('FOR', 'public.suppliers_code_seq');
create trigger set_updated_at before update on public.suppliers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists suppliers_company_status_idx on public.suppliers (company_id, status);
create index if not exists suppliers_document_idx on public.suppliers (document);

-- ==================================================================
-- CARRIERS (Transportadoras)
-- ==================================================================
create sequence if not exists public.carriers_code_seq;

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  legal_name text not null,
  trade_name text,
  document text not null,
  state_registration text,
  email text,
  phone text,
  responsible_name text,
  zip_code text,
  state text,
  city text,
  address text,
  transport_type text,
  coverage_region text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, document)
);

create trigger set_code before insert on public.carriers
  for each row execute procedure public.fn_generate_code('TRA', 'public.carriers_code_seq');
create trigger set_updated_at before update on public.carriers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists carriers_company_status_idx on public.carriers (company_id, status);
create index if not exists carriers_document_idx on public.carriers (document);

-- ==================================================================
-- DRIVERS (Motoristas)
-- ==================================================================
create sequence if not exists public.drivers_code_seq;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  carrier_id uuid references public.carriers(id) on delete restrict,
  name text not null,
  document text not null,
  rg text,
  cnh_number text not null,
  cnh_category text not null,
  cnh_expiration date,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, document)
);

create trigger set_code before insert on public.drivers
  for each row execute procedure public.fn_generate_code('MOT', 'public.drivers_code_seq');
create trigger set_updated_at before update on public.drivers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists drivers_company_status_idx on public.drivers (company_id, status);
create index if not exists drivers_cnh_number_idx on public.drivers (cnh_number);
create index if not exists drivers_cnh_expiration_idx on public.drivers (cnh_expiration);
create index if not exists drivers_carrier_idx on public.drivers (carrier_id);

-- ==================================================================
-- VEHICLES (Veículos)
-- ==================================================================
create sequence if not exists public.vehicles_code_seq;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  carrier_id uuid references public.carriers(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  plate text not null,
  renavam text,
  brand text,
  model text not null,
  year integer,
  type text,
  cargo_capacity_kg numeric(12, 2),
  max_weight_kg numeric(12, 2),
  fuel_type text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, plate)
);

create trigger set_code before insert on public.vehicles
  for each row execute procedure public.fn_generate_code('VEI', 'public.vehicles_code_seq');
create trigger set_updated_at before update on public.vehicles
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists vehicles_company_status_idx on public.vehicles (company_id, status);
create index if not exists vehicles_plate_idx on public.vehicles (plate);
create index if not exists vehicles_carrier_idx on public.vehicles (carrier_id);
create index if not exists vehicles_driver_idx on public.vehicles (driver_id);

-- ==================================================================
-- WAREHOUSE_LOCATIONS (Locais de estoque)
-- ==================================================================
create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text,
  warehouse text,
  zone text,
  aisle text,
  rack text,
  level text,
  position text,
  location_type text,
  capacity numeric(12, 2),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create trigger set_updated_at before update on public.warehouse_locations
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists warehouse_locations_company_status_idx on public.warehouse_locations (company_id, status);

-- ==================================================================
-- PRODUCTS (Produtos)
-- ==================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  sku text,
  barcode text,
  name text not null,
  description text,
  category text,
  subcategory text,
  unit text not null,
  ncm text,
  weight numeric(12, 3),
  height_cm numeric(12, 2),
  width_cm numeric(12, 2),
  length_cm numeric(12, 2),
  minimum_stock numeric(14, 2) default 0,
  maximum_stock numeric(14, 2) default 0,
  reorder_point numeric(14, 2) default 0,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  default_location_code text,
  batch_controlled boolean not null default false,
  expiration_controlled boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, sku),
  unique (company_id, barcode),
  foreign key (company_id, default_location_code)
    references public.warehouse_locations (company_id, code) on delete restrict
);

create trigger set_updated_at before update on public.products
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists products_company_status_idx on public.products (company_id, status);
create index if not exists products_code_idx on public.products (code);
create index if not exists products_sku_idx on public.products (sku);
create index if not exists products_barcode_idx on public.products (barcode);
create index if not exists products_supplier_idx on public.products (supplier_id);
create index if not exists products_location_idx on public.products (company_id, default_location_code);

comment on constraint products_company_id_sku_key on public.products is
  'Postgres trata NULL como distinto em UNIQUE — múltiplos produtos sem SKU são permitidos.';

-- ==================================================================
-- CUSTOMERS (Clientes)
-- ==================================================================
create sequence if not exists public.customers_code_seq;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  type text not null default 'company' check (type in ('individual', 'company')),
  name text not null,
  trade_name text,
  document text not null,
  state_registration text,
  email text,
  phone text,
  mobile_phone text,
  zip_code text,
  state text,
  city text,
  neighborhood text,
  address text,
  address_number text,
  address_complement text,
  credit_limit numeric(14, 2) default 0,
  payment_terms text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, document)
);

create trigger set_code before insert on public.customers
  for each row execute procedure public.fn_generate_code('CLI', 'public.customers_code_seq');
create trigger set_updated_at before update on public.customers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists customers_company_status_idx on public.customers (company_id, status);
create index if not exists customers_document_idx on public.customers (document);

-- ==================================================================
-- USERS (Usuários cadastrais — NÃO é a tabela de autenticação)
-- ==================================================================
create sequence if not exists public.users_code_seq;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  -- Preenchido na Fase 3 ao vincular este cadastro a uma conta do
  -- Supabase Auth. Permanece nulo enquanto não há autenticação real.
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  login text not null,
  role text,
  department text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, email),
  unique (company_id, login)
);

create trigger set_code before insert on public.users
  for each row execute procedure public.fn_generate_code('USR', 'public.users_code_seq');
create trigger set_updated_at before update on public.users
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists users_company_status_idx on public.users (company_id, status);
create index if not exists users_auth_user_idx on public.users (auth_user_id);

comment on table public.users is
  'Cadastro de usuários do ERP (perfil/departamento). Não é o sistema de autenticação — ver auth_user_id e Fase 3.';
