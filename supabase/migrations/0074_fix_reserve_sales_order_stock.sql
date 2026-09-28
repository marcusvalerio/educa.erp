-- ==================================================================
-- 0074 — Correção: reserva de estoque do pedido de venda (duas causas)
--
-- Sintoma: "Reservar pedido" (POST /api/sales-orders/:id/reserve) falhava
-- com 500 genérico; no banco, "invalid input syntax for type uuid".
--
-- Causa: em fn_reserve_sales_order_stock (0021) o retorno de
-- fn_create_reservation — que é a linha public.stock_reservations
-- (tipo composto, 0011) — era gravado com
--     select public.fn_create_reservation(...) into v_reservation;
-- Com v_reservation do tipo linha, o PL/pgSQL distribui as COLUNAS do
-- select pelos campos da variável: a única coluna (o valor composto
-- inteiro) ia para o 1º campo, id uuid, e a conversão abortava a
-- transação. Nenhuma reserva de pedido jamais foi criada por essa função.
--
-- Segunda causa, escondida atrás da primeira: a função audita a reserva
-- com action = 'RESERVE', que nunca entrou no CHECK de audit_logs.action
-- (0017 → 0064). Corrigida a 1ª, a reserva passava a falhar no INSERT da
-- auditoria ("violates check constraint audit_logs_action_check").
--
-- Correção:
--   1. audit_logs.action passa a aceitar 'RESERVE' — mesmo padrão aditivo
--      da 0017/0064 (localiza o CHECK pelo conteúdo, recria com o
--      vocabulário anterior COMPLETO + 'RESERVE'). Nenhuma linha muda.
--   2. fn_reserve_sales_order_stock com atribuição direta
--      (v_reservation := fn_create_reservation(...)). O restante da função
--      é IDÊNTICO à 0021 (assinatura, retorno, permissão, status, reserva
--      parcial e auditoria); "create or replace" preserva os grants da
--      0021 (revoke de public, execute para authenticated).
--
-- Varreduras feitas junto (registradas, NÃO corrigidas aqui — fora do
-- escopo desta correção):
--   * nenhuma outra função usa "select f(...) into" com f de tipo composto;
--   * 'INSERT' também está fora do vocabulário e é usado em 0055
--     (conversões do CRM) e 0057 (custo de ordem de manutenção).
-- ==================================================================

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.audit_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action%';
  if v_conname is not null then
    execute format('alter table public.audit_logs drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'INACTIVATE',
    'APPROVE', 'CANCEL', 'RECEIVE', 'CONFIRM', 'REJECT',
    'PICK', 'PACK', 'SHIP', 'DELIVER', 'FAIL', 'RETURN',
    'RELEASE', 'START', 'CONSUME', 'COMPLETE', 'SCRAP',
    'PAY', 'REVERSE', 'RECONCILE',
    'AUTHORIZE', 'EVENT',
    'CONFIGURE', 'EXPORT',
    'GRANT', 'REVOKE', 'ENABLE', 'DISABLE', 'ASSIGN', 'UNASSIGN',
    'SUSPEND', 'RESUME',
    'RESERVE'
  ));

create or replace function public.fn_reserve_sales_order_stock(
  p_order_id uuid,
  p_location_id uuid,
  p_idempotency_key text default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_item record;
  v_available numeric;
  v_to_reserve numeric;
  v_reservation_items jsonb := '[]'::jsonb;
  v_item_reserve jsonb;
  v_reservation public.stock_reservations;
  v_fully_reserved boolean := true;
  v_any_reserved boolean := false;
begin
  -- Trava o cabeçalho do pedido: duas chamadas concorrentes a esta
  -- função para o MESMO pedido (ex.: duplo clique em "Reservar")
  -- serializam aqui, em vez de ambas lerem status = 'approved' e
  -- criarem duas reservas para a mesma necessidade. A integridade do
  -- saldo em si já é garantida por fn_post_stock_movement (dentro de
  -- fn_create_reservation) independentemente disso — este lock
  -- protege a idempotência no nível do PEDIDO, não do estoque.
  select * into v_order from public.sales_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.reserve') then
    raise exception 'Permissão negada (sales_orders.reserve).' using errcode = '42501';
  end if;

  if v_order.status not in ('approved', 'reservation_pending') then
    raise exception 'Só é possível reservar estoque de um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.sales_order_items
    where order_id = p_order_id and (ordered_quantity - cancelled_quantity - reserved_quantity) > 0
  loop
    if v_item.product_id is null then
      -- Item fora do catálogo: nunca reservável via estoque (mesma
      -- decisão de purchase_request_items para o mesmo caso). Fica
      -- pendente para sempre — o recálculo de status abaixo, feito a
      -- partir de uma query fresca pós-atualização, já reflete isso
      -- corretamente sem precisar de uma flag mantida aqui no loop.
      continue;
    end if;

    select coalesce(available, 0) into v_available
    from public.stock_balances
    where company_id = v_order.company_id and product_id = v_item.product_id and location_id = p_location_id
      and lot_id is null;

    v_to_reserve := least(v_item.ordered_quantity - v_item.cancelled_quantity - v_item.reserved_quantity, coalesce(v_available, 0));

    if v_to_reserve > 0 then
      v_item_reserve := jsonb_build_object('product_id', v_item.product_id, 'quantity', v_to_reserve, 'sales_order_item_id', v_item.id);
      v_reservation_items := v_reservation_items || jsonb_build_array(v_item_reserve);
      v_any_reserved := true;
    end if;
  end loop;

  if v_any_reserved then
    -- v_reservation_items carrega "sales_order_item_id" além de
    -- product_id/quantity — fn_create_reservation só lê as duas
    -- primeiras chaves de cada item, o resto é ignorado sem problema;
    -- não há necessidade de reconstruir o array antes de repassar.
    -- fn_create_reservation devolve a LINHA de stock_reservations (tipo
    -- composto). Atribuição direta à variável do mesmo tipo — o
    -- "select f(...) into v_reservation" da 0021 tentava pôr o valor
    -- composto inteiro no 1º campo (id uuid) e abortava a reserva.
    v_reservation := public.fn_create_reservation(
      p_company_id => v_order.company_id,
      p_location_id => p_location_id,
      p_items => v_reservation_items,
      p_notes => 'Reserva do pedido de venda ' || v_order.code,
      p_reference_type => 'sales_order',
      p_reference_id => v_order.id
    );

    for v_item_reserve in select * from jsonb_array_elements(v_reservation_items)
    loop
      update public.sales_order_items
      set reserved_quantity = reserved_quantity + (v_item_reserve->>'quantity')::numeric
      where id = (v_item_reserve->>'sales_order_item_id')::uuid;
    end loop;
  end if;

  -- Recalcula se cobriu tudo (considerando itens sem product_id, que
  -- nunca são reserváveis via estoque, como sempre "não totalmente
  -- reservados" — ficam fora do controle de saldo, mesma decisão de
  -- purchase_request_items para itens fora do catálogo).
  select not exists (
    select 1 from public.sales_order_items
    where order_id = p_order_id and (ordered_quantity - cancelled_quantity - reserved_quantity) > 0
  ) into v_fully_reserved;

  update public.sales_orders
  set status = case when v_fully_reserved then 'reserved' else 'reservation_pending' end
  where id = p_order_id
  returning * into v_order;

  if v_any_reserved then
    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_order.company_id, public.current_app_user_id(), 'system', 'sales_orders', v_order.id, 'RESERVE',
      null, jsonb_build_object('status', v_order.status, 'location_id', p_location_id));
  end if;

  return v_order;
end;
$$;

comment on function public.fn_reserve_sales_order_stock(uuid, uuid, text) is
  'Reserva o estoque disponível dos itens do pedido aprovado (parcial permitida). Corrigida na 0074: retorno de fn_create_reservation atribuído diretamente.';
