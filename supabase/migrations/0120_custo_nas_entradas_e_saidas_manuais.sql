-- 0120 — Custo nas entradas e saídas manuais e nas devoluções.
--
-- A entrada manual (Logística › Movimentações › Entrada), a saída manual e as
-- devoluções (0108) mexiam na quantidade mas não registravam o CUSTO: o custo
-- médio do produto ficava zerado e, depois, produção (custo de material) e
-- venda (CMV) consumiam a custo R$ 0. Recebimento de compra, expedição,
-- produção, ajuste e transferência já registravam e não mudam.
--   1) fn_receive_stock e fn_issue_stock passam a registrar o custo
--      (entrada: custo informado, ou o preço de custo do cadastro; saída:
--      custo médio). Devolução de cliente entra pelo custo médio (ou de
--      cadastro); devolução a fornecedor sai pelo custo médio.
--   2) Entradas antigas sem custo (manual/devolução) ganham o custo agora,
--      pelo custo informado no movimento ou pelo de cadastro.
-- Pode rodar de novo.

create or replace function public.fn_receive_stock(p_company_id uuid, p_product_id uuid, p_location_id uuid, p_quantity numeric, p_lot_id uuid default null, p_unit_cost numeric default null, p_notes text default null, p_idempotency_key text default null)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement public.stock_movements;
  v_cost numeric;
begin
  if not public.has_permission(p_company_id, 'stock.create') then
    raise exception 'Permissão negada (stock.create).' using errcode = '42501';
  end if;

  select coalesce(p_unit_cost, nullif(cost_price, 0)) into v_cost from public.products where id = p_product_id and company_id = p_company_id;

  v_movement := public.fn_post_stock_movement(
    p_company_id => p_company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => 'RECEIPT',
    p_quantity => p_quantity,
    p_lot_id => p_lot_id,
    p_unit_cost => v_cost,
    p_reference_type => 'manual',
    p_notes => p_notes,
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );
  perform public.fn_register_cost_movement(p_stock_movement_id => v_movement.id, p_unit_cost => v_cost, p_source_type => 'manual', p_source_id => v_movement.id);
  return v_movement;
end;
$$;

create or replace function public.fn_issue_stock(p_company_id uuid, p_product_id uuid, p_location_id uuid, p_quantity numeric, p_lot_id uuid default null, p_notes text default null, p_idempotency_key text default null)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement public.stock_movements;
begin
  if not public.has_permission(p_company_id, 'stock.adjust') then
    raise exception 'Permissão negada (stock.adjust).' using errcode = '42501';
  end if;

  v_movement := public.fn_post_stock_movement(
    p_company_id => p_company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => 'ISSUE',
    p_quantity => p_quantity,
    p_lot_id => p_lot_id,
    p_reference_type => 'manual',
    p_notes => p_notes,
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );
  perform public.fn_register_cost_movement(p_stock_movement_id => v_movement.id, p_unit_cost => null, p_source_type => 'manual', p_source_id => v_movement.id);
  return v_movement;
end;
$$;

create or replace function public.fn_register_stock_return(p_company_id uuid, p_product_id uuid, p_location_id uuid, p_quantity numeric, p_direction text, p_notes text default null)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_in boolean := upper(coalesce(p_direction, '')) = 'IN';
  v_movement public.stock_movements;
  v_cost numeric;
begin
  if upper(coalesce(p_direction, '')) not in ('IN', 'OUT') then
    raise exception 'Informe se é devolução de cliente (IN) ou a fornecedor (OUT).' using errcode = '22023';
  end if;
  if not public.has_permission(p_company_id, case when v_in then 'stock.create' else 'stock.adjust' end) then
    raise exception 'Permissão negada (%).', case when v_in then 'stock.create' else 'stock.adjust' end using errcode = '42501';
  end if;
  if coalesce(trim(p_notes), '') = '' then
    raise exception 'Informe o motivo da devolução.' using errcode = '22023';
  end if;
  if v_in then
    select coalesce(
      (select nullif(average_unit_cost, 0) from public.product_cost_balances where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id and lot_id is null),
      (select nullif(cost_price, 0) from public.products where id = p_product_id))
      into v_cost;
  end if;
  v_movement := public.fn_post_stock_movement(
    p_company_id => p_company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => case when v_in then 'RETURN_IN' else 'RETURN_OUT' end,
    p_quantity => p_quantity,
    p_unit_cost => v_cost,
    p_reference_type => 'manual',
    p_notes => p_notes,
    p_created_by => public.current_app_user_id()
  );
  perform public.fn_register_cost_movement(p_stock_movement_id => v_movement.id, p_unit_cost => v_cost, p_source_type => 'manual', p_source_id => v_movement.id);
  return v_movement;
end;
$$;

revoke all on function public.fn_receive_stock(uuid, uuid, uuid, numeric, uuid, numeric, text, text) from public, anon;
revoke all on function public.fn_issue_stock(uuid, uuid, uuid, numeric, uuid, text, text) from public, anon;
revoke all on function public.fn_register_stock_return(uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.fn_receive_stock(uuid, uuid, uuid, numeric, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.fn_issue_stock(uuid, uuid, uuid, numeric, uuid, text, text) to authenticated, service_role;
grant execute on function public.fn_register_stock_return(uuid, uuid, uuid, numeric, text, text) to authenticated;

-- Entradas antigas sem custo: registra pelo custo do movimento ou do cadastro.
do $$
declare
  r record;
begin
  for r in
    select m.id, coalesce(nullif(m.unit_cost, 0), nullif(p.cost_price, 0)) as cost
    from public.stock_movements m
    join public.products p on p.id = m.product_id
    where m.movement_type in ('RECEIPT', 'RETURN_IN')
      and not exists (select 1 from public.cost_movements c where c.stock_movement_id = m.id)
    order by m.created_at
  loop
    perform public.fn_register_cost_movement(p_stock_movement_id => r.id, p_unit_cost => r.cost, p_source_type => 'manual', p_source_id => r.id);
  end loop;
end;
$$;
