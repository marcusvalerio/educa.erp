-- Fase 2c — Estoque/WMS: transferências entre locais, com ciclo de
-- status draft -> in_transit -> completed (ou draft -> cancelled).
--
-- Estoque nunca fica "perdido" em trânsito por falta de uma saída
-- correspondente: expedir grava TRANSFER_OUT na origem; receber grava
-- TRANSFER_IN no destino. Entre os dois passos, a quantidade não existe
-- em nenhum local (mesma simplificação assumida em 0009: sem um bucket
-- físico de "em trânsito" nesta etapa — o status do documento é a fonte
-- de verdade de que a mercadoria está a caminho). Documentado como
-- possível evolução futura em docs/INVENTORY.md.
--
-- Toda escrita passa pelas funções abaixo — as tabelas só têm policy de
-- SELECT para authenticated (mesmo padrão de stock_balances/stock_movements
-- em 0009).

create sequence if not exists public.stock_transfers_code_seq;

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  from_location_id uuid not null,
  to_location_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'in_transit', 'completed', 'cancelled')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  shipped_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (from_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (to_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  check (from_location_id <> to_location_id)
);

create trigger set_code before insert on public.stock_transfers
  for each row execute procedure public.fn_generate_code('TRF', 'public.stock_transfers_code_seq');
create trigger set_updated_at before update on public.stock_transfers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists stock_transfers_company_status_idx on public.stock_transfers (company_id, status);

comment on table public.stock_transfers is
  'Transferências de estoque entre locais. Escrita exclusiva via fn_create_transfer/fn_ship_transfer/fn_receive_transfer/fn_cancel_transfer — sem policy de insert/update direto.';

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null,
  lot_id uuid,
  quantity numeric(16, 4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  foreign key (transfer_id, company_id) references public.stock_transfers (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create index if not exists stock_transfer_items_transfer_idx on public.stock_transfer_items (transfer_id);
create index if not exists stock_transfer_items_product_idx on public.stock_transfer_items (product_id);

-- ==================================================================
-- fn_create_transfer — cria o cabeçalho (draft) e os itens em uma
-- única transação. Nenhum movimento é gravado aqui — só ao expedir.
-- p_items: jsonb array de {"product_id": uuid, "lot_id": uuid|null, "quantity": number}
-- ==================================================================
create or replace function public.fn_create_transfer(
  p_company_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.stock_transfers;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'stock.create') then
    raise exception 'Permissão negada (stock.create).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A transferência precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.stock_transfers (company_id, from_location_id, to_location_id, notes, created_by)
  values (p_company_id, p_from_location_id, p_to_location_id, p_notes, public.current_app_user_id())
  returning * into v_transfer;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.stock_transfer_items (company_id, transfer_id, product_id, lot_id, quantity)
    values (
      p_company_id,
      v_transfer.id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'lot_id', '')::uuid,
      (v_item->>'quantity')::numeric
    );
  end loop;

  return v_transfer;
end;
$$;

-- ==================================================================
-- fn_ship_transfer — expede uma transferência draft: grava TRANSFER_OUT
-- por item na origem e muda o status para in_transit. Chave de
-- idempotência por item deriva de p_idempotency_key (evita colisão
-- entre itens de uma mesma expedição reprocessada).
-- ==================================================================
create or replace function public.fn_ship_transfer(
  p_transfer_id uuid,
  p_idempotency_key text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.stock_transfers;
  v_item record;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_transfer.company_id, 'stock.transfer') then
    raise exception 'Permissão negada (stock.transfer).' using errcode = '42501';
  end if;

  if v_transfer.status <> 'draft' then
    raise exception 'Só é possível expedir uma transferência em rascunho (status atual: %).', v_transfer.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_transfer.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_transfer.from_location_id,
      p_movement_type => 'TRANSFER_OUT',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_transfer',
      p_reference_id => v_transfer.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':out:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_transfers
  set status = 'in_transit', shipped_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_transfer.company_id, public.current_app_user_id(), 'system',
    'stock_transfers', v_transfer.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'in_transit')
  );

  return v_transfer;
end;
$$;

-- ==================================================================
-- fn_receive_transfer — recebe uma transferência in_transit: grava
-- TRANSFER_IN por item no destino e muda o status para completed.
-- ==================================================================
create or replace function public.fn_receive_transfer(
  p_transfer_id uuid,
  p_idempotency_key text default null
)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.stock_transfers;
  v_item record;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_transfer.company_id, 'stock.transfer') then
    raise exception 'Permissão negada (stock.transfer).' using errcode = '42501';
  end if;

  if v_transfer.status <> 'in_transit' then
    raise exception 'Só é possível receber uma transferência em trânsito (status atual: %).', v_transfer.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_transfer.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_transfer.to_location_id,
      p_movement_type => 'TRANSFER_IN',
      p_quantity => v_item.quantity,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_transfer',
      p_reference_id => v_transfer.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':in:' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_transfers
  set status = 'completed', received_at = now()
  where id = p_transfer_id
  returning * into v_transfer;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_transfer.company_id, public.current_app_user_id(), 'system',
    'stock_transfers', v_transfer.id, 'UPDATE',
    jsonb_build_object('status', 'in_transit'), jsonb_build_object('status', 'completed')
  );

  return v_transfer;
end;
$$;

-- ==================================================================
-- fn_cancel_transfer — só permitido em draft (nenhum movimento ainda
-- foi gravado, então não há nada para estornar).
-- ==================================================================
create or replace function public.fn_cancel_transfer(p_transfer_id uuid)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer public.stock_transfers;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id;
  if not found then
    raise exception 'Transferência não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_transfer.company_id, 'stock.transfer') then
    raise exception 'Permissão negada (stock.transfer).' using errcode = '42501';
  end if;

  if v_transfer.status <> 'draft' then
    raise exception 'Só é possível cancelar uma transferência em rascunho (status atual: %). Transferências em trânsito já movimentaram estoque.', v_transfer.status using errcode = 'P0001';
  end if;

  update public.stock_transfers set status = 'cancelled' where id = p_transfer_id
  returning * into v_transfer;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_transfer.company_id, public.current_app_user_id(), 'system',
    'stock_transfers', v_transfer.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'cancelled')
  );

  return v_transfer;
end;
$$;

revoke all on function public.fn_create_transfer(uuid, uuid, uuid, jsonb, text) from public;
revoke all on function public.fn_ship_transfer(uuid, text) from public;
revoke all on function public.fn_receive_transfer(uuid, text) from public;
revoke all on function public.fn_cancel_transfer(uuid) from public;
grant execute on function public.fn_create_transfer(uuid, uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.fn_ship_transfer(uuid, text) to authenticated;
grant execute on function public.fn_receive_transfer(uuid, text) to authenticated;
grant execute on function public.fn_cancel_transfer(uuid) to authenticated;

-- ==================================================================
-- RLS — somente leitura para authenticated.
-- ==================================================================
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;

drop policy if exists stock_transfers_select on public.stock_transfers;
create policy stock_transfers_select on public.stock_transfers
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));

drop policy if exists stock_transfer_items_select on public.stock_transfer_items;
create policy stock_transfer_items_select on public.stock_transfer_items
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));
