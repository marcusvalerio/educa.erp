-- Verificação ANTES e DEPOIS da contenção — só metadados (nenhuma linha de
-- negócio é lida). Resultado esperado depois: todas as colunas "ok" = true.
select
  not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and pg_get_expr(polqual, polrelid) = 'true')
    as ok_units_sem_policy_aberta,
  exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select')
    as ok_units_select_mantida,
  (select relrowsecurity from pg_class where oid = 'public.units'::regclass)
    as ok_units_rls_ligado,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and has_table_privilege('anon', c.oid, 'SELECT')) = 0
    as ok_views_sem_anon,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%') = 0
    as ok_views_security_invoker,
  not has_function_privilege('anon', 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)', 'execute')
    and not has_function_privilege('authenticated', 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)', 'execute')
    as ok_regras_fiscais_sem_execucao_publica,
  has_table_privilege('service_role', 'public.v_cash_flow_summary', 'SELECT')
    as ok_app_service_role_le_views,
  (select rolbypassrls from pg_roles where rolname = 'service_role')
    as ok_service_role_bypassrls;
