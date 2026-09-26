-- ==================================================================
-- Camada de compatibilidade Supabase → PostgreSQL puro (Neon).
--
-- As migrations do EDUCA foram escritas para o Supabase e dependem de:
--   * papéis anon / authenticated / service_role;
--   * schema "extensions" com pgcrypto, uuid-ossp, moddatetime,
--     btree_gist e ltree;
--   * auth.uid() / auth.jwt() / auth.role() lendo as claims da requisição
--     (mesma implementação do Supabase: GUC request.jwt.claims);
--   * auth.users (FK de users, platform_members, user_invitations,
--     auth_identity_links).
-- Nada aqui é específico de produção; nenhum segredo.
-- ==================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists extensions;
grant usage on schema extensions to public;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists moddatetime with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists ltree with schema extensions;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean not null default false,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on auth.users to service_role;

-- Mesmas definições do Supabase (claims vêm do GUC por transação).
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Privilégios padrão equivalentes aos do Supabase (as migrations revogam o que não deve valer).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
