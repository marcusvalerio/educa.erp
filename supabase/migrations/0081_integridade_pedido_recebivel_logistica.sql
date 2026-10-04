-- 0081 — Rodada 2 do teste com 48 usuários em 7 empresas: integridade do
-- pedido sob concorrência (recebível, separação, expedição e reservas).
--
-- Reproduzido antes da correção (roteiro p1-reproducao, Vértice e Sertão):
--   R48-01  duas contas a receber ATIVAS para o mesmo pedido (Financeiro +
--           Gerente ao mesmo tempo) — check-then-act sem trava nem índice.
--   R48-06  duas separações abertas (G1) e duas expedições somando mais que o
--           reservado (G3) — inclusive EM SEQUÊNCIA (a criação não descontava
--           as expedições abertas).
--   R48-11  reserva continuava "active" depois de o pedido ser expedido.
--   R48-15  corrida de reserva: o perdedor recebia erro em vez da parcial.
--   R2-01   pedido em separação/pronto para expedir não cancelava (a
--           restrição reserved + cancelled <= ordered estourava) e a reserva
--           ficava presa.
--   R2-03   expedição criada a partir de um local onde a reserva é de outro
--           pedido; só era barrada no envio.
--   R48-17  mensagens com o UUID do item e números com 4 casas.
--
-- Antes de criar os índices únicos, a migration CONFERE duplicatas e PARA se
-- encontrar: não cancela título nem separação sozinha (decisão de quem opera).

-- ------------------------------------------------------------ 0. conferência
do $$
declare
  v_dup text;
begin
  select string_agg(format('%s (%s)', titulos, company_id), '; ')
  into v_dup
  from (
    select company_id, origin_id, string_agg(code, ', ' order by created_at) titulos
    from public.accounts_receivable
    where origin_type = 'sales_order' and origin_id is not null and status <> 'CANCELLED'
    group by company_id, origin_id having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Há pedidos com mais de uma conta a receber ativa: %. Cancele os excedentes antes de aplicar esta migration.', v_dup;
  end if;

  select string_agg(format('%s (%s)', listas, company_id), '; ')
  into v_dup
  from (
    select company_id, sales_order_id, string_agg(code, ', ' order by created_at) listas
    from public.pick_lists
    where status in ('pending', 'in_progress')
    group by company_id, sales_order_id having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Há pedidos com mais de uma separação aberta: %. Cancele as excedentes antes de aplicar esta migration.', v_dup;
  end if;
end $$;

-- ------------------------------------------------------------ 1. textos
-- Quantidade sem os zeros do numeric(16,4) e com vírgula decimal.
create or replace function public.fn_fmt_qty(p numeric)
returns text
language sql
immutable
as $$
  select replace(trim_scale(coalesce(p, 0))::text, '.', ',');
$$;

-- "CÓDIGO — Nome" do produto (no lugar do UUID nas mensagens).
create or replace function public.fn_product_label(p_product_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.code || ' — ' || p.name from public.products p where p.id = p_product_id), 'produto');
$$;

-- ------------------------------------------------------------ 2. recebível único
create unique index if not exists accounts_receivable_origin_active_unique
  on public.accounts_receivable (company_id, origin_type, origin_id)
  where origin_id is not null and status <> 'CANCELLED';

create or replace function public.fn_generate_accounts_receivable_from_sales_order(
  p_sales_order_id uuid,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_payment_terms_id uuid default null,
  p_issue_date date default current_date,
  p_due_date_base date default current_date,
  p_description text default null
)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_existing public.accounts_receivable;
  v_receivable public.accounts_receivable;
  v_payment_terms_id uuid;
  v_installment record;
  v_amount numeric;
  v_due_date date;
  v_sum_so_far numeric := 0;
  v_count integer;
  v_idx integer := 0;
begin
  -- Trava o pedido: a 2ª geração simultânea espera a 1ª e encontra o título.
  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'accounts_receivable.approve') then
    raise exception 'Permissão negada (accounts_receivable.approve).' using errcode = '42501';
  end if;

  if v_order.status in ('draft', 'pending_approval', 'cancelled') then
    raise exception 'Só é possível gerar título a receber a partir de um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  select * into v_existing from public.accounts_receivable
  where company_id = v_order.company_id and origin_type = 'sales_order' and origin_id = p_sales_order_id
  order by (status = 'CANCELLED'), created_at desc
  limit 1;
  if found then
    return v_existing;
  end if;

  if v_order.total_amount <= 0 then
    raise exception 'Pedido sem valor total — nada a gerar.' using errcode = 'P0001';
  end if;

  begin
    insert into public.accounts_receivable (
      company_id, customer_id, description, category_id, cost_center_id,
      origin_type, origin_id, original_amount, issue_date, due_date, notes
    ) values (
      v_order.company_id, v_order.customer_id, coalesce(p_description, 'Pedido de venda ' || v_order.code),
      p_category_id, p_cost_center_id, 'sales_order', v_order.id,
      v_order.total_amount, coalesce(p_issue_date, current_date), coalesce(p_due_date_base, current_date), null
    )
    returning * into v_receivable;
  exception when unique_violation then
    -- Defesa extra: o índice recusou (outra transação gravou primeiro).
    select * into v_existing from public.accounts_receivable
    where company_id = v_order.company_id and origin_type = 'sales_order' and origin_id = p_sales_order_id and status <> 'CANCELLED'
    limit 1;
    return v_existing;
  end;

  v_payment_terms_id := coalesce(p_payment_terms_id, v_order.payment_terms_id);

  if v_payment_terms_id is not null then
    select count(*) into v_count from public.payment_term_installments where payment_term_id = v_payment_terms_id;
    if v_count = 0 then
      raise exception 'Condição de pagamento não encontrada ou sem parcelas.' using errcode = 'P0002';
    end if;

    for v_installment in
      select * from public.payment_term_installments where payment_term_id = v_payment_terms_id order by installment_number
    loop
      v_idx := v_idx + 1;
      v_due_date := coalesce(p_due_date_base, current_date) + v_installment.days_after;
      if v_idx = v_count then
        v_amount := v_order.total_amount - v_sum_so_far;
      else
        v_amount := round(v_order.total_amount * v_installment.percentage / 100, 2);
      end if;
      v_sum_so_far := v_sum_so_far + v_amount;

      insert into public.accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount)
      values (v_order.company_id, v_receivable.id, v_installment.installment_number, v_due_date, v_amount);
    end loop;
  else
    insert into public.accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount)
    values (v_order.company_id, v_receivable.id, 1, coalesce(p_due_date_base, current_date), v_order.total_amount);
  end if;

  update public.accounts_receivable set due_date = (
    select min(due_date) from public.accounts_receivable_installments where receivable_id = v_receivable.id
  ) where id = v_receivable.id
  returning * into v_receivable;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'accounts_receivable', v_receivable.id, 'APPROVE',
    null, jsonb_build_object('origin_type', 'sales_order', 'origin_id', v_order.id, 'sales_order_code', v_order.code,
      'original_amount', v_order.total_amount));

  return v_receivable;
end;
$$;

-- Diz se o título foi criado agora ou se já existia (a API responde 201/200).
create or replace function public.fn_generate_receivable_for_sales_order(
  p_sales_order_id uuid,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_payment_terms_id uuid default null,
  p_issue_date date default current_date,
  p_due_date_base date default current_date,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_existing public.accounts_receivable;
  v_receivable public.accounts_receivable;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;
  -- Permissão ANTES de revelar se existe título (isolamento entre empresas).
  if not public.has_permission(v_order.company_id, 'accounts_receivable.approve') then
    raise exception 'Permissão negada (accounts_receivable.approve).' using errcode = '42501';
  end if;

  select * into v_existing from public.accounts_receivable
  where company_id = v_order.company_id and origin_type = 'sales_order' and origin_id = p_sales_order_id
  order by (status = 'CANCELLED'), created_at desc
  limit 1;
  if found then
    return jsonb_build_object('created', false, 'receivable', to_jsonb(v_existing), 'sales_order_code', v_order.code);
  end if;

  v_receivable := public.fn_generate_accounts_receivable_from_sales_order(
    p_sales_order_id, p_category_id, p_cost_center_id, p_payment_terms_id, p_issue_date, p_due_date_base, p_description
  );
  return jsonb_build_object('created', true, 'receivable', to_jsonb(v_receivable), 'sales_order_code', v_order.code);
end;
$$;

-- ------------------------------------------------------------ 3. separação única aberta
create unique index if not exists pick_lists_open_per_order_unique
  on public.pick_lists (company_id, sales_order_id)
  where status in ('pending', 'in_progress');

create or replace function public.fn_create_pick_list(p_company_id uuid, p_sales_order_id uuid, p_warehouse_id uuid, p_notes text default null)
returns public.pick_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_pick_list public.pick_lists;
  v_open public.pick_lists;
  v_reservation record;
  v_item record;
  v_order_item_id uuid;
  v_items_created integer := 0;
begin
  if not public.has_permission(p_company_id, 'pick_lists.create') then
    raise exception 'Permissão negada (pick_lists.create).' using errcode = '42501';
  end if;

  select * into v_order from public.sales_orders where id = p_sales_order_id and company_id = p_company_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_open from public.pick_lists
  where company_id = p_company_id and sales_order_id = p_sales_order_id and status in ('pending', 'in_progress')
  limit 1;
  if found then
    raise exception 'O pedido % já tem a separação % em aberto. Use essa separação (ou cancele-a antes de criar outra).', v_order.code, v_open.code using errcode = 'P0001';
  end if;

  if v_order.status not in ('reserved', 'reservation_pending') then
    raise exception 'Só é possível separar um pedido com reserva (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  insert into public.pick_lists (company_id, sales_order_id, warehouse_id, notes, created_by)
  values (p_company_id, p_sales_order_id, p_warehouse_id, p_notes, public.current_app_user_id())
  returning * into v_pick_list;

  for v_reservation in
    select * from public.stock_reservations
    where company_id = p_company_id and reference_type = 'sales_order' and reference_id = p_sales_order_id and status = 'active'
  loop
    for v_item in
      select * from public.stock_reservation_items where reservation_id = v_reservation.id and quantity - consumed_quantity > 0
    loop
      select soi.id into v_order_item_id
      from public.sales_order_items soi
      where soi.order_id = p_sales_order_id and soi.product_id = v_item.product_id
      limit 1;

      if v_order_item_id is not null then
        insert into public.pick_list_items (
          company_id, pick_list_id, sales_order_item_id, product_id, location_id, lot_id, requested_quantity
        ) values (
          p_company_id, v_pick_list.id, v_order_item_id, v_item.product_id, v_reservation.location_id, v_item.lot_id,
          v_item.quantity - v_item.consumed_quantity
        );
        v_items_created := v_items_created + 1;
      end if;
    end loop;
  end loop;

  if v_items_created = 0 then
    raise exception 'Nenhum item reservado encontrado para este pedido — nada para separar.' using errcode = 'P0001';
  end if;

  update public.sales_orders set status = 'picking' where id = p_sales_order_id;

  return v_pick_list;
end;
$$;

-- ------------------------------------------------------------ 4. reserva consumida na expedição
alter table public.stock_reservation_items
  add column if not exists consumed_quantity numeric(16,4) not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_reservation_items_consumed_check') then
    alter table public.stock_reservation_items
      add constraint stock_reservation_items_consumed_check check (consumed_quantity >= 0 and consumed_quantity <= quantity);
  end if;
end $$;

-- Consome (FIFO) as reservas ativas do pedido para o produto/local que saiu.
-- Lote "solto": usa primeiro o mesmo lote, depois reservas sem lote.
create or replace function public.fn_consume_sales_order_reservation(
  p_company_id uuid, p_order_id uuid, p_product_id uuid, p_location_id uuid, p_lot_id uuid, p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_left numeric := p_quantity;
  v_item record;
  v_take numeric;
begin
  for v_item in
    select sri.id, sri.reservation_id, sri.quantity - sri.consumed_quantity as free
    from public.stock_reservation_items sri
    join public.stock_reservations sr on sr.id = sri.reservation_id
    where sr.company_id = p_company_id and sr.reference_type = 'sales_order' and sr.reference_id = p_order_id
      and sr.status = 'active' and sr.location_id = p_location_id and sri.product_id = p_product_id
      and sri.quantity - sri.consumed_quantity > 0
      and (sri.lot_id is not distinct from p_lot_id or sri.lot_id is null or p_lot_id is null)
    order by (sri.lot_id is not distinct from p_lot_id) desc, sr.created_at, sri.id
    for update of sri
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_item.free);
    update public.stock_reservation_items set consumed_quantity = consumed_quantity + v_take where id = v_item.id;
    v_left := v_left - v_take;
  end loop;

  update public.stock_reservations sr
  set status = 'consumed', consumed_at = now()
  where sr.company_id = p_company_id and sr.reference_type = 'sales_order' and sr.reference_id = p_order_id
    and sr.status = 'active'
    and not exists (
      select 1 from public.stock_reservation_items i where i.reservation_id = sr.id and i.quantity - i.consumed_quantity > 0
    );
end;
$$;

-- Liberar devolve só o que ainda não foi consumido.
create or replace function public.fn_release_reservation(p_reservation_id uuid)
returns public.stock_reservations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.stock_reservations;
  v_item record;
begin
  select * into v_reservation from public.stock_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_reservation.company_id, 'stock.update') then
    raise exception 'Permissão negada (stock.update).' using errcode = '42501';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'Só é possível liberar uma reserva ativa (status atual: %).', v_reservation.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_reservation_items where reservation_id = p_reservation_id and quantity - consumed_quantity > 0
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_reservation.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_reservation.location_id,
      p_movement_type => 'RELEASE',
      p_quantity => v_item.quantity - v_item.consumed_quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_reservation',
      p_reference_id => v_reservation.id,
      p_idempotency_key => 'reservation:release:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_reservations
  set status = 'released', released_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_reservation.company_id, public.current_app_user_id(), 'system',
    'stock_reservations', v_reservation.id, 'UPDATE',
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'released')
  );

  return v_reservation;
end;
$$;

-- Libera o que restou: o reservado do item volta a ser só o que já saiu.
create or replace function public.fn_release_sales_order_reservations_internal(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation record;
begin
  for v_reservation in
    select * from public.stock_reservations
    where reference_type = 'sales_order' and reference_id = p_order_id and status = 'active'
    order by id
  loop
    perform public.fn_release_reservation(v_reservation.id);
  end loop;

  update public.sales_order_items
  set reserved_quantity = shipped_quantity,
      picked_quantity = least(picked_quantity, shipped_quantity)
  where order_id = p_order_id;
end;
$$;

-- ------------------------------------------------------------ 5. corrida de reserva
-- Trava a linha de saldo (ordem determinística por produto) antes de ler o
-- disponível: o perdedor da corrida reserva o que sobrou, como em sequência.
create or replace function public.fn_reserve_sales_order_stock(p_order_id uuid, p_location_id uuid, p_idempotency_key text default null)
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

  perform 1 from public.stock_balances b
  where b.company_id = v_order.company_id and b.location_id = p_location_id and b.lot_id is null
    and b.product_id in (select product_id from public.sales_order_items where order_id = p_order_id and product_id is not null)
  order by b.product_id
  for update;

  for v_item in
    select * from public.sales_order_items
    where order_id = p_order_id and (ordered_quantity - cancelled_quantity - reserved_quantity) > 0
    order by product_id
  loop
    if v_item.product_id is null then
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

-- ------------------------------------------------------------ 6. expedição
create or replace function public.fn_create_shipment(
  p_company_id uuid, p_sales_order_id uuid, p_warehouse_id uuid, p_items jsonb,
  p_pick_list_id uuid default null, p_expected_ship_date date default null,
  p_delivery_zip_code text default null, p_delivery_state text default null, p_delivery_city text default null,
  p_delivery_neighborhood text default null, p_delivery_address text default null, p_delivery_address_number text default null,
  p_delivery_address_complement text default null, p_notes text default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_shipment public.shipments;
  v_item jsonb;
  v_order_item public.sales_order_items;
  v_qty numeric;
  v_location uuid;
  v_in_open numeric;
  v_free numeric;
  v_reserved_here numeric;
  v_open_here numeric;
  v_has_explicit_address boolean;
begin
  if not public.has_permission(p_company_id, 'shipments.create') then
    raise exception 'Permissão negada (shipments.create).' using errcode = '42501';
  end if;

  -- Trava o pedido: duas criações simultâneas não somam mais que o reservado.
  select * into v_order from public.sales_orders where id = p_sales_order_id and company_id = p_company_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if v_order.status not in ('reserved', 'ready_to_ship', 'partially_shipped') then
    raise exception 'Só é possível criar expedição para um pedido reservado ou pronto para envio (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A expedição precisa de ao menos um item.' using errcode = '22023';
  end if;

  v_has_explicit_address := p_delivery_address is not null or p_delivery_zip_code is not null;

  insert into public.shipments (
    company_id, sales_order_id, customer_id, warehouse_id, pick_list_id, expected_ship_date,
    delivery_zip_code, delivery_state, delivery_city, delivery_neighborhood,
    delivery_address, delivery_address_number, delivery_address_complement,
    notes, created_by
  ) values (
    p_company_id, p_sales_order_id, v_order.customer_id, p_warehouse_id, p_pick_list_id, p_expected_ship_date,
    case when v_has_explicit_address then p_delivery_zip_code else v_order.delivery_zip_code end,
    case when v_has_explicit_address then p_delivery_state else v_order.delivery_state end,
    case when v_has_explicit_address then p_delivery_city else v_order.delivery_city end,
    case when v_has_explicit_address then p_delivery_neighborhood else v_order.delivery_neighborhood end,
    case when v_has_explicit_address then p_delivery_address else v_order.delivery_address end,
    case when v_has_explicit_address then p_delivery_address_number else v_order.delivery_address_number end,
    case when v_has_explicit_address then p_delivery_address_complement else v_order.delivery_address_complement end,
    p_notes, public.current_app_user_id()
  )
  returning * into v_shipment;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from public.sales_order_items
    where id = (v_item->>'sales_order_item_id')::uuid and order_id = p_sales_order_id;
    if not found then
      raise exception 'Um dos itens informados não pertence a este pedido.' using errcode = 'P0002';
    end if;
    v_qty := (v_item->>'quantity')::numeric;
    v_location := (v_item->>'location_id')::uuid;

    -- Quanto deste item já está em expedições ABERTAS (inclui itens desta mesma chamada).
    select coalesce(sum(si.quantity), 0) into v_in_open
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id
    where si.sales_order_item_id = v_order_item.id
      and s.status in ('draft', 'ready', 'picking', 'packed', 'ready_to_ship');

    v_free := v_order_item.reserved_quantity - v_order_item.shipped_quantity - v_in_open;
    if v_qty > v_free then
      raise exception 'Não é possível criar a expedição: para o produto %, a quantidade a expedir (%) é maior que o reservado ainda livre para expedição (%).%',
        public.fn_product_label(v_order_item.product_id), public.fn_fmt_qty(v_qty), public.fn_fmt_qty(greatest(v_free, 0)),
        case when v_in_open > 0 then ' ' || public.fn_fmt_qty(v_in_open) || ' já está em outra expedição aberta deste pedido.' else '' end
        using errcode = 'P0001';
    end if;

    -- O estoque precisa estar reservado PARA ESTE PEDIDO no local escolhido.
    select coalesce(sum(sri.quantity - sri.consumed_quantity), 0) into v_reserved_here
    from public.stock_reservation_items sri
    join public.stock_reservations sr on sr.id = sri.reservation_id
    where sr.reference_type = 'sales_order' and sr.reference_id = p_sales_order_id and sr.status = 'active'
      and sr.location_id = v_location and sri.product_id = v_order_item.product_id;

    select coalesce(sum(si.quantity), 0) into v_open_here
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id
    where s.sales_order_id = p_sales_order_id and si.product_id = v_order_item.product_id and si.location_id = v_location
      and s.status in ('draft', 'ready', 'picking', 'packed', 'ready_to_ship');

    if v_qty > v_reserved_here - v_open_here then
      raise exception 'Não é possível criar a expedição: o pedido % não tem reserva suficiente neste local para o produto % (reservado livre aqui: %). Expeça do local onde o estoque foi reservado.',
        v_order.code, public.fn_product_label(v_order_item.product_id), public.fn_fmt_qty(greatest(v_reserved_here - v_open_here, 0))
        using errcode = 'P0001';
    end if;

    insert into public.shipment_items (
      company_id, shipment_id, sales_order_item_id, product_id, location_id, quantity, unit, lot_id, serial_numbers, weight, notes
    ) values (
      p_company_id, v_shipment.id, v_order_item.id, v_order_item.product_id,
      v_location,
      v_qty,
      coalesce(nullif(v_item->>'unit', ''), v_order_item.unit),
      nullif(v_item->>'lot_id', '')::uuid,
      v_item->'serial_numbers',
      nullif(v_item->>'weight', '')::numeric,
      nullif(v_item->>'notes', '')
    );
  end loop;

  return v_shipment;
end;
$$;

create or replace function public.fn_ship_shipment(p_shipment_id uuid, p_idempotency_key text default null)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_order public.sales_orders;
  v_item record;
  v_order_item public.sales_order_items;
  v_available_to_ship numeric;
  v_total_ordered numeric;
  v_total_shipped numeric;
  v_total_cancelled numeric;
  v_new_status text;
  v_movement public.stock_movements;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.ship') then
    raise exception 'Permissão negada (shipments.ship).' using errcode = '42501';
  end if;

  if v_shipment.status <> 'ready_to_ship' then
    raise exception 'Só é possível expedir uma expedição pronta para envio (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  select * into v_order from public.sales_orders where id = v_shipment.sales_order_id for update;
  if v_order.status in ('cancelled', 'completed') then
    raise exception 'Pedido no status % não pode ser expedido.', v_order.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.shipment_items where shipment_id = p_shipment_id order by product_id, id
  loop
    select * into v_order_item from public.sales_order_items where id = v_item.sales_order_item_id for update;

    v_available_to_ship := v_order_item.reserved_quantity - v_order_item.shipped_quantity;
    if v_item.quantity > v_available_to_ship then
      raise exception 'Produto %: quantidade a expedir (%) excede o saldo reservado disponível (%).',
        public.fn_product_label(v_item.product_id), public.fn_fmt_qty(v_item.quantity), public.fn_fmt_qty(v_available_to_ship) using errcode = 'P0001';
    end if;

    v_movement := public.fn_post_stock_movement(
      p_company_id => v_shipment.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_item.location_id,
      p_movement_type => 'ISSUE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'SHIPMENT',
      p_reference_id => v_shipment.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':issue:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_register_cost_movement(
      p_stock_movement_id => v_movement.id,
      p_source_type => 'shipment_item',
      p_source_id => v_item.id
    );

    perform public.fn_post_stock_movement(
      p_company_id => v_shipment.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_item.location_id,
      p_movement_type => 'RELEASE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'SHIPMENT',
      p_reference_id => v_shipment.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':release:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    -- R48-11: o que saiu consome a reserva do pedido (não fica "active").
    perform public.fn_consume_sales_order_reservation(
      v_shipment.company_id, v_order.id, v_item.product_id, v_item.location_id, v_item.lot_id, v_item.quantity
    );

    update public.sales_order_items set shipped_quantity = shipped_quantity + v_item.quantity where id = v_order_item.id;

    if v_item.serial_numbers is not null and jsonb_array_length(v_item.serial_numbers) > 0 then
      update public.product_serial_numbers
      set status = 'shipped', current_location_id = null
      where company_id = v_shipment.company_id and product_id = v_item.product_id
        and serial_number in (select jsonb_array_elements_text(v_item.serial_numbers));
    end if;
  end loop;

  select coalesce(sum(ordered_quantity), 0), coalesce(sum(shipped_quantity), 0), coalesce(sum(cancelled_quantity), 0)
  into v_total_ordered, v_total_shipped, v_total_cancelled
  from public.sales_order_items where order_id = v_order.id;

  v_new_status := case when v_total_shipped + v_total_cancelled >= v_total_ordered then 'shipped' else 'partially_shipped' end;
  update public.sales_orders set status = v_new_status where id = v_order.id;

  update public.shipments set status = 'shipped', shipped_at = now() where id = p_shipment_id
  returning * into v_shipment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id, 'SHIP',
    jsonb_build_object('status', 'ready_to_ship'), jsonb_build_object('status', 'shipped', 'sales_order_status', v_new_status));

  return v_shipment;
end;
$$;

-- ------------------------------------------------------------ 7. cancelamento do pedido
create or replace function public.fn_cancel_sales_order(p_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_open text;
begin
  select * into v_order from public.sales_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.cancel') then
    raise exception 'Permissão negada (sales_orders.cancel).' using errcode = '42501';
  end if;

  if v_order.status in ('shipped', 'completed', 'cancelled') then
    raise exception 'Pedido no status % não pode ser cancelado.', v_order.status using errcode = 'P0001';
  end if;

  -- R2-16 (decisão registrada): com tarefa aberta, recusa nomeando a tarefa.
  select string_agg(code, ', ' order by code) into v_open
  from public.pick_lists where sales_order_id = p_order_id and status in ('pending', 'in_progress');
  if v_open is not null then
    raise exception 'Não é possível cancelar o pedido %: a separação % está em aberto. Cancele a separação antes de cancelar o pedido.', v_order.code, v_open using errcode = 'P0001';
  end if;
  select string_agg(code, ', ' order by code) into v_open
  from public.shipments where sales_order_id = p_order_id and status in ('draft', 'ready', 'picking', 'packed', 'ready_to_ship');
  if v_open is not null then
    raise exception 'Não é possível cancelar o pedido %: a expedição % está em aberto. Cancele a expedição antes de cancelar o pedido.', v_order.code, v_open using errcode = 'P0001';
  end if;

  -- Libera o que restou reservado (inclusive depois da separação ou de expedição parcial).
  perform public.fn_release_sales_order_reservations_internal(p_order_id);

  update public.sales_order_items
  set cancelled_quantity = ordered_quantity - shipped_quantity
  where order_id = p_order_id and (ordered_quantity - shipped_quantity - cancelled_quantity) > 0;

  update public.sales_orders set status = 'cancelled' where id = p_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'sales_orders', v_order.id, 'CANCEL',
    null, jsonb_build_object('status', 'cancelled'));

  return v_order;
end;
$$;

-- ------------------------------------------------------------ 8. dados existentes
-- Pedidos já expedidos/concluídos: o que estava reservado e saiu é consumo.
update public.stock_reservation_items sri
set consumed_quantity = sri.quantity
from public.stock_reservations sr
join public.sales_orders so on so.id = sr.reference_id
where sri.reservation_id = sr.id and sr.reference_type = 'sales_order' and sr.status = 'active'
  and so.status in ('shipped', 'completed');

update public.stock_reservations sr
set status = 'consumed', consumed_at = coalesce(sr.consumed_at, now())
from public.sales_orders so
where so.id = sr.reference_id and sr.reference_type = 'sales_order' and sr.status = 'active'
  and so.status in ('shipped', 'completed');

-- ------------------------------------------------------------ permissões
revoke all on function public.fn_generate_receivable_for_sales_order(uuid, uuid, uuid, uuid, date, date, text) from public;
grant execute on function public.fn_generate_receivable_for_sales_order(uuid, uuid, uuid, uuid, date, date, text) to authenticated;
revoke all on function public.fn_fmt_qty(numeric) from public;
grant execute on function public.fn_fmt_qty(numeric) to authenticated;
revoke all on function public.fn_product_label(uuid) from public;
grant execute on function public.fn_product_label(uuid) to authenticated;
revoke all on function public.fn_consume_sales_order_reservation(uuid, uuid, uuid, uuid, uuid, numeric) from public;
