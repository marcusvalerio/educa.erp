-- 0096 — Modo Estudo: turma (empresa do tipo "study") e grupos (subempresas).
--
-- Uma turma é uma empresa comum com company_kind = 'study'; o Administrador
-- dela (professor) cria GRUPOS, que são empresas comuns (company_kind =
-- 'business') com parent_company_id = turma. Cada grupo é isolado como
-- qualquer empresa (RLS por company_id, inalterada). O professor NÃO vê os
-- dados dos grupos: só cria grupos, cadastra alunos e emite convites (a
-- senha provisória do servidor usa esses convites). Um login continua
-- ligado a um único cadastro.
--
-- Só acréscimos: duas colunas, um gatilho de proteção e funções novas.
-- Nenhuma função existente é alterada. Reaplicável (idempotente) e
-- compatível com a sequência 0075 e com 0076–0095.

-- ------------------------------------------------------------------ colunas
alter table public.companies add column if not exists company_kind text not null default 'business';
alter table public.companies add column if not exists parent_company_id uuid references public.companies(id) on delete restrict;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_company_kind_check') then
    alter table public.companies add constraint companies_company_kind_check check (company_kind in ('business', 'study'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_parent_company_check') then
    -- Grupo é sempre empresa comum e nunca é pai de si mesmo.
    alter table public.companies add constraint companies_parent_company_check
      check (parent_company_id is null or (parent_company_id <> id and company_kind = 'business'));
  end if;
end $$;

create index if not exists companies_parent_company_id_idx on public.companies (parent_company_id) where parent_company_id is not null;

comment on column public.companies.company_kind is 'business = empresa; study = turma (o Administrador cria grupos). 0096.';
comment on column public.companies.parent_company_id is 'Turma (company_kind = study) à qual este grupo pertence. 0096.';

-- ------------------------------------------------------------------ proteção
-- Tipo e turma só mudam pelas funções desta migration (marca
-- educa.company_kind na transação), nunca por UPDATE direto — nem com o
-- cliente administrativo. Ligar uma empresa a uma turma daria ao professor
-- poder sobre os cadastros dela.
create or replace function public.fn_guard_company_kind()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if (new.company_kind <> 'business' or new.parent_company_id is not null)
       and coalesce(current_setting('educa.company_kind', true), '') <> 'fn' then
      raise exception 'Tipo de empresa e turma só são definidos pelas funções do Modo Estudo.' using errcode = '42501';
    end if;
  elsif (new.company_kind is distinct from old.company_kind or new.parent_company_id is distinct from old.parent_company_id)
        and coalesce(current_setting('educa.company_kind', true), '') <> 'fn' then
    raise exception 'Tipo de empresa e turma só são alterados pelas funções do Modo Estudo.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_company_kind on public.companies;
create trigger guard_company_kind
  before insert or update of company_kind, parent_company_id on public.companies
  for each row execute function public.fn_guard_company_kind();

-- ------------------------------------------------------------------ plataforma
create or replace function public.fn_platform_set_company_kind(p_company_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies;
begin
  if not public.has_platform_permission('platform.companies.create') then
    raise exception 'Permissão negada (platform.companies.create).' using errcode = '42501';
  end if;
  if p_kind not in ('business', 'study') then
    raise exception 'Tipo inválido: use empresa ou estudo.' using errcode = '22023';
  end if;
  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  if v_company.parent_company_id is not null then
    raise exception 'Um grupo de turma não pode mudar de tipo.' using errcode = 'P0001';
  end if;
  if p_kind = 'business' and exists (select 1 from public.companies where parent_company_id = p_company_id) then
    raise exception 'Esta turma tem grupos: ela não pode voltar a ser empresa.' using errcode = 'P0001';
  end if;
  if v_company.company_kind = p_kind then
    return jsonb_build_object('company_id', p_company_id, 'company_kind', p_kind);
  end if;

  perform set_config('educa.company_kind', 'fn', true);
  update public.companies set company_kind = p_kind where id = p_company_id;
  perform set_config('educa.company_kind', '', true);

  perform public.fn_log_platform_audit('companies', p_company_id, 'UPDATE',
    jsonb_build_object('company_kind', v_company.company_kind), jsonb_build_object('company_kind', p_kind));
  return jsonb_build_object('company_id', p_company_id, 'company_kind', p_kind);
end;
$$;

-- ------------------------------------------------------------------ professor
-- Quem chama precisa ser usuário ativo de uma TURMA, com users.create,
-- users.update e roles.manage nela (o Administrador da turma).
create or replace function public.fn_study_actor()
returns public.users
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
begin
  select * into v_actor from public.users where id = public.current_app_user_id();
  if not found or v_actor.status <> 'active' then
    raise exception 'Entre com um usuário ativo da turma.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = v_actor.company_id and company_kind = 'study') then
    raise exception 'Grupos existem só em empresas do tipo Estudo.' using errcode = '42501';
  end if;
  if not (public.has_permission(v_actor.company_id, 'users.create')
          and public.has_permission(v_actor.company_id, 'users.update')
          and public.has_permission(v_actor.company_id, 'roles.manage')) then
    raise exception 'Só o Administrador da turma gerencia os grupos.' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

/** Grupo da turma de quem chama (ou erro). */
create or replace function public.fn_study_group_of_actor(p_group_id uuid, p_actor public.users)
returns public.companies
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.companies;
begin
  select * into v_group from public.companies where id = p_group_id;
  if not found or v_group.parent_company_id is distinct from p_actor.company_id then
    raise exception 'Grupo não encontrado nesta turma.' using errcode = 'P0002';
  end if;
  return v_group;
end;
$$;

/** A tela pergunta: esta empresa é turma, e quem chama pode gerenciar os grupos? */
create or replace function public.fn_study_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_company public.companies;
begin
  select * into v_actor from public.users where id = public.current_app_user_id();
  if not found then
    return jsonb_build_object('is_study', false, 'can_manage', false, 'parent_name', null);
  end if;
  select * into v_company from public.companies where id = v_actor.company_id;
  return jsonb_build_object(
    'is_study', v_company.company_kind = 'study',
    'can_manage', v_company.company_kind = 'study' and v_actor.status = 'active'
      and public.has_permission(v_actor.company_id, 'users.create')
      and public.has_permission(v_actor.company_id, 'users.update')
      and public.has_permission(v_actor.company_id, 'roles.manage'),
    'parent_name', (select name from public.companies where id = v_company.parent_company_id)
  );
end;
$$;

create or replace function public.fn_study_create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_parent public.companies;
  v_group public.companies;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_name = '' then
    raise exception 'Informe o nome do grupo.' using errcode = '22023';
  end if;
  if length(v_name) > 160 then
    raise exception 'O nome do grupo pode ter no máximo 160 caracteres.' using errcode = '22023';
  end if;
  select * into v_parent from public.companies where id = v_actor.company_id;
  if (select count(*) from public.companies where parent_company_id = v_parent.id) >= 100 then
    raise exception 'Limite de 100 grupos por turma.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.companies where parent_company_id = v_parent.id and lower(name) = lower(v_name)) then
    raise exception 'Já existe um grupo com este nome nesta turma.' using errcode = 'P0001';
  end if;

  -- Os gatilhos de companies semeiam papéis, unidades, depósitos, perfil
  -- de plataforma e módulos, como em qualquer empresa nova.
  perform set_config('educa.company_kind', 'fn', true);
  insert into public.companies (name, status, company_kind, parent_company_id, city, state)
  values (v_name, 'active', 'business', v_parent.id, v_parent.city, v_parent.state)
  returning * into v_group;
  perform set_config('educa.company_kind', '', true);

  -- Mesma situação, plano e módulos da turma.
  update public.company_platform_profiles g
  set lifecycle_status = p.lifecycle_status, plan_code = p.plan_code
  from public.company_platform_profiles p
  where g.company_id = v_group.id and p.company_id = v_parent.id;

  insert into public.company_modules (company_id, module_code, contracted, enabled_by_company, notes)
  select v_group.id, m.module_code, m.contracted, m.enabled_by_company, 'Herdado da turma'
  from public.company_modules m
  where m.company_id = v_parent.id
    and not exists (select 1 from public.company_modules x where x.company_id = v_group.id and x.module_code = m.module_code);
  update public.company_modules g
  set contracted = m.contracted, enabled_by_company = m.enabled_by_company, disabled_at = m.disabled_at
  from public.company_modules m
  where g.company_id = v_group.id and m.company_id = v_parent.id and m.module_code = g.module_code;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_parent.id, v_actor.id, coalesce(v_actor.name, v_actor.email), 'companies', v_group.id, 'CREATE', null,
    jsonb_build_object('name', v_group.name, 'via', 'study_group'));

  return jsonb_build_object('group_id', v_group.id, 'name', v_group.name);
end;
$$;

/** Grupos da turma com contagens (nunca o conteúdo). */
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
  select c.id, c.name, c.created_at,
    (select count(*) from public.users u where u.company_id = c.id),
    (select count(*) from public.users u where u.company_id = c.id and u.auth_user_id is not null),
    (select count(*) from public.user_invitations i where i.company_id = c.id and i.status = 'pending' and i.expires_at > now()),
    (select count(*) from public.products p where p.company_id = c.id),
    (select count(*) from public.sales_orders s where s.company_id = c.id),
    (select count(*) from public.purchase_orders o where o.company_id = c.id)
  from public.companies c
  where c.parent_company_id = v_actor.company_id
  order by c.created_at;
end;
$$;

/** Papéis do grupo, para escolher o do aluno. */
create or replace function public.fn_study_group_roles(p_group_id uuid)
returns table (id uuid, code text, name text)
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
  select r.id, r.code::text, r.name::text from public.roles r
  where r.company_id = v_group.id and r.status = 'active'
  order by r.is_system desc, r.name;
end;
$$;

/** Alunos do grupo: cadastro, se já tem acesso e o convite pendente. */
create or replace function public.fn_study_group_members(p_group_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  status text,
  has_login boolean,
  roles text,
  invitation_status text,
  invitation_expires_at timestamptz
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
    (select i.expires_at from public.user_invitations i where i.user_id = u.id order by i.created_at desc limit 1)
  from public.users u
  where u.company_id = v_group.id
  order by u.name;
end;
$$;

create or replace function public.fn_study_add_member(p_group_id uuid, p_name text, p_email text, p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_group public.companies := public.fn_study_group_of_actor(p_group_id, v_actor);
  v_role public.roles;
  v_user public.users;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_login text;
begin
  if v_name = '' then
    raise exception 'Informe o nome do aluno.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  select * into v_role from public.roles where id = p_role_id;
  if not found or v_role.company_id <> v_group.id then
    raise exception 'Papel não encontrado neste grupo.' using errcode = 'P0002';
  end if;
  if v_role.status <> 'active' then
    raise exception 'Papel inativo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.users where company_id = v_group.id and lower(email) = v_email) then
    raise exception 'Este e-mail já está cadastrado neste grupo.' using errcode = 'P0001';
  end if;

  v_login := split_part(v_email, '@', 1);
  if exists (select 1 from public.users where company_id = v_group.id and login = v_login) then
    v_login := v_login || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  insert into public.users (company_id, name, email, login, role, status)
  values (v_group.id, v_name, v_email, v_login, v_role.name, 'active')
  returning * into v_user;
  insert into public.user_roles (user_id, role_id) values (v_user.id, v_role.id) on conflict do nothing;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values
    (v_group.id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'users', v_user.id, 'CREATE', null,
      jsonb_build_object('email', v_email, 'name', v_name, 'via', 'study_group')),
    (v_group.id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'user_roles', v_user.id, 'GRANT', null,
      jsonb_build_object('user_id', v_user.id, 'role_id', v_role.id, 'role_code', v_role.code));

  return jsonb_build_object('user_id', v_user.id, 'name', v_user.name, 'email', v_user.email);
end;
$$;

/** Aluno do grupo da turma de quem chama (ou erro). */
create or replace function public.fn_study_member_of_actor(p_user_id uuid, p_actor public.users)
returns public.users
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
begin
  select u.* into v_user from public.users u join public.companies c on c.id = u.company_id
  where u.id = p_user_id and c.parent_company_id = p_actor.company_id;
  if not found then
    raise exception 'Aluno não encontrado nos grupos desta turma.' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

/** Convite de um aluno (base da senha provisória). Mesmas regras do convite comum. */
create or replace function public.fn_study_create_member_invitation(p_user_id uuid, p_ttl_hours integer default 72)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
  v_result jsonb;
begin
  if v_user.status <> 'active' then
    raise exception 'Cadastro inativo não recebe acesso.' using errcode = 'P0001';
  end if;
  if v_user.auth_user_id is not null then
    raise exception 'Este aluno já tem acesso. Ele usa "Esqueci minha senha" se precisar.' using errcode = 'P0001';
  end if;
  if coalesce(trim(v_user.email), '') = '' then
    raise exception 'O cadastro do aluno não possui e-mail.' using errcode = '22023';
  end if;

  v_result := public.fn_issue_user_invitation(v_user.id, 'USER', least(greatest(coalesce(p_ttl_hours, 72), 1), 168),
    coalesce(v_actor.name, v_actor.email) || ' (professor)', null);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'user_invitations',
    (v_result->>'invitation_id')::uuid, 'CREATE', null,
    jsonb_build_object('user_id', v_user.id, 'email', v_result->>'email', 'kind', 'USER', 'via', 'study_group', 'expires_at', v_result->>'expires_at'));

  return v_result;
end;
$$;

/** Convite pendente de um aluno (para revogar a senha provisória). */
create or replace function public.fn_study_member_pending_invitation(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
  v_inv public.user_invitations;
begin
  select * into v_inv from public.user_invitations where user_id = v_user.id and status = 'pending' order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object('id', v_inv.id, 'email', v_inv.email, 'user_id', v_user.id);
end;
$$;

create or replace function public.fn_study_revoke_member_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_inv public.user_invitations;
begin
  select * into v_inv from public.user_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;
  perform public.fn_study_member_of_actor(v_inv.user_id, v_actor);
  if v_inv.status <> 'pending' then
    return jsonb_build_object('revoked', false);
  end if;
  update public.user_invitations set status = 'revoked', revoked_at = now(), updated_at = now() where id = v_inv.id;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_inv.company_id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'user_invitations', v_inv.id, 'REVOKE',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'revoked', 'via', 'study_group'));
  return jsonb_build_object('revoked', true);
end;
$$;

-- ------------------------------------------------------------------ privilégios
revoke all on function public.fn_guard_company_kind() from public, anon, authenticated;
revoke all on function public.fn_platform_set_company_kind(uuid, text) from public, anon;
revoke all on function public.fn_study_actor() from public, anon, authenticated;
revoke all on function public.fn_study_group_of_actor(uuid, public.users) from public, anon, authenticated;
revoke all on function public.fn_study_member_of_actor(uuid, public.users) from public, anon, authenticated;
revoke all on function public.fn_study_context() from public, anon;
revoke all on function public.fn_study_create_group(text) from public, anon;
revoke all on function public.fn_study_groups() from public, anon;
revoke all on function public.fn_study_group_roles(uuid) from public, anon;
revoke all on function public.fn_study_group_members(uuid) from public, anon;
revoke all on function public.fn_study_add_member(uuid, text, text, uuid) from public, anon;
revoke all on function public.fn_study_create_member_invitation(uuid, integer) from public, anon;
revoke all on function public.fn_study_member_pending_invitation(uuid) from public, anon;
revoke all on function public.fn_study_revoke_member_invitation(uuid) from public, anon;

grant execute on function public.fn_platform_set_company_kind(uuid, text) to authenticated;
grant execute on function public.fn_study_context() to authenticated;
grant execute on function public.fn_study_create_group(text) to authenticated;
grant execute on function public.fn_study_groups() to authenticated;
grant execute on function public.fn_study_group_roles(uuid) to authenticated;
grant execute on function public.fn_study_group_members(uuid) to authenticated;
grant execute on function public.fn_study_add_member(uuid, text, text, uuid) to authenticated;
grant execute on function public.fn_study_create_member_invitation(uuid, integer) to authenticated;
grant execute on function public.fn_study_member_pending_invitation(uuid) to authenticated;
grant execute on function public.fn_study_revoke_member_invitation(uuid) to authenticated;
