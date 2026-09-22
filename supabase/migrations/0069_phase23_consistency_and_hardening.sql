-- Fase 23 — fechamento de consistência e hardening da própria fase.
--
-- 1) permissions.resource: o backfill de 0067 rodou antes de 0068
--    registrar dashboard.view/dashboard.configure, que nasceram com
--    resource nulo. Em vez de só corrigir as duas linhas, um trigger
--    garante o invariante para toda permissão futura (resource = module
--    quando não informado) — o catálogo nunca mais fica pela metade.
--
-- 2) EXECUTE de `anon` nas funções criadas nesta fase: no Supabase, os
--    privilégios padrão concedem EXECUTE a anon/authenticated no momento
--    do CREATE FUNCTION, e o `revoke ... from public` que cada migration
--    faz NÃO desfaz isso (a concessão é direta ao papel, não ao PUBLIC).
--    As funções desta fase administram plataforma, RBAC e organização,
--    então o acesso anônimo é revogado explicitamente aqui.
--    O mesmo hardening para as ~275 funções das fases anteriores segue
--    registrado como pendência técnica separada (fora do escopo desta
--    etapa, por ser mudança ampla e não relacionada).

-- ------------------------------------------------------------------ 1
update public.permissions set resource = module where resource is null;

create or replace function public.fn_default_permission_resource()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.resource is null then
    NEW.resource := NEW.module;
  end if;
  return NEW;
end;
$$;

drop trigger if exists default_permission_resource on public.permissions;
create trigger default_permission_resource
  before insert or update of resource, module on public.permissions
  for each row execute procedure public.fn_default_permission_resource();

comment on trigger default_permission_resource on public.permissions is
  'Mantém o invariante resource = module quando o registrador da permissão não informa um recurso próprio — evita catálogo parcialmente preenchido conforme novas fases inserem permissões.';

-- ------------------------------------------------------------------ 2
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
        -- 0064 (plataforma)
        'current_platform_member_id', 'current_platform_role', 'is_platform_member',
        'is_platform_owner', 'is_platform_admin', 'has_platform_permission',
        'fn_log_platform_audit', 'fn_upsert_platform_member', 'bootstrap_platform_owner',
        -- 0065 (empresas/módulos)
        'fn_company_operational', 'fn_company_module_enabled', 'fn_permission_module_enabled',
        'fn_platform_set_company_lifecycle', 'fn_platform_set_company_module',
        'fn_company_set_module_enabled', 'fn_seed_company_platform_defaults',
        -- 0066 (organização)
        'fn_guard_department_hierarchy', 'fn_user_has_branch_access', 'fn_user_branch_ids',
        'fn_set_user_org_context', 'fn_grant_user_branch_access', 'fn_revoke_user_branch_access',
        -- 0067 (RBAC)
        'fn_create_company_role', 'fn_update_company_role', 'fn_set_role_permissions',
        'fn_assign_user_role', 'fn_revoke_user_role', 'fn_user_effective_permissions',
        -- 0068 (contexto/dashboard)
        'fn_user_context', 'fn_dashboard_context', 'fn_set_company_focus_rule',
        -- 0069
        'fn_default_permission_resource'
      )
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;
end;
$$;
