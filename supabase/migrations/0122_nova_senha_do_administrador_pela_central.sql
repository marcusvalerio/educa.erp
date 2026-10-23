-- 0122 — Administração Central: nova senha provisória do administrador
-- de cada empresa.
--
-- A plataforma (quem pode editar empresas) gera uma senha provisória para
-- o administrador da empresa que JÁ tem acesso (esqueceu a senha, troca de
-- responsável...). Mesmo fluxo da "Nova senha provisória" da empresa (0102):
-- a senha aparece uma vez, vale por tempo limitado e a pessoa cria a
-- própria senha no próximo acesso. Só o administrador (papel admin) mais
-- antigo com acesso; nunca um login da própria plataforma. Fica na
-- auditoria da empresa. Pode rodar de novo.

create or replace function public.fn_platform_authorize_company_admin_password_reset(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_actor text;
begin
  if not public.has_platform_permission('platform.companies.update') then
    raise exception 'Permissão negada (platform.companies.update).' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;

  select u.* into v_user
  from public.users u
  where u.company_id = p_company_id and u.status = 'active' and u.auth_user_id is not null and not u.is_supervisor
    and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id and r.code = 'admin')
  order by u.created_at
  limit 1;
  if not found then
    raise exception 'Esta empresa ainda não tem administrador com acesso: envie o convite do administrador.' using errcode = 'P0001';
  end if;

  select coalesce(name, email) || ' (Administração Central)' into v_actor from public.platform_members where auth_user_id = auth.uid();
  return public.fn_password_reset_target(v_user, coalesce(v_actor, 'Administração Central'));
end;
$$;
revoke all on function public.fn_platform_authorize_company_admin_password_reset(uuid) from public, anon;
grant execute on function public.fn_platform_authorize_company_admin_password_reset(uuid) to authenticated;
