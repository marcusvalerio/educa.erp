-- Fase 23 — RBAC: papéis personalizados por empresa e vocabulário
-- granular de permissão.
--
-- Modelo: ROLE -> PERMISSION -> MODULE -> RESOURCE -> ACTION.
-- permissions (0005) já tem code/module/action; falta apenas RESOURCE,
-- que entra como coluna aditiva com backfill = module (o catálogo atual
-- continua íntegro e nenhuma permissão é duplicada ou renomeada).
--
-- Compatibilidade explícita: o vocabulário atual convive com 'read' E
-- 'view' para leitura — as duas formas existem no catálogo por herança
-- histórica e ambas continuam válidas (ver permission_actions).

alter table public.permissions add column if not exists resource text;

update public.permissions set resource = module where resource is null;

alter table public.permissions alter column resource set default null;

create index if not exists permissions_module_resource_idx on public.permissions (module, resource);

comment on column public.permissions.resource is
  'Recurso dentro do módulo. Backfill inicial = module (um recurso por módulo); módulos que precisarem de granularidade fina passam a registrar permissões com resource próprio, sem alterar as existentes.';

-- ==================================================================
-- PERMISSION_ACTIONS — vocabulário de ações suportado, como dado e não
-- como constante espalhada pelo código. Serve para a UI montar o editor
-- de papéis; NÃO é usado como gate de autorização (quem autoriza é
-- has_permission a partir de role_permissions).
-- ==================================================================
create table if not exists public.permission_actions (
  code text primary key,
  name text not null,
  description text,
  is_standard boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

comment on table public.permission_actions is
  'Catálogo das ações usadas em permissions.action. read e view coexistem por herança do catálogo histórico e são equivalentes em significado (leitura) — nenhuma das duas foi renomeada para não quebrar concessões já existentes.';

insert into public.permission_actions (code, name, description, is_standard, sort_order)
select v.code, v.name, v.description, v.is_standard, v.sort_order
from (
  values
    ('view', 'Consultar', 'Leitura de registros (forma predominante no catálogo)', true, 10),
    ('read', 'Ler', 'Leitura de registros (forma histórica, equivalente a view)', true, 11),
    ('create', 'Criar', 'Criação de registros', true, 20),
    ('update', 'Editar', 'Alteração de registros', true, 30),
    ('delete', 'Excluir', 'Exclusão de registros', true, 40),
    ('approve', 'Aprovar', 'Aprovação de documentos/processos', true, 50),
    ('cancel', 'Cancelar', 'Cancelamento de documentos/processos', true, 60),
    ('execute', 'Executar', 'Execução de uma operação/processo', true, 70),
    ('manage', 'Administrar', 'Administração completa do recurso', false, 80),
    ('assign', 'Atribuir', 'Atribuição de vínculo (papel, unidade, contexto)', false, 90)
) as v(code, name, description, is_standard, sort_order)
on conflict (code) do nothing;

-- ==================================================================
-- ROLES — papéis personalizados. A tabela já é por empresa desde a
-- fundação; aqui ela ganha o vínculo opcional com setor (útil para o
-- contexto de dashboard) e a autoria.
-- ==================================================================
alter table public.roles add column if not exists department_id uuid;
alter table public.roles add column if not exists created_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_department_id_company_id_fkey') then
    alter table public.roles
      add constraint roles_department_id_company_id_fkey
      foreign key (department_id, company_id) references public.departments (id, company_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'roles_created_by_fkey') then
    alter table public.roles
      add constraint roles_created_by_fkey
      foreign key (created_by) references public.users(id) on delete set null;
  end if;
end;
$$;

comment on column public.roles.department_id is
  'Setor ao qual o papel se refere (opcional). É um metadado de organização/priorização de dashboard — NUNCA uma fonte de autorização: o que autoriza continua sendo role_permissions.';
comment on column public.roles.is_system is
  'true nos papéis semeados pela plataforma (admin/operador/leitura). Papéis personalizados da empresa nascem com is_system=false e podem ser criados, editados e desativados livremente pelo Company Admin.';

-- ==================================================================
-- Funções administrativas de RBAC — todas auditadas, todas validando
-- que papel e usuário pertencem à MESMA empresa (um Company Admin da
-- Empresa A nunca alcança um papel da Empresa B).
-- ==================================================================
create or replace function public.fn_create_company_role(
  p_company_id uuid,
  p_code text,
  p_name text,
  p_description text default null,
  p_department_id uuid default null
)
returns public.roles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
begin
  if not public.has_permission(p_company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments where id = p_department_id and company_id = p_company_id
  ) then
    raise exception 'Setor não pertence a esta empresa.' using errcode = '22023';
  end if;

  insert into public.roles (company_id, code, name, description, is_system, department_id, created_by)
  values (p_company_id, p_code, p_name, p_description, false, p_department_id, public.current_app_user_id())
  returning * into v_role;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'roles', v_role.id, 'CREATE', null,
    jsonb_build_object('code', p_code, 'name', p_name, 'department_id', p_department_id));

  return v_role;
end;
$$;

create or replace function public.fn_update_company_role(
  p_role_id uuid,
  p_name text default null,
  p_description text default null,
  p_status text default null,
  p_department_id uuid default null
)
returns public.roles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
  v_old jsonb;
begin
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'Papel não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_role.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('active', 'inactive') then
    raise exception 'status inválido: %.', p_status using errcode = '22023';
  end if;

  if v_role.is_system and p_status = 'inactive' then
    raise exception 'Papel de sistema (%) não pode ser desativado.', v_role.code using errcode = 'P0001';
  end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments where id = p_department_id and company_id = v_role.company_id
  ) then
    raise exception 'Setor não pertence a esta empresa.' using errcode = '22023';
  end if;

  v_old := jsonb_build_object('name', v_role.name, 'status', v_role.status, 'department_id', v_role.department_id);

  update public.roles
  set name = coalesce(p_name, name),
      description = coalesce(p_description, description),
      status = coalesce(p_status, status),
      department_id = coalesce(p_department_id, department_id)
  where id = p_role_id
  returning * into v_role;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_role.company_id, public.current_app_user_id(), 'system', 'roles', v_role.id, 'UPDATE', v_old,
    jsonb_build_object('name', v_role.name, 'status', v_role.status, 'department_id', v_role.department_id));

  return v_role;
end;
$$;

-- fn_set_role_permissions — define o conjunto EXATO de permissões do
-- papel (substitui). Recusa o papel 'admin' de sistema: editar as
-- permissões do administrador é o caminho clássico para a empresa se
-- trancar para fora da própria administração.
create or replace function public.fn_set_role_permissions(
  p_role_id uuid,
  p_permission_codes text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
  v_old text[];
  v_invalid text[];
  v_count integer;
begin
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'Papel não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_role.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;

  if v_role.is_system and v_role.code = 'admin' then
    raise exception 'As permissões do papel administrador de sistema não podem ser redefinidas (evita perda de acesso administrativo).' using errcode = 'P0001';
  end if;

  select array_agg(x) into v_invalid
  from unnest(coalesce(p_permission_codes, array[]::text[])) as x
  where not exists (select 1 from public.permissions p where p.code = x);

  if v_invalid is not null then
    raise exception 'Permissões inexistentes no catálogo: %.', array_to_string(v_invalid, ', ') using errcode = '22023';
  end if;

  select coalesce(array_agg(p.code order by p.code), array[]::text[]) into v_old
  from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
  where rp.role_id = p_role_id;

  delete from public.role_permissions where role_id = p_role_id;

  insert into public.role_permissions (role_id, permission_id)
  select p_role_id, p.id from public.permissions p
  where p.code = any (coalesce(p_permission_codes, array[]::text[]))
  on conflict (role_id, permission_id) do nothing;

  get diagnostics v_count = row_count;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_role.company_id, public.current_app_user_id(), 'system', 'roles', v_role.id, 'GRANT',
    jsonb_build_object('permissions', v_old),
    jsonb_build_object('permissions', coalesce(p_permission_codes, array[]::text[])));

  return v_count;
end;
$$;

create or replace function public.fn_assign_user_role(p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_role public.roles;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'Papel não encontrado.' using errcode = 'P0002';
  end if;

  if v_role.company_id <> v_user.company_id then
    raise exception 'Papel e usuário pertencem a empresas diferentes.' using errcode = '22023';
  end if;

  if not public.has_permission(v_user.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (p_user_id, p_role_id)
  on conflict do nothing;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'system', 'user_roles', v_user.id, 'GRANT', null,
    jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id, 'role_code', v_role.code));
end;
$$;

create or replace function public.fn_revoke_user_role(p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_role public.roles;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'Papel não encontrado.' using errcode = 'P0002';
  end if;

  if v_role.company_id <> v_user.company_id then
    raise exception 'Papel e usuário pertencem a empresas diferentes.' using errcode = '22023';
  end if;

  if not public.has_permission(v_user.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;

  delete from public.user_roles where user_id = p_user_id and role_id = p_role_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'system', 'user_roles', v_user.id, 'REVOKE',
    jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id, 'role_code', v_role.code), null);
end;
$$;

-- ==================================================================
-- Permissões efetivas do usuário autenticado — já com o gate de módulo
-- aplicado, para que a UI nunca receba uma permissão que o banco não
-- honraria.
-- ==================================================================
create or replace function public.fn_user_effective_permissions(p_company_id uuid)
returns table (code text, module text, resource text, action text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.code, p.module, coalesce(p.resource, p.module), p.action
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where u.auth_user_id = auth.uid()
    and u.company_id = p_company_id
    and u.status = 'active'
    and r.status = 'active'
    and public.fn_company_operational(p_company_id)
    and public.fn_permission_module_enabled(p_company_id, p.module);
$$;

revoke all on function public.fn_create_company_role(uuid, text, text, text, uuid) from public;
revoke all on function public.fn_update_company_role(uuid, text, text, text, uuid) from public;
revoke all on function public.fn_set_role_permissions(uuid, text[]) from public;
revoke all on function public.fn_assign_user_role(uuid, uuid) from public;
revoke all on function public.fn_revoke_user_role(uuid, uuid) from public;
grant execute on function public.fn_create_company_role(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.fn_update_company_role(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.fn_set_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.fn_assign_user_role(uuid, uuid) to authenticated;
grant execute on function public.fn_revoke_user_role(uuid, uuid) to authenticated;
grant execute on function public.fn_user_effective_permissions(uuid) to authenticated;

alter table public.permission_actions enable row level security;

drop policy if exists permission_actions_select on public.permission_actions;
create policy permission_actions_select on public.permission_actions
  for select to authenticated using (true);
