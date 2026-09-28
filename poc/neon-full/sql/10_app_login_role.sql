-- ==================================================================
-- Papel de LOGIN da aplicação no modo DATA_BACKEND=postgres (Neon).
--
-- Sem privilégios próprios (NOINHERIT): tudo o que ele faz passa por
-- SET LOCAL ROLE anon | authenticated | service_role dentro da transação
-- (src/lib/database/pg/client.ts), exatamente como o PostgREST. A senha
-- NÃO fica aqui: é definida fora do repositório (Neon Console/API ou
-- ALTER ROLE ... PASSWORD em sessão administrativa).
-- ==================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'educa_app') then
    create role educa_app login noinherit;
  end if;
end $$;
grant anon, authenticated, service_role to educa_app;

-- Login "sombra" (auth.users): no Supabase quem grava é o GoTrue; aqui é o
-- servidor, como service_role (convite/bootstrap). Nunca anon/authenticated.
grant select, insert, update on auth.users to service_role;
revoke all on auth.users from anon, authenticated;
