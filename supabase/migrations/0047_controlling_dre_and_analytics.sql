-- Fase 11 — Controladoria Gerencial: DRE gerencial, CMV, margens,
-- resultado por centro de custo, custo industrial e forecast.
--
-- Nenhuma tabela nova aqui — só funções/consultas sobre o que já
-- existe (seção 11.21: "preferir views/functions calculáveis").
-- Funções (não views simples) porque todas precisam de parâmetros de
-- período — mesmo padrão de fn_resolve_applicable_tax_rules (0038).
-- Permissão checada DENTRO de cada função (controlling.view) porque são
-- chamadas via RPC (cliente de sessão), não lidas via cliente admin
-- como v_cash_flow_summary (0035) — mesma distinção "cadastro simples"
-- vs "função parametrizada" usada em todo o sistema.

-- ==================================================================
-- fn_get_dre_gerencial — DRE GERENCIAL (seção 11.4), não societária.
--
-- Fontes (seção 11.1, nunca duplicadas):
--   RECEITA BRUTA        = accounts_receivable (origin_type='sales_order',
--                           issue_date no período — competência, seção 11.5)
--   DEDUÇÕES              = 0 (seção 11.5 — limitação documentada:
--                           não há tributo sobre venda modelado como
--                           dedução de receita separado do CMV/despesas;
--                           ver docs/CONTROLLING.md)
--   CMV                   = cost_movements (movement_type='ISSUE',
--                           source_type='shipment_item' — a saída real
--                           de venda, seção 11.6), nunca recalculado
--   DESPESAS OPERACIONAIS = accounts_payable (categoria EXPENSE,
--                           issue_date no período, seção 11.7)
--   RESULTADO FINANCEIRO  = financial_transactions manuais
--                           (reference_type='MANUAL' — tarifas/juros
--                           bancários não ligados a título, seção
--                           11.4) — aproximação documentada; sem uma
--                           flag "financeiro vs operacional" em
--                           financial_categories, esta é a fonte mais
--                           honesta disponível hoje.
-- ==================================================================
create or replace function public.fn_get_dre_gerencial(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  gross_revenue numeric,
  deductions numeric,
  net_revenue numeric,
  cmv numeric,
  gross_profit numeric,
  operating_expenses numeric,
  operating_result numeric,
  financial_result numeric,
  managerial_result numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gross_revenue numeric;
  v_cmv numeric;
  v_operating_expenses numeric;
  v_financial_result numeric;
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  select coalesce(sum(original_amount), 0) into v_gross_revenue
  from public.accounts_receivable
  where company_id = p_company_id and origin_type = 'sales_order' and status <> 'CANCELLED'
    and issue_date between p_period_start and p_period_end;

  select coalesce(sum(cm.total_cost), 0) into v_cmv
  from public.cost_movements cm
  where cm.company_id = p_company_id and cm.movement_type = 'ISSUE' and cm.source_type = 'shipment_item'
    and cm.created_at::date between p_period_start and p_period_end;

  select coalesce(sum(ap.updated_amount), 0) into v_operating_expenses
  from public.accounts_payable ap
  join public.financial_categories fc on fc.id = ap.category_id
  where ap.company_id = p_company_id and fc.type = 'EXPENSE' and ap.status <> 'CANCELLED'
    and ap.issue_date between p_period_start and p_period_end;

  select coalesce(sum(case when ft.type = 'CREDIT' then ft.amount else -ft.amount end), 0) into v_financial_result
  from public.financial_transactions ft
  where ft.company_id = p_company_id and ft.reference_type = 'MANUAL'
    and ft.occurred_at::date between p_period_start and p_period_end;

  return query select
    v_gross_revenue,
    0::numeric,
    v_gross_revenue,
    v_cmv,
    v_gross_revenue - v_cmv,
    v_operating_expenses,
    (v_gross_revenue - v_cmv) - v_operating_expenses,
    v_financial_result,
    ((v_gross_revenue - v_cmv) - v_operating_expenses) + v_financial_result;
end;
$$;

-- ==================================================================
-- fn_controlling_kpis — indicadores financeiros (seção 11.19),
-- reaproveitando fn_get_dre_gerencial (nunca recalcula a mesma coisa
-- duas vezes) + saldo/contas em aberto/inadimplência/ticket médio.
-- ==================================================================
create or replace function public.fn_controlling_kpis(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  gross_revenue numeric,
  net_revenue numeric,
  cmv numeric,
  gross_profit numeric,
  gross_margin_pct numeric,
  operating_expenses numeric,
  operating_result numeric,
  financial_result numeric,
  managerial_result numeric,
  accounts_receivable_open numeric,
  accounts_payable_open numeric,
  cash_balance numeric,
  overdue_receivable numeric,
  average_ticket numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dre record;
  v_ar_open numeric;
  v_ap_open numeric;
  v_cash numeric;
  v_overdue numeric;
  v_order_count integer;
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  select * into v_dre from public.fn_get_dre_gerencial(p_company_id, p_period_start, p_period_end);

  select coalesce(sum(amount - received_amount), 0) into v_ar_open
  from public.accounts_receivable_installments
  where company_id = p_company_id and status in ('OPEN', 'PARTIALLY_RECEIVED', 'OVERDUE');

  select coalesce(sum(amount - paid_amount), 0) into v_ap_open
  from public.accounts_payable_installments
  where company_id = p_company_id and status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE');

  select coalesce(sum(amount - received_amount), 0) into v_overdue
  from public.accounts_receivable_installments
  where company_id = p_company_id and status = 'OVERDUE';

  select coalesce(sum(current_balance), 0) into v_cash
  from public.financial_accounts
  where company_id = p_company_id and status = 'active';

  select count(*) into v_order_count
  from public.sales_orders
  where company_id = p_company_id and status not in ('draft', 'cancelled')
    and order_date between p_period_start and p_period_end;

  return query select
    v_dre.gross_revenue,
    v_dre.net_revenue,
    v_dre.cmv,
    v_dre.gross_profit,
    case when v_dre.net_revenue > 0 then round(v_dre.gross_profit / v_dre.net_revenue * 100, 2) else null end,
    v_dre.operating_expenses,
    v_dre.operating_result,
    v_dre.financial_result,
    v_dre.managerial_result,
    v_ar_open,
    v_ap_open,
    v_cash,
    v_overdue,
    case when v_order_count > 0 then round(v_dre.gross_revenue / v_order_count, 4) else null end;
end;
$$;

-- ==================================================================
-- fn_result_by_cost_center — receita - despesa - custo rateado, por
-- centro de custo (seção 11.16), considerando os rateios já aplicados
-- (0046) — nenhum recálculo, só soma o que já foi decidido.
-- ==================================================================
create or replace function public.fn_result_by_cost_center(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  cost_center_id uuid,
  cost_center_code text,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  allocated_cost numeric,
  result numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  return query
  with ids as (
    select cc.id from public.cost_centers cc where cc.company_id = p_company_id
  ),
  revenue as (
    select cost_center_id, sum(original_amount) as amount
    from public.accounts_receivable
    where company_id = p_company_id and status <> 'CANCELLED' and cost_center_id is not null
      and issue_date between p_period_start and p_period_end
    group by cost_center_id
  ),
  expense as (
    select cost_center_id, sum(updated_amount) as amount
    from public.accounts_payable
    where company_id = p_company_id and status <> 'CANCELLED' and cost_center_id is not null
      and issue_date between p_period_start and p_period_end
    group by cost_center_id
  ),
  allocated as (
    select cai.cost_center_id, sum(cai.amount) as amount
    from public.cost_allocation_items cai
    join public.cost_allocations ca on ca.id = cai.allocation_id
    where ca.company_id = p_company_id and ca.status = 'applied'
      and ca.created_at::date between p_period_start and p_period_end
    group by cai.cost_center_id
  )
  select
    cc.id,
    cc.code,
    cc.name,
    coalesce(r.amount, 0),
    coalesce(e.amount, 0),
    coalesce(a.amount, 0),
    coalesce(r.amount, 0) - coalesce(e.amount, 0) - coalesce(a.amount, 0)
  from public.cost_centers cc
  left join revenue r on r.cost_center_id = cc.id
  left join expense e on e.cost_center_id = cc.id
  left join allocated a on a.cost_center_id = cc.id
  where cc.id in (select id from ids)
    and (r.amount is not null or e.amount is not null or a.amount is not null);
end;
$$;

-- ==================================================================
-- fn_industrial_cost_summary — custo industrial (seção 11.17): só
-- custo de material já calculado pela Fase 10 (production_orders.
-- material_cost) — nenhuma mão de obra/rateio inventado.
-- ==================================================================
create or replace function public.fn_industrial_cost_summary(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  production_order_id uuid,
  production_order_code text,
  product_id uuid,
  material_cost numeric,
  produced_quantity numeric,
  unit_cost numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  return query
  select
    po.id, po.code, po.product_id, po.material_cost, po.produced_quantity,
    case when po.produced_quantity > 0 then round(po.material_cost / po.produced_quantity, 6) else 0 end
  from public.production_orders po
  where po.company_id = p_company_id
    and po.created_at::date between p_period_start and p_period_end;
end;
$$;

-- ==================================================================
-- fn_controlling_forecast — projeção gerencial (seção 11.13): nunca
-- IA — realizado (competência já reconhecida) + compromissos (parcelas
-- ainda em aberto com vencimento no período), claramente separados.
-- ==================================================================
create or replace function public.fn_controlling_forecast(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (bucket text, amount numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'controlling.forecast.view') then
    raise exception 'Permissão negada (controlling.forecast.view).' using errcode = '42501';
  end if;

  return query
  select 'REALIZED_REVENUE'::text, coalesce(sum(original_amount), 0)
  from public.accounts_receivable
  where company_id = p_company_id and origin_type = 'sales_order' and status <> 'CANCELLED'
    and issue_date between p_period_start and p_period_end
  union all
  select 'REALIZED_EXPENSE'::text, coalesce(sum(updated_amount), 0)
  from public.accounts_payable
  where company_id = p_company_id and status <> 'CANCELLED'
    and issue_date between p_period_start and p_period_end
  union all
  select 'COMMITTED_REVENUE'::text, coalesce(sum(amount - received_amount), 0)
  from public.accounts_receivable_installments
  where company_id = p_company_id and status in ('OPEN', 'PARTIALLY_RECEIVED', 'OVERDUE')
    and due_date between p_period_start and p_period_end
  union all
  select 'COMMITTED_EXPENSE'::text, coalesce(sum(amount - paid_amount), 0)
  from public.accounts_payable_installments
  where company_id = p_company_id and status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
    and due_date between p_period_start and p_period_end;
end;
$$;

-- ==================================================================
-- v_sales_order_item_margin — margem granular (linha do pedido),
-- seção 11.14/11.15. Receita = line_total (já existente em
-- sales_order_items); custo = soma de cost_movements do(s)
-- shipment_item(s) gerado(s) para aquele item de pedido (via
-- fn_ship_shipment, Fase 10) — nunca recalcula custo, só agrega. Um
-- item ainda não expedido aparece com cost_amount=0/margin=revenue
-- (não é erro — reflete que a venda ainda não teve saída de estoque).
-- ==================================================================
create or replace view public.v_sales_order_item_margin as
select
  soi.id as sales_order_item_id,
  soi.order_id as sales_order_id,
  so.company_id,
  so.customer_id,
  so.sales_representative_id,
  so.order_date,
  soi.product_id,
  soi.line_total as revenue_amount,
  coalesce(cm.cost_amount, 0) as cost_amount,
  soi.line_total - coalesce(cm.cost_amount, 0) as margin_amount
from public.sales_order_items soi
join public.sales_orders so on so.id = soi.order_id
left join (
  select si.sales_order_item_id, sum(cmv.total_cost) as cost_amount
  from public.shipment_items si
  join public.cost_movements cmv on cmv.source_type = 'shipment_item' and cmv.source_id = si.id
  group by si.sales_order_item_id
) cm on cm.sales_order_item_id = soi.id;

comment on view public.v_sales_order_item_margin is
  'Margem por item de pedido de venda — granularidade mínima para as agregações (produto/cliente/pedido/vendedor, seção 11.14/11.15). Lida via cliente admin com permissão checada na API (controlling.view), mesmo padrão de v_cash_flow_summary (0035).';

-- ==================================================================
-- fn_margin_by_product / fn_margin_by_customer / fn_margin_by_order —
-- agregações sobre v_sales_order_item_margin (seção 11.14/11.15).
-- ==================================================================
create or replace function public.fn_margin_by_product(p_company_id uuid, p_period_start date, p_period_end date)
returns table (product_id uuid, revenue numeric, cost numeric, margin numeric, margin_pct numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  return query
  select
    m.product_id, sum(m.revenue_amount), sum(m.cost_amount), sum(m.margin_amount),
    case when sum(m.revenue_amount) > 0 then round(sum(m.margin_amount) / sum(m.revenue_amount) * 100, 2) else null end
  from public.v_sales_order_item_margin m
  where m.company_id = p_company_id and m.order_date between p_period_start and p_period_end
  group by m.product_id;
end;
$$;

create or replace function public.fn_margin_by_customer(p_company_id uuid, p_period_start date, p_period_end date)
returns table (customer_id uuid, revenue numeric, cost numeric, margin numeric, margin_pct numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  return query
  select
    m.customer_id, sum(m.revenue_amount), sum(m.cost_amount), sum(m.margin_amount),
    case when sum(m.revenue_amount) > 0 then round(sum(m.margin_amount) / sum(m.revenue_amount) * 100, 2) else null end
  from public.v_sales_order_item_margin m
  where m.company_id = p_company_id and m.order_date between p_period_start and p_period_end
  group by m.customer_id;
end;
$$;

create or replace function public.fn_margin_by_order(p_company_id uuid, p_period_start date, p_period_end date)
returns table (sales_order_id uuid, customer_id uuid, revenue numeric, cost numeric, margin numeric, margin_pct numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'controlling.view') then
    raise exception 'Permissão negada (controlling.view).' using errcode = '42501';
  end if;

  return query
  select
    m.sales_order_id, min(m.customer_id), sum(m.revenue_amount), sum(m.cost_amount), sum(m.margin_amount),
    case when sum(m.revenue_amount) > 0 then round(sum(m.margin_amount) / sum(m.revenue_amount) * 100, 2) else null end
  from public.v_sales_order_item_margin m
  where m.company_id = p_company_id and m.order_date between p_period_start and p_period_end
  group by m.sales_order_id;
end;
$$;

revoke all on function public.fn_get_dre_gerencial(uuid, date, date) from public;
revoke all on function public.fn_controlling_kpis(uuid, date, date) from public;
revoke all on function public.fn_result_by_cost_center(uuid, date, date) from public;
revoke all on function public.fn_industrial_cost_summary(uuid, date, date) from public;
revoke all on function public.fn_controlling_forecast(uuid, date, date) from public;
revoke all on function public.fn_margin_by_product(uuid, date, date) from public;
revoke all on function public.fn_margin_by_customer(uuid, date, date) from public;
revoke all on function public.fn_margin_by_order(uuid, date, date) from public;
grant execute on function public.fn_get_dre_gerencial(uuid, date, date) to authenticated;
grant execute on function public.fn_controlling_kpis(uuid, date, date) to authenticated;
grant execute on function public.fn_result_by_cost_center(uuid, date, date) to authenticated;
grant execute on function public.fn_industrial_cost_summary(uuid, date, date) to authenticated;
grant execute on function public.fn_controlling_forecast(uuid, date, date) to authenticated;
grant execute on function public.fn_margin_by_product(uuid, date, date) to authenticated;
grant execute on function public.fn_margin_by_customer(uuid, date, date) to authenticated;
grant execute on function public.fn_margin_by_order(uuid, date, date) to authenticated;
