-- 0097 — Correções para as telas novas (reaplicável).
--
-- 1. Lançar custo numa ordem de manutenção falhava sempre: a função gravava a
--    auditoria com a ação 'INSERT', que audit_logs não aceita (a lista usa
--    'CREATE'). Mesma função, só a ação corrigida.
-- 2. Produção exige a unidade do catálogo (products.unit_id). Produtos que só
--    tinham a unidade em texto (ex.: "UN") são ligados à unidade de mesmo
--    código da própria empresa. Nada é alterado se não houver correspondência.

create or replace function public.fn_add_maintenance_order_cost(p_order_id uuid, p_cost_type text, p_description text, p_amount numeric)
returns public.maintenance_order_costs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.maintenance_orders;
  v_cost public.maintenance_order_costs;
begin
  if p_cost_type not in ('SERVICE', 'EXPENSE') then
    raise exception 'cost_type inválido: % (use SERVICE ou EXPENSE; custo de peça é automático via consumo de estoque).', p_cost_type using errcode = '22023';
  end if;

  select * into v_order from public.maintenance_orders where id = p_order_id;
  if not found then
    raise exception 'Ordem de manutenção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'maintenance_orders.manage_costs') then
    raise exception 'Permissão negada (maintenance_orders.manage_costs).' using errcode = '42501';
  end if;

  insert into public.maintenance_order_costs (company_id, maintenance_order_id, cost_type, description, amount, created_by)
  values (v_order.company_id, v_order.id, p_cost_type, p_description, p_amount, public.current_app_user_id())
  returning * into v_cost;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'maintenance_order_costs', v_cost.id, 'CREATE', null, to_jsonb(v_cost));

  return v_cost;
end;
$$;

update public.products p
set unit_id = u.id
from public.units u
where p.unit_id is null
  and u.company_id = p.company_id
  and upper(trim(u.code)) = upper(trim(p.unit));
