insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'operador' and p.action in ('read', 'view', 'create', 'update') and p.module <> 'rbac'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'leitura' and p.action in ('read', 'view')
on conflict (role_id, permission_id) do nothing;
