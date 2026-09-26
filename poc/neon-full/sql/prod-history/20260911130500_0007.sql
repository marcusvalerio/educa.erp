create or replace function public.current_user_company_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct company_id
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active';
$$;

create or replace function public.has_permission(p_company_id uuid, p_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where u.auth_user_id = auth.uid()
      and u.company_id = p_company_id
      and u.status = 'active'
      and r.status = 'active'
      and p.code = p_code
  );
$$;

comment on function public.has_permission is
  'Usada dentro de USING/WITH CHECK das policies de RLS. security definer de propósito: precisa enxergar users/roles/permissions mesmo quando o RLS dessas tabelas negaria a leitura direta ao chamador. Não contorna isolamento — o isolamento É o parâmetro p_company_id casado com a linha.';

insert into public.permissions (code, module, action, description) values
  ('branches.read', 'branches', 'read', 'Consultar filiais'),
  ('branches.manage', 'branches', 'manage', 'Criar/editar filiais')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('branches.read', 'branches.manage')
where r.code = 'admin'
on conflict do nothing;

create policy companies_select_member on public.companies
  for select to authenticated
  using (id in (select public.current_user_company_ids()));

create policy branches_select on public.branches
  for select to authenticated
  using (public.has_permission(company_id, 'branches.read'));
create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.has_permission(company_id, 'branches.manage'));
create policy branches_update on public.branches
  for update to authenticated
  using (public.has_permission(company_id, 'branches.manage'))
  with check (public.has_permission(company_id, 'branches.manage'));
create policy branches_delete on public.branches
  for delete to authenticated
  using (public.has_permission(company_id, 'branches.manage'));

create policy permissions_select_authenticated on public.permissions
  for select to authenticated
  using (true);

create policy roles_select on public.roles
  for select to authenticated
  using (public.has_permission(company_id, 'roles.read'));
create policy roles_insert on public.roles
  for insert to authenticated
  with check (public.has_permission(company_id, 'roles.manage'));
create policy roles_update on public.roles
  for update to authenticated
  using (public.has_permission(company_id, 'roles.manage'))
  with check (public.has_permission(company_id, 'roles.manage'));
create policy roles_delete on public.roles
  for delete to authenticated
  using (public.has_permission(company_id, 'roles.manage') and not is_system);

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (public.has_permission((select company_id from public.roles where id = role_id), 'roles.read'));
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (public.has_permission((select company_id from public.roles where id = role_id), 'roles.manage'));
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (public.has_permission((select company_id from public.roles where id = role_id), 'roles.manage'));

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (public.has_permission((select company_id from public.roles where id = role_id), 'roles.read'));
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.has_permission((select company_id from public.roles where id = role_id), 'roles.manage'));
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (public.has_permission((select company_id from public.roles where id = role_id), 'roles.manage'));

create policy users_select on public.users
  for select to authenticated
  using (public.has_permission(company_id, 'users.read') or auth_user_id = auth.uid());
create policy users_insert on public.users
  for insert to authenticated
  with check (public.has_permission(company_id, 'users.create'));
create policy users_update on public.users
  for update to authenticated
  using (public.has_permission(company_id, 'users.update'))
  with check (public.has_permission(company_id, 'users.update'));
create policy users_delete on public.users
  for delete to authenticated
  using (public.has_permission(company_id, 'users.delete'));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.has_permission(company_id, 'audit_logs.read'));

create policy suppliers_select on public.suppliers for select to authenticated using (public.has_permission(company_id, 'suppliers.read'));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.has_permission(company_id, 'suppliers.create'));
create policy suppliers_update on public.suppliers for update to authenticated using (public.has_permission(company_id, 'suppliers.update')) with check (public.has_permission(company_id, 'suppliers.update'));
create policy suppliers_delete on public.suppliers for delete to authenticated using (public.has_permission(company_id, 'suppliers.delete'));

create policy carriers_select on public.carriers for select to authenticated using (public.has_permission(company_id, 'carriers.read'));
create policy carriers_insert on public.carriers for insert to authenticated with check (public.has_permission(company_id, 'carriers.create'));
create policy carriers_update on public.carriers for update to authenticated using (public.has_permission(company_id, 'carriers.update')) with check (public.has_permission(company_id, 'carriers.update'));
create policy carriers_delete on public.carriers for delete to authenticated using (public.has_permission(company_id, 'carriers.delete'));

create policy drivers_select on public.drivers for select to authenticated using (public.has_permission(company_id, 'drivers.read'));
create policy drivers_insert on public.drivers for insert to authenticated with check (public.has_permission(company_id, 'drivers.create'));
create policy drivers_update on public.drivers for update to authenticated using (public.has_permission(company_id, 'drivers.update')) with check (public.has_permission(company_id, 'drivers.update'));
create policy drivers_delete on public.drivers for delete to authenticated using (public.has_permission(company_id, 'drivers.delete'));

create policy vehicles_select on public.vehicles for select to authenticated using (public.has_permission(company_id, 'vehicles.read'));
create policy vehicles_insert on public.vehicles for insert to authenticated with check (public.has_permission(company_id, 'vehicles.create'));
create policy vehicles_update on public.vehicles for update to authenticated using (public.has_permission(company_id, 'vehicles.update')) with check (public.has_permission(company_id, 'vehicles.update'));
create policy vehicles_delete on public.vehicles for delete to authenticated using (public.has_permission(company_id, 'vehicles.delete'));

create policy warehouse_locations_select on public.warehouse_locations for select to authenticated using (public.has_permission(company_id, 'warehouse_locations.read'));
create policy warehouse_locations_insert on public.warehouse_locations for insert to authenticated with check (public.has_permission(company_id, 'warehouse_locations.create'));
create policy warehouse_locations_update on public.warehouse_locations for update to authenticated using (public.has_permission(company_id, 'warehouse_locations.update')) with check (public.has_permission(company_id, 'warehouse_locations.update'));
create policy warehouse_locations_delete on public.warehouse_locations for delete to authenticated using (public.has_permission(company_id, 'warehouse_locations.delete'));

create policy products_select on public.products for select to authenticated using (public.has_permission(company_id, 'products.read'));
create policy products_insert on public.products for insert to authenticated with check (public.has_permission(company_id, 'products.create'));
create policy products_update on public.products for update to authenticated using (public.has_permission(company_id, 'products.update')) with check (public.has_permission(company_id, 'products.update'));
create policy products_delete on public.products for delete to authenticated using (public.has_permission(company_id, 'products.delete'));

create policy customers_select on public.customers for select to authenticated using (public.has_permission(company_id, 'customers.read'));
create policy customers_insert on public.customers for insert to authenticated with check (public.has_permission(company_id, 'customers.create'));
create policy customers_update on public.customers for update to authenticated using (public.has_permission(company_id, 'customers.update')) with check (public.has_permission(company_id, 'customers.update'));
create policy customers_delete on public.customers for delete to authenticated using (public.has_permission(company_id, 'customers.delete'));
