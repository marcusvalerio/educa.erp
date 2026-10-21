-- 0104 — Professor define o papel de cada aluno do grupo.
--
-- Em Grupos da turma o professor já cadastra alunos e escolhe o setor; agora
-- também troca o papel (Gerente, Operador, Vendedor, Somente leitura,
-- Administrador ou um perfil de setor) sem precisar entrar no grupo. O papel
-- escolhido substitui os anteriores. As travas de sempre continuam: o último
-- Administrador do grupo não perde o papel. Pode rodar de novo.

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
  v_old jsonb;
begin
  select * into v_role from public.roles where id = p_role_id;
  if not found or v_role.company_id <> v_user.company_id then
    raise exception 'Papel não encontrado neste grupo.' using errcode = 'P0002';
  end if;
  if v_role.status <> 'active' then
    raise exception 'Papel inativo.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(ur.role_id), '[]'::jsonb) into v_old from public.user_roles ur where ur.user_id = v_user.id;
  insert into public.user_roles (user_id, role_id) values (v_user.id, v_role.id) on conflict do nothing;
  delete from public.user_roles ur where ur.user_id = v_user.id and ur.role_id <> v_role.id;
  update public.users set role = v_role.name where id = v_user.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'user_roles', v_user.id, 'ASSIGN',
    jsonb_build_object('roles', v_old), jsonb_build_object('role_id', v_role.id, 'role_code', v_role.code));

  return jsonb_build_object('user_id', v_user.id, 'role_id', v_role.id, 'role_name', v_role.name);
end;
$$;

revoke all on function public.fn_study_set_member_role(uuid, uuid) from public, anon;
grant execute on function public.fn_study_set_member_role(uuid, uuid) to authenticated;
