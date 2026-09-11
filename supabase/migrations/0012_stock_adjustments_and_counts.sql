-- Fase 2c — Estoque/WMS: ajustes de estoque e contagens de inventário.
--
-- Regra estrutural (não só de convenção): um ajuste ou uma contagem
-- JAMAIS altera stock_balances diretamente. Criar um ajuste/contagem
-- (stock.adjust / stock.count) só grava o documento; efetivá-lo contra
-- o saldo é uma etapa separada, gated por stock.approve
-- (fn_post_adjustment / fn_close_count), que é quem de fato chama
-- fn_post_stock_movement. Separação de responsabilidades: quem propõe
-- não necessariamente pode aprovar.

-- ==================================================================
-- STOCK_ADJUSTMENTS
-- ==================================================================
create sequence if not exists public.stock_adjustments_code_seq;

create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  location_id uuid not null,
  reason_code text not null,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  created_by uuid references public.users(id) on delete set null,
  posted_by uuid references public.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict
);

create trigger set_code before insert on public.stock_adjustments
  for each row execute procedure public.fn_generate_code('AJU', 'public.stock_adjustments_code_seq');
create trigger set_updated_at before update on public.stock_adjustments
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists stock_adjustments_company_status_idx on public.stock_adjustments (company_id, status);

comment on table public.stock_adjustments is
  'Ajustes de estoque. draft não afeta saldo — só fn_post_adjustment (stock.approve) gera stock_movements.';

create table if not exists public.stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  adjustment_id uuid not null references public.stock_adjustments(id) on delete cascade,
  product_id uuid not null,
  lot_id uuid,
  quantity_delta numeric(16, 4) not null check (quantity_delta <> 0),
  unit_cost numeric(14, 4) check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (adjustment_id, company_id) references public.stock_adjustments (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create index if not exists stock_adjustment_items_adjustment_idx on public.stock_adjustment_items (adjustment_id);
comment on column public.stock_adjustment_items.quantity_delta is
  'Positivo = ajuste para mais (ADJUSTMENT_IN). Negativo = ajuste para menos (ADJUSTMENT_OUT).';

create or replace function public.fn_create_adjustment(
  p_company_id uuid,
  p_location_id uuid,
  p_reason_code text,
  p_items jsonb,
  p_notes text default null
)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment public.stock_adjustments;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'stock.adjust') then
    raise exception 'Permissão negada (stock.adjust).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O ajuste precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.stock_adjustments (company_id, location_id, reason_code, notes, created_by)
  values (p_company_id, p_location_id, p_reason_code, p_notes, public.current_app_user_id())
  returning * into v_adjustment;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.stock_adjustment_items (company_id, adjustment_id, product_id, lot_id, quantity_delta, unit_cost)
    values (
      p_company_id,
      v_adjustment.id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'lot_id', '')::uuid,
      (v_item->>'quantity_delta')::numeric,
      nullif(v_item->>'unit_cost', '')::numeric
    );
  end loop;

  return v_adjustment;
end;
$$;

create or replace function public.fn_post_adjustment(
  p_adjustment_id uuid,
  p_idempotency_key text default null
)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment public.stock_adjustments;
  v_item record;
begin
  select * into v_adjustment from public.stock_adjustments where id = p_adjustment_id;
  if not found then
    raise exception 'Ajuste não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_adjustment.company_id, 'stock.approve') then
    raise exception 'Permissão negada (stock.approve).' using errcode = '42501';
  end if;

  if v_adjustment.status <> 'draft' then
    raise exception 'Só é possível efetivar um ajuste em rascunho (status atual: %).', v_adjustment.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.stock_adjustment_items where adjustment_id = p_adjustment_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_adjustment.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_adjustment.location_id,
      p_movement_type => case when v_item.quantity_delta > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
      p_quantity => abs(v_item.quantity_delta),
      p_lot_id => v_item.lot_id,
      p_unit_cost => v_item.unit_cost,
      p_reference_type => 'stock_adjustment',
      p_reference_id => v_adjustment.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_adjustments
  set status = 'posted', posted_by = public.current_app_user_id(), posted_at = now()
  where id = p_adjustment_id
  returning * into v_adjustment;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_adjustment.company_id, public.current_app_user_id(), 'system',
    'stock_adjustments', v_adjustment.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'posted')
  );

  return v_adjustment;
end;
$$;

create or replace function public.fn_cancel_adjustment(p_adjustment_id uuid)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment public.stock_adjustments;
begin
  select * into v_adjustment from public.stock_adjustments where id = p_adjustment_id;
  if not found then
    raise exception 'Ajuste não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_adjustment.company_id, 'stock.adjust') then
    raise exception 'Permissão negada (stock.adjust).' using errcode = '42501';
  end if;

  if v_adjustment.status <> 'draft' then
    raise exception 'Só é possível cancelar um ajuste em rascunho (status atual: %).', v_adjustment.status using errcode = 'P0001';
  end if;

  update public.stock_adjustments set status = 'cancelled' where id = p_adjustment_id
  returning * into v_adjustment;

  return v_adjustment;
end;
$$;

revoke all on function public.fn_create_adjustment(uuid, uuid, text, jsonb, text) from public;
revoke all on function public.fn_post_adjustment(uuid, text) from public;
revoke all on function public.fn_cancel_adjustment(uuid) from public;
grant execute on function public.fn_create_adjustment(uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.fn_post_adjustment(uuid, text) to authenticated;
grant execute on function public.fn_cancel_adjustment(uuid) to authenticated;

-- ==================================================================
-- STOCK_COUNTS — contagem de inventário. fn_start_count fotografa o
-- saldo atual (stock_balances.on_hand) de todos os grãos do depósito
-- em stock_count_items.expected_quantity; a diferença contra
-- counted_quantity vira ajuste ao fechar (fn_close_count).
-- ==================================================================
create sequence if not exists public.stock_counts_code_seq;

create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  warehouse_id uuid not null,
  status text not null default 'counting' check (status in ('counting', 'closed', 'cancelled')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (warehouse_id, company_id) references public.warehouses (id, company_id) on delete restrict
);

create trigger set_code before insert on public.stock_counts
  for each row execute procedure public.fn_generate_code('CNT', 'public.stock_counts_code_seq');
create trigger set_updated_at before update on public.stock_counts
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists stock_counts_company_status_idx on public.stock_counts (company_id, status);

create table if not exists public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  count_id uuid not null references public.stock_counts(id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  expected_quantity numeric(16, 4) not null default 0,
  counted_quantity numeric(16, 4) check (counted_quantity is null or counted_quantity >= 0),
  variance numeric(16, 4) generated always as (counted_quantity - expected_quantity) stored,
  status text not null default 'pending' check (status in ('pending', 'counted')),
  created_at timestamptz not null default now(),
  foreign key (count_id, company_id) references public.stock_counts (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create unique index if not exists stock_count_items_grain_key on public.stock_count_items (
  count_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index if not exists stock_count_items_count_idx on public.stock_count_items (count_id);

comment on column public.stock_count_items.variance is
  'counted_quantity - expected_quantity. Null enquanto counted_quantity não foi informado (item ainda não contado).';

-- ==================================================================
-- fn_start_count — cria o cabeçalho e fotografa stock_balances do
-- depósito informado (todos os locais que pertencem a ele) como
-- expected_quantity de cada item.
-- ==================================================================
create or replace function public.fn_start_count(
  p_company_id uuid,
  p_warehouse_id uuid,
  p_notes text default null
)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count public.stock_counts;
begin
  if not public.has_permission(p_company_id, 'stock.count') then
    raise exception 'Permissão negada (stock.count).' using errcode = '42501';
  end if;

  insert into public.stock_counts (company_id, warehouse_id, notes, created_by)
  values (p_company_id, p_warehouse_id, p_notes, public.current_app_user_id())
  returning * into v_count;

  insert into public.stock_count_items (company_id, count_id, product_id, location_id, lot_id, expected_quantity)
  select
    sb.company_id, v_count.id, sb.product_id, sb.location_id, sb.lot_id, sb.on_hand
  from public.stock_balances sb
  join public.warehouse_locations wl on wl.id = sb.location_id and wl.company_id = sb.company_id
  where sb.company_id = p_company_id
    and wl.warehouse_id = p_warehouse_id
    and sb.on_hand <> 0;

  return v_count;
end;
$$;

-- ==================================================================
-- fn_submit_count_item — registra a quantidade contada de um item.
-- ==================================================================
create or replace function public.fn_submit_count_item(
  p_count_item_id uuid,
  p_counted_quantity numeric
)
returns public.stock_count_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.stock_count_items;
  v_count public.stock_counts;
begin
  select * into v_item from public.stock_count_items where id = p_count_item_id;
  if not found then
    raise exception 'Item de contagem não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_count from public.stock_counts where id = v_item.count_id;

  if not public.has_permission(v_count.company_id, 'stock.count') then
    raise exception 'Permissão negada (stock.count).' using errcode = '42501';
  end if;

  if v_count.status <> 'counting' then
    raise exception 'Só é possível registrar contagem em uma contagem aberta (status atual: %).', v_count.status using errcode = 'P0001';
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'Quantidade contada deve ser maior ou igual a zero.' using errcode = '22023';
  end if;

  update public.stock_count_items
  set counted_quantity = p_counted_quantity, status = 'counted'
  where id = p_count_item_id
  returning * into v_item;

  return v_item;
end;
$$;

-- ==================================================================
-- fn_close_count — efetiva as diferenças contra o saldo (um
-- ADJUSTMENT_IN/OUT por item com variância != 0) e fecha a contagem.
-- Itens nunca contados (status ainda 'pending') são ignorados — não
-- assumimos variância para o que não foi contado.
-- ==================================================================
create or replace function public.fn_close_count(p_count_id uuid)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count public.stock_counts;
  v_item record;
begin
  select * into v_count from public.stock_counts where id = p_count_id;
  if not found then
    raise exception 'Contagem não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_count.company_id, 'stock.approve') then
    raise exception 'Permissão negada (stock.approve).' using errcode = '42501';
  end if;

  if v_count.status <> 'counting' then
    raise exception 'Só é possível fechar uma contagem aberta (status atual: %).', v_count.status using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.stock_count_items
    where count_id = p_count_id and status = 'counted' and variance is distinct from 0
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_count.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_item.location_id,
      p_movement_type => case when v_item.variance > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
      p_quantity => abs(v_item.variance),
      p_lot_id => v_item.lot_id,
      p_reference_type => 'stock_count',
      p_reference_id => v_count.id,
      p_idempotency_key => 'count:close:' || v_item.id::text,
      p_created_by => public.current_app_user_id()
    );
  end loop;

  update public.stock_counts
  set status = 'closed', closed_by = public.current_app_user_id(), closed_at = now()
  where id = p_count_id
  returning * into v_count;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_count.company_id, public.current_app_user_id(), 'system',
    'stock_counts', v_count.id, 'UPDATE',
    jsonb_build_object('status', 'counting'), jsonb_build_object('status', 'closed')
  );

  return v_count;
end;
$$;

create or replace function public.fn_cancel_count(p_count_id uuid)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count public.stock_counts;
begin
  select * into v_count from public.stock_counts where id = p_count_id;
  if not found then
    raise exception 'Contagem não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_count.company_id, 'stock.count') then
    raise exception 'Permissão negada (stock.count).' using errcode = '42501';
  end if;

  if v_count.status <> 'counting' then
    raise exception 'Só é possível cancelar uma contagem aberta (status atual: %).', v_count.status using errcode = 'P0001';
  end if;

  update public.stock_counts set status = 'cancelled' where id = p_count_id
  returning * into v_count;

  return v_count;
end;
$$;

revoke all on function public.fn_start_count(uuid, uuid, text) from public;
revoke all on function public.fn_submit_count_item(uuid, numeric) from public;
revoke all on function public.fn_close_count(uuid) from public;
revoke all on function public.fn_cancel_count(uuid) from public;
grant execute on function public.fn_start_count(uuid, uuid, text) to authenticated;
grant execute on function public.fn_submit_count_item(uuid, numeric) to authenticated;
grant execute on function public.fn_close_count(uuid) to authenticated;
grant execute on function public.fn_cancel_count(uuid) to authenticated;

-- ==================================================================
-- RLS — somente leitura para authenticated (mesmo padrão das
-- migrations 0009-0011).
-- ==================================================================
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_items enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('stock_adjustments'),
      ('stock_adjustment_items'),
      ('stock_counts'),
      ('stock_count_items')
    ) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'stock.view'
    );
  end loop;
end;
$$;
