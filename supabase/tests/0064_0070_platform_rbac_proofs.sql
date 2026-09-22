-- Provas comportamentais da Fase 23 (migrations 0064-0070):
-- plataforma, multi-tenant, RBAC, módulos, multi-unidade, auditoria,
-- contexto de dashboard e o hardening de congelamento (0070).
--
-- COMO RODAR: execute o arquivo inteiro contra o banco (psql ou SQL
-- Editor). Ele cria duas empresas, membros de plataforma, unidades,
-- setores, cargos e usuários; roda as asserções; e TERMINA COM
-- 'raise exception', o que faz ROLLBACK de tudo. Nada é persistido —
-- o relatório volta na mensagem de erro (ROLLBACK_PROPOSITAL).
--
-- Por que asserções em SQL e não em TypeScript: o que está sendo provado
-- aqui (RLS, has_permission, gate de módulo, isolamento entre empresas)
-- é comportamento do Postgres. Um teste que rodasse fora do banco só
-- conseguiria testar um mock — e mock nenhum prova isolamento de tenant.
--
-- Última execução (Supabase bshvfsxapwwfntowdxyr): 29/29 OK.

do $$
declare
  r text := E'\n===PROVAS FASE 23===\n';
  cA uuid; cB uuid;
  ao uuid := gen_random_uuid();   -- auth: platform owner
  ap uuid := gen_random_uuid();   -- auth: platform admin
  aa uuid := gen_random_uuid();   -- auth: company admin A
  al uuid := gen_random_uuid();   -- auth: usuário logística A
  ab uuid := gen_random_uuid();   -- auth: company admin B
  uA uuid; uL uuid; uB uuid;
  rA uuid; rB uuid; rC uuid;
  bM uuid; bR uuid; bS uuid;
  dL uuid; pS uuid; prj uuid;
  n int; n2 int;
begin
  -- ---------------- SETUP ----------------
  insert into auth.users (id) values (ao),(ap),(aa),(al),(ab);

  insert into public.companies (name, status) values ('Empresa Teste A','active') returning id into cA;
  insert into public.companies (name, status) values ('Empresa Teste B','active') returning id into cB;

  select id into rA from public.roles where company_id=cA and code='admin';
  select id into rB from public.roles where company_id=cB and code='admin';

  insert into public.users (company_id, code, auth_user_id, name, email, login, status)
    values (cA,'TA1',aa,'Admin A','admin@a.test','admina','active') returning id into uA;
  insert into public.users (company_id, code, auth_user_id, name, email, login, status)
    values (cA,'TA2',al,'Log A','log@a.test','loga','active') returning id into uL;
  insert into public.users (company_id, code, auth_user_id, name, email, login, status)
    values (cB,'TB1',ab,'Admin B','admin@b.test','adminb','active') returning id into uB;

  insert into public.user_roles (user_id, role_id) values (uA,rA),(uB,rB);

  insert into public.platform_members (auth_user_id,name,email,platform_role,status)
    values (ao,'Owner','owner@plat.test','OWNER','active'),
           (ap,'PAdmin','padmin@plat.test','ADMIN','active');

  insert into public.branches (company_id, code, name, status) values (cA,'MATRIZ','Matriz','active') returning id into bM;
  insert into public.branches (company_id, code, name, status) values (cA,'RJ','Filial RJ','active') returning id into bR;
  insert into public.branches (company_id, code, name, status) values (cA,'SP','Filial SP','active') returning id into bS;

  insert into public.departments (company_id, code, name) values (cA,'LOGISTICA','Logística') returning id into dL;
  insert into public.departments (company_id, code, name) values (cB,'LOGISTICA','Logística');
  insert into public.positions (company_id, code, name) values (cA,'SUPERVISOR','Supervisor') returning id into pS;

  -- ---------------- PLATFORM OWNER ----------------
  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  r := r || 'T01 owner administra plataforma: ' ||
    case when public.is_platform_owner()
         and public.has_platform_permission('platform.companies.lifecycle')
         and public.has_platform_permission('platform.settings.manage') then 'OK' else 'FAIL' end || E'\n';
  r := r || 'T02 owner SEM acesso a tenant: ' ||
    case when public.has_permission(cA,'products.read')=false
         and public.has_permission(cA,'roles.manage')=false
         and public.fn_user_context(cA) is null then 'OK' else 'FAIL' end || E'\n';

  -- ---------------- PLATFORM ADMIN ----------------
  perform set_config('request.jwt.claims', json_build_object('sub',ap)::text, true);
  r := r || 'T03 admin plataforma: pode o operacional, nao o owner_only: ' ||
    case when public.has_platform_permission('platform.company_modules.manage')
         and public.has_platform_permission('platform.settings.manage')=false then 'OK' else 'FAIL' end || E'\n';
  r := r || 'T04 admin plataforma nao atravessa tenant: ' ||
    case when public.has_permission(cA,'sales_orders.view')=false
         and public.has_permission(cB,'sales_orders.view')=false then 'OK' else 'FAIL' end || E'\n';

  -- ---------------- COMPANY ADMIN ----------------
  perform set_config('request.jwt.claims', json_build_object('sub',aa)::text, true);
  r := r || 'T05 company admin A administra A: ' ||
    case when public.has_permission(cA,'roles.manage') and public.has_permission(cA,'users.create') then 'OK' else 'FAIL' end || E'\n';
  r := r || 'T06 company admin A nao administra B: ' ||
    case when public.has_permission(cB,'roles.manage')=false and public.has_permission(cB,'users.create')=false then 'OK' else 'FAIL' end || E'\n';

  -- ---------------- PAPEL PERSONALIZADO + GRANULARIDADE ----------------
  rC := (public.fn_create_company_role(cA,'LOG_SUP','Supervisor de Logística','papel custom',dL)).id;
  perform public.fn_set_role_permissions(rC, array['branches.read','shipments.view','deliveries.view','sales_orders.view']);
  perform public.fn_assign_user_role(uL, rC);
  perform public.fn_set_user_org_context(uL, bR, dL, pS);
  perform public.fn_grant_user_branch_access(uL, bR, true);
  perform public.fn_grant_user_branch_access(uL, bS, false);

  perform set_config('request.jwt.claims', json_build_object('sub',al)::text, true);
  r := r || 'T08 papel personalizado funciona: ' ||
    case when public.has_permission(cA,'shipments.view') and public.has_permission(cA,'deliveries.view') then 'OK' else 'FAIL' end || E'\n';
  r := r || 'T09 permissao granular (view sim, create nao): ' ||
    case when public.has_permission(cA,'sales_orders.view')
         and public.has_permission(cA,'sales_orders.create')=false
         and public.has_permission(cA,'accounts_payable.view')=false then 'OK' else 'FAIL' end || E'\n';

  -- ---------------- MODULE ENABLEMENT ----------------
  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  perform public.fn_platform_set_company_module(cA,'comercial',false,'teste');
  perform set_config('request.jwt.claims', json_build_object('sub',al)::text, true);
  n := case when public.has_permission(cA,'sales_orders.view') then 1 else 0 end;
  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  perform public.fn_platform_set_company_module(cA,'comercial',true,'teste');
  perform set_config('request.jwt.claims', json_build_object('sub',al)::text, true);
  n2 := case when public.has_permission(cA,'sales_orders.view') then 1 else 0 end;
  r := r || 'T10 modulo desabilitado bloqueia apesar do grant: ' ||
    case when n=0 and n2=1 then 'OK' else 'FAIL(off='||n||',on='||n2||')' end || E'\n';

  -- ---------------- CICLO DE VIDA DA EMPRESA ----------------
  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  perform public.fn_platform_set_company_lifecycle(cA,'SUSPENDED','teste');
  perform set_config('request.jwt.claims', json_build_object('sub',aa)::text, true);
  n := case when public.has_permission(cA,'roles.manage') then 1 else 0 end;
  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  perform public.fn_platform_set_company_lifecycle(cA,'ACTIVE','teste');
  perform set_config('request.jwt.claims', json_build_object('sub',aa)::text, true);
  n2 := case when public.has_permission(cA,'roles.manage') then 1 else 0 end;
  r := r || 'T16 empresa suspensa derruba o tenant e reativar restaura: ' ||
    case when n=0 and n2=1 then 'OK' else 'FAIL(susp='||n||',ativa='||n2||')' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',al)::text, true);

  -- ---------------- MULTI-UNIDADE ----------------
  r := r || 'T11 unidade restrita (funcao): ' ||
    case when public.fn_user_has_branch_access(cA,bR)
         and public.fn_user_has_branch_access(cA,bS)
         and public.fn_user_has_branch_access(cA,bM)=false then 'OK' else 'FAIL' end || E'\n';
  select count(*) into n from public.fn_user_branch_ids(cA);
  r := r || 'T12 multiplas unidades, somente autorizadas: ' ||
    case when n=2 then 'OK' else 'FAIL(n='||n||')' end || E'\n';

  -- ---------------- AUDITORIA ----------------
  select count(*) into n from public.audit_logs
   where company_id=cA and entity in ('roles','user_roles','users','user_branch_access')
     and action in ('CREATE','GRANT','ASSIGN');
  select count(*) into n2 from public.audit_logs
   where company_id is null and entity='company_modules' and action in ('ENABLE','DISABLE');
  r := r || 'T13 auditoria administrativa (tenant + plataforma): ' ||
    case when n>=4 and n2>=2 then 'OK' else 'FAIL(tenant='||n||',plat='||n2||')' end || E'\n';

  -- ---------------- DASHBOARD CONTEXT ----------------
  select count(*) into n from public.fn_dashboard_context(cA);
  select count(*) into n2 from public.fn_dashboard_context(cA)
   where focus_code in ('finance.payables','executive.margin');
  r := r || 'T14 dashboard context nao concede privilegio: ' ||
    case when n>0 and n2=0
         and (select bool_and(public.has_permission(cA, fa.required_permission))
              from public.fn_dashboard_context(cA) dc
              join public.dashboard_focus_areas fa on fa.code=dc.focus_code
              where fa.required_permission is not null) then 'OK' else 'FAIL(n='||n||',leak='||n2||')' end || E'\n';

  -- ---------------- RLS REAL (role authenticated) ----------------
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims', json_build_object('sub',aa)::text, true);
  select count(*) into n from public.departments where company_id=cB;
  select count(*) into n2 from public.departments where company_id=cA;
  r := r || 'T07 usuario A nao ve dados de B (RLS): ' ||
    case when n=0 and n2>=1 then 'OK' else 'FAIL(B='||n||',A='||n2||')' end || E'\n';

  select count(*) into n from public.warehouses where company_id=cB;
  select count(*) into n2 from public.platform_members;
  r := r || 'T15 RLS direto na tabela (warehouses de B / platform_members): ' ||
    case when n=0 and n2=0 then 'OK' else 'FAIL(wh='||n||',pm='||n2||')' end || E'\n';

  select count(*) into n from public.branches where company_id=cA;
  r := r || 'T11c admin com branches.manage ve todas as unidades: ' ||
    case when n=3 then 'OK' else 'FAIL(n='||n||')' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',al)::text, true);
  select count(*) into n from public.branches where company_id=cA;
  select count(*) into n2 from public.branches where company_id=cA and id=bM;
  r := r || 'T11b RLS branches: usuario ve so as unidades autorizadas: ' ||
    case when n=2 and n2=0 then 'OK' else 'FAIL(total='||n||',matriz='||n2||')' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  select count(*) into n from public.departments;
  select count(*) into n2 from public.warehouses;
  r := r || 'T02b owner nao le dados operacionais via RLS: ' ||
    case when n=0 and n2=0 then 'OK' else 'FAIL(dep='||n||',wh='||n2||')' end || E'\n';

  -- ================= 0070: HARDENING DO CONGELAMENTO =================
  -- Continua como role authenticated (RLS e privilégios reais).

  -- T17: funções internas não são executáveis por usuário autenticado.
  perform set_config('request.jwt.claims', json_build_object('sub',aa)::text, true);
  begin
    perform public.bootstrap_platform_owner(aa, 'Intruso', 'intruso@a.test');
    n := 1;
  exception when others then
    n := case when sqlerrm like 'permission denied for function%' then 0 else 2 end;
  end;
  select count(*) into n2 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('bootstrap_platform_owner','fn_log_platform_audit','fn_post_stock_movement',
                       'fn_post_financial_transaction','fn_register_cost_movement',
                       'fn_release_sales_order_reservations_internal','fn_seed_company_units',
                       'fn_materialize_workflow_instance_step')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  r := r || 'T17 funcoes internas/bootstrap fora do alcance do authenticated: ' ||
    case when n=0 and n2=0 then 'OK' else 'FAIL(call='||n||',exec='||n2||')' end || E'\n';

  -- T18: último admin não perde o papel (função E DML direto).
  begin
    perform public.fn_revoke_user_role(uA, rA);
    n := 1;
  exception when others then n := 0;
  end;
  begin
    delete from public.user_roles where user_id = uA and role_id = rA;
  exception when others then null;
  end;
  select count(*) into n2 from public.user_roles where user_id = uA and role_id = rA;
  r := r || 'T18 ultimo admin nao perde o papel (funcao + DML): ' ||
    case when n=0 and n2=1 then 'OK' else 'FAIL(fn='||n||',ainda='||n2||')' end || E'\n';

  -- T19: permissões do papel admin de sistema não são removíveis por DML.
  select count(*) into n from public.role_permissions where role_id = rA;
  begin
    delete from public.role_permissions where role_id = rA;
  exception when others then null;
  end;
  select count(*) into n2 from public.role_permissions where role_id = rA;
  r := r || 'T19 admin nao remove as proprias permissoes (DML direto): ' ||
    case when n>0 and n2=n then 'OK' else 'FAIL(antes='||n||',depois='||n2||')' end || E'\n';

  -- T20: papel admin de sistema não é desativado nem renomeado.
  n := 0;
  begin
    update public.roles set status = 'inactive' where id = rA;
  exception when others then n := n + 1;
  end;
  begin
    update public.roles set code = 'admin_x' where id = rA;
  exception when others then n := n + 1;
  end;
  select count(*) into n2 from public.roles where id = rA and code = 'admin' and status = 'active';
  r := r || 'T20 papel admin de sistema imutavel (status/codigo): ' ||
    case when n=2 and n2=1 then 'OK' else 'FAIL(bloqueios='||n||',intacto='||n2||')' end || E'\n';

  -- T21: último admin não pode ser inativado nem excluído.
  n := 0;
  begin
    update public.users set status = 'inactive' where id = uA;
  exception when others then n := n + 1;
  end;
  begin
    delete from public.users where id = uA;
  exception when others then n := n + 1;
  end;
  select count(*) into n2 from public.users where id = uA and status = 'active';
  r := r || 'T21 ultimo admin nao e inativado/excluido: ' ||
    case when n=2 and n2=1 then 'OK' else 'FAIL(bloqueios='||n||',ativo='||n2||')' end || E'\n';

  -- T22: cliente não cria papel de sistema.
  begin
    insert into public.roles (company_id, code, name, is_system, status)
      values (cA, 'fake_sys', 'Falso sistema', true, 'active');
    n := 1;
  exception when others then n := 0;
  end;
  r := r || 'T22 cliente nao cria papel is_system: ' ||
    case when n=0 then 'OK' else 'FAIL' end || E'\n';

  -- T25: resumo de custos de projeto respeita empresa e permissão.
  execute 'reset role';
  insert into public.projects (company_id, code, name) values (cA, 'PRJ-T', 'Projeto Teste') returning id into prj;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',ab)::text, true);
  begin
    perform public.fn_project_service_cost_summary('project', prj);
    n := 1;
  exception when insufficient_privilege then n := 0;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub',aa)::text, true);
  select count(*) into n2 from public.fn_project_service_cost_summary('project', prj) where total_cost = 0;
  r := r || 'T25 custo de projeto: admin B negado, admin A le: ' ||
    case when n=0 and n2=1 then 'OK' else 'FAIL(B='||n||',A='||n2||')' end || E'\n';

  -- T23: com um segundo admin, a revogação volta a ser permitida.
  perform public.fn_assign_user_role(uL, rA);
  begin
    perform public.fn_revoke_user_role(uA, rA);
    n := 1;
  exception when others then n := 0;
  end;
  execute 'reset role';
  n2 := public.fn_count_active_company_admins(cA);
  r := r || 'T23 guarda nao e excessiva (com 2 admins, revoga um): ' ||
    case when n=1 and n2=1 then 'OK' else 'FAIL(revogou='||n||',admins='||n2||')' end || E'\n';

  -- T24: plataforma — ADMIN não cria OWNER; último OWNER não cai.
  n := 0;
  perform set_config('request.jwt.claims', json_build_object('sub',ap)::text, true);
  begin
    perform public.fn_upsert_platform_member(aa, 'Novo Owner', 'novo@plat.test', 'OWNER');
  exception when others then n := n + 1;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub',ao)::text, true);
  begin
    perform public.fn_upsert_platform_member(ao, 'Owner', 'owner@plat.test', 'ADMIN');
  exception when others then n := n + 1;
  end;
  begin
    update public.platform_members set status = 'inactive' where auth_user_id = ao;
  exception when others then n := n + 1;
  end;
  select count(*) into n2 from public.platform_members
   where auth_user_id = ao and platform_role = 'OWNER' and status = 'active';
  r := r || 'T24 ADMIN nao cria OWNER; ultimo OWNER protegido (funcao + DML): ' ||
    case when n=3 and n2=1 then 'OK' else 'FAIL(bloqueios='||n||',owner='||n2||')' end || E'\n';

  -- T26: as guardas não bloqueiam a exclusão de uma empresa inteira.
  begin
    delete from public.companies where id = cB;
    n := 1;
  exception when others then n := 0;
  end;
  select count(*) into n2 from public.users where company_id = cB;
  r := r || 'T26 cascata de empresa passa pelas guardas: ' ||
    case when n=1 and n2=0 then 'OK' else 'FAIL(del='||n||',users='||n2||')' end || E'\n';

  raise exception 'ROLLBACK_PROPOSITAL %', r;
end;
$$;
