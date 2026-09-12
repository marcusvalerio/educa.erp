-- Fase 6 — Produção/PCP: Ordem de Produção.
--
-- DEMANDA -> ORDEM DE PRODUÇÃO -> RESERVA DE MATÉRIA-PRIMA -> CONSUMO ->
-- PRODUÇÃO -> PRODUTO ACABADO -> ESTOQUE (consumo/produção real ficam em
-- 0029 — aqui só o cabeçalho, o snapshot da BOM e a reserva).
--
-- Reserva reutiliza stock_reservations (0011) — NÃO existe
-- production_reservations. Uma ordem tem uma única localização de
-- consumo (consumption_location_id) e uma única localização de saída
-- (output_location_id), mesma simplificação já usada em
-- fn_reserve_sales_order_stock (0021, docs/COMMERCIAL.md §6: "lock no
-- CABEÇALHO, não por item").

create sequence if not exists public.production_orders_code_seq;

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  product_id uuid not null,
  bom_id uuid not null,
  planned_quantity numeric(16, 4) not null check (planned_quantity > 0),
  produced_quantity numeric(16, 4) not null default 0 check (produced_quantity >= 0),
  rejected_quantity numeric(16, 4) not null default 0 check (rejected_quantity >= 0),
  unit_id uuid not null,
  source_warehouse_id uuid not null,
  consumption_location_id uuid not null,
  target_warehouse_id uuid not null,
  output_location_id uuid not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'draft' check (status in (
    'draft', 'planned', 'released', 'materials_reserved', 'in_progress', 'completed', 'cancelled', 'on_hold'
  )),
  planned_date date,
  started_at timestamptz,
  finished_at timestamptz,
  responsible_user_id uuid references public.users(id) on delete set null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (bom_id, company_id) references public.product_boms (id, company_id) on delete restrict,
  foreign key (unit_id, company_id) references public.units (id, company_id) on delete restrict,
  foreign key (source_warehouse_id, company_id) references public.warehouses (id, company_id) on delete restrict,
  foreign key (consumption_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (target_warehouse_id, company_id) references public.warehouses (id, company_id) on delete restrict,
  foreign key (output_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict
);

create trigger set_code before insert on public.production_orders
  for each row execute procedure public.fn_generate_code('OP', 'public.production_orders_code_seq');
create trigger set_updated_at before update on public.production_orders
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists production_orders_company_status_idx on public.production_orders (company_id, status);
create index if not exists production_orders_product_idx on public.production_orders (product_id);
create index if not exists production_orders_bom_idx on public.production_orders (bom_id);

comment on table public.production_orders is
  'Ordem de produção. bom_id aponta para a BOM usada — mas a estrutura efetivamente planejada é o SNAPSHOT em production_order_materials, criado uma única vez em fn_create_production_order: se a BOM mudar depois, esta ordem não é afetada (rastreabilidade, seção 7). Escrita exclusiva via fn_create_production_order e as demais fn_* desta migration/0029.';
comment on column public.production_orders.consumption_location_id is
  'Local único de onde os materiais são reservados e consumidos (mesma simplificação de fn_reserve_sales_order_stock, 0021). Pode ser uma localização purpose=PRODUCTION (0013) se a empresa pré-abastece a linha, ou diretamente o Almoxarifado Operacional.';
comment on column public.production_orders.output_location_id is
  'Local onde o produto acabado entra no estoque ao produzir (fn_register_production_output, 0029) — tipicamente purpose=STOCK ou PRODUCTION.';

create table if not exists public.production_order_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  production_order_id uuid not null,
  bom_item_id uuid,
  component_product_id uuid not null,
  planned_quantity numeric(16, 4) not null check (planned_quantity > 0),
  reserved_quantity numeric(16, 4) not null default 0 check (reserved_quantity >= 0),
  consumed_quantity numeric(16, 4) not null default 0 check (consumed_quantity >= 0),
  returned_quantity numeric(16, 4) not null default 0 check (returned_quantity >= 0),
  scrapped_quantity numeric(16, 4) not null default 0 check (scrapped_quantity >= 0),
  unit_id uuid not null,
  lot_id uuid,
  serial_numbers jsonb,
  scrap_percentage numeric(5, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'partial', 'reserved', 'consumed', 'short', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (production_order_id, company_id) references public.production_orders (id, company_id) on delete cascade,
  foreign key (bom_item_id, company_id) references public.product_bom_items (id, company_id) on delete set null,
  foreign key (component_product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (unit_id, company_id) references public.units (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict,
  constraint production_order_materials_usage_within_reserved check (consumed_quantity + returned_quantity + scrapped_quantity <= reserved_quantity)
);

create index if not exists production_order_materials_order_idx on public.production_order_materials (production_order_id);
create index if not exists production_order_materials_component_idx on public.production_order_materials (component_product_id);
create index if not exists production_order_materials_bom_item_idx on public.production_order_materials (bom_item_id);

comment on table public.production_order_materials is
  'Snapshot dos componentes necessários, criado uma vez por fn_create_production_order a partir da BOM ativa no momento — nunca recalculado depois. reserved_quantity é o total historicamente reservado para esta linha (nunca decrementado); consumed/returned/scrapped somam até, no máximo, reserved_quantity (CHECK estrutural, mesmo princípio de sales_order_items: campos aditivos, nunca sobrescritos).';

-- ==================================================================
-- fn_create_production_order — cria a ordem (draft) e já materializa o
-- snapshot da BOM ativa (ou da BOM explicitamente informada, se não
-- estiver em draft) em production_order_materials, convertendo unidade
-- quando o item da BOM usa uma unidade diferente da unidade de estoque
-- do componente (seção 8 — unit_conversions, nunca assumindo unidades
-- iguais).
-- ==================================================================
create or replace function public.fn_create_production_order(
  p_company_id uuid,
  p_product_id uuid,
  p_planned_quantity numeric,
  p_unit_id uuid,
  p_source_warehouse_id uuid,
  p_consumption_location_id uuid,
  p_target_warehouse_id uuid,
  p_output_location_id uuid,
  p_bom_id uuid default null,
  p_priority text default 'medium',
  p_planned_date date default null,
  p_responsible_user_id uuid default null,
  p_notes text default null
)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products;
  v_bom public.product_boms;
  v_order public.production_orders;
  v_item record;
  v_component public.products;
  v_base_quantity numeric;
  v_quantity_with_scrap numeric;
  v_final_quantity numeric;
  v_final_unit_id uuid;
  v_factor numeric;
  v_item_count integer := 0;
begin
  if not public.has_permission(p_company_id, 'production_orders.create') then
    raise exception 'Permissão negada (production_orders.create).' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id and company_id = p_company_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;

  if v_product.production_type not in ('manufactured', 'both') then
    raise exception 'Produto % não está marcado como fabricado (production_type = %). Atualize o cadastro do produto antes de criar uma ordem de produção.', v_product.name, v_product.production_type using errcode = 'P0001';
  end if;

  if p_bom_id is not null then
    select * into v_bom from public.product_boms where id = p_bom_id and company_id = p_company_id and product_id = p_product_id;
    if not found then
      raise exception 'BOM informada não encontrada para este produto.' using errcode = 'P0002';
    end if;
    if v_bom.status = 'draft' then
      raise exception 'Não é possível criar uma ordem a partir de uma BOM em rascunho.' using errcode = 'P0001';
    end if;
  else
    select * into v_bom from public.product_boms where company_id = p_company_id and product_id = p_product_id and status = 'active';
    if not found then
      raise exception 'Nenhuma BOM ativa encontrada para este produto. Ative uma BOM ou informe bom_id explicitamente.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.production_orders (
    company_id, product_id, bom_id, planned_quantity, unit_id,
    source_warehouse_id, consumption_location_id, target_warehouse_id, output_location_id,
    priority, planned_date, responsible_user_id, notes, created_by
  ) values (
    p_company_id, p_product_id, v_bom.id, p_planned_quantity, p_unit_id,
    p_source_warehouse_id, p_consumption_location_id, p_target_warehouse_id, p_output_location_id,
    coalesce(p_priority, 'medium'), p_planned_date, p_responsible_user_id, p_notes, public.current_app_user_id()
  )
  returning * into v_order;

  for v_item in select * from public.product_bom_items where bom_id = v_bom.id order by sequence
  loop
    select * into v_component from public.products where id = v_item.component_product_id;

    v_base_quantity := v_item.quantity * (p_planned_quantity / v_bom.reference_quantity);
    v_quantity_with_scrap := v_base_quantity * (1 + v_item.scrap_percentage / 100);

    if v_item.unit_id = v_component.unit_id then
      v_final_quantity := v_quantity_with_scrap;
      v_final_unit_id := v_item.unit_id;
    else
      v_factor := null;
      select factor into v_factor from public.unit_conversions
      where company_id = p_company_id and from_unit_id = v_item.unit_id and to_unit_id = v_component.unit_id and status = 'active';

      if v_factor is not null then
        v_final_quantity := v_quantity_with_scrap * v_factor;
        v_final_unit_id := v_component.unit_id;
      else
        select factor into v_factor from public.unit_conversions
        where company_id = p_company_id and from_unit_id = v_component.unit_id and to_unit_id = v_item.unit_id and status = 'active';

        if v_factor is not null then
          v_final_quantity := v_quantity_with_scrap / v_factor;
          v_final_unit_id := v_component.unit_id;
        else
          raise exception 'Componente % (BOM %): unidade do item não coincide com a unidade de estoque do produto e não há unit_conversions cadastrada entre elas.', v_component.name, v_bom.code using errcode = 'P0001';
        end if;
      end if;
    end if;

    insert into public.production_order_materials (
      company_id, production_order_id, bom_item_id, component_product_id, planned_quantity, unit_id, scrap_percentage
    ) values (
      p_company_id, v_order.id, v_item.id, v_item.component_product_id, round(v_final_quantity, 4), v_final_unit_id, v_item.scrap_percentage
    );
    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count = 0 then
    raise exception 'A BOM informada não possui componentes — nada para planejar.' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'CREATE',
    null, jsonb_build_object('bom_id', v_bom.id, 'bom_version', v_bom.version, 'planned_quantity', p_planned_quantity));

  return v_order;
end;
$$;

create or replace function public.fn_plan_production_order(
  p_production_order_id uuid,
  p_planned_date date default null
)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
begin
  select * into v_order from public.production_orders where id = p_production_order_id;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.update') then
    raise exception 'Permissão negada (production_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'Só é possível planejar uma ordem em rascunho (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.production_orders
  set status = 'planned', planned_date = coalesce(p_planned_date, planned_date)
  where id = p_production_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ==================================================================
-- fn_release_production_order — "LIBERAR ORDEM -> RESERVAR MATERIAIS"
-- (seção 33) como uma única transação. Suporta reserva parcial e
-- chamadas repetidas para top-up (mesmo espírito de
-- fn_reserve_sales_order_stock, 0021): cada chamada tenta cobrir o que
-- ainda falta (planned_quantity - reserved_quantity já acumulado),
-- nunca re-reserva o que uma chamada anterior já conseguiu. Nunca
-- permite overbooking — fn_post_stock_movement (dentro de
-- fn_create_reservation) é quem garante isso estruturalmente; aqui o
-- teto por item é calculado a partir de stock_balances.available antes
-- de chamar, para permitir reserva PARCIAL em vez de falhar a operação
-- inteira quando falta disponibilidade de um único componente.
-- ==================================================================
create or replace function public.fn_release_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_material record;
  v_available numeric;
  v_remaining numeric;
  v_to_reserve numeric;
  v_items jsonb := '[]'::jsonb;
  v_any_reserved boolean := false;
  v_fully_covered boolean;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.release') then
    raise exception 'Permissão negada (production_orders.release).' using errcode = '42501';
  end if;

  if v_order.status not in ('draft', 'planned', 'released') then
    raise exception 'Só é possível liberar/reservar materiais de uma ordem draft, planned ou released (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  for v_material in
    select * from public.production_order_materials where production_order_id = p_production_order_id for update
  loop
    v_remaining := v_material.planned_quantity - v_material.reserved_quantity;
    if v_remaining > 0 then
      -- Mesmo grão de stock_balances usado por fn_post_stock_movement
      -- (coalesce(lot_id, zero-uuid)): "is not distinct from" casa
      -- exatamente o bucket que fn_create_reservation vai de fato
      -- reservar — somar todos os lotes aqui quando lot_id for null
      -- superestimaria a disponibilidade se o produto for controlado
      -- por lote e o estoque físico estiver em lotes específicos.
      select coalesce(sum(available), 0) into v_available
      from public.stock_balances
      where company_id = v_order.company_id
        and product_id = v_material.component_product_id
        and location_id = v_order.consumption_location_id
        and lot_id is not distinct from v_material.lot_id;

      v_to_reserve := least(v_remaining, greatest(v_available, 0));
      if v_to_reserve > 0 then
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'product_id', v_material.component_product_id,
          'lot_id', v_material.lot_id,
          'quantity', v_to_reserve,
          '_material_id', v_material.id
        ));
        v_any_reserved := true;
      end if;
    end if;
  end loop;

  if v_any_reserved then
    perform public.fn_create_reservation(
      p_company_id => v_order.company_id,
      p_location_id => v_order.consumption_location_id,
      p_items => v_items,
      p_notes => 'Ordem de produção ' || v_order.code,
      p_reference_type => 'production_order',
      p_reference_id => v_order.id
    );

    update public.production_order_materials pom
    set reserved_quantity = pom.reserved_quantity + (elem->>'quantity')::numeric,
        status = case
          when pom.reserved_quantity + (elem->>'quantity')::numeric >= pom.planned_quantity then 'reserved'
          else 'partial'
        end
    from jsonb_array_elements(v_items) elem
    where pom.id = (elem->>'_material_id')::uuid;
  end if;

  select not exists (
    select 1 from public.production_order_materials
    where production_order_id = p_production_order_id and reserved_quantity < planned_quantity
  ) into v_fully_covered;

  update public.production_orders
  set status = case when v_fully_covered then 'materials_reserved' else 'released' end
  where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'RELEASE',
    null, jsonb_build_object('status', v_order.status, 'fully_covered', v_fully_covered));

  return v_order;
end;
$$;

create or replace function public.fn_start_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.start') then
    raise exception 'Permissão negada (production_orders.start).' using errcode = '42501';
  end if;

  if v_order.status <> 'materials_reserved' then
    raise exception 'Só é possível iniciar uma ordem com materiais totalmente reservados (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.production_orders
  set status = 'in_progress', started_at = now()
  where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'START',
    jsonb_build_object('status', 'materials_reserved'), jsonb_build_object('status', 'in_progress'));

  return v_order;
end;
$$;

create or replace function public.fn_hold_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.update') then
    raise exception 'Permissão negada (production_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível colocar em espera uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.production_orders set status = 'on_hold' where id = p_production_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.fn_resume_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.update') then
    raise exception 'Permissão negada (production_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'on_hold' then
    raise exception 'Só é possível retomar uma ordem em espera (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.production_orders set status = 'in_progress' where id = p_production_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ==================================================================
-- fn_cancel_production_order — permitida em qualquer status exceto
-- completed/cancelled. Libera (fn_release_reservation, reaproveitada)
-- qualquer stock_reservations ainda ativa vinculada à ordem — o que já
-- foi consumido permanece consumido (fato histórico, nunca desfeito).
-- ==================================================================
create or replace function public.fn_cancel_production_order(p_production_order_id uuid)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_reservation record;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.cancel') then
    raise exception 'Permissão negada (production_orders.cancel).' using errcode = '42501';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Ordem no status % não pode ser cancelada.', v_order.status using errcode = 'P0001';
  end if;

  for v_reservation in
    select * from public.stock_reservations
    where company_id = v_order.company_id and reference_type = 'production_order' and reference_id = p_production_order_id and status = 'active'
  loop
    perform public.fn_release_reservation(v_reservation.id);
  end loop;

  update public.production_order_materials set status = 'cancelled'
  where production_order_id = p_production_order_id and status in ('pending', 'partial', 'reserved');

  update public.production_orders set status = 'cancelled' where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'CANCEL',
    null, jsonb_build_object('status', 'cancelled'));

  return v_order;
end;
$$;

revoke all on function public.fn_create_production_order(uuid, uuid, numeric, uuid, uuid, uuid, uuid, uuid, uuid, text, date, uuid, text) from public;
revoke all on function public.fn_plan_production_order(uuid, date) from public;
revoke all on function public.fn_release_production_order(uuid) from public;
revoke all on function public.fn_start_production_order(uuid) from public;
revoke all on function public.fn_hold_production_order(uuid) from public;
revoke all on function public.fn_resume_production_order(uuid) from public;
revoke all on function public.fn_cancel_production_order(uuid) from public;
grant execute on function public.fn_create_production_order(uuid, uuid, numeric, uuid, uuid, uuid, uuid, uuid, uuid, text, date, uuid, text) to authenticated;
grant execute on function public.fn_plan_production_order(uuid, date) to authenticated;
grant execute on function public.fn_release_production_order(uuid) to authenticated;
grant execute on function public.fn_start_production_order(uuid) to authenticated;
grant execute on function public.fn_hold_production_order(uuid) to authenticated;
grant execute on function public.fn_resume_production_order(uuid) to authenticated;
grant execute on function public.fn_cancel_production_order(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('production_orders.view', 'production_orders', 'view', 'Consultar ordens de produção'),
    ('production_orders.create', 'production_orders', 'create', 'Criar ordens de produção (snapshot da BOM ativa)'),
    ('production_orders.update', 'production_orders', 'update', 'Planejar, colocar em espera e retomar ordens de produção'),
    ('production_orders.release', 'production_orders', 'release', 'Liberar ordem e reservar matéria-prima'),
    ('production_orders.start', 'production_orders', 'start', 'Iniciar produção (materiais já reservados)'),
    ('production_orders.complete', 'production_orders', 'complete', 'Concluir ordem de produção'),
    ('production_orders.cancel', 'production_orders', 'cancel', 'Cancelar ordem de produção'),
    -- production_materials.view é definida aqui (não em 0029) porque a
    -- policy de select de production_order_materials, criada nesta
    -- mesma migration, já depende dela.
    ('production_materials.view', 'production_materials', 'view', 'Consultar materiais de ordens de produção')
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
-- RLS — select-only; toda escrita via função.
-- ==================================================================
alter table public.production_orders enable row level security;
alter table public.production_order_materials enable row level security;

drop policy if exists production_orders_select on public.production_orders;
create policy production_orders_select on public.production_orders
  for select to authenticated using (public.has_permission(company_id, 'production_orders.view'));

drop policy if exists production_order_materials_select on public.production_order_materials;
create policy production_order_materials_select on public.production_order_materials
  for select to authenticated using (public.has_permission(company_id, 'production_materials.view'));
