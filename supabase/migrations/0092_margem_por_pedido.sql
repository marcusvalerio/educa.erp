-- 0092 — Margem por pedido (fn_margin_by_order) falhava sempre.
--
-- Encontrado ao testar as funções que leem v_sales_order_item_margin (missão
-- de segurança multiempresa, docs/homologacao/CONTENCAO-SEGURANCA.md):
-- "function min(uuid) does not exist". O PostgreSQL não tem min() para uuid,
-- então GET /api/controlling/margin/order respondia erro para qualquer
-- empresa, com ou sem dados (defeito da 0047, anterior a esta missão).
--
-- Correção: o cliente é um só por pedido (sales_orders.customer_id), então ele
-- entra no GROUP BY em vez de min(). Mesma assinatura, mesma checagem de
-- permissão (controlling.view na empresa pedida) e mesmos números.
-- Independente das demais migrations desta sequência; idempotente.
create or replace function public.fn_margin_by_order(p_company_id uuid, p_period_start date, p_period_end date)
returns table(sales_order_id uuid, customer_id uuid, revenue numeric, cost numeric, margin numeric, margin_pct numeric)
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
    m.sales_order_id, m.customer_id, sum(m.revenue_amount), sum(m.cost_amount), sum(m.margin_amount),
    case when sum(m.revenue_amount) > 0 then round(sum(m.margin_amount) / sum(m.revenue_amount) * 100, 2) else null end
  from public.v_sales_order_item_margin m
  where m.company_id = p_company_id and m.order_date between p_period_start and p_period_end
  group by m.sales_order_id, m.customer_id;
end;
$$;
