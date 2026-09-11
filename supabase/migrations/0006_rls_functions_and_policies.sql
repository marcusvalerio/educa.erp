-- Fase 2b — RLS real
--
-- Substitui o estado "RLS habilitada, sem nenhuma policy" da migration
-- 0004 por policies reais para o papel `authenticated`, usando o
-- contexto do usuário autenticado (Supabase Auth -> public.users ->
-- user_companies/user_roles/roles/role_permissions).
--
-- Nenhuma policy usa `using (true)`. `anon` continua sem nenhuma policy
-- (nega tudo — não existe acesso anônimo ao ERP). `service_role`
-- continua ignorando RLS por definição (usado pelas rotas /api/* nesta
-- fase) — service_role deixa de ser a ÚNICA barreira porque agora a
-- autorização por permissão é real mesmo se alguém acessar o Supabase
-- diretamente com uma sessão de usuário comum (anon key + JWT),
-- contornando a API do Next.js.
--
-- As funções abaixo são SECURITY DEFINER (rodam com o dono da função,
-- não com o papel da policy) para poder ler users/user_roles/roles/
-- role_permissions mesmo com RLS habilitada nessas tabelas, sem cair em
-- recursão. `search_path` é fixado explicitamente por segurança.

-- ==================================================================
-- FUNÇÕES DE CONTEXTO DO USUÁRIO AUTENTICADO
-- ==================================================================
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
  limit 1;
$$;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.status = 'active'
  );
$$;

create or replace function public.user_in_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_companies uc
    join public.users u on u.id = uc.user_id
    where u.auth_user_id = auth.uid()
      and uc.company_id = p_company_id
      and uc.status = 'active'
      and u.status = 'active'
  );
$$;

-- Verdadeiro caso o usuário autenticado tenha, na empresa informada, um
-- papel ativo que conceda a permissão informada (ex.: 'products.delete').
-- Esta é a ÚNICA função que as policies de dados de negócio consultam —
-- centraliza toda a lógica de autorização em um único lugar.
create or replace function public.has_permission(p_company_id uuid, p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and ur.company_id = p_company_id
      and r.status = 'active'
      and p.code = p_permission_code
  );
$$;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.user_in_company(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- ==================================================================
-- COMPANIES — cada usuário só vê/edita a(s) própria(s) empresa(s).
-- Criação/exclusão de empresa não é self-service nesta fase (só
-- service_role) — por isso não há policy de insert/delete aqui.
-- ==================================================================
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (public.has_permission(id, 'companies.read'));

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update to authenticated
  using (public.has_permission(id, 'companies.update'))
  with check (public.has_permission(id, 'companies.update'));

-- ==================================================================
-- CADASTROS DE NEGÓCIO — mesmo padrão para as 8 tabelas company_id
-- já existentes: select/insert/update/delete gated por has_permission
-- no módulo correspondente. Gerado em loop para não repetir a mesma
-- lógica de autorização 32 vezes (8 tabelas x 4 operações).
-- ==================================================================
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('suppliers', 'suppliers'),
      ('carriers', 'carriers'),
      ('drivers', 'drivers'),
      ('vehicles', 'vehicles'),
      ('warehouse_locations', 'warehouse_locations'),
      ('products', 'products'),
      ('customers', 'customers'),
      ('users', 'users')
    ) as x(table_name, module)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.module || '.read'
    );

    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.module || '.create'
    );

    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.module || '.update', t.module || '.update'
    );

    execute format('drop policy if exists %I_delete on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.module || '.delete'
    );
  end loop;
end;
$$;

-- ==================================================================
-- AUDIT_LOGS — trilha imutável. Leitura gated por audit_logs.read;
-- escrita permitida a qualquer membro ativo da empresa (é efeito
-- colateral de uma operação já autorizada na tabela de origem, não uma
-- permissão de negócio em si) mas sempre amarrada ao próprio usuário.
-- Sem policy de update/delete — auditoria nunca é alterada nem apagada
-- por um usuário comum.
-- ==================================================================
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (company_id is not null and public.has_permission(company_id, 'audit_logs.read'));

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    company_id is not null
    and public.user_in_company(company_id)
    and (user_id is null or user_id = public.current_app_user_id())
  );

-- ==================================================================
-- RBAC — permissions (catálogo global, somente leitura para qualquer
-- usuário autenticado válido), roles/role_permissions/user_companies/
-- user_roles (leitura para membros da empresa, escrita gated por
-- rbac.manage; papéis padrão (is_system) não podem ser renomeados,
-- excluídos ou ter seu conjunto de permissões alterado pela API —
-- apenas atribuídos a usuários).
-- ==================================================================
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated
  using (public.is_active_app_user());

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated
  using (public.user_in_company(company_id));

drop policy if exists roles_insert on public.roles;
create policy roles_insert on public.roles
  for insert to authenticated
  with check (public.has_permission(company_id, 'rbac.manage'));

drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles
  for update to authenticated
  using (public.has_permission(company_id, 'rbac.manage') and is_system = false)
  with check (public.has_permission(company_id, 'rbac.manage') and is_system = false);

drop policy if exists roles_delete on public.roles;
create policy roles_delete on public.roles
  for delete to authenticated
  using (public.has_permission(company_id, 'rbac.manage') and is_system = false);

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (exists (
    select 1 from public.roles r where r.id = role_permissions.role_id and public.user_in_company(r.company_id)
  ));

drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and r.is_system = false
      and public.has_permission(r.company_id, 'rbac.manage')
  ));

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and r.is_system = false
      and public.has_permission(r.company_id, 'rbac.manage')
  ));

drop policy if exists user_companies_select on public.user_companies;
create policy user_companies_select on public.user_companies
  for select to authenticated
  using (public.user_in_company(company_id));

drop policy if exists user_companies_insert on public.user_companies;
create policy user_companies_insert on public.user_companies
  for insert to authenticated
  with check (public.has_permission(company_id, 'rbac.manage'));

drop policy if exists user_companies_update on public.user_companies;
create policy user_companies_update on public.user_companies
  for update to authenticated
  using (public.has_permission(company_id, 'rbac.manage'))
  with check (public.has_permission(company_id, 'rbac.manage'));

drop policy if exists user_companies_delete on public.user_companies;
create policy user_companies_delete on public.user_companies
  for delete to authenticated
  using (public.has_permission(company_id, 'rbac.manage'));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (public.user_in_company(company_id));

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.has_permission(company_id, 'rbac.manage'));

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (public.has_permission(company_id, 'rbac.manage'));
