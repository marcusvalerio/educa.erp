-- =====================================================================
-- PROPOSTA (NÃO APLICADA) — painéis Fiscal, Estoque e Produção
-- =====================================================================
-- fn_report_fiscal, fn_report_inventory e fn_report_production são
-- RETURNS TABLE e as colunas de saída têm o mesmo nome de colunas das
-- tabelas lidas (taxes_amount, total_value, produced_quantity). Com
-- plpgsql.variable_conflict = error (padrão; é o valor em produção,
-- consultado em 10/10/2026), cada chamada falha com
-- "column reference ... is ambiguous" e o painel mostra "Tente novamente".
-- Os corpos destas funções em produção têm o mesmo md5 do repositório.
--
-- Correção mínima, sem mudar a lógica: a diretiva #variable_conflict
-- use_column, que manda o PL/pgSQL resolver o nome ambíguo pela coluna da
-- tabela (o que a consulta quis dizer). Validada numa cópia descartável do
-- banco reconstruído pelo plano: as três funções passam a responder.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_report_fiscal(p_company_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(documents_count integer, entradas_count integer, saidas_count integer, authorized_count integer, rejected_count integer, cancelled_count integer, pending_count integer, taxes_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  if not public.has_permission(p_company_id, 'fiscal_reports.view') then
    raise exception 'Permissão negada (fiscal_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and direction = 'ENTRADA' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and direction = 'SAIDA' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status = 'AUTHORIZED' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status in ('REJECTED', 'DENIED') and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status = 'CANCELLED' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status in ('DRAFT', 'CALCULATED', 'READY') and issue_date between p_period_start and p_period_end),
    (select coalesce(sum(taxes_amount), 0) from public.fiscal_documents where company_id = p_company_id and status = 'AUTHORIZED' and issue_date between p_period_start and p_period_end);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_report_inventory(p_company_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(total_quantity numeric, total_value numeric, receipts_count integer, issues_count integer, transfers_count integer, adjustments_count integer, reservations_active integer, products_without_movement integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  if not public.has_permission(p_company_id, 'inventory_reports.view') then
    raise exception 'Permissão negada (inventory_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select coalesce(sum(quantity), 0) from public.inventory_valuation where company_id = p_company_id),
    (select coalesce(sum(total_value), 0) from public.inventory_valuation where company_id = p_company_id),
    (select count(*)::integer from public.stock_movements where company_id = p_company_id and movement_type = 'RECEIPT' and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_movements where company_id = p_company_id and movement_type = 'ISSUE' and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_movements where company_id = p_company_id and movement_type in ('TRANSFER_OUT', 'TRANSFER_IN') and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_movements where company_id = p_company_id and movement_type in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.stock_reservations where company_id = p_company_id and status = 'active'),
    (select count(*)::integer from public.stock_balances sb
      where sb.company_id = p_company_id and sb.on_hand > 0
        and not exists (
          select 1 from public.stock_movements sm
          where sm.company_id = sb.company_id and sm.product_id = sb.product_id and sm.movement_type = 'ISSUE'
            and sm.created_at::date between p_period_start and p_period_end
        ));
end;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_report_production(p_company_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(orders_count integer, open_orders integer, in_progress_orders integer, completed_orders integer, cancelled_orders integer, produced_quantity numeric, consumed_material_cost numeric, scrap_quantity numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  if not public.has_permission(p_company_id, 'production_reports.view') then
    raise exception 'Permissão negada (production_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.production_orders where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status in ('draft', 'planned', 'released', 'materials_reserved') and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status = 'in_progress' and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status = 'completed' and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status = 'cancelled' and created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(produced_quantity), 0) from public.production_orders where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(material_cost), 0) from public.production_orders where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(quantity), 0) from public.production_scrap where company_id = p_company_id and occurred_at::date between p_period_start and p_period_end);
end;
$function$

;

