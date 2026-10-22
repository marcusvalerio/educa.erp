-- 0109 — Professor entra no ERP de cada grupo e grupos cadastram a empresa.
--
-- 1. Dados da empresa: as permissões companies.read/companies.update
--    voltam ao catálogo e vão para Administrador e Gerente (leitura para
--    os demais papéis). Cada grupo preenche nome, razão social, CNPJ etc.
--    em Configurações › Dados da empresa. O nome original do grupo fica
--    guardado em companies.group_label (só o professor vê; ninguém edita).
-- 2. Trocar de ERP: o login do professor ganha, em cada grupo que ele abre,
--    um usuário "supervisor" (escondido das listas) com o papel
--    Administrador do grupo. A empresa ativa do login fica em
--    user_active_company; current_app_user_id() e o servidor resolvem o
--    usuário por ela. Só o Administrador da turma entra nos grupos da
--    própria turma. Isolamento entre grupos continua: cada ERP só enxerga
--    a própria empresa.

-- ------------------------------------------------------------------ 1. empresa
insert into public.permissions (code, module, action, description)
values
  ('companies.read', 'companies', 'read', 'Consultar dados da própria empresa'),
  ('companies.update', 'companies', 'update', 'Atualizar dados da própria empresa')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'companies.update'
where r.code in ('admin', 'gerente')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'companies.read'
where r.code in ('admin', 'gerente', 'operador', 'leitura', 'vendedor')
on conflict do nothing;

alter table public.companies add column if not exists group_label text;
update public.companies set group_label = name where parent_company_id is not null and group_label is null;

create or replace function public.fn_guard_company_group_label()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_company_id is not null then
      new.group_label := new.name;
    else
      new.group_label := null;
    end if;
  elsif new.group_label is distinct from old.group_label then
    new.group_label := old.group_label;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_company_group_label() from public, anon, authenticated, service_role;

drop trigger if exists guard_company_group_label on public.companies;
create trigger guard_company_group_label
  before insert or update on public.companies
  for each row execute function public.fn_guard_company_group_label();

-- ------------------------------------------------------------------ 2. empresa ativa
alter table public.users add column if not exists is_supervisor boolean not null default false;

create table if not exists public.user_active_company (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.user_active_company enable row level security;
revoke all on public.user_active_company from public, anon, authenticated;
-- Mesmo dono de public.users, para as funções SECURITY DEFINER lerem a tabela.
do $$
begin
  execute format('alter table public.user_active_company owner to %I',
    (select tableowner from pg_tables where schemaname = 'public' and tablename = 'users'));
end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.users u
  left join public.user_active_company a on a.auth_user_id = u.auth_user_id
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
  order by (u.company_id = a.company_id) desc nulls last, u.is_supervisor, u.created_at, u.id
  limit 1;
$$;

-- Linha do professor na TURMA (independe do ERP aberto no momento).
create or replace function public.fn_study_professor_row()
returns public.users
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.*
  from public.users u
  join public.companies c on c.id = u.company_id and c.company_kind = 'study'
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and u.is_supervisor = false
    and public.has_permission(c.id, 'users.create')
    and public.has_permission(c.id, 'users.update')
    and public.has_permission(c.id, 'roles.manage')
  order by u.created_at
  limit 1;
$$;
revoke all on function public.fn_study_professor_row() from public, anon, authenticated;

-- O professor continua gerenciando grupos mesmo dentro do ERP de um grupo.
create or replace function public.fn_study_actor()
returns public.users
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_professor_row();
begin
  if v_actor.id is not null then
    return v_actor;
  end if;
  select * into v_actor from public.users where id = public.current_app_user_id();
  if not found or v_actor.status <> 'active' then
    raise exception 'Entre com um usuário ativo da turma.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = v_actor.company_id and company_kind = 'study') then
    raise exception 'Grupos existem só em empresas do tipo Estudo.' using errcode = '42501';
  end if;
  raise exception 'Só o Administrador da turma gerencia os grupos.' using errcode = '42501';
end;
$$;

/** Onde o professor pode entrar: a turma e os grupos dela (vazio para os demais). */
create or replace function public.fn_study_workspaces()
returns table (company_id uuid, name text, group_label text, is_class boolean, is_current boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof public.users := public.fn_study_professor_row();
  v_current uuid;
begin
  if v_prof.id is null then
    return;
  end if;
  select u.company_id into v_current from public.users u where u.id = public.current_app_user_id();
  return query
  select c.id, c.name, c.group_label, c.id = v_prof.company_id, c.id = v_current
  from public.companies c
  where c.id = v_prof.company_id or c.parent_company_id = v_prof.company_id
  order by c.parent_company_id nulls first, c.created_at;
end;
$$;

/** Entra no ERP de um grupo da turma (ou volta para a turma). */
create or replace function public.fn_study_enter_workspace(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof public.users := public.fn_study_professor_row();
  v_group public.companies;
  v_user public.users;
  v_admin uuid;
  v_login text;
begin
  if v_prof.id is null then
    raise exception 'Só o Administrador da turma entra no ERP dos grupos.' using errcode = '42501';
  end if;

  if p_company_id = v_prof.company_id then
    insert into public.user_active_company (auth_user_id, company_id) values (v_prof.auth_user_id, p_company_id)
    on conflict (auth_user_id) do update set company_id = excluded.company_id, updated_at = now();
    return jsonb_build_object('company_id', p_company_id, 'name', (select name from public.companies where id = p_company_id));
  end if;

  select * into v_group from public.companies where id = p_company_id;
  if not found or v_group.parent_company_id is distinct from v_prof.company_id then
    raise exception 'Grupo não encontrado nesta turma.' using errcode = 'P0002';
  end if;
  select id into v_admin from public.roles where company_id = v_group.id and code = 'admin';
  if v_admin is null then
    raise exception 'O grupo não tem o papel Administrador.' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where company_id = v_group.id and auth_user_id = v_prof.auth_user_id;
  if not found then
    select * into v_user from public.users where company_id = v_group.id and lower(email) = lower(v_prof.email) and auth_user_id is null;
    if found then
      raise exception 'O seu e-mail já está cadastrado como aluno neste grupo. Remova esse cadastro antes de entrar como professor.' using errcode = 'P0001';
    end if;
    v_login := 'professor';
    if exists (select 1 from public.users where company_id = v_group.id and login = v_login) then
      v_login := v_login || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
    perform set_config('educa.auth_link', 'invitation', true);
    insert into public.users (company_id, auth_user_id, name, email, login, role, status, is_supervisor)
    values (v_group.id, v_prof.auth_user_id, coalesce(v_prof.name, 'Professor') || ' (professor)', v_prof.email, v_login, 'Administrador', 'active', true)
    returning * into v_user;
    perform set_config('educa.auth_link', '', true);
    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_group.id, null, coalesce(v_prof.name, v_prof.email) || ' (professor)', 'users', v_user.id, 'CREATE', null,
      jsonb_build_object('via', 'study_supervisor'));
  elsif v_user.status <> 'active' or not v_user.is_supervisor then
    update public.users set status = 'active', is_supervisor = true where id = v_user.id;
  end if;

  insert into public.user_roles (user_id, role_id) values (v_user.id, v_admin) on conflict do nothing;

  insert into public.user_active_company (auth_user_id, company_id) values (v_prof.auth_user_id, v_group.id)
  on conflict (auth_user_id) do update set company_id = excluded.company_id, updated_at = now();

  return jsonb_build_object('company_id', v_group.id, 'name', v_group.name);
end;
$$;

-- Listas do professor: o nome original do grupo junto ao nome dado pelos alunos;
-- o supervisor não conta como integrante.
create or replace function public.fn_study_groups()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  members bigint,
  logins bigint,
  pending_invitations bigint,
  products bigint,
  sales_orders bigint,
  purchase_orders bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
begin
  return query
  select c.id,
    case when c.group_label is not null and c.group_label <> c.name then c.group_label || ' — ' || c.name else c.name end,
    c.created_at,
    (select count(*) from public.users u where u.company_id = c.id and not u.is_supervisor),
    (select count(*) from public.users u where u.company_id = c.id and u.auth_user_id is not null and not u.is_supervisor),
    (select count(*) from public.user_invitations i where i.company_id = c.id and i.status = 'pending' and i.expires_at > now()),
    (select count(*) from public.products p where p.company_id = c.id),
    (select count(*) from public.sales_orders s where s.company_id = c.id),
    (select count(*) from public.purchase_orders o where o.company_id = c.id)
  from public.companies c
  where c.parent_company_id = v_actor.company_id
  order by c.created_at;
end;
$$;

drop function if exists public.fn_study_group_members(uuid);
create function public.fn_study_group_members(p_group_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  status text,
  has_login boolean,
  roles text,
  invitation_status text,
  invitation_expires_at timestamptz,
  sector_code text,
  sector_name text,
  is_admin boolean,
  level_role_id uuid,
  profile_role_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_group public.companies := public.fn_study_group_of_actor(p_group_id, v_actor);
begin
  return query
  select u.id, u.name::text, u.email::text, u.status::text, u.auth_user_id is not null,
    (select string_agg(r.name, ', ' order by r.name) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id)::text,
    (select case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end
       from public.user_invitations i where i.user_id = u.id order by i.created_at desc limit 1)::text,
    (select i.expires_at from public.user_invitations i where i.user_id = u.id order by i.created_at desc limit 1),
    d.code::text, d.name::text,
    exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id and r.code = 'admin'),
    (select r.id from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id and r.screens is null order by r.is_system desc, r.name limit 1),
    (select r.id from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id and r.screens is not null order by r.name limit 1)
  from public.users u
  left join public.departments d on d.id = u.department_id
  where u.company_id = v_group.id and not u.is_supervisor
  order by u.name;
end;
$$;

revoke all on function public.fn_study_workspaces() from public, anon;
revoke all on function public.fn_study_enter_workspace(uuid) from public, anon;
revoke all on function public.fn_study_group_members(uuid) from public, anon;
grant execute on function public.fn_study_workspaces() to authenticated;
grant execute on function public.fn_study_enter_workspace(uuid) to authenticated;
grant execute on function public.fn_study_group_members(uuid) to authenticated;
