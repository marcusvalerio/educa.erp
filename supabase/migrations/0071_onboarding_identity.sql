-- ==================================================================
-- 0071 — Onboarding & Identity (ADITIVA)
--
-- Por que esta migration existe (verificado antes de escrever):
--   * Não há convite: nenhuma estrutura registra um convite com
--     validade, uso único e vínculo com empresa/usuário. O Supabase Auth
--     sozinho não sabe a qual cadastro de public.users um login deve se
--     ligar — e o vínculo NÃO pode ser decidido pelo cliente.
--   * Não há criação de empresa: a permissão platform.companies.create
--     existe (0064), mas nenhuma função a usa, e a RLS de companies não
--     permite INSERT a ninguém.
--   * Não há caminho funcional para o PRIMEIRO administrador de uma
--     empresa: bootstrap_admin_user (0005) não está instalada no banco
--     atual e escrevia em user_companies / user_roles.company_id, que não
--     existem mais no modelo.
--
-- O que esta migration NÃO faz:
--   * não altera nenhuma tabela, policy, função ou permissão existente;
--   * não cria permissão nova — usa users.update, platform.companies.create,
--     platform.companies.view e platform.members.manage, já no catálogo;
--   * não dá à plataforma acesso a dados operacionais de empresas;
--   * não concede nada automaticamente a quem apenas se autentica.
--
-- Regras centrais:
--   * token de convite: gerado no banco, entregue UMA vez, armazenado só
--     como hash SHA-256; expira; uso único;
--   * aceite: quem aceita é o usuário autenticado (auth.uid()), com e-mail
--     confirmado e IGUAL ao e-mail do convite; empresa, usuário e papel
--     vêm do convite, nunca de parâmetros do cliente;
--   * um login (auth.users) liga-se a no máximo UM cadastro de usuário.
-- ==================================================================

-- ------------------------------------------------------------------
-- user_invitations
-- ------------------------------------------------------------------
create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  kind text not null default 'USER' check (kind in ('USER', 'COMPANY_ADMIN')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_by_label text not null,
  accepted_at timestamptz,
  accepted_auth_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_invitations is
  'Convites de acesso (0071). Um convite liga um login (auth.users) a um cadastro existente em public.users da MESMA empresa. Token só como hash; expira; uso único. Escrita apenas pelas funções fn_*_invitation.';

-- No máximo um convite pendente por usuário.
create unique index if not exists user_invitations_one_pending_idx
  on public.user_invitations (user_id) where status = 'pending';
create index if not exists user_invitations_company_idx
  on public.user_invitations (company_id, created_at desc);

alter table public.user_invitations enable row level security;

-- Os privilégios padrão do Supabase concedem tudo a anon/authenticated em
-- tabelas novas; aqui só leitura (filtrada pela policy) para authenticated.
revoke all on public.user_invitations from anon;
revoke insert, update, delete, truncate on public.user_invitations from authenticated;

-- Leitura: quem pode ver usuários da empresa vê os convites dela.
-- Não há policy de escrita: INSERT/UPDATE/DELETE só pelas funções.
drop policy if exists user_invitations_select on public.user_invitations;
create policy user_invitations_select on public.user_invitations
  for select to authenticated
  using (public.has_permission(company_id, 'users.read'));

-- ------------------------------------------------------------------
-- Helpers internos (sem grant: só as funções abaixo os chamam)
-- ------------------------------------------------------------------
create or replace function public.fn_invitation_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.fn_mask_email(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email))
  end;
$$;

-- Emite um convite para um cadastro já validado pelo chamador. Revoga o
-- pendente anterior do mesmo usuário (reenvio). Devolve o token em claro
-- uma única vez; o banco guarda só o hash.
create or replace function public.fn_issue_user_invitation(
  p_user_id uuid,
  p_kind text,
  p_ttl_hours integer,
  p_actor_label text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_token text;
  v_ttl integer;
  v_invitation public.user_invitations;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  v_ttl := least(greatest(coalesce(p_ttl_hours, 168), 1), 720);

  update public.user_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where user_id = v_user.id and status = 'pending';

  -- 2 × UUIDv4 (gerador forte do Postgres) = 244 bits aleatórios.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.user_invitations (
    company_id, user_id, email, kind, token_hash, status, expires_at, created_by_user_id, created_by_label
  )
  values (
    v_user.company_id, v_user.id, lower(trim(v_user.email)), p_kind,
    public.fn_invitation_token_hash(v_token), 'pending', now() + make_interval(hours => v_ttl),
    p_actor_user_id, coalesce(nullif(trim(p_actor_label), ''), 'system')
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'token', v_token,
    'email', v_invitation.email,
    'kind', v_invitation.kind,
    'expires_at', v_invitation.expires_at,
    'user_id', v_user.id,
    'user_name', v_user.name
  );
end;
$$;

-- Os privilégios padrão do Supabase concedem EXECUTE diretamente a anon e
-- authenticated; revogar só de PUBLIC não basta.
revoke all on function public.fn_invitation_token_hash(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_mask_email(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_issue_user_invitation(uuid, text, integer, text, uuid) from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- Company Admin: convidar / revogar
-- ------------------------------------------------------------------
create or replace function public.fn_create_user_invitation(p_user_id uuid, p_ttl_hours integer default 168)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_result jsonb;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  -- Empresa vem do cadastro; has_permission só é verdadeiro para quem é
  -- membro ativo DESTA empresa com a permissão. Cross-company = negado.
  if not public.has_permission(v_user.company_id, 'users.update') then
    raise exception 'Permissão negada (users.update).' using errcode = '42501';
  end if;
  if v_user.status <> 'active' then
    raise exception 'Usuário inativo não pode receber convite. Reative o cadastro antes.' using errcode = 'P0001';
  end if;
  if v_user.auth_user_id is not null then
    raise exception 'Este usuário já possui login vinculado.' using errcode = 'P0001';
  end if;
  if coalesce(trim(v_user.email), '') = '' then
    raise exception 'O cadastro do usuário não possui e-mail.' using errcode = '22023';
  end if;
  -- Dar login a um cadastro é, na prática, entregar os papéis dele. Quem
  -- só edita cadastros (users.update — ex.: papel operador) não pode
  -- liberar acesso a cadastro que já tenha papel (senão bastaria trocar
  -- o e-mail de um cadastro administrador e convidar a si mesmo).
  if exists (select 1 from public.user_roles where user_id = v_user.id)
     and not public.has_permission(v_user.company_id, 'roles.manage') then
    raise exception 'Este cadastro tem papéis atribuídos: liberar o acesso exige a permissão de gerenciar papéis (roles.manage).' using errcode = '42501';
  end if;

  select * into v_actor from public.users where id = public.current_app_user_id();

  v_result := public.fn_issue_user_invitation(v_user.id, 'USER', p_ttl_hours, coalesce(v_actor.name, v_actor.email), v_actor.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, v_actor.id, coalesce(v_actor.name, 'system'), 'user_invitations',
    (v_result->>'invitation_id')::uuid, 'CREATE', null,
    jsonb_build_object('user_id', v_user.id, 'email', v_result->>'email', 'kind', 'USER', 'expires_at', v_result->>'expires_at'));

  return v_result || jsonb_build_object('company_name', (select name from public.companies where id = v_user.company_id));
end;
$$;

create or replace function public.fn_revoke_user_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.user_invitations;
begin
  select * into v_inv from public.user_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_inv.company_id, 'users.update') then
    raise exception 'Permissão negada (users.update).' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Apenas convites pendentes podem ser cancelados.' using errcode = 'P0001';
  end if;

  update public.user_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = v_inv.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_inv.company_id, public.current_app_user_id(), 'system', 'user_invitations', v_inv.id, 'REVOKE',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'revoked', 'user_id', v_inv.user_id));
end;
$$;

-- ------------------------------------------------------------------
-- Convidado: consultar e aceitar
-- ------------------------------------------------------------------
-- Consulta pelo token (quem tem o token é o convidado). Não devolve ids
-- internos nem o e-mail completo.
create or replace function public.fn_get_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.user_invitations;
  v_status text;
begin
  if coalesce(length(p_token), 0) < 32 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_inv from public.user_invitations where token_hash = public.fn_invitation_token_hash(p_token);
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_status := case
    when v_inv.status = 'pending' and v_inv.expires_at < now() then 'expired'
    else v_inv.status
  end;

  return jsonb_build_object(
    'status', v_status,
    'kind', v_inv.kind,
    'email_hint', public.fn_mask_email(v_inv.email),
    'expires_at', v_inv.expires_at,
    'company_name', (select name from public.companies where id = v_inv.company_id),
    'user_name', (select name from public.users where id = v_inv.user_id)
  );
end;
$$;

create or replace function public.fn_accept_user_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.user_invitations;
  v_user public.users;
  v_auth_email text;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'Entre com a sua conta para aceitar o convite.' using errcode = '42501';
  end if;

  select * into v_inv from public.user_invitations
  where token_hash = public.fn_invitation_token_hash(p_token)
  for update;
  if not found then
    raise exception 'Convite inválido.' using errcode = 'P0002';
  end if;
  if v_inv.status = 'accepted' then
    raise exception 'Este convite já foi utilizado.' using errcode = 'P0001';
  end if;
  if v_inv.status = 'revoked' then
    raise exception 'Este convite foi cancelado. Solicite um novo convite ao administrador.' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Este convite expirou. Solicite um novo convite ao administrador.' using errcode = 'P0001';
  end if;

  -- A identidade vem do Auth, não do cliente.
  select email, email_confirmed_at into v_auth_email, v_confirmed from auth.users where id = v_uid;
  if v_auth_email is null or lower(trim(v_auth_email)) <> v_inv.email then
    raise exception 'Este convite foi emitido para outro e-mail. Entre com a conta do e-mail convidado.' using errcode = '42501';
  end if;
  if v_confirmed is null then
    raise exception 'Confirme o seu e-mail antes de aceitar o convite.' using errcode = '42501';
  end if;

  -- Um login liga-se a um único cadastro (nenhuma segunda empresa).
  if exists (select 1 from public.users where auth_user_id = v_uid) then
    raise exception 'Esta conta já está vinculada a um acesso. Um mesmo login não pode ser vinculado a outro cadastro.' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where id = v_inv.user_id for update;
  if not found or v_user.company_id <> v_inv.company_id then
    raise exception 'Convite inválido.' using errcode = 'P0002';
  end if;
  if v_user.auth_user_id is not null then
    raise exception 'Este cadastro já possui login vinculado.' using errcode = 'P0001';
  end if;
  if v_user.status <> 'active' then
    raise exception 'O acesso deste cadastro está desativado. Fale com o administrador da sua organização.' using errcode = 'P0001';
  end if;

  -- Marca, só nesta transação, que o vínculo vem do aceite oficial
  -- (o gatilho guard_users_auth_link da 0072 exige isso).
  perform set_config('educa.auth_link', 'invitation', true);
  update public.users set auth_user_id = v_uid where id = v_user.id;
  perform set_config('educa.auth_link', '', true);

  update public.user_invitations
  set status = 'accepted', accepted_at = now(), accepted_auth_user_id = v_uid, updated_at = now()
  where id = v_inv.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values
    (v_inv.company_id, v_user.id, v_user.name, 'user_invitations', v_inv.id, 'CONFIRM',
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'accepted', 'kind', v_inv.kind)),
    (v_inv.company_id, v_user.id, v_user.name, 'users', v_user.id, 'ASSIGN',
      null, jsonb_build_object('auth_linked', true, 'via', 'invitation', 'invitation_id', v_inv.id));

  return jsonb_build_object('status', 'accepted', 'kind', v_inv.kind);
end;
$$;

-- ------------------------------------------------------------------
-- Plataforma: criar empresa e convidar o PRIMEIRO administrador
-- ------------------------------------------------------------------
create or replace function public.fn_platform_create_company(
  p_name text,
  p_legal_name text default null,
  p_document text default null,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip_code text default null,
  p_plan_code text default null,
  p_lifecycle_status text default 'TRIAL',
  p_branch_code text default null,
  p_branch_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies;
  v_branch_id uuid;
  v_doc text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
begin
  if not public.has_platform_permission('platform.companies.create') then
    raise exception 'Permissão negada (platform.companies.create).' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Informe o nome da empresa.' using errcode = '22023';
  end if;
  if p_lifecycle_status not in ('TRIAL', 'ACTIVE') then
    raise exception 'Uma empresa nova começa em avaliação (TRIAL) ou ativa (ACTIVE).' using errcode = '22023';
  end if;
  if (coalesce(trim(p_branch_code), '') = '') <> (coalesce(trim(p_branch_name), '') = '') then
    raise exception 'Para criar a unidade inicial, informe código e nome.' using errcode = '22023';
  end if;
  if v_doc is not null and exists (
    select 1 from public.companies where regexp_replace(coalesce(document, ''), '\D', '', 'g') = v_doc
  ) then
    raise exception 'Já existe uma empresa com este documento.' using errcode = 'P0001';
  end if;

  -- Os gatilhos de companies semeiam papéis, unidades de medida,
  -- depósitos, perfil de plataforma e módulos (0005/0007/0008/0013/0065).
  insert into public.companies (name, legal_name, document, email, phone, address, city, state, zip_code, status)
  values (
    trim(p_name), nullif(trim(p_legal_name), ''), nullif(trim(p_document), ''), nullif(lower(trim(p_email)), ''),
    nullif(trim(p_phone), ''), nullif(trim(p_address), ''), nullif(trim(p_city), ''),
    nullif(upper(trim(p_state)), ''), nullif(trim(p_zip_code), ''), 'active'
  )
  returning * into v_company;

  update public.company_platform_profiles
  set lifecycle_status = p_lifecycle_status, plan_code = nullif(trim(p_plan_code), '')
  where company_id = v_company.id;

  if coalesce(trim(p_branch_code), '') <> '' then
    insert into public.branches (company_id, code, name, status)
    values (v_company.id, upper(trim(p_branch_code)), trim(p_branch_name), 'active')
    returning id into v_branch_id;
  end if;

  perform public.fn_log_platform_audit('companies', v_company.id, 'CREATE', null,
    jsonb_build_object('name', v_company.name, 'lifecycle_status', p_lifecycle_status,
      'plan_code', nullif(trim(p_plan_code), ''), 'branch_code', nullif(upper(trim(p_branch_code)), '')));

  return jsonb_build_object(
    'company_id', v_company.id,
    'name', v_company.name,
    'lifecycle_status', p_lifecycle_status,
    'branch_id', v_branch_id
  );
end;
$$;

-- Primeiro administrador da empresa. Só enquanto nenhum administrador
-- da empresa tiver login vinculado: a partir daí, novos acessos são
-- concedidos pela própria empresa (/admin). A plataforma não lê nem
-- altera nenhum outro dado da empresa.
create or replace function public.fn_platform_invite_company_admin(
  p_company_id uuid,
  p_name text,
  p_email text,
  p_ttl_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_admin_role_id uuid;
  v_user public.users;
  v_login text;
  v_result jsonb;
  v_actor text;
begin
  if not public.has_platform_permission('platform.companies.create') then
    raise exception 'Permissão negada (platform.companies.create).' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Informe o nome do administrador.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  select id into v_admin_role_id from public.roles
  where company_id = p_company_id and code = 'admin' and is_system and status = 'active';
  if v_admin_role_id is null then
    raise exception 'A empresa não possui o papel administrador de sistema.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.role_id = v_admin_role_id
    where u.company_id = p_company_id and u.status = 'active' and u.auth_user_id is not null
  ) then
    raise exception 'A empresa já possui um administrador com acesso. Novos acessos são concedidos pela Administração da Empresa.' using errcode = 'P0001';
  end if;

  select * into v_user from public.users where company_id = p_company_id and lower(email) = v_email;
  if found then
    if v_user.auth_user_id is not null then
      raise exception 'Este e-mail já possui acesso nesta empresa.' using errcode = 'P0001';
    end if;
    if v_user.status <> 'active' then
      raise exception 'Existe um cadastro inativo com este e-mail. Reative-o pela Administração da Empresa.' using errcode = 'P0001';
    end if;
  else
    v_login := split_part(v_email, '@', 1);
    if exists (select 1 from public.users where company_id = p_company_id and login = v_login) then
      v_login := v_login || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
    insert into public.users (company_id, name, email, login, role, status)
    values (p_company_id, trim(p_name), v_email, v_login, 'admin', 'active')
    returning * into v_user;
  end if;

  insert into public.user_roles (user_id, role_id)
  values (v_user.id, v_admin_role_id)
  on conflict do nothing;

  v_actor := coalesce(
    (select 'platform:' || m.platform_role || ':' || m.email from public.platform_members m where m.auth_user_id = auth.uid()),
    'platform:system'
  );
  v_result := public.fn_issue_user_invitation(v_user.id, 'COMPANY_ADMIN', p_ttl_hours, v_actor, null);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, null, v_actor, 'user_invitations', (v_result->>'invitation_id')::uuid, 'CREATE', null,
    jsonb_build_object('user_id', v_user.id, 'email', v_email, 'kind', 'COMPANY_ADMIN', 'expires_at', v_result->>'expires_at'));

  perform public.fn_log_platform_audit('users', v_user.id, 'ASSIGN', null,
    jsonb_build_object('company_id', p_company_id, 'email', v_email, 'role', 'admin', 'invitation_id', v_result->>'invitation_id'));

  return v_result;
end;
$$;

-- Situação do onboarding de uma empresa, sem dado operacional.
create or replace function public.fn_platform_company_onboarding(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_platform_permission('platform.companies.view') then
    raise exception 'Permissão negada (platform.companies.view).' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'admin_with_access', exists (
      select 1 from public.users u
      join public.user_roles ur on ur.user_id = u.id
      join public.roles r on r.id = ur.role_id
      where u.company_id = p_company_id and u.status = 'active' and u.auth_user_id is not null
        and r.company_id = p_company_id and r.code = 'admin' and r.is_system
    ),
    'pending_admin_invitation', (
      select jsonb_build_object('email_hint', public.fn_mask_email(i.email), 'expires_at', i.expires_at,
        'expired', i.expires_at < now())
      from public.user_invitations i
      where i.company_id = p_company_id and i.kind = 'COMPANY_ADMIN' and i.status = 'pending'
      order by i.created_at desc
      limit 1
    )
  );
end;
$$;

-- Membro da plataforma por e-mail: localiza o login existente. Só para
-- quem administra membros da plataforma.
create or replace function public.fn_platform_auth_user_id(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_platform_permission('platform.members.manage') then
    raise exception 'Permissão negada (platform.members.manage).' using errcode = '42501';
  end if;
  return (select id from auth.users where lower(email) = lower(trim(p_email)) limit 1);
end;
$$;

-- ------------------------------------------------------------------
-- Grants: nada público; o convidado anônimo só consulta pelo token.
-- ------------------------------------------------------------------
revoke all on function public.fn_create_user_invitation(uuid, integer) from public, anon, authenticated;
revoke all on function public.fn_revoke_user_invitation(uuid) from public, anon, authenticated;
revoke all on function public.fn_get_invitation(text) from public, anon, authenticated;
revoke all on function public.fn_accept_user_invitation(text) from public, anon, authenticated;
revoke all on function public.fn_platform_create_company(text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_platform_invite_company_admin(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.fn_platform_company_onboarding(uuid) from public, anon, authenticated;
revoke all on function public.fn_platform_auth_user_id(text) from public, anon, authenticated;

grant execute on function public.fn_create_user_invitation(uuid, integer) to authenticated;
grant execute on function public.fn_revoke_user_invitation(uuid) to authenticated;
grant execute on function public.fn_get_invitation(text) to anon, authenticated;
grant execute on function public.fn_accept_user_invitation(text) to authenticated;
grant execute on function public.fn_platform_create_company(text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.fn_platform_invite_company_admin(uuid, text, text, integer) to authenticated;
grant execute on function public.fn_platform_company_onboarding(uuid) to authenticated;
grant execute on function public.fn_platform_auth_user_id(text) to authenticated;
