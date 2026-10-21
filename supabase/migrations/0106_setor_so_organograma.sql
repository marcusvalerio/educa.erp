-- 0106 — Em Grupos da turma, Papel e Setor deixam de brigar.
--
-- Os dois campos trocavam as permissões e valia o último alterado (ex.: a
-- pessoa ficava "Gerente" com setor "Comercial" só de rótulo). Agora:
--   * Papel = o que a pessoa pode fazer (Gerente, perfis com telas, perfis
--     de setor "Setor: Comercial"...). Escolher um perfil de setor continua
--     usando fn_study_set_member_sector (cria o perfil se preciso).
--   * Setor = onde a pessoa fica no organograma: só o departamento, sem
--     mexer nas permissões (esta função).
-- Pode rodar de novo.

create or replace function public.fn_study_set_member_department(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
  v_sector record;
  v_department uuid;
begin
  select * into v_sector from public.fn_sector_catalog() c where c.code = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception 'Setor desconhecido: %.', p_code using errcode = '22023';
  end if;
  select d.id into v_department from public.departments d where d.company_id = v_user.company_id and d.code = v_sector.code;
  if v_department is null then
    insert into public.departments (company_id, code, name, status)
    values (v_user.company_id, v_sector.code, v_sector.name, 'active')
    returning id into v_department;
  end if;
  update public.users set department_id = v_department, department = v_sector.name where id = v_user.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'users', v_user.id, 'ASSIGN',
    jsonb_build_object('department_id', v_user.department_id), jsonb_build_object('department_id', v_department, 'sector', v_sector.code));

  return jsonb_build_object('user_id', v_user.id, 'sector', v_sector.code, 'sector_name', v_sector.name);
end;
$$;

revoke all on function public.fn_study_set_member_department(uuid, text) from public, anon;
grant execute on function public.fn_study_set_member_department(uuid, text) to authenticated;
