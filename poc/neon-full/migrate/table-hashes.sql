-- Contagem + md5 por tabela, IGUAL nos dois lados (Supabase e Neon).
-- Ordenação com COLLATE "C" (independe da collation do banco) e fuso UTC.
-- Uso: psql "$URL" -v ON_ERROR_STOP=1 -At -f table-hashes.sql
set timezone = 'UTC';
select t as tabela,
  (xpath('/row/h/text()', query_to_xml(format(
    'select count(*)||'':''||md5(coalesce(string_agg(row_to_json(x)::text, chr(10) order by row_to_json(x)::text collate "C"),'''')) as h from %s x', t),
    false, true, '')))[1]::text as contagem_md5
from unnest(array(
  select format('public.%I', relname) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all
  select '(select id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, banned_until, deleted_at, is_anonymous, last_sign_in_at, created_at, updated_at from auth.users)'
)) t
order by 1;
