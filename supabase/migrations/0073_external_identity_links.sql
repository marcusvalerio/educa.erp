-- ==================================================================
-- 0073 — Vínculo de identidade externa (Neon Auth) → auth_user_id
--
-- BRANCH feat/neon-auth-migration — Plano A (POC). NÃO aplicada em
-- produção. Aditiva: não altera tabela, policy, função ou dado existente.
--
-- Plano A: o Neon Auth autentica a pessoa; o banco do EDUCA continua no
-- Supabase e continua reconhecendo o usuário por auth.uid(). O servidor
-- verifica o token do Neon Auth, traduz a identidade do provedor para o
-- auth_user_id já usado por users/platform_members e emite um token curto
-- para o PostgREST com esse sub (src/lib/auth/neon-bridge.ts). As 328
-- policies, has_permission() e current_app_user_id() ficam intactos.
--
-- Regras:
--   * um vínculo por identidade do provedor e um por auth_user_id;
--   * criar vínculo exige e-mail igual ao do login e já confirmado;
--   * a tabela não é legível nem gravável por anon/authenticated: só as
--     funções abaixo, executáveis apenas por service_role (servidor).
-- ==================================================================

create table if not exists public.auth_identity_links (
  provider text not null check (provider in ('neon')),
  external_user_id text not null check (length(external_user_id) between 1 and 255),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (provider, external_user_id),
  unique (provider, auth_user_id)
);

comment on table public.auth_identity_links is
  'Plano A (0073): identidade do provedor externo (Neon Auth) → auth_user_id. Lida só pelo servidor (fn_resolve_identity_link).';

alter table public.auth_identity_links enable row level security;
revoke all on public.auth_identity_links from public, anon, authenticated;

create or replace function public.fn_resolve_identity_link(p_provider text, p_external_user_id text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.auth_user_id
  from public.auth_identity_links l
  join auth.users u on u.id = l.auth_user_id
  where l.provider = p_provider and l.external_user_id = p_external_user_id
$$;

create or replace function public.fn_link_identity(p_provider text, p_external_user_id text, p_email text, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_confirmed timestamptz;
  v_existing uuid;
begin
  select lower(trim(email)), email_confirmed_at into v_email, v_confirmed from auth.users where id = p_auth_user_id;
  if v_email is null then
    raise exception 'Login não encontrado.' using errcode = 'P0002';
  end if;
  if v_email <> lower(trim(coalesce(p_email, ''))) then
    raise exception 'O e-mail da identidade externa difere do e-mail do login.' using errcode = '42501';
  end if;
  if v_confirmed is null then
    raise exception 'E-mail do login ainda não confirmado.' using errcode = '42501';
  end if;

  select auth_user_id into v_existing from public.auth_identity_links
  where provider = p_provider and external_user_id = p_external_user_id;
  if v_existing is not null then
    if v_existing <> p_auth_user_id then
      raise exception 'Identidade externa já vinculada a outro login.' using errcode = '42501';
    end if;
    return;
  end if;

  insert into public.auth_identity_links (provider, external_user_id, auth_user_id, email)
  values (p_provider, p_external_user_id, p_auth_user_id, v_email);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (null, null, 'identity-bridge', 'auth_identity_links', p_auth_user_id, 'ASSIGN', null,
    jsonb_build_object('provider', p_provider, 'email', v_email));
end;
$$;

revoke all on function public.fn_resolve_identity_link(text, text) from public, anon, authenticated;
revoke all on function public.fn_link_identity(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_resolve_identity_link(text, text) to service_role;
grant execute on function public.fn_link_identity(text, text, text, uuid) to service_role;
