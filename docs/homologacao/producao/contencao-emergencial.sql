-- CONTENÇÃO EMERGENCIAL — exposições multiempresa (ATLAS.ERP) — v2
-- NÃO EXECUTAR sem autorização explícita. Plano e verificações:
-- docs/homologacao/PLANO-PRODUCAO-E-ROLLBACK.md (parte A)
--
-- Alvo ÚNICO: projeto Supabase bshvfsxapwwfntowdxyr (educa.erp), banco
-- "postgres", system_identifier 7678069749886157684 (lido em 12/10/2026 com
-- pg_control_system()). Em qualquer outro banco o script aborta sem alterar nada.
--
-- Fecha somente o que foi comprovado:
--   E1  policy units_select_authenticated USING (true): leitura de unidades e
--       dos ids de todas as empresas por qualquer usuário autenticado;
--   E2  views v_cash_flow_summary, v_cash_flow_projection, inventory_valuation
--       e v_sales_order_item_margin: rodam com os direitos do dono (bypass de
--       RLS) e concedem TODOS os privilégios a anon e authenticated → totais
--       de todas as empresas sem login;
--   E3  fn_resolve_applicable_tax_rules: SECURITY DEFINER sem checagem,
--       executável por anon/authenticated/service_role → regras fiscais de
--       qualquer empresa.
--
-- É um SUBCONJUNTO LITERAL e idempotente das migrations 0091 (§1 e §4), 0093 e
-- 0094. Aplicar depois a sequência completa (0076…0094) não conflita: os mesmos
-- comandos rodam de novo sem efeito. Não cria permissões, não muda papéis, não
-- toca dados, não altera definição de view, policy restante ou função.
--
-- Concessões em produção são DIRETAS a anon/authenticated/service_role (não há
-- entrada PUBLIC): por isso cada REVOKE nomeia os papéis, e a verificação final
-- confere os privilégios efetivos (has_*_privilege, que segue herança de papéis
-- e PUBLIC) e a ACL crua (aclexplode).
--
-- Tudo numa transação: se qualquer pré-condição ou verificação falhar, nada
-- é aplicado.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ------------------------------------------------------------------ pré-condições
do $$
declare
  v_fn regprocedure := to_regprocedure('public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)');
  v_bad text;
begin
  -- Identificação inequívoca do banco (não depende de nome nem de URL).
  if (select system_identifier from pg_control_system()) <> 7678069749886157684
     or current_database() <> 'postgres' then
    raise exception 'Contenção: banco não é o de produção esperado (system_identifier/current_database). Nada foi aplicado.';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20260929165645') then
    raise exception 'Contenção: ledger sem 20260929165645 (0075_company_roles_and_user_invites). Nada foi aplicado.';
  end if;

  if to_regclass('public.units') is null
     or to_regclass('public.v_cash_flow_summary') is null
     or to_regclass('public.v_cash_flow_projection') is null
     or to_regclass('public.inventory_valuation') is null
     or to_regclass('public.v_sales_order_item_margin') is null
     or v_fn is null then
    raise exception 'Contenção: objeto esperado ausente — schema diferente do previsto. Nada foi aplicado.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select' and pg_get_expr(polqual, polrelid) like '%has_permission(company_id%') then
    raise exception 'Contenção: units_select (has_permission) não encontrada — remover a policy aberta deixaria units sem leitura por RLS prevista. Nada foi aplicado.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.units'::regclass) then
    raise exception 'Contenção: RLS desligado em units. Nada foi aplicado.';
  end if;
  -- O app lê as views com service_role (cliente administrativo).
  if not (select rolbypassrls from pg_roles where rolname = 'service_role')
     or not has_table_privilege('service_role', 'public.v_cash_flow_summary', 'SELECT')
     or not has_table_privilege('service_role', 'public.v_cash_flow_projection', 'SELECT')
     or not has_table_privilege('service_role', 'public.inventory_valuation', 'SELECT')
     or not has_table_privilege('service_role', 'public.v_sales_order_item_margin', 'SELECT') then
    raise exception 'Contenção: service_role sem SELECT/BYPASSRLS nas views — o app quebraria. Nada foi aplicado.';
  end if;
  -- Quem chama a função de regras fiscais precisa continuar podendo: só se
  -- aceita chamadora SECURITY DEFINER cujo dono tenha EXECUTE próprio (dono).
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
  from pg_proc p
  where p.oid <> v_fn and p.prosrc like '%fn_resolve_applicable_tax_rules%'
    and not (p.prosecdef and p.proowner = (select proowner from pg_proc where oid = v_fn));
  if v_bad is not null then
    raise exception 'Contenção: chamadora(s) de fn_resolve_applicable_tax_rules que perderiam acesso: %. Nada foi aplicado.', v_bad;
  end if;
end;
$$;

-- ------------------------------------------------------------------ E1 (0091 §1)
drop policy if exists units_select_authenticated on public.units;

-- ------------------------------------------------------------------ E2 (0091 §4 + 0094)
alter view public.v_cash_flow_summary set (security_invoker = true);
alter view public.v_cash_flow_projection set (security_invoker = true);
alter view public.inventory_valuation set (security_invoker = true);
alter view public.v_sales_order_item_margin set (security_invoker = true);
revoke all on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin from anon;
revoke all on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin
  from public, anon, authenticated;

-- ------------------------------------------------------------------ E3 (0093 + 0094)
revoke all on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------ verificação (aborta se falhar)
do $$
declare
  v_fn regprocedure := 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)'::regprocedure;
  v_bad text;
begin
  if exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and pg_get_expr(polqual, polrelid) = 'true') then
    raise exception 'Contenção: ainda há policy USING (true) em units.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select')
     or not (select relrowsecurity from pg_class where oid = 'public.units'::regclass) then
    raise exception 'Contenção: units perdeu units_select ou RLS.';
  end if;

  -- Toda view/matview do schema public: nenhum privilégio efetivo para anon
  -- ou authenticated, nenhuma entrada PUBLIC na ACL, security_invoker ligado.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
    and (exists (select 1 from unnest(array['anon', 'authenticated']) r,
                   unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
                 where has_table_privilege(r, c.oid, p))
         -- ACL crua: entrada PUBLIC (grantee 0) ou qualquer privilégio direto
         -- de anon/authenticated (inclui MAINTAIN do PG17).
         or exists (select 1 from aclexplode(c.relacl) x
                    where x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole))
         or coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%');
  if v_bad is not null then
    raise exception 'Contenção: views ainda expostas: %', v_bad;
  end if;
  if not (has_table_privilege('service_role', 'public.v_cash_flow_summary', 'SELECT')
          and has_table_privilege('service_role', 'public.v_cash_flow_projection', 'SELECT')
          and has_table_privilege('service_role', 'public.inventory_valuation', 'SELECT')
          and has_table_privilege('service_role', 'public.v_sales_order_item_margin', 'SELECT')) then
    raise exception 'Contenção: service_role perdeu SELECT nas views (o app quebraria).';
  end if;

  -- Função: ACL explícita (NULL = EXECUTE para PUBLIC) e só o dono na ACL.
  if (select proacl from pg_proc where oid = v_fn) is null
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) x where p.oid = v_fn and x.grantee <> p.proowner)
     or has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute')
     or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'Contenção: fn_resolve_applicable_tax_rules ainda executável por outro papel além do dono.';
  end if;
end;
$$;

commit;
