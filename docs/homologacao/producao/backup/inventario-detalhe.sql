-- Inventário DETALHADO do catálogo (SOMENTE LEITURA): uma linha por objeto,
-- "categoria|objeto|assinatura". Complementa inventario-catalogo.sql para
-- apontar QUAL objeto diverge entre a produção e a restauração de teste.
-- Só catálogo do schema public (+ ledger): nenhuma linha de negócio é lida.
-- Mesmas regras: objetos de extensões ignorados; ACL sem o concedente e ordenada.
with
rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions, c.relacl
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
fn as (
  select p.oid, p.oid::regprocedure::text as sig, p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
acl as (
  select a, (select string_agg(regexp_replace(e, '/.*$', ''), ',' order by regexp_replace(e, '/.*$', '')) from unnest(a::text[]) e) as n
  from (select distinct relacl as a from rel union select distinct proacl from fn) s
)
select categoria || '|' || objeto || '|' || assinatura from (
  select 'tabela'::text categoria, r.relname::text objeto,
         md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), ''), ',' order by a.attnum)) assinatura
    from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = r.oid and ad.adnum = a.attnum
    where r.relkind in ('r', 'p') group by r.relname
  union all
  select 'constraint', r.relname || '.' || co.conname, md5(co.contype::text || ':' || pg_get_constraintdef(co.oid))
    from rel r join pg_constraint co on co.conrelid = r.oid
  union all
  select 'indice', ic.relname, md5(pg_get_indexdef(i.indexrelid))
    from rel r join pg_index i on i.indrelid = r.oid join pg_class ic on ic.oid = i.indexrelid
  union all
  select 'view', relname, md5(coalesce(reloptions::text, '') || ':' || pg_get_viewdef(oid)) from rel where relkind in ('v', 'm')
  union all
  select 'funcao', sig, md5(md5(prosrc) || ':' || prosecdef || ':' || provolatile::text || ':' || coalesce(proconfig::text, '')) from fn
  union all
  select 'policy', r.relname || '.' || po.polname,
         md5(po.polcmd::text || ':' || po.polpermissive || ':' || array_to_string(po.polroles::regrole[], ',') || ':' ||
             coalesce(pg_get_expr(po.polqual, po.polrelid), '') || ':' || coalesce(pg_get_expr(po.polwithcheck, po.polrelid), ''))
    from rel r join pg_policy po on po.polrelid = r.oid
  union all
  select 'rls', relname, relrowsecurity || ':' || relforcerowsecurity from rel where relkind in ('r', 'p')
  union all
  select 'gatilho', r.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
    from rel r join pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal
  union all
  select 'grant_relacao', r.relname, coalesce(a.n, '-') from rel r left join acl a on a.a is not distinct from r.relacl
  union all
  select 'grant_funcao', f.sig, coalesce(a.n, '-') from fn f left join acl a on a.a is not distinct from f.proacl
  union all
  select 'sequencia', relname, '-' from rel where relkind = 'S'
  union all
  select 'ledger', version, md5(coalesce(name, '')) from supabase_migrations.schema_migrations
) s
order by 1;
