-- Fase 2b — Verificação de RLS/RBAC contra um projeto Supabase real.
--
-- Não roda em CI (não há Postgres disponível no pipeline deste
-- projeto) — rode manualmente no SQL Editor do Supabase, ou via
-- `psql "$SUPABASE_DB_URL" -f supabase/tests/rls_rbac.sql`, DEPOIS de
-- aplicar as migrations 0001-0007. Documentado em docs/TESTING.md.
--
-- Tudo roda dentro de uma transação com ROLLBACK no final — nenhuma
-- empresa/usuário de teste fica no banco depois de rodar. Se qualquer
-- verificação falhar, a exceção interrompe o script antes do ROLLBACK
-- (a transação ainda é desfeita, mas a mensagem aponta exatamente qual
-- verificação falhou).
--
-- Cobre os cenários exigidos:
--   RLS: usuário A não acessa/altera/exclui dados da empresa B.
--   RBAC: usuário com/sem products.read/create/delete.
--   Proteção dos papéis padrão (admin/operator/viewer).

begin;

create or replace function pg_temp.assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not p_condition then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_company_a uuid;
  v_company_b uuid;
  v_auth_admin_a uuid := gen_random_uuid();
  v_auth_viewer_a uuid := gen_random_uuid();
  v_admin_a public.users;
  v_viewer_a public.users;
  v_viewer_role_id uuid;
  v_product_a uuid;
  v_product_b uuid;
  v_row_count integer;
  v_error_caught boolean;
begin
  -- ---------------------------------------------------------- SETUP
  insert into public.companies (name) values ('[TESTE RLS] Empresa A') returning id into v_company_a;
  insert into public.companies (name) values ('[TESTE RLS] Empresa B') returning id into v_company_b;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token
  ) values
    (v_auth_admin_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'teste-admin-a@educa.local', extensions.crypt('teste', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}', '', ''),
    (v_auth_viewer_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'teste-viewer-a@educa.local', extensions.crypt('teste', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}', '', '');

  v_admin_a := public.bootstrap_admin_user(v_auth_admin_a, v_company_a, 'Admin Teste A', 'teste-admin-a@educa.local');

  insert into public.users (company_id, auth_user_id, name, email, login, status)
  values (v_company_a, v_auth_viewer_a, 'Viewer Teste A', 'teste-viewer-a@educa.local', 'teste-viewer-a', 'active')
  returning * into v_viewer_a;

  select id into v_viewer_role_id from public.roles where company_id = v_company_a and code = 'viewer';
  insert into public.user_companies (user_id, company_id) values (v_viewer_a.id, v_company_a);
  insert into public.user_roles (user_id, company_id, role_id) values (v_viewer_a.id, v_company_a, v_viewer_role_id);

  insert into public.products (company_id, code, name, unit) values (v_company_a, 'TST-A', 'Produto Empresa A', 'UN')
    returning id into v_product_a;
  insert into public.products (company_id, code, name, unit) values (v_company_b, 'TST-B', 'Produto Empresa B', 'UN')
    returning id into v_product_b;

  -- ------------------------------------------------- RBAC: bootstrap
  perform pg_temp.assert(v_admin_a.id is not null, 'bootstrap_admin_user deveria retornar o usuário criado');

  begin
    perform public.bootstrap_admin_user(v_auth_admin_a, v_company_a, 'Outro', 'outro@educa.local');
    v_error_caught := false;
  exception when others then
    v_error_caught := true;
  end;
  perform pg_temp.assert(v_error_caught, 'bootstrap_admin_user deveria falhar quando a empresa já tem admin');

  -- --------------------------------------------- Como ADMIN da empresa A
  set local role authenticated;
  set local request.jwt.claims = concat('{"sub":"', v_auth_admin_a, '"}');

  select count(*) into v_row_count from public.products;
  perform pg_temp.assert(v_row_count = 1, 'admin da empresa A deveria ver exatamente 1 produto (só o da própria empresa)');

  select count(*) into v_row_count from public.products where id = v_product_b;
  perform pg_temp.assert(v_row_count = 0, 'admin da empresa A não pode enxergar produto da empresa B');

  update public.products set name = 'Hackeado' where id = v_product_b;
  get diagnostics v_row_count = row_count;
  perform pg_temp.assert(v_row_count = 0, 'admin da empresa A não pode alterar produto da empresa B (RLS deve bloquear, 0 linhas afetadas)');

  delete from public.products where id = v_product_b;
  get diagnostics v_row_count = row_count;
  perform pg_temp.assert(v_row_count = 0, 'admin da empresa A não pode excluir produto da empresa B (RLS deve bloquear, 0 linhas afetadas)');

  update public.products set name = 'Produto Empresa A (editado)' where id = v_product_a;
  get diagnostics v_row_count = row_count;
  perform pg_temp.assert(v_row_count = 1, 'admin da empresa A deve conseguir editar o próprio produto (products.update)');

  begin
    delete from public.roles where company_id = v_company_a and code = 'admin';
    get diagnostics v_row_count = row_count;
    v_error_caught := (v_row_count > 0);
  exception when others then
    v_error_caught := false; -- RLS nega silenciosamente (0 linhas), não lança erro aqui
  end;
  perform pg_temp.assert(not v_error_caught, 'papel padrão "admin" não pode ser excluído, nem pelo próprio admin (is_system=true)');

  -- ------------------------------------------- Como VIEWER da empresa A
  set local request.jwt.claims = concat('{"sub":"', v_auth_viewer_a, '"}');

  select count(*) into v_row_count from public.products;
  perform pg_temp.assert(v_row_count = 1, 'viewer com products.read deve conseguir consultar produtos da própria empresa');

  begin
    insert into public.products (company_id, code, name, unit) values (v_company_a, 'TST-C', 'Sem permissão', 'UN');
    v_error_caught := false;
  exception when others then
    v_error_caught := true;
  end;
  perform pg_temp.assert(v_error_caught, 'viewer SEM products.create não pode inserir produto (RLS deve rejeitar o INSERT)');

  delete from public.products where id = v_product_a;
  get diagnostics v_row_count = row_count;
  perform pg_temp.assert(v_row_count = 0, 'viewer SEM products.delete não pode excluir produto (0 linhas afetadas)');

  reset role;
  reset request.jwt.claims;

  raise notice 'TODAS AS VERIFICAÇÕES DE RLS/RBAC PASSARAM';
end;
$$;

rollback;
