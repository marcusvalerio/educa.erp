-- Fase 4 — Comercial: Pedido de Venda + integração com reserva de
-- estoque.
--
-- Workflow: draft -> pending_approval -> approved -> reservation_pending
--   -> reserved -> picking -> ready_to_ship -> shipped -> completed,
--   mais cancelled. Nesta etapa NÃO é implementado Picking/Expedição
--   (picking/ready_to_ship/shipped/completed nunca são setados por
--   nenhuma função aqui — só existem no vocabulário do CHECK para o
--   modelo já nascer pronto, ver docs/COMMERCIAL.md).
--
-- Reserva de estoque REUTILIZA integralmente stock_reservations/
-- stock_reservation_items (0011) via fn_create_reservation/
-- fn_release_reservation — nenhum mecanismo paralelo. Disponibilidade
-- (on_hand - reservas existentes) já é stock_balances.available
-- (coluna gerada desde 0009) — reaproveitada diretamente, nenhum
-- cálculo novo.

-- Pré-requisito para a FK composta carrier_id (preparação de
-- logística/expedição — seção 18) — mesma técnica já usada em
-- warehouse_locations/products/roles.
alter table public.carriers
  add constraint carriers_id_company_id_key unique (id, company_id);

create sequence if not exists public.sales_orders_code_seq;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  customer_id uuid not null,
  sales_representative_id uuid,
  sales_quote_id uuid,
  price_list_id uuid,
  payment_terms_id uuid,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'reservation_pending', 'reserved',
    'picking', 'ready_to_ship', 'shipped', 'completed', 'cancelled'
  )),
  order_date date not null default current_date,
  expected_delivery_at date,
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  freight_cost numeric(14, 4) not null default 0 check (freight_cost >= 0),
  total_amount numeric(16, 4) not null default 0,
  -- Snapshot do endereço de entrega no momento do pedido (seção 17) —
  -- o cliente pode alterar o cadastro depois sem afetar pedidos já
  -- feitos.
  delivery_zip_code text,
  delivery_state text,
  delivery_city text,
  delivery_neighborhood text,
  delivery_address text,
  delivery_address_number text,
  delivery_address_complement text,
  -- Preparação de logística/expedição (seção 18) — referência apenas,
  -- nenhum TMS implementado.
  carrier_id uuid,
  -- Preparação fiscal (seção 19) — referência apenas, nenhum módulo
  -- fiscal acoplado. Mesmo padrão de purchase_receipts (0018).
  fiscal_document_type text,
  fiscal_document_number text,
  fiscal_document_series text,
  fiscal_access_key text,
  fiscal_status text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers (id, company_id) on delete restrict,
  foreign key (sales_representative_id, company_id) references public.sales_representatives (id, company_id) on delete set null,
  foreign key (sales_quote_id, company_id) references public.sales_quotes (id, company_id) on delete set null,
  foreign key (price_list_id, company_id) references public.price_lists (id, company_id) on delete set null,
  foreign key (payment_terms_id, company_id) references public.payment_terms (id, company_id) on delete set null,
  foreign key (carrier_id, company_id) references public.carriers (id, company_id) on delete set null
);

create trigger set_code before insert on public.sales_orders
  for each row execute procedure public.fn_generate_code('PV', 'public.sales_orders_code_seq');
create trigger set_updated_at before update on public.sales_orders
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists sales_orders_company_status_idx on public.sales_orders (company_id, status);
create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id);
create index if not exists sales_orders_quote_idx on public.sales_orders (sales_quote_id);

comment on table public.sales_orders is
  'Pedido de Venda — compromisso comercial. Escrita exclusiva via fn_create_sales_order e as demais fn_* desta migration. Reserva de estoque delega inteiramente a stock_reservations (0011).';
comment on column public.sales_orders.fiscal_status is
  'Referência apenas — nenhum módulo fiscal implementado nesta etapa. Preparado para uma futura emissão (NF-e de saída).';

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  description text not null,
  unit text,
  ordered_quantity numeric(16, 4) not null check (ordered_quantity > 0),
  reserved_quantity numeric(16, 4) not null default 0 check (reserved_quantity >= 0),
  picked_quantity numeric(16, 4) not null default 0 check (picked_quantity >= 0),
  shipped_quantity numeric(16, 4) not null default 0 check (shipped_quantity >= 0),
  cancelled_quantity numeric(16, 4) not null default 0 check (cancelled_quantity >= 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  line_total numeric(16, 4) generated always as (ordered_quantity * unit_price - discount) stored,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (order_id, company_id) references public.sales_orders (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  constraint sales_order_items_reserved_within_ordered check (reserved_quantity + cancelled_quantity <= ordered_quantity),
  constraint sales_order_items_picked_within_reserved check (picked_quantity <= reserved_quantity),
  constraint sales_order_items_shipped_within_picked check (shipped_quantity <= picked_quantity)
);

create index if not exists sales_order_items_order_idx on public.sales_order_items (order_id);
create index if not exists sales_order_items_product_idx on public.sales_order_items (product_id);

comment on column public.sales_order_items.reserved_quantity is
  'Nunca escrito diretamente pela API — só por fn_reserve_sales_order_stock/fn_release_sales_order_reservation, em espelho ao que stock_reservation_items realmente reservou.';

-- ==================================================================
-- total_amount sempre derivado — mesmo padrão de purchase_orders (0016)
-- e sales_quotes (0020).
-- ==================================================================
create or replace function public.fn_recalculate_sales_order_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := coalesce(NEW.order_id, OLD.order_id);
  v_items_total numeric;
begin
  select coalesce(sum(line_total), 0) into v_items_total from public.sales_order_items where order_id = v_order_id;
  update public.sales_orders set total_amount = v_items_total + freight_cost - discount where id = v_order_id;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists recalculate_total on public.sales_order_items;
create trigger recalculate_total
  after insert or update or delete on public.sales_order_items
  for each row execute procedure public.fn_recalculate_sales_order_total();

create or replace function public.fn_recalculate_sales_order_total_on_header()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items_total numeric;
begin
  if NEW.freight_cost is distinct from OLD.freight_cost or NEW.discount is distinct from OLD.discount then
    select coalesce(sum(line_total), 0) into v_items_total from public.sales_order_items where order_id = NEW.id;
    NEW.total_amount := v_items_total + NEW.freight_cost - NEW.discount;
  end if;
  return NEW;
end;
$$;

drop trigger if exists recalculate_total_on_header on public.sales_orders;
create trigger recalculate_total_on_header
  before update on public.sales_orders
  for each row execute procedure public.fn_recalculate_sales_order_total_on_header();

-- ==================================================================
-- fn_create_sales_order — se p_items vier vazio/nulo e
-- p_sales_quote_id for informado, copia os itens do orçamento (que
-- precisa estar 'approved') — é como um orçamento "vira" pedido. Se
-- p_items vier preenchido, usa os itens informados independentemente
-- de haver ou não uma cotação de referência.
--
-- Endereço de entrega: se nenhum campo de endereço for informado,
-- fotografa o endereço atual do cliente (customers) no pedido —
-- alterações futuras no cadastro do cliente não afetam pedidos já
-- criados.
-- ==================================================================
create or replace function public.fn_create_sales_order(
  p_company_id uuid,
  p_customer_id uuid,
  p_items jsonb default null,
  p_sales_quote_id uuid default null,
  p_sales_representative_id uuid default null,
  p_price_list_id uuid default null,
  p_payment_terms_id uuid default null,
  p_discount numeric default 0,
  p_freight_cost numeric default 0,
  p_expected_delivery_at date default null,
  p_delivery_zip_code text default null,
  p_delivery_state text default null,
  p_delivery_city text default null,
  p_delivery_neighborhood text default null,
  p_delivery_address text default null,
  p_delivery_address_number text default null,
  p_delivery_address_complement text default null,
  p_notes text default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_quote public.sales_quotes;
  v_customer public.customers;
  v_item jsonb;
  v_has_explicit_address boolean;
begin
  if not public.has_permission(p_company_id, 'sales_orders.create') then
    raise exception 'Permissão negada (sales_orders.create).' using errcode = '42501';
  end if;

  select * into v_customer from public.customers where id = p_customer_id and company_id = p_company_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  if p_sales_quote_id is not null then
    select * into v_quote from public.sales_quotes where id = p_sales_quote_id and company_id = p_company_id;
    if not found then
      raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
    end if;
    if v_quote.status <> 'approved' then
      raise exception 'Só é possível gerar pedido a partir de um orçamento aprovado (status atual: %).', v_quote.status using errcode = 'P0001';
    end if;
  end if;

  v_has_explicit_address := p_delivery_address is not null or p_delivery_zip_code is not null;

  insert into public.sales_orders (
    company_id, customer_id, sales_representative_id, sales_quote_id, price_list_id, payment_terms_id,
    discount, freight_cost, expected_delivery_at,
    delivery_zip_code, delivery_state, delivery_city, delivery_neighborhood,
    delivery_address, delivery_address_number, delivery_address_complement,
    notes, created_by
  ) values (
    p_company_id, p_customer_id,
    coalesce(p_sales_representative_id, v_customer.default_sales_representative_id),
    p_sales_quote_id,
    coalesce(p_price_list_id, v_customer.default_price_list_id),
    coalesce(p_payment_terms_id, v_customer.default_payment_terms_id),
    coalesce(p_discount, 0), coalesce(p_freight_cost, 0), p_expected_delivery_at,
    case when v_has_explicit_address then p_delivery_zip_code else v_customer.zip_code end,
    case when v_has_explicit_address then p_delivery_state else v_customer.state end,
    case when v_has_explicit_address then p_delivery_city else v_customer.city end,
    case when v_has_explicit_address then p_delivery_neighborhood else v_customer.neighborhood end,
    case when v_has_explicit_address then p_delivery_address else v_customer.address end,
    case when v_has_explicit_address then p_delivery_address_number else v_customer.address_number end,
    case when v_has_explicit_address then p_delivery_address_complement else v_customer.address_complement end,
    p_notes, public.current_app_user_id()
  )
  returning * into v_order;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    if p_sales_quote_id is null then
      raise exception 'O pedido precisa de ao menos um item (informe items ou um orçamento aprovado).' using errcode = '22023';
    end if;
    insert into public.sales_order_items (company_id, order_id, product_id, description, unit, ordered_quantity, unit_price, discount, notes)
    select p_company_id, v_order.id, qi.product_id, qi.description, qi.unit, qi.quantity, qi.unit_price, qi.discount, qi.notes
    from public.sales_quote_items qi
    where qi.quote_id = p_sales_quote_id;
  else
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.sales_order_items (company_id, order_id, product_id, description, unit, ordered_quantity, unit_price, discount, notes)
      values (
        p_company_id, v_order.id,
        nullif(v_item->>'product_id', '')::uuid,
        v_item->>'description',
        nullif(v_item->>'unit', ''),
        (v_item->>'quantity')::numeric,
        (v_item->>'unit_price')::numeric,
        coalesce((v_item->>'discount')::numeric, 0),
        nullif(v_item->>'notes', '')
      );
    end loop;
  end if;

  select * into v_order from public.sales_orders where id = v_order.id;
  return v_order;
end;
$$;

create or replace function public.fn_submit_sales_order_for_approval(p_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
begin
  select * into v_order from public.sales_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.update') then
    raise exception 'Permissão negada (sales_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'Só é possível enviar para aprovação um pedido em rascunho (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.sales_orders set status = 'pending_approval' where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.fn_approve_sales_order(p_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
begin
  select * into v_order from public.sales_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.approve') then
    raise exception 'Permissão negada (sales_orders.approve).' using errcode = '42501';
  end if;

  if v_order.status <> 'pending_approval' then
    raise exception 'Só é possível aprovar um pedido pendente de aprovação (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.sales_orders
  set status = 'approved', approved_by = public.current_app_user_id(), approved_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'sales_orders', v_order.id, 'APPROVE',
    jsonb_build_object('status', 'pending_approval'), jsonb_build_object('status', 'approved'));

  return v_order;
end;
$$;

-- ==================================================================
-- fn_reserve_sales_order_stock — a integração crítica com estoque.
-- Chamável várias vezes (top-up): a cada chamada, tenta cobrir só o
-- que ainda está pendente por item, respeitando o disponível ATUAL
-- (stock_balances.available, já líquido de reservas existentes — não
-- um cálculo novo). Reserva parcial é o caminho normal, não uma
-- exceção: cada item recebe min(pendente, disponível); o que não
-- couber fica pendente para uma futura chamada (ex.: depois de um
-- recebimento de compra repor o estoque).
--
-- Overbooking é estruturalmente impossível: o que de fato é gravado
-- passa por fn_create_reservation -> fn_post_stock_movement, que trava
-- a linha de stock_balances (for update) e rejeita qualquer reserva
-- que excederia on_hand — dois pedidos de venda concorrentes disputando
-- o mesmo produto/local serializam ali, não aqui. Esta função só
-- decide QUANTO tentar reservar por item antes de chamar a função que
-- garante o quanto realmente pode.
-- ==================================================================
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
    select public.fn_create_reservation(
      p_company_id => v_order.company_id,
      p_location_id => p_location_id,
      p_items => v_reservation_items,
      p_notes => 'Reserva do pedido de venda ' || v_order.code,
      p_reference_type => 'sales_order',
      p_reference_id => v_order.id
    ) into v_reservation;

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

-- fn_release_sales_order_reservations_internal — helper interno
-- (sem grant a authenticated) usado por fn_release_sales_order_reservation
-- e fn_cancel_sales_order. Libera TODAS as stock_reservations ativas
-- referenciando este pedido via fn_release_reservation (0011) — nenhuma
-- lógica de movimento reimplementada aqui.
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
  loop
    perform public.fn_release_reservation(v_reservation.id);
  end loop;

  update public.sales_order_items set reserved_quantity = 0 where order_id = p_order_id;
end;
$$;

revoke all on function public.fn_release_sales_order_reservations_internal(uuid) from public;

create or replace function public.fn_release_sales_order_reservation(p_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
begin
  select * into v_order from public.sales_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.update') then
    raise exception 'Permissão negada (sales_orders.update).' using errcode = '42501';
  end if;

  if v_order.status not in ('reservation_pending', 'reserved') then
    raise exception 'Este pedido não tem reserva ativa para liberar (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  perform public.fn_release_sales_order_reservations_internal(p_order_id);

  update public.sales_orders set status = 'approved' where id = p_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'sales_orders', v_order.id, 'RELEASE',
    null, jsonb_build_object('status', 'approved'));

  return v_order;
end;
$$;

-- ==================================================================
-- fn_cancel_sales_order — libera qualquer reserva ativa (nunca deixa
-- uma reserva órfã), cancela a quantidade ainda pendente de cada item
-- e encerra o pedido. Bloqueado a partir de 'shipped'/'completed' —
-- expedição não foi implementada nesta etapa, então na prática nenhum
-- pedido chega lá ainda; o guard já fica pronto para quando existir.
-- ==================================================================
create or replace function public.fn_cancel_sales_order(p_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
begin
  select * into v_order from public.sales_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.cancel') then
    raise exception 'Permissão negada (sales_orders.cancel).' using errcode = '42501';
  end if;

  if v_order.status in ('shipped', 'completed', 'cancelled') then
    raise exception 'Pedido no status % não pode ser cancelado.', v_order.status using errcode = 'P0001';
  end if;

  if v_order.status in ('reservation_pending', 'reserved') then
    perform public.fn_release_sales_order_reservations_internal(p_order_id);
  end if;

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

revoke all on function public.fn_create_sales_order(
  uuid, uuid, jsonb, uuid, uuid, uuid, uuid, numeric, numeric, date, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.fn_submit_sales_order_for_approval(uuid) from public;
revoke all on function public.fn_approve_sales_order(uuid) from public;
revoke all on function public.fn_reserve_sales_order_stock(uuid, uuid, text) from public;
revoke all on function public.fn_release_sales_order_reservation(uuid) from public;
revoke all on function public.fn_cancel_sales_order(uuid) from public;
grant execute on function public.fn_create_sales_order(
  uuid, uuid, jsonb, uuid, uuid, uuid, uuid, numeric, numeric, date, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.fn_submit_sales_order_for_approval(uuid) to authenticated;
grant execute on function public.fn_approve_sales_order(uuid) to authenticated;
grant execute on function public.fn_reserve_sales_order_stock(uuid, uuid, text) to authenticated;
grant execute on function public.fn_release_sales_order_reservation(uuid) to authenticated;
grant execute on function public.fn_cancel_sales_order(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('sales_orders.view', 'sales_orders', 'view', 'Consultar pedidos de venda'),
    ('sales_orders.create', 'sales_orders', 'create', 'Criar pedidos de venda'),
    ('sales_orders.update', 'sales_orders', 'update', 'Editar pedidos de venda e liberar reservas'),
    ('sales_orders.approve', 'sales_orders', 'approve', 'Aprovar pedidos de venda'),
    ('sales_orders.cancel', 'sales_orders', 'cancel', 'Cancelar pedidos de venda'),
    ('sales_orders.reserve', 'sales_orders', 'reserve', 'Reservar estoque para um pedido de venda')
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

-- ==================================================================
-- RLS
-- ==================================================================
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;

drop policy if exists sales_orders_select on public.sales_orders;
create policy sales_orders_select on public.sales_orders
  for select to authenticated using (public.has_permission(company_id, 'sales_orders.view'));

drop policy if exists sales_order_items_select on public.sales_order_items;
create policy sales_order_items_select on public.sales_order_items
  for select to authenticated using (public.has_permission(company_id, 'sales_orders.view'));
