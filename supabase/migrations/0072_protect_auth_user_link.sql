-- ==================================================================
-- 0072 — Proteção do vínculo login ↔ cadastro (users.auth_user_id)
--
-- Problema (existente desde 0007, registrado em docs/ONBOARDING.md):
-- a policy users_update permite a quem tem users.update alterar
-- QUALQUER coluna de public.users da própria empresa via PostgREST —
-- inclusive auth_user_id. Um administrador (ou uma sessão sequestrada)
-- poderia ligar um cadastro, e com ele os papéis da empresa, a um login
-- qualquer. users_insert tem o mesmo efeito na criação.
--
-- Verificado antes de restringir (dependências):
--   * nenhuma função do banco de produção escreve users.auth_user_id
--     (consulta em pg_proc por UPDATE/INSERT em users com a coluna);
--   * a aplicação não escreve a coluna (mapeadores de users não a
--     incluem; rotas de admin só a leem para mostrar "login vinculado");
--   * bootstrap_admin_user (0005) não está instalada;
--   * o único caminho oficial é fn_accept_user_invitation (0071), que
--     roda como SECURITY DEFINER e marca a transação com
--     educa.auth_link = 'invitation' imediatamente antes do UPDATE.
--
-- Regra:
--   * anon, authenticated, authenticator e service_role NUNCA criam nem
--     alteram auth_user_id (nem para outro login, nem para NULL);
--   * um vínculo NÃO nulo só é aceito com a marca do aceite oficial;
--   * desvinculação para NULL segue possível ao dono da tabela — é o
--     que o ON DELETE SET NULL de auth.users faz quando um login é
--     excluído no Auth.
--
-- Aditiva: não altera policy, papel, permissão nem dado existente.
-- ==================================================================

create or replace function public.fn_guard_users_auth_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.auth_user_id is null then
    return new;
  end if;

  -- Função SECURITY INVOKER de propósito: current_user é quem de fato
  -- está escrevendo (PostgREST = authenticated/anon; cliente
  -- administrativo = service_role; função SECURITY DEFINER = dono).
  if current_user in ('anon', 'authenticated', 'authenticator', 'service_role') then
    raise exception 'O vínculo de login (auth_user_id) só é definido pelo aceite de convite.'
      using errcode = '42501';
  end if;

  if new.auth_user_id is not null
     and coalesce(current_setting('educa.auth_link', true), '') <> 'invitation' then
    raise exception 'O vínculo de login (auth_user_id) só é definido pelo aceite de convite.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_guard_users_auth_link() from public, anon, authenticated, service_role;

drop trigger if exists guard_users_auth_link on public.users;
create trigger guard_users_auth_link
  before insert or update of auth_user_id on public.users
  for each row execute function public.fn_guard_users_auth_link();

comment on function public.fn_guard_users_auth_link() is
  'Impede que auth_user_id seja definido fora do aceite de convite (fn_accept_user_invitation). Ver 0072.';
