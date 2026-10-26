-- 0124 — Professor com várias turmas, tela de grupos dentro do ERP do grupo
-- e aluno movido de um grupo para outro da mesma turma.
--
--   1) fn_study_professor_row escolhe a turma do ERP aberto (a própria turma
--      ou a turma do grupo aberto); fn_study_context responde pela turma do
--      professor, então "Grupos da turma" funciona dentro do ERP de um grupo.
--   2) fn_study_create_class: o professor cria outra turma (empresa do tipo
--      Estudo, mesmo plano e módulos da turma atual) e vira o Administrador
--      dela. Os grupos novos vão para a turma aberta no momento.
--   3) fn_study_workspaces / fn_study_enter_workspace: todas as turmas do
--      professor e os grupos de cada uma.
--   4) fn_study_move_member: muda o aluno de grupo dentro da turma, com o
--      mesmo papel (nível); o setor (perfil com telas) é do grupo antigo e sai.
--      O que ele já lançou fica no grupo antigo.
-- Pode rodar de novo.

-- Todas as linhas de professor (Administrador de turma) de quem chama.
create or replace function public.fn_study_professor_rows()
returns setof public.users
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
    and public.has_permission(c.id, 'roles.manage');
$$;
revoke all on function public.fn_study_professor_rows() from public, anon, authenticated;

-- A turma do ERP aberto (a turma ou o grupo dela); senão, a mais antiga.
create or replace function public.fn_study_professor_row()
returns public.users
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
  from public.fn_study_professor_rows() p
  left join public.user_active_company a on a.auth_user_id = p.auth_user_id
  left join public.companies cur on cur.id = a.company_id
  order by (p.company_id = cur.id or p.company_id = cur.parent_company_id) desc nulls last, p.created_at
  limit 1;
$$;
revoke all on function public.fn_study_professor_row() from public, anon, authenticated;

create or replace function public.fn_study_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof public.users := public.fn_study_professor_row();
  v_actor public.users;
  v_company public.companies;
begin
  if v_prof.id is not null then
    return jsonb_build_object('is_study', true, 'can_manage', true, 'parent_name', null,
      'class_id', v_prof.company_id,
      'class_name', (select name from public.companies where id = v_prof.company_id),
      'classes', (select count(*) from public.fn_study_professor_rows()));
  end if;
  select * into v_actor from public.users where id = public.current_app_user_id();
  if not found then
    return jsonb_build_object('is_study', false, 'can_manage', false, 'parent_name', null);
  end if;
  select * into v_company from public.companies where id = v_actor.company_id;
  return jsonb_build_object(
    'is_study', v_company.company_kind = 'study',
    'can_manage', false,
    'parent_name', (select name from public.companies where id = v_company.parent_company_id)
  );
end;
$$;

-- ------------------------------------------------------------ nova turma
create or replace function public.fn_study_create_class(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof public.users := public.fn_study_professor_row();
  v_from public.companies;
  v_class public.companies;
  v_user public.users;
  v_admin uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_prof.id is null then
    raise exception 'Só o Administrador de uma turma cria outras turmas.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Informe o nome da turma.' using errcode = '22023';
  end if;
  if length(v_name) > 160 then
    raise exception 'O nome da turma pode ter no máximo 160 caracteres.' using errcode = '22023';
  end if;
  if (select count(*) from public.fn_study_professor_rows()) >= 30 then
    raise exception 'Limite de 30 turmas por professor.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fn_study_professor_rows() p join public.companies c on c.id = p.company_id where lower(c.name) = lower(v_name)) then
    raise exception 'Você já tem uma turma com este nome.' using errcode = 'P0001';
  end if;
  select * into v_from from public.companies where id = v_prof.company_id;

  perform set_config('educa.company_kind', 'fn', true);
  insert into public.companies (name, status, company_kind, city, state)
  values (v_name, 'active', 'study', v_from.city, v_from.state)
  returning * into v_class;
  perform set_config('educa.company_kind', '', true);

  update public.company_platform_profiles g
  set lifecycle_status = p.lifecycle_status, plan_code = p.plan_code
  from public.company_platform_profiles p
  where g.company_id = v_class.id and p.company_id = v_from.id;

  insert into public.company_modules (company_id, module_code, contracted, enabled_by_company, notes)
  select v_class.id, m.module_code, m.contracted, m.enabled_by_company, 'Herdado da turma'
  from public.company_modules m
  where m.company_id = v_from.id
    and not exists (select 1 from public.company_modules x where x.company_id = v_class.id and x.module_code = m.module_code);
  update public.company_modules g
  set contracted = m.contracted, enabled_by_company = m.enabled_by_company, disabled_at = m.disabled_at
  from public.company_modules m
  where g.company_id = v_class.id and m.company_id = v_from.id and m.module_code = g.module_code;

  select id into v_admin from public.roles where company_id = v_class.id and code = 'admin';
  if v_admin is null then
    raise exception 'A turma nova não recebeu o papel Administrador.' using errcode = 'P0001';
  end if;

  perform set_config('educa.auth_link', 'invitation', true);
  insert into public.users (company_id, auth_user_id, name, email, login, role, status)
  values (v_class.id, v_prof.auth_user_id, v_prof.name, v_prof.email, coalesce(v_prof.login, split_part(v_prof.email, '@', 1)), 'Administrador', 'active')
  returning * into v_user;
  perform set_config('educa.auth_link', '', true);
  insert into public.user_roles (user_id, role_id) values (v_user.id, v_admin) on conflict do nothing;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values
    (v_from.id, v_prof.id, coalesce(v_prof.name, v_prof.email), 'companies', v_class.id, 'CREATE', null,
      jsonb_build_object('name', v_class.name, 'via', 'study_class')),
    (v_class.id, v_user.id, coalesce(v_prof.name, v_prof.email), 'companies', v_class.id, 'CREATE', null,
      jsonb_build_object('name', v_class.name, 'via', 'study_class', 'from', v_from.id));

  -- Abre a turma nova.
  insert into public.user_active_company (auth_user_id, company_id) values (v_prof.auth_user_id, v_class.id)
  on conflict (auth_user_id) do update set company_id = excluded.company_id, updated_at = now();

  return jsonb_build_object('class_id', v_class.id, 'name', v_class.name);
end;
$$;

-- ------------------------------------------------------------ troca de ERP
drop function if exists public.fn_study_workspaces();
create function public.fn_study_workspaces()
returns table (company_id uuid, name text, group_label text, is_class boolean, is_current boolean, class_id uuid, class_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
begin
  select u.company_id into v_current from public.users u where u.id = public.current_app_user_id();
  return query
  select c.id, c.name, c.group_label, c.parent_company_id is null, c.id = v_current, t.id, t.name
  from public.fn_study_professor_rows() p
  join public.companies t on t.id = p.company_id
  join public.companies c on c.id = t.id or c.parent_company_id = t.id
  order by t.created_at, t.name, c.parent_company_id nulls first, c.created_at, c.name;
end;
$$;

create or replace function public.fn_study_enter_workspace(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.companies;
  v_prof public.users;
  v_group public.companies;
  v_user public.users;
  v_admin uuid;
  v_login text;
begin
  select * into v_target from public.companies where id = p_company_id;
  select p.* into v_prof from public.fn_study_professor_rows() p
  where p.company_id = v_target.id or p.company_id = v_target.parent_company_id
  limit 1;
  if v_prof.id is null then
    if not exists (select 1 from public.fn_study_professor_rows()) then
      raise exception 'Só o Administrador da turma entra no ERP dos grupos.' using errcode = '42501';
    end if;
    raise exception 'Grupo não encontrado nesta turma.' using errcode = 'P0002';
  end if;

  if p_company_id = v_prof.company_id then
    insert into public.user_active_company (auth_user_id, company_id) values (v_prof.auth_user_id, p_company_id)
    on conflict (auth_user_id) do update set company_id = excluded.company_id, updated_at = now();
    return jsonb_build_object('company_id', p_company_id, 'name', v_target.name);
  end if;

  v_group := v_target;
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

-- ------------------------------------------------------------ mover aluno
create or replace function public.fn_study_move_member(p_user_id uuid, p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
  v_to public.companies := public.fn_study_group_of_actor(p_group_id, v_actor);
  v_from public.companies;
  v_level text;
  v_role public.roles;
  v_login text := v_user.login;
begin
  if v_user.is_supervisor then
    raise exception 'O professor não é movido entre grupos.' using errcode = 'P0001';
  end if;
  if v_to.id = v_user.company_id then
    raise exception 'O aluno já está neste grupo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.users where company_id = v_to.id and lower(email) = lower(v_user.email)) then
    raise exception 'Este e-mail já está cadastrado no grupo de destino.' using errcode = 'P0001';
  end if;
  select * into v_from from public.companies where id = v_user.company_id;

  -- Mesmo nível no grupo novo (Gerente, Operador...); sem nível, Gerente.
  select r.code into v_level from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = v_user.id and r.screens is null and r.code not like 'setor\_%'
  order by r.is_system desc, r.name limit 1;
  select * into v_role from public.roles where company_id = v_to.id and status = 'active' and code = coalesce(v_level, 'gerente');
  if not found then
    select * into v_role from public.roles where company_id = v_to.id and status = 'active' and code = 'gerente';
  end if;
  if not found then
    raise exception 'O grupo de destino não tem o papel do aluno.' using errcode = 'P0001';
  end if;

  if v_login is not null and exists (select 1 from public.users where company_id = v_to.id and login = v_login) then
    v_login := v_login || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  delete from public.user_roles where user_id = v_user.id;
  delete from public.user_branch_access where user_id = v_user.id;
  delete from public.workflow_step_approvers where user_id = v_user.id;
  update public.users
  set company_id = v_to.id, login = v_login, branch_id = null, department_id = null, position_id = null, role = v_role.name
  where id = v_user.id;
  insert into public.user_roles (user_id, role_id) values (v_user.id, v_role.id) on conflict do nothing;
  update public.user_invitations set company_id = v_to.id where user_id = v_user.id;
  if v_user.auth_user_id is not null then
    update public.user_active_company set company_id = v_to.id, updated_at = now()
    where auth_user_id = v_user.auth_user_id and company_id = v_from.id;
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values
    (v_from.id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'users', v_user.id, 'UPDATE',
      jsonb_build_object('grupo', coalesce(v_from.group_label, v_from.name)), jsonb_build_object('movido_para', coalesce(v_to.group_label, v_to.name), 'aluno', v_user.name)),
    (v_to.id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'users', v_user.id, 'UPDATE',
      jsonb_build_object('veio_de', coalesce(v_from.group_label, v_from.name)), jsonb_build_object('aluno', v_user.name, 'papel', v_role.name));

  return jsonb_build_object('user_id', v_user.id, 'group_id', v_to.id, 'role_name', v_role.name);
end;
$$;

revoke all on function public.fn_study_create_class(text) from public, anon;
revoke all on function public.fn_study_workspaces() from public, anon;
revoke all on function public.fn_study_enter_workspace(uuid) from public, anon;
revoke all on function public.fn_study_move_member(uuid, uuid) from public, anon;
revoke all on function public.fn_study_context() from public, anon;
grant execute on function public.fn_study_create_class(text) to authenticated;
grant execute on function public.fn_study_workspaces() to authenticated;
grant execute on function public.fn_study_enter_workspace(uuid) to authenticated;
grant execute on function public.fn_study_move_member(uuid, uuid) to authenticated;
grant execute on function public.fn_study_context() to authenticated;
