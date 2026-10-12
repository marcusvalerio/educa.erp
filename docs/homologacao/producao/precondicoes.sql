-- Pré-condições da contenção v2 avaliadas como SELECT (somente leitura).
-- Mesmas condições do bloco inicial de contencao-emergencial.sql. Esperado em
-- produção: todas as colunas pre_* = t, executor_superuser = f.
select
  (select system_identifier from pg_control_system()) = 7678069749886157684 and current_database() = 'postgres' as pre_identidade,
  to_regclass('supabase_migrations.schema_migrations') is not null
    and exists (select 1 from supabase_migrations.schema_migrations where version = '20260929165645') as pre_ledger,
  to_regclass('public.units') is not null and to_regclass('public.v_cash_flow_summary') is not null
    and to_regclass('public.v_cash_flow_projection') is not null and to_regclass('public.inventory_valuation') is not null
    and to_regclass('public.v_sales_order_item_margin') is not null
    and to_regprocedure('public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)') is not null as pre_objetos,
  exists (select 1 from pg_policy where polrelid = to_regclass('public.units') and polname = 'units_select'
          and pg_get_expr(polqual, polrelid) like '%has_permission(company_id%') as pre_units_select,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.units')), false) as pre_rls,
  coalesce((select rolbypassrls from pg_roles where rolname = 'service_role'), false)
    and coalesce(has_table_privilege('service_role', to_regclass('public.v_cash_flow_summary'), 'SELECT'), false)
    and coalesce(has_table_privilege('service_role', to_regclass('public.v_cash_flow_projection'), 'SELECT'), false)
    and coalesce(has_table_privilege('service_role', to_regclass('public.inventory_valuation'), 'SELECT'), false)
    and coalesce(has_table_privilege('service_role', to_regclass('public.v_sales_order_item_margin'), 'SELECT'), false) as pre_service_role,
  not exists (select 1 from pg_proc p
              where p.oid <> to_regprocedure('public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)')
                and p.prosrc like '%fn_resolve_applicable_tax_rules%'
                and not (p.prosecdef and p.proowner = (select proowner from pg_proc
                         where oid = to_regprocedure('public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)')))) as pre_chamadoras,
  current_user as executor,
  (select rolsuper from pg_roles where rolname = current_user) as executor_superuser;
