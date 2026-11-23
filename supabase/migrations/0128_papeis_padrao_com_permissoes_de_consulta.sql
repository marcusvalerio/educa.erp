-- 0128 — Papéis padrão de empresa nova com as permissões de consulta (reaplicável).
--
-- O catálogo tem dois verbos de consulta: 'read' (cadastros antigos) e 'view'
-- (módulos novos: Financeiro, Fiscal, Produção, CRM, Qualidade, Projetos,
-- Workflow, Importação…). fn_seed_default_roles_for_company (0075) só dava
-- 'read' a "leitura" e "operador": numa empresa nova, esses papéis recebiam
-- 403 em quase todo o sistema. A empresa de referência (ASTRA) já tem
-- 'read' + 'view' no "leitura".
--
-- 1. Empresas novas: "leitura" recebe read + view; "operador" recebe também
--    view (fora do módulo rbac, como já era para read/create/update).
-- 2. Empresas existentes: o papel de sistema "leitura" recebe as permissões
--    de consulta que faltam. Nada é removido. O "operador" existente não é
--    alterado aqui (pode ter sido ajustado pela empresa).

create or replace function public.fn_seed_default_roles_for_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_operador_id uuid;
  v_leitura_id uuid;
begin
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'admin', 'Administrador', 'Acesso total às funcionalidades existentes da empresa.', true)
  returning id into v_admin_id;
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'operador', 'Operador', 'Pode consultar, criar e editar cadastros, sem excluir.', true)
  returning id into v_operador_id;
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'leitura', 'Somente leitura', 'Pode apenas consultar cadastros e auditoria.', true)
  returning id into v_leitura_id;
  insert into public.role_permissions (role_id, permission_id)
  select v_admin_id, id from public.permissions;
  insert into public.role_permissions (role_id, permission_id)
  select v_operador_id, id from public.permissions
  where action in ('read', 'view', 'create', 'update') and module <> 'rbac'
    and code not in ('users.create', 'users.update');
  insert into public.role_permissions (role_id, permission_id)
  select v_leitura_id, id from public.permissions
  where action in ('read', 'view');
  perform public.fn_seed_operational_roles_for_company(p_company_id);
end;
$$;

revoke all on function public.fn_seed_default_roles_for_company(uuid) from public, anon, authenticated;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system and r.code = 'leitura'
  and p.action in ('read', 'view')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );
