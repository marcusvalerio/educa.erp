-- Fase 12 — Relatórios / BI Operacional.
--
-- Nenhuma tabela nova (seção 12.2: "evitar sistema de BI genérico
-- abstrato" — report_definitions não foi criada porque os relatórios
-- desta etapa são um conjunto fixo e conhecido de dashboards, não um
-- catálogo dinâmico configurável; se um catálogo genuinamente surgir
-- no futuro, essa é a hora de criá-lo, não antes). Cada dashboard é
-- uma função parametrizada (company_id + período) que agrega fontes já
-- existentes — nunca fabrica dado (seção 12.1): quando uma fonte não
-- existe (ex.: SLA configurado), a métrica correspondente simplesmente
-- não é criada, não é preenchida com zero fictício.
--
-- Relatórios OPERACIONAIS de lista (pedidos, recebimentos, expedições,
-- documentos fiscais...) já existem como APIs de listagem com filtro
-- desde as fases anteriores (ex.: GET /api/purchase-orders,
-- /api/shipments, /api/fiscal-documents) — não duplicados aqui (seção
-- 12.11 cobre "views para consulta", que já são essas mesmas rotas).
-- Esta migration cobre só os DASHBOARDS agregados (seções 12.3-12.10).

-- ==================================================================
-- fn_report_executive (seção 12.3) — reaproveita fn_controlling_kpis
-- (0047) para a parte financeira; soma indicadores operacionais.
-- ==================================================================
create or replace function public.fn_report_executive(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  gross_revenue numeric,
  net_revenue numeric,
  gross_margin_pct numeric,
  cmv numeric,
  operating_expenses numeric,
  managerial_result numeric,
  accounts_receivable_open numeric,
  accounts_payable_open numeric,
  cash_balance numeric,
  inventory_value numeric,
  open_sales_orders integer,
  open_shipments integer,
  open_production_orders integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kpis record;
  v_inventory_value numeric;
  v_open_sales_orders integer;
  v_open_shipments integer;
  v_open_production_orders integer;
begin
  if not public.has_permission(p_company_id, 'reports.view') then
    raise exception 'Permissão negada (reports.view).' using errcode = '42501';
  end if;

  select * into v_kpis from public.fn_controlling_kpis(p_company_id, p_period_start, p_period_end);

  select coalesce(sum(total_value), 0) into v_inventory_value
  from public.inventory_valuation where company_id = p_company_id;

  select count(*) into v_open_sales_orders from public.sales_orders
  where company_id = p_company_id and status not in ('completed', 'cancelled');

  select count(*) into v_open_shipments from public.shipments
  where company_id = p_company_id and status not in ('completed', 'cancelled');

  select count(*) into v_open_production_orders from public.production_orders
  where company_id = p_company_id and status not in ('completed', 'cancelled');

  return query select
    v_kpis.gross_revenue, v_kpis.net_revenue, v_kpis.gross_margin_pct, v_kpis.cmv, v_kpis.operating_expenses,
    v_kpis.managerial_result, v_kpis.accounts_receivable_open, v_kpis.accounts_payable_open, v_kpis.cash_balance,
    v_inventory_value, v_open_sales_orders, v_open_shipments, v_open_production_orders;
end;
$$;

-- ==================================================================
-- fn_report_commercial (seção 12.4)
-- ==================================================================
create or replace function public.fn_report_commercial(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  orders_count integer,
  orders_amount numeric,
  average_ticket numeric,
  customers_count integer,
  cancelled_orders integer,
  pending_orders integer,
  quote_conversion_pct numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orders_count integer;
  v_orders_amount numeric;
  v_customers_count integer;
  v_cancelled integer;
  v_pending integer;
  v_quotes_total integer;
  v_quotes_approved integer;
begin
  if not public.has_permission(p_company_id, 'commercial_reports.view') then
    raise exception 'Permissão negada (commercial_reports.view).' using errcode = '42501';
  end if;

  select count(*), coalesce(sum(total_amount), 0), count(distinct customer_id)
  into v_orders_count, v_orders_amount, v_customers_count
  from public.sales_orders
  where company_id = p_company_id and status <> 'draft' and order_date between p_period_start and p_period_end;

  select count(*) into v_cancelled from public.sales_orders
  where company_id = p_company_id and status = 'cancelled' and order_date between p_period_start and p_period_end;

  select count(*) into v_pending from public.sales_orders
  where company_id = p_company_id and status in ('draft', 'pending_approval') and order_date between p_period_start and p_period_end;

  select count(*) into v_quotes_total from public.sales_quotes
  where company_id = p_company_id and issued_at between p_period_start and p_period_end;

  select count(*) into v_quotes_approved from public.sales_quotes
  where company_id = p_company_id and status = 'approved' and issued_at between p_period_start and p_period_end;

  return query select
    v_orders_count, v_orders_amount,
    case when v_orders_count > 0 then round(v_orders_amount / v_orders_count, 4) else null end,
    v_customers_count, v_cancelled, v_pending,
    case when v_quotes_total > 0 then round(v_quotes_approved::numeric / v_quotes_total * 100, 2) else null end;
end;
$$;

-- ==================================================================
-- fn_report_inventory (seção 12.5)
-- ==================================================================
create or replace function public.fn_report_inventory(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  total_quantity numeric,
  total_value numeric,
  receipts_count integer,
  issues_count integer,
  transfers_count integer,
  adjustments_count integer,
  reservations_active integer,
  products_without_movement integer
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
$$;

-- ==================================================================
-- fn_report_purchases (seção 12.6)
-- ==================================================================
create or replace function public.fn_report_purchases(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  requests_count integer,
  orders_count integer,
  orders_amount numeric,
  receipts_count integer,
  receipts_amount numeric,
  divergent_receipt_items integer,
  suppliers_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'purchase_reports.view') then
    raise exception 'Permissão negada (purchase_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.purchase_requests where company_id = p_company_id and requested_at between p_period_start and p_period_end),
    (select count(*)::integer from public.purchase_orders where company_id = p_company_id and issued_at between p_period_start and p_period_end),
    (select coalesce(sum(total_amount), 0) from public.purchase_orders where company_id = p_company_id and issued_at between p_period_start and p_period_end),
    (select count(*)::integer from public.purchase_receipts where company_id = p_company_id and received_at::date between p_period_start and p_period_end),
    (select coalesce(sum(ri.accepted_quantity * poi.unit_price), 0)
      from public.purchase_receipt_items ri
      join public.purchase_order_items poi on poi.id = ri.purchase_order_item_id
      join public.purchase_receipts pr on pr.id = ri.receipt_id
      where pr.company_id = p_company_id and ri.accepted_quantity > 0 and pr.received_at::date between p_period_start and p_period_end),
    (select count(*)::integer
      from public.purchase_receipt_items ri
      join public.purchase_receipts pr on pr.id = ri.receipt_id
      where pr.company_id = p_company_id and ri.divergence_type is not null and ri.divergence_type <> 'none'
        and pr.received_at::date between p_period_start and p_period_end),
    (select count(distinct supplier_id)::integer from public.purchase_orders where company_id = p_company_id and issued_at between p_period_start and p_period_end);
end;
$$;

-- ==================================================================
-- fn_report_production (seção 12.7)
-- ==================================================================
create or replace function public.fn_report_production(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  orders_count integer,
  open_orders integer,
  in_progress_orders integer,
  completed_orders integer,
  cancelled_orders integer,
  produced_quantity numeric,
  consumed_material_cost numeric,
  scrap_quantity numeric
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
    (select count(*)::integer from public.production_orders where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status in ('draft', 'planned', 'released', 'materials_reserved') and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status = 'in_progress' and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status = 'completed' and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.production_orders where company_id = p_company_id and status = 'cancelled' and created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(produced_quantity), 0) from public.production_orders where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(material_cost), 0) from public.production_orders where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select coalesce(sum(quantity), 0) from public.production_scrap where company_id = p_company_id and occurred_at::date between p_period_start and p_period_end);
end;
$$;

-- ==================================================================
-- fn_report_logistics (seção 12.8) — average_lead_time_days só
-- considera expedições já expedidas (shipped_at preenchido); nenhum
-- SLA é assumido (seção 12.8: "não inventar SLA se o sistema ainda não
-- possuir SLA configurado").
-- ==================================================================
create or replace function public.fn_report_logistics(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  shipments_count integer,
  shipped_count integer,
  delivered_count integer,
  failed_count integer,
  in_transit_count integer,
  pick_lists_count integer,
  average_lead_time_days numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'logistics_reports.view') then
    raise exception 'Permissão negada (logistics_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.shipments where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.shipments where company_id = p_company_id and status in ('shipped', 'in_transit', 'delivered', 'completed') and created_at::date between p_period_start and p_period_end),
    (select count(distinct shipment_id)::integer from public.delivery_events where company_id = p_company_id and status = 'delivered' and occurred_at::date between p_period_start and p_period_end),
    (select count(distinct shipment_id)::integer from public.delivery_events where company_id = p_company_id and status in ('failed', 'refused', 'absent', 'returned') and occurred_at::date between p_period_start and p_period_end),
    (select count(*)::integer from public.shipments where company_id = p_company_id and status = 'in_transit'),
    (select count(*)::integer from public.pick_lists where company_id = p_company_id and created_at::date between p_period_start and p_period_end),
    (select round(avg(extract(epoch from (shipped_at - created_at)) / 86400)::numeric, 2)
      from public.shipments
      where company_id = p_company_id and shipped_at is not null and created_at::date between p_period_start and p_period_end);
end;
$$;

-- ==================================================================
-- fn_report_finance (seção 12.9) — reaproveita os mesmos totais de
-- v_cash_flow_summary (0035), sem duplicar a consulta em outro lugar.
-- ==================================================================
create or replace function public.fn_report_finance(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  cash_balance numeric,
  accounts_receivable_open numeric,
  accounts_payable_open numeric,
  overdue_receivable numeric,
  overdue_payable numeric,
  received_in_period numeric,
  paid_in_period numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'financial_reports.view') then
    raise exception 'Permissão negada (financial_reports.view).' using errcode = '42501';
  end if;

  return query
  select
    cf.current_balance_total,
    cf.open_receivable_total,
    cf.open_payable_total,
    (select coalesce(sum(amount - received_amount), 0) from public.accounts_receivable_installments where company_id = p_company_id and status = 'OVERDUE'),
    (select coalesce(sum(amount - paid_amount), 0) from public.accounts_payable_installments where company_id = p_company_id and status = 'OVERDUE'),
    (select coalesce(sum(amount), 0) from public.receipts where company_id = p_company_id and status = 'CONFIRMED' and received_at between p_period_start and p_period_end),
    (select coalesce(sum(amount), 0) from public.payments where company_id = p_company_id and status = 'CONFIRMED' and paid_at between p_period_start and p_period_end)
  from public.v_cash_flow_summary cf
  where cf.company_id = p_company_id;
end;
$$;

-- ==================================================================
-- fn_report_fiscal (seção 12.10) — sem apuração fiscal oficial; só
-- contagem/soma do que já está registrado.
-- ==================================================================
create or replace function public.fn_report_fiscal(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  documents_count integer,
  entradas_count integer,
  saidas_count integer,
  authorized_count integer,
  rejected_count integer,
  cancelled_count integer,
  pending_count integer,
  taxes_amount numeric
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
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and direction = 'ENTRADA' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and direction = 'SAIDA' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status = 'AUTHORIZED' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status in ('REJECTED', 'DENIED') and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status = 'CANCELLED' and issue_date between p_period_start and p_period_end),
    (select count(*)::integer from public.fiscal_documents where company_id = p_company_id and status in ('DRAFT', 'CALCULATED', 'READY') and issue_date between p_period_start and p_period_end),
    (select coalesce(sum(taxes_amount), 0) from public.fiscal_documents where company_id = p_company_id and status = 'AUTHORIZED' and issue_date between p_period_start and p_period_end);
end;
$$;

revoke all on function public.fn_report_executive(uuid, date, date) from public;
revoke all on function public.fn_report_commercial(uuid, date, date) from public;
revoke all on function public.fn_report_inventory(uuid, date, date) from public;
revoke all on function public.fn_report_purchases(uuid, date, date) from public;
revoke all on function public.fn_report_production(uuid, date, date) from public;
revoke all on function public.fn_report_logistics(uuid, date, date) from public;
revoke all on function public.fn_report_finance(uuid, date, date) from public;
revoke all on function public.fn_report_fiscal(uuid, date, date) from public;
grant execute on function public.fn_report_executive(uuid, date, date) to authenticated;
grant execute on function public.fn_report_commercial(uuid, date, date) to authenticated;
grant execute on function public.fn_report_inventory(uuid, date, date) to authenticated;
grant execute on function public.fn_report_purchases(uuid, date, date) to authenticated;
grant execute on function public.fn_report_production(uuid, date, date) to authenticated;
grant execute on function public.fn_report_logistics(uuid, date, date) to authenticated;
grant execute on function public.fn_report_finance(uuid, date, date) to authenticated;
grant execute on function public.fn_report_fiscal(uuid, date, date) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('reports.view', 'reports', 'view', 'Consultar o dashboard executivo (cross-módulo)'),
    -- reports.export é seedada (seção 12.17: "as APIs não devem impedir"
    -- exportação futura) mas nenhuma função a usa nesta fase — nenhum
    -- gerador de CSV/XLSX/PDF foi implementado ainda. Mesmo precedente
    -- de payments.cancel (Financeiro, 0034): permissão reservada,
    -- documentada, sem workflow inventado só para preenchê-la.
    ('reports.export', 'reports', 'export', 'Reservado — exportação de relatórios (CSV/XLSX/PDF) não implementada nesta fase'),
    -- controlling_reports.view (citada como exemplo na seção 12.19) não
    -- foi criada: os relatórios de controladoria (DRE, margens,
    -- resultado por centro, 0047) já exigem controlling.view — uma
    -- segunda permissão para a mesma leitura seria duplicar RBAC sem
    -- necessidade (seção 15 da revisão arquitetural: "nenhuma
    -- permissão inútil").
    ('commercial_reports.view', 'commercial_reports', 'view', 'Consultar o dashboard comercial'),
    ('inventory_reports.view', 'inventory_reports', 'view', 'Consultar o dashboard de estoque'),
    ('purchase_reports.view', 'purchase_reports', 'view', 'Consultar o dashboard de compras'),
    ('production_reports.view', 'production_reports', 'view', 'Consultar o dashboard de produção'),
    ('logistics_reports.view', 'logistics_reports', 'view', 'Consultar o dashboard logístico'),
    ('financial_reports.view', 'financial_reports', 'view', 'Consultar o dashboard financeiro'),
    ('fiscal_reports.view', 'fiscal_reports', 'view', 'Consultar o dashboard fiscal')
) as v(code, module, action, description)
on conflict (code) do nothing;

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_rbac(c.id);
  end loop;
end;
$$;
