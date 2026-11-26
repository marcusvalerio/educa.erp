-- Excluir pedido de venda que nunca gerou nada: só em rascunho ou cancelado,
-- sem separação, expedição, reserva, movimento de estoque, título nem nota.
-- Quem pode cancelar pode excluir. A exclusão fica na auditoria (dados antigos).
create or replace function public.fn_delete_sales_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders%rowtype;
begin
  select * into v_order from public.sales_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_order.company_id, 'sales_orders.cancel') then
    raise exception 'Permissão negada.' using errcode = '42501';
  end if;
  if v_order.status not in ('draft', 'cancelled') then
    raise exception 'Só é possível excluir pedido em rascunho ou cancelado. Cancele o pedido antes.' using errcode = '22023';
  end if;
  if exists (select 1 from public.pick_lists where sales_order_id = p_order_id)
     or exists (select 1 from public.shipments where sales_order_id = p_order_id)
     or exists (select 1 from public.stock_reservations where reference_id = p_order_id)
     or exists (select 1 from public.stock_movements where reference_id = p_order_id)
     or exists (select 1 from public.accounts_receivable where origin_id = p_order_id)
     or exists (select 1 from public.fiscal_documents where source_id = p_order_id) then
    raise exception 'Este pedido já gerou separação, reserva, estoque, financeiro ou nota: mantenha-o cancelado para preservar o histórico.' using errcode = '22023';
  end if;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'sales_orders', v_order.id, 'DELETE',
    to_jsonb(v_order) || jsonb_build_object('items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.sales_order_items i where i.order_id = p_order_id)),
    null);
  delete from public.sales_orders where id = p_order_id;
end;
$$;
grant execute on function public.fn_delete_sales_order(uuid) to authenticated;
