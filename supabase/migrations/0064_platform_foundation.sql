-- Fase 23 — Camada de PLATAFORMA (SaaS): Platform Owner e Platform Admin.
--
-- PRINCÍPIO CENTRAL (não negociável): quem administra a PLATAFORMA não
-- recebe, por isso, nenhum acesso aos dados operacionais dos tenants.
-- has_permission() continua olhando exclusivamente para public.users /
-- user_roles / roles / role_permissions da EMPRESA — esta migration não
-- cria nenhum bypass de RLS, nenhum "super usuário de tenant" e nenhum
-- caminho automático de leitura de dados de empresa cliente.
--
-- O acesso de suporte a uma empresa (se um dia for necessário) deverá ser
-- um mecanismo próprio, explícito, temporário e auditado — deliberadamente
-- NÃO implementado aqui, para que não exista nenhuma porta aberta por
-- omissão.
--
-- Identidade: um membro de plataforma é um auth.users que existe em
-- platform_members. Ele pode (ou não) ser também usuário de alguma
-- empresa — são vínculos independentes, resolvidos por funções distintas.

-- ==================================================================
-- audit_logs.action — amplia o vocabulário para as operações
-- administrativas desta fase. Corrige também duas lacunas reais já
-- existentes: 'CONFIGURE' (fn_configure_fiscal_provider, 0063) e
-- 'EXPORT' (fn_create_export_job, 0062) nunca estiveram no CHECK e
-- quebrariam em runtime.
-- ==================================================================
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.audit_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action%';
  if v_conname is not null then
    execute format('alter table public.audit_logs drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'INACTIVATE',
    'APPROVE', 'CANCEL', 'RECEIVE', 'CONFIRM', 'REJECT',
    'PICK', 'PACK', 'SHIP', 'DELIVER', 'FAIL', 'RETURN',
    'RELEASE', 'START', 'CONSUME', 'COMPLETE', 'SCRAP',
    'PAY', 'REVERSE', 'RECONCILE',
    'AUTHORIZE', 'EVENT',
    'CONFIGURE', 'EXPORT',
    'GRANT', 'REVOKE', 'ENABLE', 'DISABLE', 'ASSIGN', 'UNASSIGN',
    'SUSPEND', 'RESUME'
  ));

comment on column public.audit_logs.action is
  'Vocabulário acumulado por fase. CONFIGURE/EXPORT (0062/0063) e GRANT/REVOKE/ENABLE/DISABLE/ASSIGN/UNASSIGN/SUSPEND/RESUME (0064, administração de plataforma/organização) incluídos aqui. company_id nulo = evento de PLATAFORMA (não pertence a nenhum tenant).';

-- ==================================================================
-- PLATFORM_MEMBERS — quem administra o SaaS. Nunca é um "usuário de
-- todas as empresas": não há company_id aqui, e nenhuma função deste
-- arquivo consulta dados de tenant.
-- ==================================================================
create table if not exists public.platform_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  platform_role text not null check (platform_role in ('OWNER', 'ADMIN')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_by uuid references public.platform_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create trigger set_updated_at before update on public.platform_members
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists platform_members_role_status_idx on public.platform_members (platform_role, status);

comment on table public.platform_members is
  'Administradores da PLATAFORMA (OWNER = administração máxima do SaaS; ADMIN = operação do SaaS). Sem company_id por design: pertencer a esta tabela não concede absolutamente nenhum acesso a dados de empresa cliente — o isolamento multi-tenant continua sendo decidido só por public.users + RLS.';

-- ==================================================================
-- Catálogo de permissões da PLATAFORMA — namespace separado do
-- catálogo de permissões de tenant (public.permissions), porque são
-- universos de autorização diferentes e nunca devem se misturar.
-- ==================================================================
create table if not exists public.platform_permissions (
  code text primary key,
  area text not null,
  action text not null,
  description text,
  owner_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_role_permissions (
  platform_role text not null check (platform_role in ('OWNER', 'ADMIN')),
  permission_code text not null references public.platform_permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (platform_role, permission_code)
);

comment on table public.platform_permissions is
  'Permissões de plataforma (platform.*). owner_only=true marca o que só o Platform Owner pode fazer (configurações críticas, gestão de owners).';

-- ==================================================================
-- Helpers de identidade de plataforma. STABLE + SECURITY DEFINER pelo
-- mesmo motivo de current_app_user_id/has_permission: precisam ler a
-- tabela de identidade sem depender da RLS do chamador.
-- ==================================================================
create or replace function public.current_platform_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.platform_members
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.current_platform_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select platform_role from public.platform_members
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.is_platform_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_members
    where auth_user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_members
    where auth_user_id = auth.uid() and status = 'active' and platform_role = 'OWNER'
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_members
    where auth_user_id = auth.uid() and status = 'active' and platform_role in ('OWNER', 'ADMIN')
  );
$$;

create or replace function public.has_platform_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_members m
    join public.platform_role_permissions prp on prp.platform_role = m.platform_role
    where m.auth_user_id = auth.uid()
      and m.status = 'active'
      and prp.permission_code = p_code
  );
$$;

comment on function public.has_platform_permission(text) is
  'Autorização de PLATAFORMA. Deliberadamente não consulta public.users/roles/permissions: uma permissão de plataforma nunca se converte em permissão dentro de um tenant.';

-- ==================================================================
-- Auditoria de plataforma — reaproveita audit_logs (nenhum sistema
-- paralelo). company_id nulo identifica o evento como de plataforma;
-- user_id fica nulo porque um membro de plataforma não é um
-- public.users (a FK não permitiria), e a identificação vai em
-- actor_label.
-- ==================================================================
create or replace function public.fn_log_platform_audit(
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_old_data jsonb default null,
  p_new_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    null,
    null,
    coalesce(
      (select 'platform:' || m.platform_role || ':' || m.email from public.platform_members m where m.auth_user_id = auth.uid()),
      'platform:system'
    ),
    p_entity, p_entity_id, p_action, p_old_data, p_new_data
  );
end;
$$;

revoke all on function public.fn_log_platform_audit(text, uuid, text, jsonb, jsonb) from public;

-- ==================================================================
-- fn_upsert_platform_member — único caminho de escrita.
-- Regras: ADMIN administra ADMIN; apenas OWNER cria/altera/rebaixa
-- OWNER; nunca é possível remover o último OWNER ativo.
-- ==================================================================
create or replace function public.fn_upsert_platform_member(
  p_auth_user_id uuid,
  p_name text,
  p_email text,
  p_platform_role text,
  p_status text default 'active'
)
returns public.platform_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.platform_members;
  v_member public.platform_members;
  v_owner_count integer;
begin
  if p_platform_role not in ('OWNER', 'ADMIN') then
    raise exception 'platform_role inválido: % (use OWNER ou ADMIN).', p_platform_role using errcode = '22023';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'status inválido: %.', p_status using errcode = '22023';
  end if;

  if not public.has_platform_permission('platform.members.manage') then
    raise exception 'Permissão negada (platform.members.manage).' using errcode = '42501';
  end if;

  select * into v_existing from public.platform_members where auth_user_id = p_auth_user_id;

  if (p_platform_role = 'OWNER' or coalesce(v_existing.platform_role, '') = 'OWNER')
     and not public.is_platform_owner() then
    raise exception 'Apenas o Platform Owner pode criar ou alterar outro Owner.' using errcode = '42501';
  end if;

  if v_existing.id is not null and v_existing.platform_role = 'OWNER'
     and (p_platform_role <> 'OWNER' or p_status <> 'active') then
    select count(*) into v_owner_count
    from public.platform_members
    where platform_role = 'OWNER' and status = 'active' and id <> v_existing.id;
    if v_owner_count = 0 then
      raise exception 'Não é possível remover/rebaixar o último Platform Owner ativo.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.platform_members (auth_user_id, name, email, platform_role, status, created_by)
  values (p_auth_user_id, p_name, p_email, p_platform_role, p_status, public.current_platform_member_id())
  on conflict (auth_user_id) do update
    set name = excluded.name,
        email = excluded.email,
        platform_role = excluded.platform_role,
        status = excluded.status
  returning * into v_member;

  perform public.fn_log_platform_audit(
    'platform_members', v_member.id,
    case when v_existing.id is null then 'CREATE' else 'UPDATE' end,
    case when v_existing.id is null then null else jsonb_build_object('platform_role', v_existing.platform_role, 'status', v_existing.status) end,
    jsonb_build_object('platform_role', v_member.platform_role, 'status', v_member.status, 'email', v_member.email)
  );

  return v_member;
end;
$$;

-- ==================================================================
-- bootstrap_platform_owner — criação do PRIMEIRO owner, só enquanto
-- não existir nenhum owner ativo. Mesmo padrão (e mesma limitação
-- proposital) de bootstrap_admin_user: exposto apenas a service_role,
-- nunca a authenticated.
-- ==================================================================
create or replace function public.bootstrap_platform_owner(
  p_auth_user_id uuid,
  p_name text,
  p_email text
)
returns public.platform_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_count integer;
  v_member public.platform_members;
begin
  select count(*) into v_owner_count
  from public.platform_members where platform_role = 'OWNER' and status = 'active';

  if v_owner_count > 0 then
    raise exception 'Já existe um Platform Owner ativo. Use fn_upsert_platform_member.' using errcode = 'P0001';
  end if;

  insert into public.platform_members (auth_user_id, name, email, platform_role, status)
  values (p_auth_user_id, p_name, p_email, 'OWNER', 'active')
  on conflict (auth_user_id) do update
    set platform_role = 'OWNER', status = 'active', name = excluded.name, email = excluded.email
  returning * into v_member;

  perform public.fn_log_platform_audit('platform_members', v_member.id, 'CREATE', null,
    jsonb_build_object('platform_role', 'OWNER', 'email', p_email, 'bootstrap', true));

  return v_member;
end;
$$;

revoke all on function public.bootstrap_platform_owner(uuid, text, text) from public;
grant execute on function public.bootstrap_platform_owner(uuid, text, text) to service_role;

revoke all on function public.fn_upsert_platform_member(uuid, text, text, text, text) from public;
grant execute on function public.fn_upsert_platform_member(uuid, text, text, text, text) to authenticated;

revoke all on function public.current_platform_member_id() from public;
revoke all on function public.current_platform_role() from public;
grant execute on function public.current_platform_member_id() to authenticated;
grant execute on function public.current_platform_role() to authenticated;
grant execute on function public.is_platform_member() to authenticated;
grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_platform_permission(text) to authenticated;

-- ==================================================================
-- SEED — catálogo de permissões de plataforma e concessões por papel.
-- ==================================================================
insert into public.platform_permissions (code, area, action, description, owner_only)
select v.code, v.area, v.action, v.description, v.owner_only
from (
  values
    ('platform.companies.view', 'companies', 'view', 'Consultar empresas como entidades SaaS (cadastro/ciclo de vida, nunca dados operacionais)', false),
    ('platform.companies.create', 'companies', 'create', 'Cadastrar uma nova empresa na plataforma', false),
    ('platform.companies.update', 'companies', 'update', 'Editar dados cadastrais/administrativos de uma empresa', false),
    ('platform.companies.lifecycle', 'companies', 'lifecycle', 'Ativar, suspender ou cancelar uma empresa', false),
    ('platform.modules.view', 'modules', 'view', 'Consultar o catálogo de módulos da plataforma', false),
    ('platform.modules.manage', 'modules', 'manage', 'Manter o catálogo de módulos da plataforma', true),
    ('platform.company_modules.view', 'company_modules', 'view', 'Consultar módulos contratados por empresa', false),
    ('platform.company_modules.manage', 'company_modules', 'manage', 'Contratar/descontratar módulos para uma empresa', false),
    ('platform.members.view', 'members', 'view', 'Consultar administradores da plataforma', false),
    ('platform.members.manage', 'members', 'manage', 'Criar/editar administradores da plataforma (OWNER só por OWNER)', false),
    ('platform.audit.view', 'audit', 'view', 'Consultar a auditoria administrativa da plataforma', false),
    ('platform.usage.view', 'usage', 'view', 'Acompanhar utilização/saúde da plataforma', false),
    ('platform.settings.view', 'settings', 'view', 'Consultar configurações globais da plataforma', false),
    ('platform.settings.manage', 'settings', 'manage', 'Alterar configurações críticas/globais da plataforma', true)
) as v(code, area, action, description, owner_only)
on conflict (code) do nothing;

-- OWNER: tudo.
insert into public.platform_role_permissions (platform_role, permission_code)
select 'OWNER', code from public.platform_permissions
on conflict do nothing;

-- ADMIN: tudo que não é owner_only.
insert into public.platform_role_permissions (platform_role, permission_code)
select 'ADMIN', code from public.platform_permissions where owner_only = false
on conflict do nothing;

-- ==================================================================
-- RLS — tabelas de plataforma são visíveis apenas a membros de
-- plataforma; escrita exclusivamente via função.
-- ==================================================================
alter table public.platform_members enable row level security;
alter table public.platform_permissions enable row level security;
alter table public.platform_role_permissions enable row level security;

drop policy if exists platform_members_select on public.platform_members;
create policy platform_members_select on public.platform_members
  for select to authenticated
  using (public.has_platform_permission('platform.members.view') or auth_user_id = auth.uid());

drop policy if exists platform_permissions_select on public.platform_permissions;
create policy platform_permissions_select on public.platform_permissions
  for select to authenticated using (public.is_platform_member());

drop policy if exists platform_role_permissions_select on public.platform_role_permissions;
create policy platform_role_permissions_select on public.platform_role_permissions
  for select to authenticated using (public.is_platform_member());

-- ==================================================================
-- audit_logs — membros de plataforma enxergam SOMENTE os eventos de
-- plataforma (company_id nulo). Eventos de tenant continuam exigindo
-- audit_logs.read dentro da empresa, como antes.
-- ==================================================================
drop policy if exists audit_logs_select_platform on public.audit_logs;
create policy audit_logs_select_platform on public.audit_logs
  for select to authenticated
  using (company_id is null and public.has_platform_permission('platform.audit.view'));

comment on policy audit_logs_select_platform on public.audit_logs is
  'Platform Owner/Admin leem apenas auditoria de plataforma (company_id nulo). Nenhuma linha de auditoria de empresa cliente é alcançável por esta policy.';
