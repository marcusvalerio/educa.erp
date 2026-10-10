-- =====================================================================
-- 0090 — Painéis Fiscal, Estoque e Produção sem ambiguidade de nomes
-- =====================================================================
-- fn_report_fiscal, fn_report_inventory e fn_report_production (0048) são
-- RETURNS TABLE com colunas de saída de mesmo nome que colunas das tabelas
-- lidas (taxes_amount, total_value, produced_quantity). Em PL/pgSQL as
-- colunas de saída são variáveis; com plpgsql.variable_conflict = error (o
-- padrão), toda chamada falha com 'column reference "…" is ambiguous' e o
-- painel mostra "Tente novamente". Reproduzido em banco descartável
-- reconstruído pelo plano equivalente à produção.
--
-- Correção: todas as referências a colunas passam a ser qualificadas pelo
-- alias da tabela. Nada muda além disso: mesma assinatura, mesmos nomes e
-- tipos de saída (os que a API e as telas leem), mesmos filtros por empresa e
-- período, mesmos cálculos, mesma checagem de permissão e SECURITY DEFINER.
-- (Preferido à diretiva #variable_conflict use_column da proposta anterior:
-- explícito e independente de configuração.)
-- =====================================================================

create or replace function public.fn_report_fiscal(p_company_id uuid, p_period_start date, p_period_end date)
returns table (
  documents_count integer, entradas_count integer, saidas_count integer, authorized_count integer,
  rejected_count integer, cancelled_count integer, pending_count integer, taxes_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'fiscal_reports.view') then
    raise exception 'Permissão negada (fiscal_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.direction = 'ENTRADA' and fd.issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.direction = 'SAIDA' and fd.issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.status = 'AUTHORIZED' and fd.issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.status in ('REJECTED', 'DENIED') and fd.issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.status = 'CANCELLED' and fd.issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents fd where fd.company_id = p_company_id and fd.status in ('DRAFT', 'CALCULATED', 'READY') and fd.issue_date between p_period_start and p_period_end),
    (select coalesce(sum(fd.taxes_amount), 0) from public.fiscal_documents fd where fd.company_id = p_company_id and fd.status = 'AUTHORIZED' and fd.issue_date between p_period_start and p_period_end);
end;
$$;

create or replace function public.fn_report_inventory(p_company_id uuid, p_period_start date, p_period_end date)
returns table (
  total_quantity numeric, total_value numeric, receipts_count integer, issues_count integer,
  transfers_count integer, adjustments_count integer, reservations_active integer, products_without_movement integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'inventory_reports.view') then
    raise exception 'Permissão negada (inventory_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select coalesce(sum(iv.quantity), 0) from public.inventory_valuation iv where iv.company_id = p_company_id),
    (select coalesce(sum(iv.total_value), 0) from public.inventory_valuation iv where iv.company_id = p_company_id),
    (select count(*)::integer from public.stock_movements sm where sm.company_id = p_company_id and sm.movement_type = 'RECEIPT' and sm.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_movements sm where sm.company_id = p_company_id and sm.movement_type = 'ISSUE' and sm.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_movements sm where sm.company_id = p_company_id and sm.movement_type in ('TRANSFER_OUT', 'TRANSFER_IN') and sm.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_movements sm where sm.company_id = p_company_id and sm.movement_type in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') and sm.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_reservations sr where sr.company_id = p_company_id and sr.status = 'active'),
    (select count(*)::integer from public.stock_balances sb
      where sb.company_id = p_company_id and sb.on_hand > 0
        and not exists (
          select 1 from public.stock_movements sm
          where sm.company_id = sb.company_id and sm.product_id = sb.product_id and sm.movement_type = 'ISSUE'
            and sm.created_at::date between p_period_start and p_period_end
        ));
end;
$$;

create or replace function public.fn_report_production(p_company_id uuid, p_period_start date, p_period_end date)
returns table (
  orders_count integer, open_orders integer, in_progress_orders integer, completed_orders integer,
  cancelled_orders integer, produced_quantity numeric, consumed_material_cost numeric, scrap_quantity numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'production_reports.view') then
    raise exception 'Permissão negada (production_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.production_orders po where po.company_id = p_company_id and po.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders po where po.company_id = p_company_id and po.status in ('draft', 'planned', 'released', 'materials_reserved') and po.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders po where po.company_id = p_company_id and po.status = 'in_progress' and po.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders po where po.company_id = p_company_id and po.status = 'completed' and po.created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders po where po.company_id = p_company_id and po.status = 'cancelled' and po.created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(po.produced_quantity), 0) from public.production_orders po where po.company_id = p_company_id and po.created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(po.material_cost), 0) from public.production_orders po where po.company_id = p_company_id and po.created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(ps.quantity), 0) from public.production_scrap ps where ps.company_id = p_company_id and ps.occurred_at::date between p_period_start and p_period_end);
end;
$$;
