-- POC EDUCA-NEON — bateria de segurança no Neon REAL (projeto educa-neon-poc,
-- NUNCA produção). Executada pelo MCP do Neon (run_sql_transaction) em
-- 2026-09-26; resultado em poc/neon-full/evidence/neon-real-security.md.
--
-- 1) Massa de teste (dono do banco; idempotente). Os gatilhos de companies
--    criam papéis (admin/operador/leitura), 10 unidades e depósitos padrão.
insert into public.companies (id, name) values
  ('0a000000-0000-4000-8000-00000000000a', 'POC Neon Alfa'),
  ('0b000000-0000-4000-8000-00000000000b', 'POC Neon Beta')
on conflict (id) do nothing;
insert into auth.users (id, email, email_confirmed_at) values
  ('aa000000-0000-4000-8000-000000000001', 'admin.alfa@neon-poc.test', now()),
  ('bb000000-0000-4000-8000-000000000002', 'admin.beta@neon-poc.test', now()),
  ('ac000000-0000-4000-8000-000000000003', 'leitura.alfa@neon-poc.test', now())
on conflict (id) do nothing;
-- Vínculo de login só pelo caminho do convite (guarda fn_guard_users_auth_link).
select set_config('educa.auth_link', 'invitation', true);
insert into public.users (id, company_id, code, auth_user_id, name, email, login) values
  ('a1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-00000000000a', 'U-A1', 'aa000000-0000-4000-8000-000000000001', 'Admin Alfa', 'admin.alfa@neon-poc.test', 'admin.alfa'),
  ('b1000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-00000000000b', 'U-B1', 'bb000000-0000-4000-8000-000000000002', 'Admin Beta', 'admin.beta@neon-poc.test', 'admin.beta'),
  ('a2000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-00000000000a', 'U-A2', 'ac000000-0000-4000-8000-000000000003', 'Leitura Alfa', 'leitura.alfa@neon-poc.test', 'leitura.alfa')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u
join public.roles r on r.company_id = u.company_id and r.code = case when u.login = 'leitura.alfa' then 'leitura' else 'admin' end
where u.id in ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003')
on conflict do nothing;
insert into public.products (company_id, code, name, unit) values
  ('0a000000-0000-4000-8000-00000000000a', 'P-ALFA-1', 'Produto Alfa', 'UN'),
  ('0b000000-0000-4000-8000-00000000000b', 'P-BETA-1', 'Produto Beta', 'UN')
on conflict do nothing;

-- 2) Sondas (esquema separado, só no banco de teste). SECURITY INVOKER: rodam
--    com o papel ativo. probe() executa numa subtransação SEMPRE desfeita e
--    devolve "OK rows=n" ou "ERR sqlstate mensagem" — nada persiste.
create schema if not exists poc_sec;
create or replace function poc_sec.probe(q text) returns text language plpgsql security invoker as $$
declare n bigint;
begin
  begin
    execute q;
    get diagnostics n = row_count;
    raise exception using errcode = 'P0001', message = '__ok__:' || n;
  exception when others then
    if sqlerrm like '__ok__:%' then return 'OK rows=' || substr(sqlerrm, 8); end if;
    return 'ERR ' || sqlstate || ' ' || left(sqlerrm, 90);
  end;
end $$;
create or replace function poc_sec.cnt(q text) returns text language plpgsql security invoker as $$
declare n bigint;
begin
  execute q into n;
  return n::text;
exception when others then
  return 'ERR ' || sqlstate || ' ' || left(sqlerrm, 90);
end $$;
grant usage on schema poc_sec to anon, authenticated, service_role;
grant execute on all functions in schema poc_sec to anon, authenticated, service_role;
-- O dono do banco (neondb_owner) cria os papéis mas, no PG 16+, não ganha
-- SET sobre eles: concede-se SET sem INHERIT (mesmo modelo do educa_app).
grant anon, authenticated, service_role to neondb_owner with inherit false, set true;

-- 3) Bateria (uma transação; o papel e as claims são LOCAL, como no adaptador).
--    Exemplo do padrão usado em cada bloco:
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"aa000000-0000-4000-8000-000000000001","role":"authenticated"}', true),
--             set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
--      select poc_sec.probe($q$insert into public.products (company_id, code, name, unit)
--                              values ('0b000000-0000-4000-8000-00000000000b','P-X','X','UN')$q$);
--    A lista completa (S01–S33) e cada resultado estão na evidência.
