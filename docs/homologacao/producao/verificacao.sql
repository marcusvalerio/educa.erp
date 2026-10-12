-- Verificação ANTES e DEPOIS da contenção (v2) — só metadados (nenhuma linha
-- de negócio é lida). Esperado em produção:
--   banco = 7678069749886157684/postgres
--   antes:  f t t f f f f t t
--   depois: t t t t t t t t t
select
  (select system_identifier::text from pg_control_system()) || '/' || current_database()
    as banco,
  not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and pg_get_expr(polqual, polrelid) = 'true')
    as ok_units_sem_policy_aberta,
  exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select')
    as ok_units_select_mantida,
  (select relrowsecurity from pg_class where oid = 'public.units'::regclass)
    as ok_units_rls_ligado,
  not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and (exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p where has_table_privilege('anon', c.oid, p))
          or exists (select 1 from aclexplode(c.relacl) x where x.grantee = 0 or x.grantee = 'anon'::regrole)))
    as ok_views_sem_anon,
  not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and (exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p where has_table_privilege('authenticated', c.oid, p))
          or exists (select 1 from aclexplode(c.relacl) x where x.grantee = 'authenticated'::regrole)))
    as ok_views_sem_authenticated,
  not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%')
    as ok_views_security_invoker,
  (select p.proacl is not null
          and not exists (select 1 from aclexplode(p.proacl) x where x.grantee <> p.proowner)
          and not has_function_privilege('anon', p.oid, 'execute')
          and not has_function_privilege('authenticated', p.oid, 'execute')
          and not has_function_privilege('service_role', p.oid, 'execute')
   from pg_proc p where p.oid = 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)'::regprocedure)
    as ok_regras_fiscais_so_dono,
  (select bool_and(has_table_privilege('service_role', v, 'SELECT'))
   from unnest(array['public.v_cash_flow_summary', 'public.v_cash_flow_projection', 'public.inventory_valuation', 'public.v_sales_order_item_margin']) v)
    as ok_app_service_role_le_views,
  (select rolbypassrls from pg_roles where rolname = 'service_role')
    as ok_service_role_bypassrls;
