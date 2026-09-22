-- Fase 23 — hardening de segurança exigido para o congelamento.
--
-- Achados da auditoria final (todos reais, todos corrigidos aqui):
--
-- 1) ESCALADA DE PRIVILÉGIO: bootstrap_platform_owner era executável por
--    QUALQUER usuário autenticado. Com platform_members vazia, qualquer
--    conta logada poderia se tornar Platform Owner. Causa: o Supabase
--    concede EXECUTE a anon/authenticated por privilégio padrão no
--    CREATE FUNCTION, e o `revoke ... from public` não desfaz essa
--    concessão direta.
--
-- 2) ESCRITA ENTRE EMPRESAS: funções internas de ledger/seed/status
--    (fn_post_stock_movement, fn_post_financial_transaction, ...) não
--    checam permissão — por design, são chamadas só por outras funções
--    SECURITY DEFINER que já checaram — mas estavam expostas via RPC e
--    aceitam company_id/ids arbitrários. Um usuário da Empresa A poderia
--    lançar estoque ou financeiro na Empresa B.
--
-- 3) FALSIFICAÇÃO DE AUDITORIA: fn_log_platform_audit era executável,
--    permitindo inserir eventos de plataforma arbitrários.
--
-- 4) AUTO-TRANCAMENTO DO ADMIN: fn_set_role_permissions protegia o papel
--    admin, mas as policies pré-existentes de role_permissions/
--    user_roles/roles/users permitem DML direto que contorna a função.
--    Agora a proteção está em triggers — vale para função E para DML.
--
-- 5) LEITURA ENTRE EMPRESAS: fn_project_service_cost_summary (chamada pelo
--    app) devolvia custos de qualquer projeto/OS sem checar permissão.
--
-- Nenhuma dessas funções internas é referenciada por policy e nenhuma é
-- chamada diretamente pelo app (verificado): todos os chamadores são
-- funções SECURITY DEFINER, cuja checagem de EXECUTE é feita contra o
-- dono (postgres). Revogar o acesso direto não altera nenhum fluxo.

-- ==================================================================
-- 1-3) Funções internas: sem EXECUTE para anon/authenticated/public.
-- ==================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'bootstrap_platform_owner',
        'fn_log_platform_audit',
        'fn_materialize_workflow_instance_step',
        'fn_post_stock_movement',
        'fn_post_financial_transaction',
        'fn_register_cost_movement',
        'fn_recompute_payable_status',
        'fn_recompute_receivable_status',
        'fn_release_sales_order_reservations_internal',
        'fn_sync_purchase_request_status',
        'fn_seed_company_default_warehouse',
        'fn_seed_company_operational_warehouse',
        'fn_seed_company_units'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

-- bootstrap continua disponível para quem deve usá-lo: service_role.
grant execute on function public.bootstrap_platform_owner(uuid, text, text) to service_role;

-- ==================================================================
-- 4) Proteção do administrador — no banco, não só na função.
-- ==================================================================

-- Quantos administradores ativos restam na empresa (opcionalmente
-- desconsiderando um usuário). Base das guardas abaixo.
create or replace function public.fn_count_active_company_admins(p_company_id uuid, p_exclude_user_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct u.id)::integer
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  where u.company_id = p_company_id
    and u.status = 'active'
    and r.company_id = p_company_id
    and r.code = 'admin'
    and r.is_system
    and r.status = 'active'
    and u.id <> coalesce(p_exclude_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
$$;

revoke execute on function public.fn_count_active_company_admins(uuid, uuid) from public, anon, authenticated;

-- 4a) Papéis de sistema: identidade imutável; admin nunca inativo;
--     is_system só é criado pelo seed da plataforma (nunca por cliente).
--     Função NÃO é security definer de propósito: current_user precisa
--     refletir quem está executando o comando.
create or replace function public.fn_guard_system_roles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.is_system and current_user in ('authenticated', 'anon') then
      raise exception 'Papéis de sistema só podem ser criados pela plataforma.' using errcode = '42501';
    end if;
    return NEW;
  end if;

  if OLD.is_system then
    if NEW.is_system is distinct from OLD.is_system
       or NEW.code is distinct from OLD.code
       or NEW.company_id is distinct from OLD.company_id then
      raise exception 'A identidade de um papel de sistema (%) não pode ser alterada.', OLD.code using errcode = 'P0001';
    end if;
    if OLD.code = 'admin' and NEW.status <> 'active' then
      raise exception 'O papel administrador de sistema não pode ser desativado.' using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_system_roles on public.roles;
create trigger guard_system_roles
  before insert or update on public.roles
  for each row execute procedure public.fn_guard_system_roles();

-- 4b) Permissões do papel admin de sistema não são removíveis. Exceção:
--     quando o papel ou a permissão estão sendo excluídos (cascata) — aí
--     a linha-pai já não existe e a remoção é legítima.
create or replace function public.fn_guard_admin_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
       select 1 from public.roles r
       where r.id = OLD.role_id and r.is_system and r.code = 'admin'
     )
     and exists (select 1 from public.permissions p where p.id = OLD.permission_id) then
    raise exception 'Permissões do papel administrador de sistema não podem ser removidas (evita perda de acesso administrativo).' using errcode = 'P0001';
  end if;
  return OLD;
end;
$$;

drop trigger if exists guard_admin_role_permissions on public.role_permissions;
create trigger guard_admin_role_permissions
  before delete on public.role_permissions
  for each row execute procedure public.fn_guard_admin_role_permissions();

-- 4c) Nunca remover a atribuição do ÚLTIMO administrador ativo. Cascatas
--     (usuário/papel/empresa excluídos) passam: a linha-pai já sumiu.
create or replace function public.fn_guard_last_admin_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
  v_user public.users;
begin
  select * into v_role from public.roles where id = OLD.role_id;
  if not found or not v_role.is_system or v_role.code <> 'admin' then
    return OLD;
  end if;

  select * into v_user from public.users where id = OLD.user_id;
  if not found or v_user.status <> 'active' then
    return OLD;
  end if;

  if public.fn_count_active_company_admins(v_role.company_id, OLD.user_id) = 0 then
    raise exception 'Não é possível remover o último administrador ativo da empresa.' using errcode = 'P0001';
  end if;

  return OLD;
end;
$$;

drop trigger if exists guard_last_admin_assignment on public.user_roles;
create trigger guard_last_admin_assignment
  before delete on public.user_roles
  for each row execute procedure public.fn_guard_last_admin_assignment();

-- 4d) O último administrador ativo não pode ser inativado, trocado de
--     empresa ou excluído. Exclusão da empresa inteira passa (cascata).
create or replace function public.fn_guard_last_admin_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
begin
  if OLD.status <> 'active' then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'UPDATE'
     and NEW.status = 'active'
     and NEW.company_id is not distinct from OLD.company_id then
    return NEW;
  end if;

  if TG_OP = 'DELETE' and not exists (select 1 from public.companies where id = OLD.company_id) then
    return OLD;
  end if;

  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = OLD.id and r.company_id = OLD.company_id
      and r.code = 'admin' and r.is_system and r.status = 'active'
  ) into v_is_admin;

  if v_is_admin and public.fn_count_active_company_admins(OLD.company_id, OLD.id) = 0 then
    raise exception 'O último administrador ativo da empresa não pode ser inativado, movido ou excluído.' using errcode = 'P0001';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists guard_last_admin_user on public.users;
create trigger guard_last_admin_user
  before update of status, company_id or delete on public.users
  for each row execute procedure public.fn_guard_last_admin_user();

-- 4e) Mesmo princípio na plataforma: nunca remover o último Owner ativo,
--     também por DML direto (fn_upsert_platform_member já recusava).
create or replace function public.fn_guard_last_platform_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if OLD.platform_role <> 'OWNER' or OLD.status <> 'active' then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'UPDATE' and NEW.platform_role = 'OWNER' and NEW.status = 'active' then
    return NEW;
  end if;

  if TG_OP = 'DELETE' and not exists (select 1 from auth.users where id = OLD.auth_user_id) then
    return OLD;
  end if;

  if not exists (
    select 1 from public.platform_members
    where platform_role = 'OWNER' and status = 'active' and id <> OLD.id
  ) then
    raise exception 'Não é possível remover/rebaixar o último Platform Owner ativo.' using errcode = 'P0001';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists guard_last_platform_owner on public.platform_members;
create trigger guard_last_platform_owner
  before update or delete on public.platform_members
  for each row execute procedure public.fn_guard_last_platform_owner();

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'fn_guard_system_roles', 'fn_guard_admin_role_permissions',
        'fn_guard_last_admin_assignment', 'fn_guard_last_admin_user',
        'fn_guard_last_platform_owner'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

-- ==================================================================
-- 5) fn_project_service_cost_summary — MESMA assinatura, agora com
--    checagem de permissão e escopo de empresa.
-- ==================================================================
create or replace function public.fn_project_service_cost_summary(p_source_type text, p_source_id uuid)
returns table (materials_cost numeric, services_cost numeric, expenses_cost numeric, total_cost numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_permission text;
  v_materials numeric;
  v_services numeric;
  v_expenses numeric;
begin
  if p_source_type = 'project' then
    select company_id into v_company_id from public.projects where id = p_source_id;
    v_permission := 'projects.view';
  elsif p_source_type = 'service_order' then
    select company_id into v_company_id from public.service_orders where id = p_source_id;
    v_permission := 'service_orders.view';
  else
    raise exception 'source_type inválido: %.', p_source_type using errcode = '22023';
  end if;

  if v_company_id is null then
    raise exception '% % não encontrado.', p_source_type, p_source_id using errcode = 'P0002';
  end if;

  if not public.has_permission(v_company_id, v_permission) then
    raise exception 'Permissão negada (%).', v_permission using errcode = '42501';
  end if;

  -- Colunas qualificadas: total_cost também é nome de coluna de saída.
  select coalesce(sum(cm.total_cost), 0) into v_materials
  from public.cost_movements cm
  where cm.company_id = v_company_id and cm.source_type = p_source_type and cm.source_id = p_source_id;

  select coalesce(sum(case when psc.cost_type = 'SERVICE' then psc.amount else 0 end), 0),
         coalesce(sum(case when psc.cost_type = 'EXPENSE' then psc.amount else 0 end), 0)
    into v_services, v_expenses
  from public.project_service_costs psc
  where psc.company_id = v_company_id and psc.source_type = p_source_type and psc.source_id = p_source_id;

  return query select v_materials, v_services, v_expenses, v_materials + v_services + v_expenses;
end;
$$;

revoke execute on function public.fn_project_service_cost_summary(text, uuid) from public, anon;
grant execute on function public.fn_project_service_cost_summary(text, uuid) to authenticated;
