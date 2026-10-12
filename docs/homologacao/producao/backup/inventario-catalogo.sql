-- Inventário do catálogo (SOMENTE LEITURA) para comparar a produção com a
-- restauração de teste do dump. Não lê linhas de negócio: só catálogo.
-- Rodar igual nos dois lados e comparar as saídas (validar-restauracao-dump.sh
-- faz isso automaticamente no banco restaurado).
--
-- Escopo de DDL: schema public (o dump do CLI não traz o DDL de auth/storage,
-- que o próprio Supabase cria). Objetos de extensões são ignorados. ACL sem o
-- concedente (o papel que restaura pode ser outro) e com entradas ordenadas.
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
acl_norm as (
  select a, (select string_agg(regexp_replace(e, '/.*$', ''), ',' order by regexp_replace(e, '/.*$', '')) from unnest(a::text[]) e) as n
  from (select distinct relacl as a from rel union select distinct proacl from fn) s
),
itens(item, qtd, assinatura) as (
  select 'tabelas', count(*), md5(coalesce(string_agg(relname, ',' order by relname), '')) from rel where relkind in ('r', 'p')
  union all
  select 'colunas', count(*), md5(coalesce(string_agg(r.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), ''), ',' order by r.relname, a.attnum), ''))
    from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = r.oid and ad.adnum = a.attnum
    where r.relkind in ('r', 'p', 'v', 'm')
  union all
  select 'constraints_' || co.contype::text, count(*), md5(coalesce(string_agg(r.relname || '.' || co.conname || ':' || pg_get_constraintdef(co.oid), ',' order by r.relname, co.conname), ''))
    from rel r join pg_constraint co on co.conrelid = r.oid group by co.contype
  union all
  select 'indices', count(*), md5(coalesce(string_agg(pg_get_indexdef(i.indexrelid), ',' order by pg_get_indexdef(i.indexrelid)), ''))
    from rel r join pg_index i on i.indrelid = r.oid
  union all
  select 'views', count(*), md5(coalesce(string_agg(relname || ':' || coalesce(reloptions::text, '') || ':' || pg_get_viewdef(oid), ',' order by relname), '')) from rel where relkind in ('v', 'm')
  union all
  select 'funcoes', count(*), md5(coalesce(string_agg(sig || ':' || md5(prosrc) || ':' || prosecdef || ':' || provolatile::text || ':' || coalesce(proconfig::text, ''), ',' order by sig), '')) from fn
  union all
  select 'policies', count(*), md5(coalesce(string_agg(r.relname || '.' || po.polname || ':' || po.polcmd::text || ':' || po.polpermissive || ':' || array_to_string(po.polroles::regrole[], ',') || ':' || coalesce(pg_get_expr(po.polqual, po.polrelid), '') || ':' || coalesce(pg_get_expr(po.polwithcheck, po.polrelid), ''), ',' order by r.relname, po.polname), ''))
    from rel r join pg_policy po on po.polrelid = r.oid
  union all
  select 'rls', count(*) filter (where relrowsecurity), md5(coalesce(string_agg(relname || ':' || relrowsecurity || ':' || relforcerowsecurity, ',' order by relname), '')) from rel where relkind in ('r', 'p')
  union all
  select 'gatilhos', count(*), md5(coalesce(string_agg(r.relname || '.' || t.tgname || ':' || pg_get_triggerdef(t.oid), ',' order by r.relname, t.tgname), ''))
    from rel r join pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal
  union all
  select 'acl_relacoes', count(*), md5(coalesce(string_agg(r.relname || ':' || coalesce(an.n, '-'), ',' order by r.relname), ''))
    from rel r left join acl_norm an on an.a is not distinct from r.relacl
  union all
  select 'acl_funcoes', count(*), md5(coalesce(string_agg(f.sig || ':' || coalesce(an.n, '-'), ',' order by f.sig), ''))
    from fn f left join acl_norm an on an.a is not distinct from f.proacl
  union all
  select 'sequencias', count(*), md5(coalesce(string_agg(relname, ',' order by relname), '')) from rel where relkind = 'S'
  union all
  select 'extensoes', count(*), md5(coalesce(string_agg(extname, ',' order by extname), '')) from pg_extension
  union all
  select 'ledger', count(*), md5(coalesce(string_agg(version || ':' || coalesce(name, ''), ',' order by version), ''))
    from supabase_migrations.schema_migrations
)
select item, qtd, assinatura from itens order by item;
