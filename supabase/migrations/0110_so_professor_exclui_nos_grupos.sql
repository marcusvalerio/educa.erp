-- 0110 — Nos grupos de uma turma, só o professor exclui.
--
-- Os papéis dos alunos (Gerente, Operador, Vendedor, perfis de setor...)
-- perdem as permissões de exclusão (*.delete); os alunos passam a INATIVAR
-- cadastros, o que mantém o histórico. O papel Administrador do grupo —
-- usado pelo professor ao entrar no ERP do grupo (0109) — continua com elas.
-- Um gatilho impede que a exclusão volte a um papel de aluno (perfis novos,
-- grupos novos, edição de papéis). Empresas comuns não mudam.

create or replace function public.fn_is_delete_permission(p_permission_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.permissions p where p.id = p_permission_id and (p.action = 'delete' or p.code like '%.delete'));
$$;

create or replace function public.fn_guard_group_delete_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.fn_is_delete_permission(new.permission_id)
     and exists (
       select 1 from public.roles r join public.companies c on c.id = r.company_id
       where r.id = new.role_id and c.parent_company_id is not null and r.code <> 'admin'
     ) then
    return null; -- ignora em silêncio: aluno não recebe exclusão
  end if;
  return new;
end;
$$;
revoke all on function public.fn_guard_group_delete_permission() from public, anon, authenticated, service_role;
revoke all on function public.fn_is_delete_permission(uuid) from public, anon;

drop trigger if exists guard_group_delete_permission on public.role_permissions;
create trigger guard_group_delete_permission
  before insert or update on public.role_permissions
  for each row execute function public.fn_guard_group_delete_permission();

delete from public.role_permissions rp
using public.roles r, public.companies c
where r.id = rp.role_id
  and c.id = r.company_id
  and c.parent_company_id is not null
  and r.code <> 'admin'
  and public.fn_is_delete_permission(rp.permission_id);
