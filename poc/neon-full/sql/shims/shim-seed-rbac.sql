-- SHIM LOCAL (só na réplica): produção nunca teve fn_seed_company_rbac;
-- as chamadas foram substituídas por concessões diretas equivalentes.
create or replace function public.fn_seed_company_rbac(p_company_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.company_id = p_company_id and r.code = 'admin'
  on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.company_id = p_company_id and r.code = 'operador' and p.action in ('read', 'create', 'update') and p.module <> 'rbac'
  on conflict do nothing;
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.company_id = p_company_id and r.code = 'leitura' and p.action = 'read'
  on conflict do nothing;
$$;
