-- Fase 5 — Logística/Expedição: Expedição (shipments).
--
-- Onde Logística finalmente encosta em Estoque — e SOMENTE aqui.
-- fn_ship_shipment é a única função deste módulo que chama
-- fn_post_stock_movement; nenhuma outra parte de Logística toca em
-- stock_balances/stock_movements, direta ou indiretamente. Reutiliza
-- carriers/drivers/vehicles (0002) — nenhum cadastro novo.

alter table public.drivers
  add constraint drivers_id_company_id_key unique (id, company_id);
alter table public.vehicles
  add constraint vehicles_id_company_id_key unique (id, company_id);

create sequence if not exists public.shipments_code_seq;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  sales_order_id uuid not null,
  customer_id uuid not null,
  warehouse_id uuid not null,
  pick_list_id uuid,
  status text not null default 'draft' check (status in (
    'draft', 'ready', 'picking', 'packed', 'ready_to_ship',
    'shipped', 'in_transit', 'delivered', 'completed', 'cancelled'
  )),
  carrier_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  -- Snapshot do endereço de entrega — herdado de sales_orders no
  -- momento da criação (que por sua vez já o herdou de customers em
  -- 0021). Um pedido com múltiplas expedições pode, em tese, enviar
  -- volumes para endereços diferentes — por isso cada shipment tem sua
  -- própria cópia, não uma referência só ao pedido.
  delivery_zip_code text,
  delivery_state text,
  delivery_city text,
  delivery_neighborhood text,
  delivery_address text,
  delivery_address_number text,
  delivery_address_complement text,
  expected_ship_date date,
  shipped_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (sales_order_id, company_id) references public.sales_orders (id, company_id) on delete restrict,
  foreign key (customer_id, company_id) references public.customers (id, company_id) on delete restrict,
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete restrict,
  foreign key (pick_list_id, company_id) references public.pick_lists (id, company_id) on delete set null,
  foreign key (carrier_id, company_id) references public.carriers (id, company_id) on delete set null,
  foreign key (driver_id, company_id) references public.drivers (id, company_id) on delete set null,
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id) on delete set null
);

create trigger set_code before insert on public.shipments
  for each row execute procedure public.fn_generate_code('EXP', 'public.shipments_code_seq');
create trigger set_updated_at before update on public.shipments
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists shipments_company_status_idx on public.shipments (company_id, status);
create index if not exists shipments_order_idx on public.shipments (sales_order_id);

comment on table public.shipments is
  'Expedição — envio físico de (parte de) um Pedido de Venda. Um pedido pode ter mais de uma expedição (expedição parcial, seção 21). Escrita exclusiva via fn_create_shipment e as demais fn_* desta migration.';
comment on column public.shipments.status is
  'picking existe no vocabulário por paridade com o pedido, mas nenhuma função desta etapa o define — a separação em si é conduzida por pick_lists (0023) antes da expedição existir.';

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shipment_id uuid not null,
  sales_order_item_id uuid not null,
  product_id uuid not null,
  location_id uuid not null,
  quantity numeric(16, 4) not null check (quantity > 0),
  unit text,
  lot_id uuid,
  serial_numbers jsonb,
  weight numeric(12, 3),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (shipment_id, company_id) references public.shipments (id, company_id) on delete cascade,
  foreign key (sales_order_item_id, company_id) references public.sales_order_items (id, company_id) on delete restrict,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create index if not exists shipment_items_shipment_idx on public.shipment_items (shipment_id);
create index if not exists shipment_items_order_item_idx on public.shipment_items (sales_order_item_id);

comment on column public.shipment_items.location_id is
  'De onde a mercadoria efetivamente sai (informado pelo chamador — normalmente o mesmo local da pick_list_item correspondente). fn_ship_shipment usa exatamente este local ao chamar fn_post_stock_movement.';

create table if not exists public.shipment_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shipment_id uuid not null,
  package_number integer not null check (package_number > 0),
  weight numeric(12, 3),
  height numeric(12, 2),
  width numeric(12, 2),
  length numeric(12, 2),
  tracking_code text,
  notes text,
  created_at timestamptz not null default now(),
  unique (shipment_id, package_number),
  foreign key (shipment_id, company_id) references public.shipments (id, company_id) on delete cascade
);

create index if not exists shipment_packages_shipment_idx on public.shipment_packages (shipment_id);

comment on table public.shipment_packages is
  'Volumes de uma expedição. Base para cubagem futura — sem cálculo automático de peso cubado nesta etapa.';

-- ==================================================================
-- fn_create_shipment
-- ==================================================================
create or replace function public.fn_create_shipment(
  p_company_id uuid,
  p_sales_order_id uuid,
  p_warehouse_id uuid,
  p_items jsonb,
  p_pick_list_id uuid default null,
  p_expected_ship_date date default null,
  p_delivery_zip_code text default null,
  p_delivery_state text default null,
  p_delivery_city text default null,
  p_delivery_neighborhood text default null,
  p_delivery_address text default null,
  p_delivery_address_number text default null,
  p_delivery_address_complement text default null,
  p_notes text default null
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
  v_available_to_ship numeric;
  v_has_explicit_address boolean;
begin
  if not public.has_permission(p_company_id, 'shipments.create') then
    raise exception 'Permissão negada (shipments.create).' using errcode = '42501';
  end if;

  select * into v_order from public.sales_orders where id = p_sales_order_id and company_id = p_company_id;
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
      raise exception 'Item do pedido não encontrado (sales_order_item_id inválido para este pedido).' using errcode = 'P0002';
    end if;

    v_available_to_ship := v_order_item.reserved_quantity - v_order_item.shipped_quantity;
    if (v_item->>'quantity')::numeric > v_available_to_ship then
      raise exception 'Item %: quantidade a expedir (%) excede o saldo reservado disponível (%). Reserve mais estoque ou reduza a quantidade.', v_order_item.product_id, (v_item->>'quantity')::numeric, v_available_to_ship using errcode = 'P0001';
    end if;

    insert into public.shipment_items (
      company_id, shipment_id, sales_order_item_id, product_id, location_id, quantity, unit, lot_id, serial_numbers, weight, notes
    ) values (
      p_company_id, v_shipment.id, v_order_item.id, v_order_item.product_id,
      (v_item->>'location_id')::uuid,
      (v_item->>'quantity')::numeric,
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

-- ==================================================================
-- fn_assign_shipment_transport — valida coerência (seção 14): se
-- driver/vehicle já têm um carrier_id próprio definido, precisa ser o
-- mesmo informado aqui. Campos nulos (motorista/veículo autônomos,
-- sem transportadora vinculada no cadastro) não são bloqueados.
-- ==================================================================
create or replace function public.fn_assign_shipment_transport(
  p_shipment_id uuid,
  p_carrier_id uuid default null,
  p_driver_id uuid default null,
  p_vehicle_id uuid default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_driver public.drivers;
  v_vehicle public.vehicles;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.update') then
    raise exception 'Permissão negada (shipments.update).' using errcode = '42501';
  end if;

  if v_shipment.status in ('shipped', 'in_transit', 'delivered', 'completed', 'cancelled') then
    raise exception 'Não é possível alterar o transporte de uma expedição no status %.', v_shipment.status using errcode = 'P0001';
  end if;

  if p_driver_id is not null then
    select * into v_driver from public.drivers where id = p_driver_id and company_id = v_shipment.company_id;
    if not found then
      raise exception 'Motorista não encontrado.' using errcode = 'P0002';
    end if;
    if v_driver.carrier_id is not null and p_carrier_id is not null and v_driver.carrier_id <> p_carrier_id then
      raise exception 'Motorista não pertence à transportadora informada.' using errcode = 'P0001';
    end if;
  end if;

  if p_vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = p_vehicle_id and company_id = v_shipment.company_id;
    if not found then
      raise exception 'Veículo não encontrado.' using errcode = 'P0002';
    end if;
    if v_vehicle.carrier_id is not null and p_carrier_id is not null and v_vehicle.carrier_id <> p_carrier_id then
      raise exception 'Veículo não pertence à transportadora informada.' using errcode = 'P0001';
    end if;
    if v_vehicle.driver_id is not null and p_driver_id is not null and v_vehicle.driver_id <> p_driver_id then
      raise exception 'Veículo está vinculado a outro motorista.' using errcode = 'P0001';
    end if;
  end if;

  update public.shipments
  set carrier_id = p_carrier_id, driver_id = p_driver_id, vehicle_id = p_vehicle_id
  where id = p_shipment_id
  returning * into v_shipment;

  return v_shipment;
end;
$$;

create or replace function public.fn_add_shipment_package(
  p_shipment_id uuid,
  p_package_number integer,
  p_weight numeric default null,
  p_height numeric default null,
  p_width numeric default null,
  p_length numeric default null,
  p_tracking_code text default null,
  p_notes text default null
)
returns public.shipment_packages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_package public.shipment_packages;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.update') then
    raise exception 'Permissão negada (shipments.update).' using errcode = '42501';
  end if;

  insert into public.shipment_packages (company_id, shipment_id, package_number, weight, height, width, length, tracking_code, notes)
  values (v_shipment.company_id, p_shipment_id, p_package_number, p_weight, p_height, p_width, p_length, p_tracking_code, p_notes)
  returning * into v_package;

  return v_package;
end;
$$;

create or replace function public.fn_mark_shipment_ready(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.update') then
    raise exception 'Permissão negada (shipments.update).' using errcode = '42501';
  end if;

  if v_shipment.status <> 'draft' then
    raise exception 'Só é possível marcar como pronta uma expedição em rascunho (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  update public.shipments set status = 'ready' where id = p_shipment_id
  returning * into v_shipment;

  return v_shipment;
end;
$$;

create or replace function public.fn_pack_shipment(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.update') then
    raise exception 'Permissão negada (shipments.update).' using errcode = '42501';
  end if;

  if v_shipment.status <> 'ready' then
    raise exception 'Só é possível embalar uma expedição pronta (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  update public.shipments set status = 'packed' where id = p_shipment_id
  returning * into v_shipment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id, 'PACK',
    jsonb_build_object('status', 'ready'), jsonb_build_object('status', 'packed'));

  return v_shipment;
end;
$$;

create or replace function public.fn_approve_shipment(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.approve') then
    raise exception 'Permissão negada (shipments.approve).' using errcode = '42501';
  end if;

  if v_shipment.status <> 'packed' then
    raise exception 'Só é possível aprovar uma expedição embalada (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  update public.shipments set status = 'ready_to_ship' where id = p_shipment_id
  returning * into v_shipment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id, 'APPROVE',
    jsonb_build_object('status', 'packed'), jsonb_build_object('status', 'ready_to_ship'));

  return v_shipment;
end;
$$;

-- ==================================================================
-- fn_ship_shipment — TRANSACIONAL. Único ponto de contato de
-- Logística com o ledger de estoque.
--
-- Para cada item: grava ISSUE (reduz on_hand) + RELEASE (reduz
-- reserved) pela MESMA quantidade parcial que está saindo — é
-- exatamente o que fn_consume_reservation (0011) faz, só que essa
-- função consome a reserva INTEIRA de uma vez; como um pedido de
-- venda pode precisar de várias expedições parciais contra a mesma
-- reserva (seção 21), a consumição aqui é feita diretamente via
-- fn_post_stock_movement (o mesmo primitivo por baixo de
-- fn_consume_reservation), na quantidade exata desta expedição — não é
-- um mecanismo paralelo, é o mesmo primitivo usado de forma parcial.
--
-- Trava o pedido E cada sales_order_item envolvido (for update) antes
-- de validar "a expedir <= reservado disponível" — mesma técnica de
-- fn_confirm_purchase_receipt (0018) — fechando a mesma janela de
-- corrida para "não expedir duas vezes" e "não expedir mais que o
-- reservado" sob concorrência.
-- ==================================================================
create or replace function public.fn_ship_shipment(
  p_shipment_id uuid,
  p_idempotency_key text default null
)
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

  for v_item in select * from public.shipment_items where shipment_id = p_shipment_id
  loop
    select * into v_order_item from public.sales_order_items where id = v_item.sales_order_item_id for update;

    v_available_to_ship := v_order_item.reserved_quantity - v_order_item.shipped_quantity;
    if v_item.quantity > v_available_to_ship then
      raise exception 'Item %: quantidade a expedir (%) excede o saldo reservado disponível (%).', v_item.product_id, v_item.quantity, v_available_to_ship using errcode = 'P0001';
    end if;

    perform public.fn_post_stock_movement(
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

create or replace function public.fn_cancel_shipment(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.cancel') then
    raise exception 'Permissão negada (shipments.cancel).' using errcode = '42501';
  end if;

  if v_shipment.status in ('shipped', 'in_transit', 'delivered', 'completed', 'cancelled') then
    raise exception 'Expedição no status % não pode ser cancelada — nenhum estoque foi movimentado ainda só até ready_to_ship.', v_shipment.status using errcode = 'P0001';
  end if;

  update public.shipments set status = 'cancelled' where id = p_shipment_id
  returning * into v_shipment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id, 'CANCEL',
    null, jsonb_build_object('status', 'cancelled'));

  return v_shipment;
end;
$$;

revoke all on function public.fn_create_shipment(uuid, uuid, uuid, jsonb, uuid, date, text, text, text, text, text, text, text, text) from public;
revoke all on function public.fn_assign_shipment_transport(uuid, uuid, uuid, uuid) from public;
revoke all on function public.fn_add_shipment_package(uuid, integer, numeric, numeric, numeric, numeric, text, text) from public;
revoke all on function public.fn_mark_shipment_ready(uuid) from public;
revoke all on function public.fn_pack_shipment(uuid) from public;
revoke all on function public.fn_approve_shipment(uuid) from public;
revoke all on function public.fn_ship_shipment(uuid, text) from public;
revoke all on function public.fn_cancel_shipment(uuid) from public;
grant execute on function public.fn_create_shipment(uuid, uuid, uuid, jsonb, uuid, date, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.fn_assign_shipment_transport(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_add_shipment_package(uuid, integer, numeric, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function public.fn_mark_shipment_ready(uuid) to authenticated;
grant execute on function public.fn_pack_shipment(uuid) to authenticated;
grant execute on function public.fn_approve_shipment(uuid) to authenticated;
grant execute on function public.fn_ship_shipment(uuid, text) to authenticated;
grant execute on function public.fn_cancel_shipment(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('shipments.view', 'shipments', 'view', 'Consultar expedições'),
    ('shipments.create', 'shipments', 'create', 'Criar expedições, atribuir transporte e volumes'),
    ('shipments.update', 'shipments', 'update', 'Editar, embalar e preparar expedições'),
    ('shipments.approve', 'shipments', 'approve', 'Aprovar expedição embalada (pronta para envio)'),
    ('shipments.ship', 'shipments', 'ship', 'Expedir — gera saída real de estoque'),
    ('shipments.cancel', 'shipments', 'cancel', 'Cancelar expedição ainda não expedida')
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
alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.shipment_packages enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('shipments'), ('shipment_items'), ('shipment_packages')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'shipments.view'
    );
  end loop;
end;
$$;
