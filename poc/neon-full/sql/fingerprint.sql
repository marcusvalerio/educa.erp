with t as (select c.oid, c.relname, c.relrowsecurity, c.relacl from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p')),
f as (select p.oid, p.oid::regprocedure::text sig, p.prosecdef, p.proconfig, p.provolatile, p.prosrc, p.proacl, p.prorettype from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'),
items as (
 select 'col' cat, t.relname||'.'||a.attname n, format_type(a.atttypid,a.atttypmod)||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||'|'||a.attnotnull||'|'||a.attgenerated::text d from t join pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 union all select 'con', conrelid::regclass::text||'.'||conname, pg_get_constraintdef(k.oid) from pg_constraint k where k.connamespace='public'::regnamespace
 union all select 'idx', c.relname, regexp_replace(pg_get_indexdef(c.oid),'extensions\.','','g') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='i'
 union all select 'trg', g.tgrelid::regclass::text||'.'||g.tgname, regexp_replace(pg_get_triggerdef(g.oid),'extensions\.','','g') from pg_trigger g join t on t.oid=g.tgrelid where not g.tgisinternal
 union all select 'pol', p.tablename||'.'||p.policyname, p.cmd||'|'||array_to_string(p.roles,',')||'|'||coalesce(p.qual,'')||'|'||coalesce(p.with_check,'') from pg_policies p where p.schemaname='public'
 union all select 'rls', t.relname, t.relrowsecurity::text from t
 union all select 'tacl', t.relname, coalesce((select string_agg(regexp_replace(x,'/.*$',''),',' order by x) from unnest(t.relacl::text[]) x where x !~ '^(postgres|neondb_owner|supabase_admin)='),'') from t
 union all select 'fn', f.sig, f.prosecdef||'|'||coalesce(array_to_string(f.proconfig,','),'')||'|'||f.provolatile::text||'|'||format_type(f.prorettype,null)||'|'||btrim(regexp_replace(regexp_replace(f.prosrc,'--[^\n]*','','g'),'\s+',' ','g')) from f
 union all select 'facl', f.sig, coalesce((select string_agg(regexp_replace(x,'/.*$',''),',' order by x) from unnest(f.proacl::text[]) x where x !~ '^(postgres|neondb_owner|supabase_admin)='),'<default>') from f
 union all select 'view', c.relname, regexp_replace(pg_get_viewdef(c.oid),'\s+',' ','g') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'
)
select cat, count(*) n, md5(string_agg(n||'='||md5(d), ';' order by n)) h from items group by cat order by cat;
