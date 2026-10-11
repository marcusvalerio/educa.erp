-- CONTENÇÃO EMERGENCIAL — exposições multiempresa (ATLAS.ERP)
-- NÃO EXECUTAR sem autorização explícita. Plano e verificações:
-- docs/homologacao/PLANO-PRODUCAO-E-ROLLBACK.md
--
-- Fecha somente o que foi comprovado:
--   E1  policy units_select_authenticated USING (true): leitura de unidades e
--       dos ids de todas as empresas por qualquer usuário autenticado;
--   E2  views v_cash_flow_summary, v_cash_flow_projection, inventory_valuation
--       e v_sales_order_item_margin: rodam com os direitos do dono (bypass de
--       RLS) e têm SELECT para anon → totais de todas as empresas sem login;
--   E3  fn_resolve_applicable_tax_rules: SECURITY DEFINER sem checagem,
--       executável por anon/authenticated → regras fiscais de qualquer empresa.
--
-- É um SUBCONJUNTO LITERAL e idempotente das migrations 0091 (§1 e §4) e 0093.
-- Aplicar depois a sequência completa (0076…0093) não conflita: os mesmos
-- comandos rodam de novo sem efeito. Não cria permissões, não muda papéis,
-- não toca dados.
--
-- Tudo numa transação: se qualquer pré-condição ou verificação falhar, nada
-- é aplicado.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ------------------------------------------------------------------ pré-condições
do $$
begin
  if to_regclass('public.units') is null
     or to_regclass('public.v_cash_flow_summary') is null
     or to_regclass('public.v_cash_flow_projection') is null
     or to_regclass('public.inventory_valuation') is null
     or to_regclass('public.v_sales_order_item_margin') is null
     or to_regprocedure('public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)') is null then
    raise exception 'Contenção: objeto esperado ausente — schema diferente do previsto. Nada foi aplicado.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select' and pg_get_expr(polqual, polrelid) like '%has_permission(company_id%') then
    raise exception 'Contenção: units_select (has_permission) não encontrada — remover a policy aberta deixaria units sem leitura por RLS prevista. Nada foi aplicado.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.units'::regclass) then
    raise exception 'Contenção: RLS desligado em units. Nada foi aplicado.';
  end if;
end;
$$;

-- ------------------------------------------------------------------ E1 (0091 §1)
drop policy if exists units_select_authenticated on public.units;

-- ------------------------------------------------------------------ E2 (0091 §4)
alter view public.v_cash_flow_summary set (security_invoker = true);
alter view public.v_cash_flow_projection set (security_invoker = true);
alter view public.inventory_valuation set (security_invoker = true);
alter view public.v_sales_order_item_margin set (security_invoker = true);
revoke all on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin from anon;

-- ------------------------------------------------------------------ E3 (0093)
revoke all on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  from public, anon, authenticated;

-- ------------------------------------------------------------------ verificação (aborta se falhar)
do $$
declare
  v_bad text;
begin
  if exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and pg_get_expr(polqual, polrelid) = 'true') then
    raise exception 'Contenção: ainda há policy USING (true) em units.';
  end if;
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
    and (has_table_privilege('anon', c.oid, 'SELECT') or coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%');
  if v_bad is not null then
    raise exception 'Contenção: views ainda expostas: %', v_bad;
  end if;
  if has_function_privilege('anon', 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)', 'execute')
     or has_function_privilege('authenticated', 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)', 'execute') then
    raise exception 'Contenção: fn_resolve_applicable_tax_rules ainda executável por anon/authenticated.';
  end if;
end;
$$;

commit;
