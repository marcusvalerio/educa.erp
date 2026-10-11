-- ROLLBACK da contenção emergencial (contencao-emergencial.sql).
-- ATENÇÃO: REABRE as exposições E1, E2 e E3. Usar só se a contenção quebrar
-- uma função legítima que não possa esperar correção, e por tempo mínimo.
-- Plano: docs/homologacao/PLANO-PRODUCAO-E-ROLLBACK.md (seção Rollback).
--
-- Restaura exatamente o estado anterior observado em produção (catálogo lido
-- em 10–11/10/2026): policy units_select_authenticated TO authenticated USING
-- (true); views sem security_invoker; SELECT de anon nas 4 views; EXECUTE de
-- anon e authenticated em fn_resolve_applicable_tax_rules.
-- Não há dados envolvidos: o rollback é completo e imediato.

begin;

do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select_authenticated') then
    create policy units_select_authenticated on public.units for select to authenticated using (true);
  end if;
end;
$$;

alter view public.v_cash_flow_summary reset (security_invoker);
alter view public.v_cash_flow_projection reset (security_invoker);
alter view public.inventory_valuation reset (security_invoker);
alter view public.v_sales_order_item_margin reset (security_invoker);
grant select on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin to anon;

grant execute on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  to anon, authenticated;

commit;
