-- Fase "RLS / RBAC / Catálogo — rodada 1" — fundação de RBAC.
--
-- Objetivo: parar de tratar `users.role` (texto livre) como autorização,
-- sem reescrever o que já existe. `users.role` é preservado (exibição/
-- legado) — a decisão de acesso passa a vir de roles/permissions reais.
--
-- Modelo (documentado em docs/RBAC.md):
--   public.users (cadastro)  -- já existe, auth_user_id já existe
--     -> public.user_roles (N:N)
--        -> public.roles (por empresa; 'admin'/'operador'/'leitura' são
--           papéis de sistema, semeados automaticamente por empresa)
--           -> public.role_permissions (N:N)
--              -> public.permissions (catálogo global, ex.: 'products.read')
--
-- "Empresa ↔ usuário": NÃO foi criada uma tabela `user_companies` nova.
-- `public.users` já é, por linha, "o cadastro desta pessoa nesta empresa"
-- (tem company_id, e (company_id, email)/(company_id, login) já são
-- únicos só dentro da empresa). Uma mesma pessoa com acesso a múltiplas
-- empresas vira múltiplas linhas de `users` com o mesmo `auth_user_id` —
-- o vínculo empresa↔usuário já É essa linha; os papéis dela também ficam
-- naturalmente por empresa, porque `user_roles` referencia o `users.id`
-- (não o `auth_user_id`). Reaproveita o que já existe em vez de duplicar.
--
-- "Preparação para filial": cada empresa pode ter filiais (`branches`);
-- `users.branch_id` é opcional. RLS desta rodada ainda é só por
-- `company_id` (filial é granularidade para a próxima rodada de
-- maturidade) — a coluna já existe para não exigir nova migration depois.

-- ==================================================================
-- BRANCHES (Filiais) — preparação, não usado em RLS ainda nesta rodada
-- ==================================================================
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create trigger set_updated_at before update on public.branches
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists branches_company_status_idx on public.branches (company_id, status);

alter table public.users add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists users_branch_idx on public.users (branch_id);

-- ==================================================================
-- PERMISSIONS (catálogo global de permissões — não é por empresa)
-- ==================================================================
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is
  'Catálogo fixo de permissões granulares (ex.: products.read). Não é por empresa — é a lista de capacidades que o sistema entende. Gerenciado por migration, não pela UI.';

-- ==================================================================
-- ROLES (papéis — por empresa; 'admin'/'operador'/'leitura' são padrão)
-- ==================================================================
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create trigger set_updated_at before update on public.roles
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists roles_company_status_idx on public.roles (company_id, status);

comment on column public.roles.is_system is
  'Papéis semeados automaticamente (admin/operador/leitura) por empresa — não podem ser excluídos pela API (ver checagem na camada de domínio), só desativados ou ter suas permissões ajustadas.';

-- ==================================================================
-- ROLE_PERMISSIONS / USER_ROLES
-- ==================================================================
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- ==================================================================
-- Catálogo inicial de permissões (fase 1 — só os módulos que existem
-- de verdade hoje + catálogo/RBAC. Novos módulos futuros adicionam
-- linhas aqui, sem mudança estrutural.)
-- ==================================================================
insert into public.permissions (code, module, action, description) values
  ('products.read', 'products', 'read', 'Consultar produtos'),
  ('products.create', 'products', 'create', 'Criar produtos'),
  ('products.update', 'products', 'update', 'Editar produtos (inclui ativar/inativar)'),
  ('products.delete', 'products', 'delete', 'Excluir produtos'),
  ('customers.read', 'customers', 'read', 'Consultar clientes'),
  ('customers.create', 'customers', 'create', 'Criar clientes'),
  ('customers.update', 'customers', 'update', 'Editar clientes'),
  ('customers.delete', 'customers', 'delete', 'Excluir clientes'),
  ('suppliers.read', 'suppliers', 'read', 'Consultar fornecedores'),
  ('suppliers.create', 'suppliers', 'create', 'Criar fornecedores'),
  ('suppliers.update', 'suppliers', 'update', 'Editar fornecedores'),
  ('suppliers.delete', 'suppliers', 'delete', 'Excluir fornecedores'),
  ('carriers.read', 'carriers', 'read', 'Consultar transportadoras'),
  ('carriers.create', 'carriers', 'create', 'Criar transportadoras'),
  ('carriers.update', 'carriers', 'update', 'Editar transportadoras'),
  ('carriers.delete', 'carriers', 'delete', 'Excluir transportadoras'),
  ('drivers.read', 'drivers', 'read', 'Consultar motoristas'),
  ('drivers.create', 'drivers', 'create', 'Criar motoristas'),
  ('drivers.update', 'drivers', 'update', 'Editar motoristas'),
  ('drivers.delete', 'drivers', 'delete', 'Excluir motoristas'),
  ('vehicles.read', 'vehicles', 'read', 'Consultar veículos'),
  ('vehicles.create', 'vehicles', 'create', 'Criar veículos'),
  ('vehicles.update', 'vehicles', 'update', 'Editar veículos'),
  ('vehicles.delete', 'vehicles', 'delete', 'Excluir veículos'),
  ('warehouse_locations.read', 'warehouse_locations', 'read', 'Consultar locais de estoque'),
  ('warehouse_locations.create', 'warehouse_locations', 'create', 'Criar locais de estoque'),
  ('warehouse_locations.update', 'warehouse_locations', 'update', 'Editar locais de estoque'),
  ('warehouse_locations.delete', 'warehouse_locations', 'delete', 'Excluir locais de estoque'),
  ('users.read', 'users', 'read', 'Consultar usuários'),
  ('users.create', 'users', 'create', 'Criar usuários'),
  ('users.update', 'users', 'update', 'Editar usuários'),
  ('users.delete', 'users', 'delete', 'Excluir usuários'),
  ('roles.read', 'rbac', 'read', 'Consultar papéis e permissões'),
  ('roles.manage', 'rbac', 'manage', 'Criar/editar papéis e atribuir permissões/usuários'),
  ('audit_logs.read', 'audit', 'read', 'Consultar trilha de auditoria'),
  ('categories.read', 'catalog', 'read', 'Consultar categorias de produto'),
  ('categories.create', 'catalog', 'create', 'Criar categorias de produto'),
  ('categories.update', 'catalog', 'update', 'Editar categorias de produto'),
  ('categories.delete', 'catalog', 'delete', 'Excluir categorias de produto'),
  ('brands.read', 'catalog', 'read', 'Consultar marcas'),
  ('brands.create', 'catalog', 'create', 'Criar marcas'),
  ('brands.update', 'catalog', 'update', 'Editar marcas'),
  ('brands.delete', 'catalog', 'delete', 'Excluir marcas')
on conflict (code) do nothing;

-- ==================================================================
-- Seed de papéis por empresa (função reaproveitada por trigger e pelo
-- backfill abaixo, para toda empresa nova ganhar os 3 papéis padrão)
-- ==================================================================
-- Função de trabalho (reaproveitada pelo trigger e pelo backfill abaixo
-- — não pode ser a própria função de trigger, já que `NEW` só existe em
-- contexto de trigger e o backfill precisa rodar para empresas que já
-- existiam antes desta migration).
create or replace function public.fn_seed_default_roles_for_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_operador_id uuid;
  v_leitura_id uuid;
begin
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'admin', 'Administrador', 'Acesso total às funcionalidades existentes da empresa.', true)
  returning id into v_admin_id;

  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'operador', 'Operador', 'Pode consultar, criar e editar cadastros, sem excluir.', true)
  returning id into v_operador_id;

  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'leitura', 'Somente leitura', 'Pode apenas consultar cadastros e auditoria.', true)
  returning id into v_leitura_id;

  insert into public.role_permissions (role_id, permission_id)
  select v_admin_id, id from public.permissions;

  insert into public.role_permissions (role_id, permission_id)
  select v_operador_id, id from public.permissions
  where action in ('read', 'create', 'update') and module <> 'rbac';

  insert into public.role_permissions (role_id, permission_id)
  select v_leitura_id, id from public.permissions
  where action = 'read';
end;
$$;

create or replace function public.fn_seed_default_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_seed_default_roles_for_company(NEW.id);
  return NEW;
end;
$$;

create trigger seed_default_roles after insert on public.companies
  for each row execute procedure public.fn_seed_default_roles();

-- Backfill: a empresa semente já existe (criada antes desta migration),
-- então o trigger acima não disparou para ela. Roda a mesma lógica uma
-- vez, manualmente, só para empresas que ainda não têm nenhum papel.
do $$
declare
  v_company_id uuid;
begin
  for v_company_id in select id from public.companies loop
    if not exists (select 1 from public.roles where company_id = v_company_id) then
      perform public.fn_seed_default_roles_for_company(v_company_id);
    end if;
  end loop;
end;
$$;
