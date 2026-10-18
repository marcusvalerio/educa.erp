-- 0098 — Fecha as funções SECURITY DEFINER do schema public para quem não
-- tem sessão (papel anon).
--
-- Por padrão o Supabase concede EXECUTE em toda função nova a anon,
-- authenticated e service_role, e o Postgres concede a PUBLIC. Como as
-- funções SECURITY DEFINER rodam com os direitos do dono, qualquer pessoa
-- com a chave pública podia chamá-las pela API sem login. Elas mesmas
-- recusam quem não tem sessão, mas a porta não precisa ficar aberta.
--
-- O que muda: anon e PUBLIC perdem EXECUTE; authenticated e service_role
-- mantêm exatamente o acesso que já tinham (concedido de forma explícita).
-- Fica liberada para anon só a prévia do convite (fn_get_invitation), que a
-- tela de convite e a senha provisória consultam antes do login.
--
-- Pode rodar de novo a qualquer momento (por exemplo, depois de uma
-- migração que crie funções novas): o resultado é o mesmo.

do $$
declare
  f record;
  auth_ok boolean;
  svc_ok boolean;
  liberadas constant text[] := array['fn_get_invitation'];
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if f.proname = any (liberadas) then
      continue;
    end if;
    auth_ok := has_function_privilege('authenticated', f.oid, 'execute');
    svc_ok := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if auth_ok then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if svc_ok then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end
$$;

-- Funções criadas daqui em diante não nascem abertas para anon/PUBLIC
-- (cada migração já concede explicitamente a authenticated o que precisa).
-- O padrão de PUBLIC é global (não por schema), por isso são dois comandos.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
