with ns as (select oid, nspname from pg_namespace where nspname in ('public'))
select 'tabelas' k, count(*)::text v from pg_class c join ns on ns.oid=c.relnamespace where c.relkind in ('r','p')
union all select 'tabelas_rls_on', count(*)::text from pg_class c join ns on ns.oid=c.relnamespace where c.relkind in ('r','p') and c.relrowsecurity
union all select 'colunas', count(*)::text from pg_attribute a join pg_class c on c.oid=a.attrelid join ns on ns.oid=c.relnamespace where c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
union all select 'colunas_geradas', count(*)::text from pg_attribute a join pg_class c on c.oid=a.attrelid join ns on ns.oid=c.relnamespace where c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped and a.attgenerated<>''
union all select 'defaults', count(*)::text from pg_attrdef d join pg_class c on c.oid=d.adrelid join ns on ns.oid=c.relnamespace
union all select 'sequences', count(*)::text from pg_class c join ns on ns.oid=c.relnamespace where c.relkind='S'
union all select 'pk', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='p'
union all select 'fk', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='f'
union all select 'fk_cascade_delete', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='f' and k.confdeltype='c'
union all select 'fk_set_null', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='f' and k.confdeltype='n'
union all select 'unique', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='u'
union all select 'check', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='c'
union all select 'exclusion', count(*)::text from pg_constraint k join ns on ns.oid=k.connamespace where k.contype='x'
union all select 'indices', count(*)::text from pg_class c join ns on ns.oid=c.relnamespace where c.relkind='i'
union all select 'views', count(*)::text from pg_class c join ns on ns.oid=c.relnamespace where c.relkind='v'
union all select 'triggers', count(*)::text from pg_trigger g join pg_class c on c.oid=g.tgrelid join ns on ns.oid=c.relnamespace where not g.tgisinternal
union all select 'functions', count(*)::text from pg_proc p join ns on ns.oid=p.pronamespace where p.prokind='f'
union all select 'functions_security_definer', count(*)::text from pg_proc p join ns on ns.oid=p.pronamespace where p.prokind='f' and p.prosecdef
union all select 'functions_trigger', count(*)::text from pg_proc p join ns on ns.oid=p.pronamespace where p.prokind='f' and p.prorettype='trigger'::regtype
union all select 'policies', count(*)::text from pg_policies where schemaname='public'
union all select 'policies_para_authenticated', count(*)::text from pg_policies where schemaname='public' and 'authenticated' = any(roles)
