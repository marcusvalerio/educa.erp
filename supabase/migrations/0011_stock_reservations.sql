-- Fase 2c — Estoque/WMS: reservas de estoque (reduzem `available` sem
-- mexer em `on_hand`) e sua liberação/consumo.
--
-- Ciclo: active -> released (libera sem consumir, ex.: pedido cancelado)
--             ou -> consumed (a reserva vira saída real, ex.: pedido
--                 expedido — grava ISSUE + RELEASE juntos)
--
-- Mesma arquitetura de 0009/0010: tabelas só com policy de SELECT para
-- authenticated; toda escrita via funções, que chamam
-- fn_post_stock_movement (que por sua vez garante reserved <= on_hand).

create sequence if not exists public.stock_reservations_code_seq;

create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  location_id uuid not null,
  status text not null default 'active' check (status in ('active', 'released', 'consumed', 'cancelled')),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  released_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict
);

create trigger set_code before insert on public.stock_reservations
  for each row execute procedure public.fn_generate_code('RES', 'public.stock_reservations_code_seq');
create trigger set_updated_at before update on public.stock_reservations
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists stock_reservations_company_status_idx on public.stock_reservations (company_id, status);
create index if not exists stock_reservations_reference_idx on public.stock_reservations (reference_type, reference_id);

comment on table public.stock_reservations is
  'Reservas de estoque (reduzem available, não on_hand). Escrita exclusiva via fn_create_reservation/fn_release_reservation/fn_consume_reservation.';

create table if not exists public.stock_reservation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null references public.stock_reservations(id) on delete cascade,
  product_id uuid not null,
  lot_id uuid,
  quantity numeric(16, 4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  foreign key (reservation_id, company_id) references public.stock_reservations (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create index if not exists stock_reservation_items_reservation_idx on public.stock_reservation_items (reservation_id);
create index if not exists stock_reservation_items_product_idx on public.stock_reservation_items (product_id);

-- ==================================================================
-- fn_create_reservation — cria o cabeçalho (active) e os itens, e já
-- grava o movimento RESERVATION de cada item (reserva é efetiva no
-- momento da criação — diferente de transferência, que só movimenta
-- ao expedir). fn_post_stock_movement rejeita se reserved excederia
-- on_hand.
-- ==================================================================
create or replace function public.fn_create_reservation(
  p_company_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.stock_reservations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.stock_reservations;
  v_item jsonb;
  v_item_id uuid;
begin
  if not public.has_permission(p_company_id, 'stock.create') then
    raise exception 'Permissão negada (stock.create).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A reserva precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.stock_reservations (company_id, location_id, notes, reference_type, reference_id, created_by)
  values (p_company_id, p_location_id, p_notes, p_reference_type, p_reference_id, public.current_app_user_id())
  returning * into v_reservation;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.stock_reservation_items (company_id, reservation_id, product_id, lot_id, quantity)
    values (
      p_company_id,
      v_reservation.id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'lot_id', '')::uuid,
      (v_item->>'quantity')::numeric
    )
    returning id into v_item_id;

    perform public.fn_post_stock_movement(
      p_company_id => p_company_id,
      p_product_id => (v_item->>'product_id')::uuid,
      p_location_id => p_location_id,
      p_movement_type => 'RESERVATION',
      p_quantity => (v_item->>'quantity')::numeric,
      p_lot_id => nullif(v_item->>'lot_id', '')::uuid,
      p_reference_type => 'stock_reservation',
      p_reference_id => v_reservation.id,
      p_idempotency_key => 'reservation:create:' || v_item_id::text,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  return v_reservation;
end;
$$;

-- ==================================================================
-- fn_release_reservation — libera sem consumir (ex.: pedido cancelado
-- antes da expedição). Grava RELEASE por item.
-- ==================================================================
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
  select * into v_reservation from public.stock_reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_reservation.company_id, 'stock.update') then
    raise exception 'Permissão negada (stock.update).' using errcode = '42501';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'Só é possível liberar uma reserva ativa (status atual: %).', v_reservation.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_reservation_items where reservation_id = p_reservation_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_reservation.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_reservation.location_id,
      p_movement_type => 'RELEASE',
      p_quantity => v_item.quantity,
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

-- ==================================================================
-- fn_consume_reservation — a reserva vira saída real (ex.: pedido
-- expedido). Grava ISSUE (reduz on_hand) + RELEASE (reduz reserved)
-- por item, na mesma transação.
-- ==================================================================
create or replace function public.fn_consume_reservation(p_reservation_id uuid)
returns public.stock_reservations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.stock_reservations;
  v_item record;
begin
  select * into v_reservation from public.stock_reservations where id = p_reservation_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_reservation.company_id, 'stock.update') then
    raise exception 'Permissão negada (stock.update).' using errcode = '42501';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'Só é possível consumir uma reserva ativa (status atual: %).', v_reservation.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_reservation_items where reservation_id = p_reservation_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_reservation.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_reservation.location_id,
      p_movement_type => 'ISSUE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_reservation',
      p_reference_id => v_reservation.id,
      p_idempotency_key => 'reservation:consume-issue:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );
    perform public.fn_post_stock_movement(
      p_company_id => v_reservation.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_reservation.location_id,
      p_movement_type => 'RELEASE',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_reservation',
      p_reference_id => v_reservation.id,
      p_idempotency_key => 'reservation:consume-release:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_reservations
  set status = 'consumed', consumed_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_reservation.company_id, public.current_app_user_id(), 'system',
    'stock_reservations', v_reservation.id, 'UPDATE',
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'consumed')
  );

  return v_reservation;
end;
$$;

revoke all on function public.fn_create_reservation(uuid, uuid, jsonb, text, text, uuid) from public;
revoke all on function public.fn_release_reservation(uuid) from public;
revoke all on function public.fn_consume_reservation(uuid) from public;
grant execute on function public.fn_create_reservation(uuid, uuid, jsonb, text, text, uuid) to authenticated;
grant execute on function public.fn_release_reservation(uuid) to authenticated;
grant execute on function public.fn_consume_reservation(uuid) to authenticated;

-- ==================================================================
-- RLS — somente leitura para authenticated.
-- ==================================================================
alter table public.stock_reservations enable row level security;
alter table public.stock_reservation_items enable row level security;

drop policy if exists stock_reservations_select on public.stock_reservations;
create policy stock_reservations_select on public.stock_reservations
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));

drop policy if exists stock_reservation_items_select on public.stock_reservation_items;
create policy stock_reservation_items_select on public.stock_reservation_items
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));
