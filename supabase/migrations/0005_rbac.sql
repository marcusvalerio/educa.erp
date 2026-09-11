-- Fase 2b — RBAC (usuários, papéis e permissões)
--
-- Modelo:
--   auth.users (Supabase Auth)
--     -> public.users (auth_user_id)          cadastro/perfil do ERP
--       -> public.user_companies               empresas às quais o usuário pertence
--       -> public.user_roles (por empresa)      papéis do usuário em cada empresa
--            -> public.roles (por empresa)
--                 -> public.role_permissions
--                      -> public.permissions    catálogo global, um módulo registra
--                                                novas linhas aqui sem alterar esta
--                                                arquitetura central.
--
-- `roles` é por empresa (cada empresa pode ter papéis próprios), mas toda
-- empresa nova recebe automaticamente 3 papéis padrão (admin/operator/
-- viewer) via trigger — ver fn_seed_company_rbac abaixo. `permissions` é
-- global: novos módulos (estoque, comercial, compras, financeiro...)
-- apenas inserem novas linhas em `permissions` (e, quando fizer sentido,
-- em `role_permissions` do papel admin) — nenhuma tabela central precisa
-- mudar.
--
-- Preparado para filial (branch_id) no futuro: a resolução de escopo do
-- usuário hoje para em "empresa" (current_company_id). Quando existir uma
-- tabela de filiais, o mesmo padrão (user_branches + branch_id nas
-- policies) pode ser acrescentado sem redesenhar isto.

-- ==================================================================
-- PERMISSIONS — catálogo global de permissões (module.action)
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
  'Catálogo global de permissões (ex.: products.read). Novos módulos registram novas linhas aqui; nunca hardcode permissões espalhadas pela aplicação.';

-- ==================================================================
-- ROLES — papéis, por empresa
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
  unique (company_id, code),
  unique (id, company_id)
);

comment on table public.roles is
  'Papéis por empresa. is_system=true para os papéis padrão semeados automaticamente (admin/operator/viewer) — não podem ser excluídos pela API.';

create trigger set_updated_at before update on public.roles
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists roles_company_status_idx on public.roles (company_id, status);

-- ==================================================================
-- ROLE_PERMISSIONS
-- ==================================================================
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- ==================================================================
-- USER_COMPANIES — empresas às quais um usuário pertence
-- ==================================================================
create table if not exists public.user_companies (
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  is_default boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

comment on table public.user_companies is
  'Associação usuário <-> empresa. Hoje o ERP opera mono-empresa, mas um usuário já pode pertencer a mais de uma linha aqui (ex.: contador multiempresa) sem mudança de schema.';

-- ==================================================================
-- USER_ROLES — papéis do usuário, por empresa
-- ==================================================================
create table if not exists public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id, role_id),
  foreign key (role_id, company_id) references public.roles(id, company_id) on delete cascade,
  foreign key (user_id, company_id) references public.user_companies(user_id, company_id) on delete cascade
);

comment on table public.user_roles is
  'Papéis atribuídos a um usuário dentro de uma empresa específica. A FK composta (role_id, company_id) garante que o papel atribuído pertence à mesma empresa do vínculo.';

create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- ==================================================================
-- SEED DE PERMISSÕES — módulos desta etapa (users/RBAC, produtos/
-- catálogo) + operações básicas dos demais cadastros já existentes,
-- para que a RLS real (migration seguinte) tenha o que checar em todas
-- as tabelas de negócio já existentes.
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('companies.read', 'companies', 'read', 'Consultar dados da própria empresa'),
    ('companies.update', 'companies', 'update', 'Atualizar dados da própria empresa'),

    ('products.read', 'products', 'read', 'Consultar produtos'),
    ('products.create', 'products', 'create', 'Criar produtos'),
    ('products.update', 'products', 'update', 'Editar produtos'),
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

    ('rbac.manage', 'rbac', 'manage', 'Gerenciar papéis, permissões e atribuições de papel'),

    ('audit_logs.read', 'audit_logs', 'read', 'Consultar trilha de auditoria'),

    ('product_categories.read', 'product_categories', 'read', 'Consultar categorias de produto'),
    ('product_categories.create', 'product_categories', 'create', 'Criar categorias de produto'),
    ('product_categories.update', 'product_categories', 'update', 'Editar categorias de produto'),
    ('product_categories.delete', 'product_categories', 'delete', 'Excluir categorias de produto'),

    ('product_brands.read', 'product_brands', 'read', 'Consultar marcas de produto'),
    ('product_brands.create', 'product_brands', 'create', 'Criar marcas de produto'),
    ('product_brands.update', 'product_brands', 'update', 'Editar marcas de produto'),
    ('product_brands.delete', 'product_brands', 'delete', 'Excluir marcas de produto'),

    ('units.read', 'units', 'read', 'Consultar unidades de medida'),
    ('units.create', 'units', 'create', 'Criar unidades de medida'),
    ('units.update', 'units', 'update', 'Editar unidades de medida'),
    ('units.delete', 'units', 'delete', 'Excluir unidades de medida'),

    ('unit_conversions.read', 'unit_conversions', 'read', 'Consultar conversões de unidade'),
    ('unit_conversions.create', 'unit_conversions', 'create', 'Criar conversões de unidade'),
    ('unit_conversions.update', 'unit_conversions', 'update', 'Editar conversões de unidade'),
    ('unit_conversions.delete', 'unit_conversions', 'delete', 'Excluir conversões de unidade'),

    ('product_suppliers.read', 'product_suppliers', 'read', 'Consultar fornecedores de um produto'),
    ('product_suppliers.create', 'product_suppliers', 'create', 'Vincular fornecedor a um produto'),
    ('product_suppliers.update', 'product_suppliers', 'update', 'Editar vínculo produto-fornecedor'),
    ('product_suppliers.delete', 'product_suppliers', 'delete', 'Remover vínculo produto-fornecedor')
) as v(code, module, action, description)
on conflict (code) do nothing;

-- ==================================================================
-- fn_seed_company_rbac — cria os 3 papéis padrão de uma empresa e
-- concede as permissões correspondentes. Idempotente (on conflict do
-- nothing) para poder ser chamada tanto pelo trigger (empresa nova)
-- quanto manualmente em backfill (empresa já existente).
-- ==================================================================
create or replace function public.fn_seed_company_rbac(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_operator_id uuid;
  v_viewer_id uuid;
begin
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'admin', 'Administrador', 'Acesso total à empresa, incluindo gestão de usuários e permissões.', true)
  on conflict (company_id, code) do update set company_id = excluded.company_id
  returning id into v_admin_id;
  if v_admin_id is null then
    select id into v_admin_id from public.roles where company_id = p_company_id and code = 'admin';
  end if;

  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'operator', 'Operador', 'Consulta, criação e edição nos cadastros. Não exclui nem gerencia permissões.', true)
  on conflict (company_id, code) do update set company_id = excluded.company_id
  returning id into v_operator_id;
  if v_operator_id is null then
    select id into v_operator_id from public.roles where company_id = p_company_id and code = 'operator';
  end if;

  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'viewer', 'Consulta', 'Somente leitura.', true)
  on conflict (company_id, code) do update set company_id = excluded.company_id
  returning id into v_viewer_id;
  if v_viewer_id is null then
    select id into v_viewer_id from public.roles where company_id = p_company_id and code = 'viewer';
  end if;

  -- admin: todas as permissões do catálogo
  insert into public.role_permissions (role_id, permission_id)
  select v_admin_id, p.id from public.permissions p
  on conflict do nothing;

  -- operator: read/create/update de todos os módulos de negócio (sem delete, sem rbac.manage)
  insert into public.role_permissions (role_id, permission_id)
  select v_operator_id, p.id from public.permissions p
  where p.action in ('read', 'create', 'update')
    and p.module not in ('rbac')
  on conflict do nothing;

  -- viewer: somente leitura
  insert into public.role_permissions (role_id, permission_id)
  select v_viewer_id, p.id from public.permissions p
  where p.action = 'read'
  on conflict do nothing;
end;
$$;

create or replace function public.fn_seed_company_rbac_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_company_rbac(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists seed_company_rbac on public.companies;
create trigger seed_company_rbac
  after insert on public.companies
  for each row execute procedure public.fn_seed_company_rbac_trigger();

-- Backfill: semeia RBAC para empresas que já existiam antes desta migration.
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
-- bootstrap_admin_user — caminho controlado para o primeiro admin de
-- uma empresa. Vincula (ou cria) o cadastro em public.users a um
-- usuário já existente em auth.users, e concede o papel 'admin'.
--
-- Só funciona enquanto a empresa ainda não tem NINGUÉM com o papel
-- admin — depois disso, novas concessões de admin passam pela API de
-- RBAC normal (que exige rbac.manage, ou seja, já exige ser admin).
-- Isso evita um "super admin" solto: é um bootstrap de uso único por
-- empresa, não uma porta permanente.
--
-- Uso (SQL Editor do Supabase, com a empresa e o auth_user_id já
-- existentes):
--   select public.bootstrap_admin_user(
--     p_auth_user_id => '<uuid de auth.users.id>',
--     p_company_id   => '00000000-0000-0000-0000-000000000001',
--     p_name         => 'Nome do administrador',
--     p_email        => 'admin@empresa.com'
--   );
-- ==================================================================
create or replace function public.bootstrap_admin_user(
  p_auth_user_id uuid,
  p_company_id uuid,
  p_name text,
  p_email text,
  p_login text default null
)
returns public.users
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_role_id uuid;
  v_existing_admin_count integer;
  v_user public.users;
  v_login text;
begin
  select id into v_admin_role_id from public.roles where company_id = p_company_id and code = 'admin';
  if v_admin_role_id is null then
    raise exception 'Empresa % não possui papel admin (RBAC não semeado).', p_company_id;
  end if;

  select count(*) into v_existing_admin_count
  from public.user_roles ur
  where ur.company_id = p_company_id and ur.role_id = v_admin_role_id;

  if v_existing_admin_count > 0 then
    raise exception 'Empresa % já possui administrador. Use a API de RBAC (rbac.manage) para conceder o papel a outros usuários.', p_company_id;
  end if;

  v_login := coalesce(nullif(trim(p_login), ''), split_part(p_email, '@', 1));

  select * into v_user from public.users where auth_user_id = p_auth_user_id;
  if v_user.id is null then
    select * into v_user from public.users where company_id = p_company_id and email = p_email;
  end if;

  if v_user.id is null then
    insert into public.users (company_id, auth_user_id, name, email, login, role, status)
    values (p_company_id, p_auth_user_id, p_name, p_email, v_login, 'admin', 'active')
    returning * into v_user;
  else
    update public.users
    set auth_user_id = p_auth_user_id, status = 'active'
    where id = v_user.id
    returning * into v_user;
  end if;

  insert into public.user_companies (user_id, company_id, is_default, status)
  values (v_user.id, p_company_id, true, 'active')
  on conflict (user_id, company_id) do update set status = 'active';

  insert into public.user_roles (user_id, company_id, role_id)
  values (v_user.id, p_company_id, v_admin_role_id)
  on conflict do nothing;

  return v_user;
end;
$$;

revoke all on function public.bootstrap_admin_user(uuid, uuid, text, text, text) from public;
grant execute on function public.bootstrap_admin_user(uuid, uuid, text, text, text) to service_role;

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_companies enable row level security;
alter table public.user_roles enable row level security;
