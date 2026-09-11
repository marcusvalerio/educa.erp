-- Fase 2c (adendo) — Almoxarifado Operacional.
--
-- NÃO é um segundo estoque. Reaproveita integralmente a infraestrutura
-- de 0008-0012 (warehouses, warehouse_locations, product_lots,
-- product_serial_numbers, stock_balances, stock_movements e
-- fn_post_stock_movement) — a diferença entre "Estoque" e "Almoxarifado
-- Operacional" é só o PROPÓSITO de uma localização, não um mecanismo de
-- saldo separado.
--
-- purpose vive em warehouse_locations (não em warehouses): na prática
-- um mesmo depósito físico pode ter áreas com propósitos diferentes
-- (ex.: uma área de quarentena dentro de um depósito de estoque geral)
-- — colocar a classificação no local, não no depósito inteiro, é o que
-- permite representar isso sem forçar uma reorganização física.

alter table public.warehouse_locations
  add column if not exists purpose text not null default 'STOCK'
  check (purpose in ('STOCK', 'OPERATIONAL_WAREHOUSE', 'PRODUCTION', 'QUARANTINE', 'TRANSIT'));

create index if not exists warehouse_locations_purpose_idx on public.warehouse_locations (company_id, purpose);

comment on column public.warehouse_locations.purpose is
  'Finalidade operacional do local — não cria um segundo mecanismo de saldo, só classifica o que já existe em stock_balances/stock_movements. STOCK = produtos/mercadorias (padrão). OPERATIONAL_WAREHOUSE = matérias-primas/componentes/insumos ("Almoxarifado Operacional"). PRODUCTION = área de consumo/transformação. QUARANTINE / TRANSIT = áreas de triagem/trânsito.';

-- ==================================================================
-- Depósito padrão de Almoxarifado Operacional por empresa — mesmo
-- padrão de fn_seed_company_default_warehouse (0008). Só o depósito é
-- semeado automaticamente; os locais dentro dele (com purpose =
-- OPERATIONAL_WAREHOUSE) são cadastrados pelo usuário, igual ao
-- depósito PRINCIPAL.
-- ==================================================================
create or replace function public.fn_seed_company_operational_warehouse(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.warehouses (company_id, code, name, type)
  values (p_company_id, 'ALMOX', 'Almoxarifado Operacional', 'standard')
  on conflict (company_id, code) do update set company_id = excluded.company_id
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.warehouses where company_id = p_company_id and code = 'ALMOX';
  end if;

  return v_id;
end;
$$;

create or replace function public.fn_seed_company_operational_warehouse_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_company_operational_warehouse(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists seed_company_operational_warehouse on public.companies;
create trigger seed_company_operational_warehouse
  after insert on public.companies
  for each row execute procedure public.fn_seed_company_operational_warehouse_trigger();

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_operational_warehouse(c.id);
  end loop;
end;
$$;

-- ==================================================================
-- MATERIAL_REQUESTS — requisição de material do Almoxarifado
-- Operacional (ex.: para a Produção). Prepara o fluxo descrito no
-- adendo sem implementar o módulo de Produção completo: hoje é só
-- "local de origem -> local de destino", sem ordem de produção/BOM
-- vinculados — reference_type/reference_id ficam prontos para apontar
-- para uma futura production_orders quando esse módulo existir.
--
-- Ciclo: requested -> delivered (fn_deliver_material_request grava um
-- PRODUCTION_OUT por item — vocabulário já existia em stock_movements
-- desde 0009, reservado exatamente para isto) ou requested -> cancelled.
-- "Verificar disponibilidade" e "separar" (do fluxo conceitual do
-- adendo) não viram estado persistido nesta etapa — são passos de
-- processo/UI entre a criação e a entrega, sem efeito no saldo até a
-- entrega de fato.
-- ==================================================================
create sequence if not exists public.material_requests_code_seq;

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  from_location_id uuid not null,
  to_location_id uuid not null,
  status text not null default 'requested' check (status in ('requested', 'delivered', 'cancelled')),
  notes text,
  reference_type text,
  reference_id uuid,
  requested_by uuid references public.users(id) on delete set null,
  delivered_by uuid references public.users(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (from_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (to_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  check (from_location_id <> to_location_id)
);

create trigger set_code before insert on public.material_requests
  for each row execute procedure public.fn_generate_code('REQ', 'public.material_requests_code_seq');
create trigger set_updated_at before update on public.material_requests
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists material_requests_company_status_idx on public.material_requests (company_id, status);
create index if not exists material_requests_reference_idx on public.material_requests (reference_type, reference_id);

comment on table public.material_requests is
  'Requisição interna de materiais (ex.: Almoxarifado Operacional -> Produção). Escrita exclusiva via fn_create_material_request/fn_deliver_material_request/fn_cancel_material_request.';

create table if not exists public.material_request_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null references public.material_requests(id) on delete cascade,
  product_id uuid not null,
  lot_id uuid,
  quantity_requested numeric(16, 4) not null check (quantity_requested > 0),
  quantity_delivered numeric(16, 4) check (quantity_delivered is null or quantity_delivered >= 0),
  created_at timestamptz not null default now(),
  foreign key (request_id, company_id) references public.material_requests (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create index if not exists material_request_items_request_idx on public.material_request_items (request_id);
create index if not exists material_request_items_product_idx on public.material_request_items (product_id);

create or replace function public.fn_create_material_request(
  p_company_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.material_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.material_requests;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'stock.request') then
    raise exception 'Permissão negada (stock.request).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A requisição precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.material_requests (company_id, from_location_id, to_location_id, notes, reference_type, reference_id, requested_by)
  values (p_company_id, p_from_location_id, p_to_location_id, p_notes, p_reference_type, p_reference_id, public.current_app_user_id())
  returning * into v_request;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.material_request_items (company_id, request_id, product_id, lot_id, quantity_requested)
    values (
      p_company_id,
      v_request.id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'lot_id', '')::uuid,
      (v_item->>'quantity')::numeric
    );
  end loop;

  return v_request;
end;
$$;

-- fn_deliver_material_request usa a MESMA permissão stock.transfer das
-- transferências — entregar uma requisição é, na prática, mover
-- material de um local para outro (o local de destino aqui costuma ser
-- uma área de propósito PRODUCTION, não uma tabela nova). Nenhuma
-- permissão warehouse.* separada foi criada: stock.transfer já cobre
-- exatamente este propósito.
create or replace function public.fn_deliver_material_request(
  p_request_id uuid,
  p_idempotency_key text default null
)
returns public.material_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.material_requests;
  v_item record;
begin
  select * into v_request from public.material_requests where id = p_request_id;
  if not found then
    raise exception 'Requisição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_request.company_id, 'stock.transfer') then
    raise exception 'Permissão negada (stock.transfer).' using errcode = '42501';
  end if;

  if v_request.status <> 'requested' then
    raise exception 'Só é possível entregar uma requisição pendente (status atual: %).', v_request.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.material_request_items where request_id = p_request_id
  loop
    perform public.fn_post_stock_movement(
      p_company_id => v_request.company_id,
      p_product_id => v_item.product_id,
      p_location_id => v_request.from_location_id,
      p_movement_type => 'PRODUCTION_OUT',
      p_quantity => v_item.quantity_requested,
      p_lot_id => v_item.lot_id,
      p_reference_type => 'material_request',
      p_reference_id => v_request.id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':' || v_item.id::text else null end,
      p_created_by => public.current_app_user_id()
    );

    update public.material_request_items
    set quantity_delivered = quantity_requested
    where id = v_item.id;
  end loop;

  update public.material_requests
  set status = 'delivered', delivered_by = public.current_app_user_id(), delivered_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    v_request.company_id, public.current_app_user_id(), 'system',
    'material_requests', v_request.id, 'UPDATE',
    jsonb_build_object('status', 'requested'), jsonb_build_object('status', 'delivered')
  );

  return v_request;
end;
$$;

create or replace function public.fn_cancel_material_request(p_request_id uuid)
returns public.material_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.material_requests;
begin
  select * into v_request from public.material_requests where id = p_request_id;
  if not found then
    raise exception 'Requisição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_request.company_id, 'stock.request') then
    raise exception 'Permissão negada (stock.request).' using errcode = '42501';
  end if;

  if v_request.status <> 'requested' then
    raise exception 'Só é possível cancelar uma requisição pendente (status atual: %). Requisições entregues já movimentaram estoque.', v_request.status using errcode = 'P0001';
  end if;

  update public.material_requests set status = 'cancelled' where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.fn_create_material_request(uuid, uuid, uuid, jsonb, text, text, uuid) from public;
revoke all on function public.fn_deliver_material_request(uuid, text) from public;
revoke all on function public.fn_cancel_material_request(uuid) from public;
grant execute on function public.fn_create_material_request(uuid, uuid, uuid, jsonb, text, text, uuid) to authenticated;
grant execute on function public.fn_deliver_material_request(uuid, text) to authenticated;
grant execute on function public.fn_cancel_material_request(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS — uma única permissão nova (stock.request). Entrega e
-- cancelamento reaproveitam stock.transfer/stock.request já cobertos
-- acima — nada de um namespace warehouse.* paralelo (o pedido explícito
-- deste adendo é "não criar permissões duplicadas quando uma permissão
-- de estoque já atender ao mesmo propósito").
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('stock.request', 'stock', 'request', 'Solicitar materiais do Almoxarifado Operacional (ex.: para a Produção)')
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
-- RLS — mesmo padrão somente-leitura das demais tabelas transacionais
-- de estoque (0009-0012): gated por stock.view (reaproveitada, não
-- duplicada), toda escrita via função.
-- ==================================================================
alter table public.material_requests enable row level security;
alter table public.material_request_items enable row level security;

drop policy if exists material_requests_select on public.material_requests;
create policy material_requests_select on public.material_requests
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));

drop policy if exists material_request_items_select on public.material_request_items;
create policy material_request_items_select on public.material_request_items
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));
