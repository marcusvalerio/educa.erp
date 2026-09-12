-- Fase 5 — Logística/Expedição: Separação/Picking.
--
-- Conecta sales_orders a stock_reservations — não cria nenhuma
-- estrutura de localização ou saldo paralela. Uma pick_list NASCE a
-- partir das reservas ATIVAS já existentes para o pedido
-- (reference_type = 'sales_order'), herdando delas o local exato
-- (warehouse_locations) e o lote de onde separar — exatamente o que a
-- seção 6 pede ("não criar uma estrutura de localização paralela").
--
-- Workflow: pending -> in_progress -> completed, mais cancelled.
-- Conferência (seção 8) não é uma tabela separada: cada
-- pick_list_item já carrega divergence_type/divergence_notes, mesmo
-- padrão de purchase_receipt_items (0018) — separar E conferir são a
-- mesma operação aqui, sem inflar o modelo com uma segunda tabela só
-- para registrar "bateu/não bateu".

create sequence if not exists public.pick_lists_code_seq;

create table if not exists public.pick_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  sales_order_id uuid not null,
  warehouse_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid references public.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (sales_order_id, company_id) references public.sales_orders (id, company_id) on delete restrict,
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete restrict
);

create trigger set_code before insert on public.pick_lists
  for each row execute procedure public.fn_generate_code('SEP', 'public.pick_lists_code_seq');
create trigger set_updated_at before update on public.pick_lists
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists pick_lists_company_status_idx on public.pick_lists (company_id, status);
create index if not exists pick_lists_order_idx on public.pick_lists (sales_order_id);

comment on table public.pick_lists is
  'Separação física de um Pedido de Venda. Itens nascem das stock_reservations ativas do pedido (fn_create_pick_list) — nunca criados soltos. Escrita exclusiva via fn_create_pick_list/fn_start_picking/fn_pick_item/fn_complete_pick_list/fn_cancel_pick_list.';

create table if not exists public.pick_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pick_list_id uuid not null,
  sales_order_item_id uuid not null,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  requested_quantity numeric(16, 4) not null check (requested_quantity > 0),
  picked_quantity numeric(16, 4) not null default 0 check (picked_quantity >= 0),
  serial_numbers jsonb,
  status text not null default 'pending' check (status in ('pending', 'picked', 'short', 'cancelled')),
  divergence_type text check (divergence_type is null or divergence_type in ('none', 'quantity', 'product', 'lot', 'serial')),
  divergence_notes text,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (pick_list_id, company_id) references public.pick_lists (id, company_id) on delete cascade,
  foreign key (sales_order_item_id, company_id) references public.sales_order_items (id, company_id) on delete restrict,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict,
  constraint pick_list_items_picked_within_requested check (picked_quantity <= requested_quantity)
);

create index if not exists pick_list_items_pick_list_idx on public.pick_list_items (pick_list_id);
create index if not exists pick_list_items_order_item_idx on public.pick_list_items (sales_order_item_id);
create index if not exists pick_list_items_location_idx on public.pick_list_items (location_id);

comment on column public.pick_list_items.requested_quantity is
  'Herdado da quantidade reservada (stock_reservation_items.quantity) no momento da criação da pick_list — não da quantidade pedida do item.';

-- ==================================================================
-- fn_create_pick_list — monta os itens a partir das reservas ATIVAS
-- do pedido. sales_order_item_id é resolvido por product_id dentro do
-- mesmo pedido (mesma simplificação documentada já usada para casar
-- purchase_receipt_items com purchase_order_items quando há ambiguidade
-- — aqui o caso comum é um item por produto por pedido).
-- ==================================================================
create or replace function public.fn_create_pick_list(
  p_company_id uuid,
  p_sales_order_id uuid,
  p_warehouse_id uuid,
  p_notes text default null
)
returns public.pick_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_pick_list public.pick_lists;
  v_reservation record;
  v_item record;
  v_order_item_id uuid;
  v_items_created integer := 0;
begin
  if not public.has_permission(p_company_id, 'pick_lists.create') then
    raise exception 'Permissão negada (pick_lists.create).' using errcode = '42501';
  end if;

  select * into v_order from public.sales_orders where id = p_sales_order_id and company_id = p_company_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
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
      select * from public.stock_reservation_items where reservation_id = v_reservation.id
    loop
      select soi.id into v_order_item_id
      from public.sales_order_items soi
      where soi.order_id = p_sales_order_id and soi.product_id = v_item.product_id
      limit 1;

      if v_order_item_id is not null then
        insert into public.pick_list_items (
          company_id, pick_list_id, sales_order_item_id, product_id, location_id, lot_id, requested_quantity
        ) values (
          p_company_id, v_pick_list.id, v_order_item_id, v_item.product_id, v_reservation.location_id, v_item.lot_id, v_item.quantity
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

create or replace function public.fn_start_picking(p_pick_list_id uuid)
returns public.pick_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pick_list public.pick_lists;
begin
  select * into v_pick_list from public.pick_lists where id = p_pick_list_id;
  if not found then
    raise exception 'Separação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_pick_list.company_id, 'pick_lists.update') then
    raise exception 'Permissão negada (pick_lists.update).' using errcode = '42501';
  end if;

  if v_pick_list.status <> 'pending' then
    raise exception 'Só é possível iniciar uma separação pendente (status atual: %).', v_pick_list.status using errcode = 'P0001';
  end if;

  update public.pick_lists
  set status = 'in_progress', started_at = now(), assigned_to = public.current_app_user_id()
  where id = p_pick_list_id
  returning * into v_pick_list;

  return v_pick_list;
end;
$$;

-- ==================================================================
-- fn_pick_item — registra quanto foi fisicamente separado de um item.
-- picked_quantity é sempre um SET (não soma) — repetir a chamada com
-- um valor corrigido é a forma de ajustar antes de concluir a
-- separação, sem duplicar efeito (idempotente por natureza).
-- p_mark_short força status = 'short' mesmo que picked_quantity não
-- tenha alcançado requested_quantity — "é tudo que existe, aceitar a
-- falta" (produto errado/lote errado também usam isso, via
-- divergence_type).
-- ==================================================================
create or replace function public.fn_pick_item(
  p_pick_list_item_id uuid,
  p_picked_quantity numeric,
  p_lot_id uuid default null,
  p_serial_numbers jsonb default null,
  p_divergence_type text default null,
  p_divergence_notes text default null,
  p_mark_short boolean default false
)
returns public.pick_list_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.pick_list_items;
  v_pick_list public.pick_lists;
  v_product public.products;
  v_serial_count integer;
begin
  select * into v_item from public.pick_list_items where id = p_pick_list_item_id;
  if not found then
    raise exception 'Item de separação não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_pick_list from public.pick_lists where id = v_item.pick_list_id;

  if not public.has_permission(v_pick_list.company_id, 'pick_lists.update') then
    raise exception 'Permissão negada (pick_lists.update).' using errcode = '42501';
  end if;

  if v_pick_list.status <> 'in_progress' then
    raise exception 'Só é possível separar itens de uma separação em andamento (status atual: %).', v_pick_list.status using errcode = 'P0001';
  end if;

  if p_picked_quantity > v_item.requested_quantity then
    raise exception 'Quantidade separada (%) excede a quantidade reservada para este item (%).', p_picked_quantity, v_item.requested_quantity using errcode = 'P0001';
  end if;

  if p_picked_quantity > 0 then
    select * into v_product from public.products where id = v_item.product_id;
    if v_product.serial_controlled then
      v_serial_count := coalesce(jsonb_array_length(p_serial_numbers), 0);
      if v_serial_count <> p_picked_quantity::integer then
        raise exception 'Produto controla número de série — informe exatamente % série(s) para a quantidade separada.', p_picked_quantity::integer using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.pick_list_items
  set picked_quantity = p_picked_quantity,
      lot_id = coalesce(p_lot_id, lot_id),
      serial_numbers = coalesce(p_serial_numbers, serial_numbers),
      divergence_type = coalesce(p_divergence_type, divergence_type),
      divergence_notes = coalesce(p_divergence_notes, divergence_notes),
      status = case
        when p_mark_short then 'short'
        when p_picked_quantity >= requested_quantity then 'picked'
        else 'pending'
      end
  where id = p_pick_list_item_id
  returning * into v_item;

  update public.sales_order_items set picked_quantity = p_picked_quantity where id = v_item.sales_order_item_id;

  return v_item;
end;
$$;

-- ==================================================================
-- fn_complete_pick_list — fecha pendências (item ainda 'pending' vira
-- 'picked' se cobriu tudo, ou 'short' se não) e avança o pedido para
-- ready_to_ship.
-- ==================================================================
create or replace function public.fn_complete_pick_list(p_pick_list_id uuid)
returns public.pick_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pick_list public.pick_lists;
begin
  select * into v_pick_list from public.pick_lists where id = p_pick_list_id;
  if not found then
    raise exception 'Separação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_pick_list.company_id, 'pick_lists.complete') then
    raise exception 'Permissão negada (pick_lists.complete).' using errcode = '42501';
  end if;

  if v_pick_list.status <> 'in_progress' then
    raise exception 'Só é possível concluir uma separação em andamento (status atual: %).', v_pick_list.status using errcode = 'P0001';
  end if;

  update public.pick_list_items
  set status = case when picked_quantity >= requested_quantity then 'picked' else 'short' end
  where pick_list_id = p_pick_list_id and status = 'pending';

  update public.pick_lists set status = 'completed', completed_at = now() where id = p_pick_list_id
  returning * into v_pick_list;

  update public.sales_orders set status = 'ready_to_ship' where id = v_pick_list.sales_order_id and status = 'picking';

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_pick_list.company_id, public.current_app_user_id(), 'system', 'pick_lists', v_pick_list.id, 'PICK',
    jsonb_build_object('status', 'in_progress'), jsonb_build_object('status', 'completed'));

  return v_pick_list;
end;
$$;

create or replace function public.fn_cancel_pick_list(p_pick_list_id uuid)
returns public.pick_lists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pick_list public.pick_lists;
begin
  select * into v_pick_list from public.pick_lists where id = p_pick_list_id;
  if not found then
    raise exception 'Separação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_pick_list.company_id, 'pick_lists.cancel') then
    raise exception 'Permissão negada (pick_lists.cancel).' using errcode = '42501';
  end if;

  if v_pick_list.status not in ('pending', 'in_progress') then
    raise exception 'Só é possível cancelar uma separação pendente ou em andamento (status atual: %).', v_pick_list.status using errcode = 'P0001';
  end if;

  update public.pick_list_items set status = 'cancelled' where pick_list_id = p_pick_list_id and status in ('pending', 'short');

  update public.pick_lists set status = 'cancelled' where id = p_pick_list_id
  returning * into v_pick_list;

  update public.sales_orders set status = 'reserved' where id = v_pick_list.sales_order_id and status = 'picking';

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_pick_list.company_id, public.current_app_user_id(), 'system', 'pick_lists', v_pick_list.id, 'CANCEL',
    null, jsonb_build_object('status', 'cancelled'));

  return v_pick_list;
end;
$$;

revoke all on function public.fn_create_pick_list(uuid, uuid, uuid, text) from public;
revoke all on function public.fn_start_picking(uuid) from public;
revoke all on function public.fn_pick_item(uuid, numeric, uuid, jsonb, text, text, boolean) from public;
revoke all on function public.fn_complete_pick_list(uuid) from public;
revoke all on function public.fn_cancel_pick_list(uuid) from public;
grant execute on function public.fn_create_pick_list(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.fn_start_picking(uuid) to authenticated;
grant execute on function public.fn_pick_item(uuid, numeric, uuid, jsonb, text, text, boolean) to authenticated;
grant execute on function public.fn_complete_pick_list(uuid) to authenticated;
grant execute on function public.fn_cancel_pick_list(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('pick_lists.view', 'pick_lists', 'view', 'Consultar separações'),
    ('pick_lists.create', 'pick_lists', 'create', 'Criar separações a partir de pedidos reservados'),
    ('pick_lists.update', 'pick_lists', 'update', 'Iniciar separação e registrar itens separados'),
    ('pick_lists.complete', 'pick_lists', 'complete', 'Concluir separação (avança o pedido para pronto para expedir)'),
    ('pick_lists.cancel', 'pick_lists', 'cancel', 'Cancelar separação')
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
alter table public.pick_lists enable row level security;
alter table public.pick_list_items enable row level security;

drop policy if exists pick_lists_select on public.pick_lists;
create policy pick_lists_select on public.pick_lists
  for select to authenticated using (public.has_permission(company_id, 'pick_lists.view'));

drop policy if exists pick_list_items_select on public.pick_list_items;
create policy pick_list_items_select on public.pick_list_items
  for select to authenticated using (public.has_permission(company_id, 'pick_lists.view'));
