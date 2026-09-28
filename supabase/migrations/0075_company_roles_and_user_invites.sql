-- 0075 — Administração de usuários DA EMPRESA (tenant), separada da governança
-- da plataforma.
--
-- Plataforma (Administração Central): Owner e Admin da plataforma —
-- platform_members / platform_permissions (0064). Não mudam aqui.
-- Empresa (ERP): papéis de sistema de cada empresa, administrados pelo
-- Administrador da empresa (papel `admin`, o único com roles.manage).
--
-- 1. Papéis de sistema novos em toda empresa: `gerente` e `vendedor`, ao lado
--    de `admin`, `operador` e `leitura` (empresas novas nascem com os cinco).
--    - Gerente: opera e APROVA em todos os módulos; sem governança (usuários,
--      papéis, módulos, unidades, estrutura, configurações).
--    - Vendedor: Comercial e CRM, sem aprovar/cancelar/reservar; cadastros e
--      estoque só para consulta.
--    (As mesmas definições validadas no smoke da homologação.)
-- 2. Operador deixa de criar/editar usuários (users.create/users.update):
--    administrar usuários é do Administrador. Continua lendo (users.read).
-- 3. Sem escalada de privilégio: quem atribui um papel, redefine permissões
--    de um papel ou convida alguém só concede permissões que ELE MESMO tem.
--    (O Administrador tem todas; um papel customizado com roles.manage não
--    consegue conceder além do que possui.)
-- 4. fn_invite_company_user: convite num passo só (nome, e-mail, papel),
--    sempre na empresa de quem convida — não existe parâmetro de empresa.

-- ------------------------------------------------------------------ modelos
-- Permissões de cada papel-modelo, a partir do catálogo atual.
create or replace function public.fn_role_template_permission_codes(p_template text)
returns setof text
language sql
stable
set search_path = public, pg_temp
as $$
  select p.code from public.permissions p
  where case p_template
    when 'gerente' then
      p.code !~ '^roles\.'
      and p.code !~ '^users\.(create|update|delete)$'
      and p.code !~ '^org\.assign$'
      and p.code !~ '^company_modules\.manage$'
      and p.code !~ '^branches\.manage$'
      and p.code !~ '^departments\.(create|update)$'
      and p.code !~ '^positions\.(create|update)$'
      and p.code !~ '^document_sequences\.(create|update)$'
      and p.code !~ '^settings\.(create|update|company\.update|establishment\.update)$'
      and p.code !~ '^fiscal_provider_configs\.manage$'
      and p.code !~ '^dashboard\.configure$'
    when 'vendedor' then
      p.code = any (array[
        'dashboard.view',
        'customers.read', 'customers.create', 'customers.update',
        'party_contacts.view', 'party_contacts.create', 'party_contacts.update',
        'party_addresses.view', 'party_addresses.create', 'party_addresses.update',
        'products.read', 'categories.read', 'brands.read', 'price_lists.read',
        'payment_terms.view', 'sales_representatives.read', 'stock.view',
        'sales_quotes.view', 'sales_quotes.create', 'sales_quotes.update',
        'sales_orders.view', 'sales_orders.create', 'sales_orders.update',
        'leads.view', 'leads.create', 'leads.update', 'leads.convert',
        'opportunities.view', 'opportunities.create', 'opportunities.update', 'opportunities.move_stage', 'opportunities.convert',
        'activities.view', 'activities.create', 'activities.update',
        'pipelines.view', 'lead_origins.view',
        'commercial_reports.view', 'crm_reports.view'
      ])
    else false
  end;
$$;

comment on function public.fn_role_template_permission_codes(text) is
  'Permissões dos papéis de sistema Gerente e Vendedor (0075), calculadas sobre o catálogo atual.';

-- Cria (se faltar) os papéis de sistema Gerente e Vendedor de uma empresa.
-- Idempotente: não mexe em papel que já exista com o mesmo código.
create or replace function public.fn_seed_operational_roles_for_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_def record;
  v_role_id uuid;
begin
  for v_def in
    select * from (values
      ('gerente', 'Gerente', 'Opera e aprova em todos os módulos; sem administrar usuários, papéis, módulos e configurações.'),
      ('vendedor', 'Vendedor', 'Comercial e CRM: orçamentos, pedidos, clientes e funil; sem aprovar, cancelar ou reservar.')
    ) as t(code, name, description)
  loop
    insert into public.roles (company_id, code, name, description, is_system)
    values (p_company_id, v_def.code, v_def.name, v_def.description, true)
    on conflict (company_id, code) do nothing
    returning id into v_role_id;
    if v_role_id is not null then
      insert into public.role_permissions (role_id, permission_id)
      select v_role_id, p.id from public.permissions p
      where p.code in (select public.fn_role_template_permission_codes(v_def.code))
      on conflict (role_id, permission_id) do nothing;
    end if;
    v_role_id := null;
  end loop;
end;
$$;

revoke all on function public.fn_seed_operational_roles_for_company(uuid) from public, anon, authenticated;

-- Empresas novas: os cinco papéis de sistema. (Corpo de 0005 + Gerente e
-- Vendedor; operador sem users.create/users.update, ver item 2.)
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
  where action in ('read', 'create', 'update') and module <> 'rbac'
    and code not in ('users.create', 'users.update');
  insert into public.role_permissions (role_id, permission_id)
  select v_leitura_id, id from public.permissions
  where action = 'read';
  perform public.fn_seed_operational_roles_for_company(p_company_id);
end;
$$;

-- Empresas existentes: Gerente e Vendedor.
select public.fn_seed_operational_roles_for_company(id) from public.companies;

-- ------------------------------------------------------------------ operador
-- Administrar usuários é do Administrador da empresa.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.is_system and r.code = 'operador'
  and p.code in ('users.create', 'users.update');

-- ------------------------------------------------------------------ sem escalada
-- Permissões (dentre p_codes) que o usuário atual NÃO tem na empresa.
-- Considera os papéis ativos do cadastro ativo, sem olhar módulo habilitado:
-- o Administrador pode atribuir papéis que incluem módulos hoje desligados.
create or replace function public.fn_permissions_not_held(p_company_id uuid, p_codes text[])
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct c order by c), array[]::text[])
  from unnest(coalesce(p_codes, array[]::text[])) as c
  where not exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id
    join public.roles r on r.id = ur.role_id and r.status = 'active'
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where u.auth_user_id = auth.uid()
      and u.company_id = p_company_id
      and u.status = 'active'
      and p.code = c
  );
$$;

revoke all on function public.fn_permissions_not_held(uuid, text[]) from public, anon;
grant execute on function public.fn_permissions_not_held(uuid, text[]) to authenticated, service_role;

create or replace function public.fn_assert_can_grant(p_company_id uuid, p_codes text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing text[] := public.fn_permissions_not_held(p_company_id, p_codes);
begin
  if cardinality(v_missing) > 0 then
    raise exception 'Você não pode conceder permissões que não possui (%).',
      array_to_string(v_missing[1:5], ', ') || case when cardinality(v_missing) > 5 then ', …' else '' end
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.fn_assert_can_grant(uuid, text[]) from public, anon;
grant execute on function public.fn_assert_can_grant(uuid, text[]) to authenticated, service_role;

create or replace function public.fn_role_permission_codes(p_role_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(p.code order by p.code), array[]::text[])
  from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
  where rp.role_id = p_role_id;
$$;

revoke all on function public.fn_role_permission_codes(uuid) from public, anon, authenticated;

-- Atribuir papel: igual a 0067 + só concede o que o ator possui.
create or replace function public.fn_assign_user_role(p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_role public.roles;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'Papel não encontrado.' using errcode = 'P0002';
  end if;
  if v_role.company_id <> v_user.company_id then
    raise exception 'Papel e usuário pertencem a empresas diferentes.' using errcode = '22023';
  end if;
  if not public.has_permission(v_user.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;
  perform public.fn_assert_can_grant(v_user.company_id, public.fn_role_permission_codes(v_role.id));
  insert into public.user_roles (user_id, role_id)
  values (p_user_id, p_role_id)
  on conflict do nothing;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'system', 'user_roles', v_user.id, 'GRANT', null,
    jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id, 'role_code', v_role.code));
end;
$$;

-- Redefinir permissões de um papel: igual a 0067 + só concede o que o ator
-- possui (permissões já presentes no papel e mantidas não contam como
-- concessão nova).
create or replace function public.fn_set_role_permissions(p_role_id uuid, p_permission_codes text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
  v_old text[];
  v_invalid text[];
  v_count integer;
begin
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'Papel não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_role.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;
  if v_role.is_system and v_role.code = 'admin' then
    raise exception 'As permissões do papel administrador de sistema não podem ser redefinidas (evita perda de acesso administrativo).' using errcode = 'P0001';
  end if;
  select array_agg(x) into v_invalid
  from unnest(coalesce(p_permission_codes, array[]::text[])) as x
  where not exists (select 1 from public.permissions p where p.code = x);
  if v_invalid is not null then
    raise exception 'Permissões inexistentes no catálogo: %.', array_to_string(v_invalid, ', ') using errcode = '22023';
  end if;
  v_old := public.fn_role_permission_codes(p_role_id);
  perform public.fn_assert_can_grant(v_role.company_id, array(
    select x from unnest(coalesce(p_permission_codes, array[]::text[])) as x where not (x = any (v_old))
  ));
  delete from public.role_permissions where role_id = p_role_id;
  insert into public.role_permissions (role_id, permission_id)
  select p_role_id, p.id from public.permissions p
  where p.code = any (coalesce(p_permission_codes, array[]::text[]))
  on conflict (role_id, permission_id) do nothing;
  get diagnostics v_count = row_count;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_role.company_id, public.current_app_user_id(), 'system', 'roles', v_role.id, 'GRANT',
    jsonb_build_object('permissions', v_old),
    jsonb_build_object('permissions', coalesce(p_permission_codes, array[]::text[])));
  return v_count;
end;
$$;

-- ------------------------------------------------------------------ convite
-- Convite de usuário da empresa num passo só: cadastro + papel + convite.
-- A empresa é a de quem convida (cadastro ativo do login atual). Exige
-- users.create e roles.manage (Administrador) e só concede o papel se o
-- ator tiver todas as permissões dele. Se já houver cadastro ativo SEM login
-- com o mesmo e-mail, reaproveita; com login, recusa.
create or replace function public.fn_invite_company_user(
  p_name text,
  p_email text,
  p_role_id uuid,
  p_ttl_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_role public.roles;
  v_user public.users;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_login text;
  v_result jsonb;
begin
  select * into v_actor from public.users where id = public.current_app_user_id();
  if not found then
    raise exception 'Entre com um usuário ativo de uma empresa.' using errcode = '42501';
  end if;
  if not public.has_permission(v_actor.company_id, 'users.create') then
    raise exception 'Permissão negada (users.create).' using errcode = '42501';
  end if;
  if not public.has_permission(v_actor.company_id, 'roles.manage') then
    raise exception 'Permissão negada (roles.manage).' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Informe o nome.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  select * into v_role from public.roles where id = p_role_id;
  if not found or v_role.company_id <> v_actor.company_id then
    raise exception 'Papel não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if v_role.status <> 'active' then
    raise exception 'Papel inativo.' using errcode = 'P0001';
  end if;
  perform public.fn_assert_can_grant(v_actor.company_id, public.fn_role_permission_codes(v_role.id));

  select * into v_user from public.users where company_id = v_actor.company_id and lower(email) = v_email;
  if found then
    if v_user.auth_user_id is not null then
      raise exception 'Este e-mail já tem acesso nesta empresa. Ajuste os papéis na lista de usuários.' using errcode = 'P0001';
    end if;
    if v_user.status <> 'active' then
      raise exception 'Existe um cadastro inativo com este e-mail. Reative-o antes de convidar.' using errcode = 'P0001';
    end if;
  else
    v_login := split_part(v_email, '@', 1);
    if exists (select 1 from public.users where company_id = v_actor.company_id and login = v_login) then
      v_login := v_login || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
    insert into public.users (company_id, name, email, login, role, status)
    values (v_actor.company_id, v_name, v_email, v_login, v_role.name, 'active')
    returning * into v_user;
    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_actor.company_id, v_actor.id, coalesce(v_actor.name, v_actor.email), 'users', v_user.id, 'CREATE', null,
      jsonb_build_object('email', v_email, 'name', v_name, 'via', 'invite'));
  end if;

  insert into public.user_roles (user_id, role_id)
  values (v_user.id, v_role.id)
  on conflict do nothing;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_actor.company_id, v_actor.id, coalesce(v_actor.name, v_actor.email), 'user_roles', v_user.id, 'GRANT', null,
    jsonb_build_object('user_id', v_user.id, 'role_id', v_role.id, 'role_code', v_role.code));

  v_result := public.fn_issue_user_invitation(v_user.id, 'USER', p_ttl_hours, coalesce(v_actor.name, v_actor.email), v_actor.id);
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_actor.company_id, v_actor.id, coalesce(v_actor.name, v_actor.email), 'user_invitations',
    (v_result->>'invitation_id')::uuid, 'CREATE', null,
    jsonb_build_object('user_id', v_user.id, 'email', v_email, 'kind', 'USER', 'role_code', v_role.code, 'expires_at', v_result->>'expires_at'));

  return v_result || jsonb_build_object(
    'user_id', v_user.id,
    'role_code', v_role.code,
    'company_name', (select name from public.companies where id = v_actor.company_id)
  );
end;
$$;

revoke all on function public.fn_invite_company_user(text, text, uuid, integer) from public, anon;
grant execute on function public.fn_invite_company_user(text, text, uuid, integer) to authenticated, service_role;

comment on function public.fn_invite_company_user(text, text, uuid, integer) is
  'Convite de usuário da empresa (nome, e-mail, papel) pelo Administrador da própria empresa; sem escalada de privilégio (0075).';
