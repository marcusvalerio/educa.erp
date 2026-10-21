-- 0107 — Papel = nível; Setor = perfil com telas.
--
-- Em Grupos da turma cada aluno passa a ter DOIS vínculos independentes:
--   * Papel (nível): Gerente, Operador, Vendedor, Somente leitura ou
--     Administrador — o perfil de sempre, sem lista de telas;
--   * Setor: um perfil com telas criado pelo professor (0105) — o menu
--     mostra só as telas dele.
-- Trocar um não mexe no outro. Sem setor, o menu segue as permissões do
-- papel. As travas de sempre continuam (último Administrador). Pode rodar
-- de novo.

create or replace function public.fn_study_set_member_role(p_user_id uuid, p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
  v_role public.roles;
  v_profile boolean;
  v_old jsonb;
begin
  select * into v_role from public.roles where id = p_role_id;
  if not found or v_role.company_id <> v_user.company_id then
    raise exception 'Papel não encontrado neste grupo.' using errcode = 'P0002';
  end if;
  if v_role.status <> 'active' then
    raise exception 'Papel inativo.' using errcode = 'P0001';
  end if;
  v_profile := v_role.screens is not null;

  select coalesce(jsonb_agg(ur.role_id), '[]'::jsonb) into v_old from public.user_roles ur where ur.user_id = v_user.id;
  insert into public.user_roles (user_id, role_id) values (v_user.id, v_role.id) on conflict do nothing;
  -- Troca só o vínculo do mesmo tipo: setor (perfil com telas) ou papel (nível).
  delete from public.user_roles ur using public.roles r
   where ur.user_id = v_user.id and r.id = ur.role_id and ur.role_id <> v_role.id
     and ((r.screens is not null) = v_profile);
  update public.users u set role = (
    select string_agg(r.name, ' · ' order by (r.screens is not null), r.name) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id
  ) where u.id = v_user.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'user_roles', v_user.id, 'ASSIGN',
    jsonb_build_object('roles', v_old), jsonb_build_object('role_id', v_role.id, 'role_code', v_role.code, 'kind', case when v_profile then 'setor' else 'papel' end));

  return jsonb_build_object('user_id', v_user.id, 'role_id', v_role.id, 'role_name', v_role.name);
end;
$$;

-- Tira o setor (perfil com telas): o menu volta a seguir o papel.
create or replace function public.fn_study_clear_member_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
begin
  if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = v_user.id and r.screens is null) then
    raise exception 'Escolha um papel antes de tirar o setor (a pessoa ficaria sem acesso).' using errcode = 'P0001';
  end if;
  delete from public.user_roles ur using public.roles r where ur.user_id = v_user.id and r.id = ur.role_id and r.screens is not null;
  update public.users u set role = (select string_agg(r.name, ' · ' order by r.name) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id) where u.id = v_user.id;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'user_roles', v_user.id, 'UNASSIGN', null, jsonb_build_object('kind', 'setor'));
  return jsonb_build_object('user_id', v_user.id);
end;
$$;

-- Membros: papel (nível) e setor (perfil com telas) separados.
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
  where u.company_id = v_group.id
  order by u.name;
end;
$$;

revoke all on function public.fn_study_set_member_role(uuid, uuid) from public, anon;
revoke all on function public.fn_study_clear_member_profile(uuid) from public, anon;
revoke all on function public.fn_study_group_members(uuid) from public, anon;
grant execute on function public.fn_study_set_member_role(uuid, uuid) to authenticated;
grant execute on function public.fn_study_clear_member_profile(uuid) to authenticated;
grant execute on function public.fn_study_group_members(uuid) to authenticated;
