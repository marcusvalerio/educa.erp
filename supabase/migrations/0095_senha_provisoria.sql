-- ==================================================================
-- 0095 — Senha provisória gerada pelo Administrador da empresa
-- ==================================================================
-- O Administrador gera, para um cadastro da PRÓPRIA empresa, uma senha
-- provisória (10 caracteres) que ele entrega à pessoa. No primeiro login a
-- pessoa é obrigada a criar uma senha nova; até lá a sessão não chega ao
-- banco. Gerar de novo ou revogar invalida a anterior.
--
-- Divisão de responsabilidades:
--   * o BANCO decide quem pode gerar para quem (mesmas regras do convite
--     da 0071 + não escalar permissões, 0075), guarda só metadados (nunca a
--     senha), audita, liga o login ao cadastro e BLOQUEIA a identidade
--     enquanto a troca não acontecer;
--   * o SERVIDOR gera a senha, grava-a no Neon Auth (só hash lá) e conduz
--     a troca obrigatória.
--
-- Bloqueio: fn_resolve_identity_link (0073) passa a devolver NULL para um
-- login com senha provisória pendente (inclusive vencida). Sem vínculo
-- resolvido não há identidade no ATLAS.ERP, mesmo que alguém entre direto
-- no Neon Auth com a senha provisória e monte o cookie à mão.
--
-- Aditiva: não altera dado existente, policy, papel ou permissão.
-- ==================================================================

create table if not exists public.user_temporary_passwords (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  -- login (auth.users) que recebe a senha; definido pelo servidor (fn_attach_…)
  auth_user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'consumed', 'revoked')),
  issued_by uuid references public.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  check (expires_at > issued_at)
);

comment on table public.user_temporary_passwords is
  'Senhas provisórias emitidas pelo Administrador (0095): só metadados — a senha fica apenas como hash no provedor de identidade.';

create unique index if not exists user_temporary_passwords_one_pending
  on public.user_temporary_passwords (user_id) where status = 'pending';
create index if not exists user_temporary_passwords_auth_pending
  on public.user_temporary_passwords (auth_user_id) where status = 'pending';

alter table public.user_temporary_passwords enable row level security;
revoke all on public.user_temporary_passwords from public, anon, authenticated;
grant select, insert, update, delete on public.user_temporary_passwords to service_role;

-- ------------------------------------------------------------------
-- Regras comuns de quem pode gerar/revogar (o alvo é o cadastro)
-- ------------------------------------------------------------------
create or replace function public.fn_assert_can_manage_temporary_password(p_user public.users)
returns public.users
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users;
  v_codes text[];
begin
  -- has_permission só é verdadeiro para membro ativo DESTA empresa: outra
  -- empresa = negado, sem revelar nada do cadastro.
  if not public.has_permission(p_user.company_id, 'users.update') then
    raise exception 'Permissão negada (users.update).' using errcode = '42501';
  end if;
  select * into v_actor from public.users where id = public.current_app_user_id();
  if v_actor.id is null or v_actor.company_id <> p_user.company_id then
    raise exception 'Permissão negada (users.update).' using errcode = '42501';
  end if;
  if v_actor.id = p_user.id then
    raise exception 'Você não pode gerar senha provisória para si mesmo. Use "Esqueci minha senha".' using errcode = 'P0001';
  end if;
  -- Mesma regra do convite (0071): liberar acesso a cadastro com papel exige roles.manage.
  if exists (select 1 from public.user_roles where user_id = p_user.id)
     and not public.has_permission(p_user.company_id, 'roles.manage') then
    raise exception 'Este cadastro tem papéis atribuídos: gerar a senha exige a permissão de gerenciar papéis (roles.manage).' using errcode = '42501';
  end if;
  -- Assumir o acesso de quem tem mais permissões que você seria escalada (0075).
  select coalesce(array_agg(distinct p.code), array[]::text[]) into v_codes
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.status = 'active'
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = p_user.id;
  if cardinality(public.fn_permissions_not_held(p_user.company_id, v_codes)) > 0 then
    raise exception 'Este cadastro tem permissões que você não possui; peça a um Administrador com as mesmas permissões.' using errcode = '42501';
  end if;
  -- Login da equipe da plataforma nunca é redefinido por uma empresa.
  if p_user.auth_user_id is not null
     and exists (select 1 from public.platform_members where auth_user_id = p_user.auth_user_id) then
    raise exception 'Este login pertence à equipe da plataforma e não pode receber senha provisória.' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

-- ------------------------------------------------------------------
-- Gerar (Administrador, authenticated)
-- ------------------------------------------------------------------
create or replace function public.fn_issue_temporary_password(p_user_id uuid, p_ttl_hours integer default 72)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_row public.user_temporary_passwords;
begin
  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 168 then
    raise exception 'Validade da senha provisória deve ser entre 1 e 168 horas.' using errcode = '22023';
  end if;
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  v_actor := public.fn_assert_can_manage_temporary_password(v_user);
  if v_user.status <> 'active' then
    raise exception 'Usuário inativo não pode receber senha provisória. Reative o cadastro antes.' using errcode = 'P0001';
  end if;
  if coalesce(trim(v_user.email), '') = '' then
    raise exception 'O cadastro do usuário não possui e-mail.' using errcode = '22023';
  end if;

  -- Uma pendente por cadastro: a anterior deixa de valer.
  update public.user_temporary_passwords
  set status = 'revoked', revoked_at = now(), revoked_by = v_actor.id
  where user_id = v_user.id and status = 'pending';

  insert into public.user_temporary_passwords (company_id, user_id, email, auth_user_id, issued_by, expires_at)
  values (v_user.company_id, v_user.id, lower(trim(v_user.email)), v_user.auth_user_id, v_actor.id, now() + make_interval(hours => p_ttl_hours))
  returning * into v_row;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, v_actor.id, coalesce(v_actor.name, 'system'), 'user_temporary_passwords', v_row.id, 'CREATE', null,
    jsonb_build_object('user_id', v_user.id, 'email', v_row.email, 'expires_at', v_row.expires_at, 'login_existente', v_user.auth_user_id is not null));

  return jsonb_build_object(
    'id', v_row.id,
    'user_id', v_user.id,
    'user_name', v_user.name,
    'email', v_row.email,
    'auth_user_id', v_row.auth_user_id,
    'expires_at', v_row.expires_at
  );
end;
$$;

-- ------------------------------------------------------------------
-- Revogar (Administrador, authenticated)
-- ------------------------------------------------------------------
create or replace function public.fn_revoke_temporary_password(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_actor public.users;
  v_row public.user_temporary_passwords;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  v_actor := public.fn_assert_can_manage_temporary_password(v_user);

  update public.user_temporary_passwords
  set status = 'revoked', revoked_at = now(), revoked_by = v_actor.id
  where user_id = v_user.id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('revoked', false, 'email', lower(trim(v_user.email)), 'auth_user_id', null);
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, v_actor.id, coalesce(v_actor.name, 'system'), 'user_temporary_passwords', v_row.id, 'REVOKE',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'revoked', 'user_id', v_user.id));

  return jsonb_build_object('revoked', true, 'email', v_row.email, 'auth_user_id', v_row.auth_user_id);
end;
$$;

-- ------------------------------------------------------------------
-- Servidor (service_role): login que recebe a senha
-- ------------------------------------------------------------------
-- Chamado ANTES de gravar a senha no provedor: recusa o login que já
-- pertence a outro cadastro ou à equipe da plataforma (senão o
-- Administrador redefiniria a senha de alguém de outra empresa que usa o
-- mesmo e-mail).
create or replace function public.fn_attach_temporary_password_login(p_id uuid, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.user_temporary_passwords;
  v_email text;
begin
  select * into v_row from public.user_temporary_passwords where id = p_id for update;
  if not found or v_row.status <> 'pending' then
    raise exception 'Senha provisória não encontrada ou não está mais pendente.' using errcode = 'P0002';
  end if;
  select lower(trim(email)) into v_email from auth.users where id = p_auth_user_id;
  if v_email is null or v_email <> v_row.email then
    raise exception 'O login não corresponde ao e-mail do cadastro.' using errcode = '42501';
  end if;
  if exists (select 1 from public.users where auth_user_id = p_auth_user_id and id <> v_row.user_id) then
    raise exception 'Este e-mail já tem login em outro cadastro; a senha provisória não pode ser usada.' using errcode = '42501';
  end if;
  if exists (select 1 from public.platform_members where auth_user_id = p_auth_user_id) then
    raise exception 'Este login pertence à equipe da plataforma e não pode receber senha provisória.' using errcode = '42501';
  end if;
  if v_row.auth_user_id is not null and v_row.auth_user_id <> p_auth_user_id then
    raise exception 'O cadastro já está ligado a outro login.' using errcode = '42501';
  end if;
  update public.user_temporary_passwords set auth_user_id = p_auth_user_id where id = p_id;
end;
$$;

-- Estado da senha provisória de uma identidade externa (login → troca obrigatória?).
create or replace function public.fn_temporary_password_state(p_provider text, p_external_user_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', t.id,
    'auth_user_id', t.auth_user_id,
    'status', case when t.expires_at < now() then 'expired' else 'pending' end,
    'expires_at', t.expires_at
  )
  from public.auth_identity_links l
  join public.user_temporary_passwords t on t.auth_user_id = l.auth_user_id and t.status = 'pending'
  where l.provider = p_provider and l.external_user_id = p_external_user_id
  order by t.issued_at desc
  limit 1
$$;

-- Troca concluída: consome a senha provisória e, se for o primeiro acesso,
-- liga o login ao cadastro (mesmas regras do aceite de convite da 0071).
create or replace function public.fn_consume_temporary_password(p_id uuid, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.user_temporary_passwords;
  v_user public.users;
  v_confirmed timestamptz;
begin
  select * into v_row from public.user_temporary_passwords where id = p_id for update;
  if not found or v_row.status <> 'pending' then
    raise exception 'Senha provisória não encontrada ou já utilizada.' using errcode = 'P0002';
  end if;
  if v_row.expires_at < now() then
    raise exception 'A senha provisória expirou. Peça uma nova ao administrador.' using errcode = 'P0001';
  end if;
  if v_row.auth_user_id is distinct from p_auth_user_id then
    raise exception 'Senha provisória de outro login.' using errcode = '42501';
  end if;
  select email_confirmed_at into v_confirmed from auth.users where id = p_auth_user_id;
  if v_confirmed is null then
    raise exception 'Login sem e-mail confirmado.' using errcode = '42501';
  end if;

  select * into v_user from public.users where id = v_row.user_id for update;
  if not found or v_user.company_id <> v_row.company_id then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  if v_user.status <> 'active' then
    raise exception 'O acesso deste cadastro está desativado. Fale com o administrador da sua organização.' using errcode = 'P0001';
  end if;

  if v_user.auth_user_id is null then
    if exists (select 1 from public.users where auth_user_id = p_auth_user_id) then
      raise exception 'Esta conta já está vinculada a um acesso. Um mesmo login não pode ser vinculado a outro cadastro.' using errcode = 'P0001';
    end if;
    -- Mesmo caminho oficial do aceite (gatilho guard_users_auth_link, 0072):
    -- a senha provisória emitida pelo Administrador faz o papel do convite.
    perform set_config('educa.auth_link', 'invitation', true);
    update public.users set auth_user_id = p_auth_user_id where id = v_user.id;
    perform set_config('educa.auth_link', '', true);
    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_user.company_id, v_user.id, v_user.name, 'users', v_user.id, 'ASSIGN',
      null, jsonb_build_object('auth_linked', true, 'via', 'temporary_password', 'temporary_password_id', v_row.id));
  elsif v_user.auth_user_id <> p_auth_user_id then
    raise exception 'O cadastro já está ligado a outro login.' using errcode = '42501';
  end if;

  update public.user_temporary_passwords set status = 'consumed', consumed_at = now() where id = v_row.id;
  -- Convites ainda pendentes deste cadastro perdem o sentido.
  update public.user_invitations set status = 'revoked', updated_at = now()
  where user_id = v_user.id and status = 'pending';

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, v_user.id, v_user.name, 'user_temporary_passwords', v_row.id, 'CONFIRM',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'consumed'));

  return jsonb_build_object('status', 'consumed', 'user_id', v_user.id);
end;
$$;

-- ------------------------------------------------------------------
-- Bloqueio: identidade com senha provisória pendente não chega ao banco
-- ------------------------------------------------------------------
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
    and not exists (
      select 1 from public.user_temporary_passwords t
      where t.auth_user_id = l.auth_user_id and t.status = 'pending'
    )
$$;

revoke all on function public.fn_assert_can_manage_temporary_password(public.users) from public, anon, authenticated, service_role;
revoke all on function public.fn_issue_temporary_password(uuid, integer) from public, anon;
revoke all on function public.fn_revoke_temporary_password(uuid) from public, anon;
revoke all on function public.fn_attach_temporary_password_login(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_temporary_password_state(text, text) from public, anon, authenticated;
revoke all on function public.fn_consume_temporary_password(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_issue_temporary_password(uuid, integer) to authenticated;
grant execute on function public.fn_revoke_temporary_password(uuid) to authenticated;
grant execute on function public.fn_attach_temporary_password_login(uuid, uuid) to service_role;
grant execute on function public.fn_temporary_password_state(text, text) to service_role;
grant execute on function public.fn_consume_temporary_password(uuid, uuid) to service_role;
