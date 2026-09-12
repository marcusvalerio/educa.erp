-- Fase 6 — Produção/PCP: consumo, devolução, produto acabado e
-- perdas/refugos.
--
-- Onde Produção finalmente encosta em Estoque — via fn_post_stock_movement
-- (0009), o único ponto de escrita de stock_balances em todo o sistema.
-- Consumo grava ISSUE+RELEASE pela quantidade parcial exata (mesmo
-- primitivo usado por fn_ship_shipment, 0024, em granularidade parcial
-- — não um mecanismo novo). Produção de acabado grava PRODUCTION_IN
-- (vocabulário já reservado desde 0009). Nenhuma linha aqui faz
-- `update stock_balances` direto.
--
-- Idempotência (seção 34): cada função que gera efeito colateral em
-- estoque faz um short-circuit EXPLÍCITO no início (não confia só na
-- idempotência interna de fn_post_stock_movement) — sem isso, uma
-- segunda chamada com a mesma idempotency_key não duplicaria o
-- movimento de estoque, mas duplicaria o incremento em
-- consumed_quantity/produced_quantity, que não tem proteção própria.

create table if not exists public.production_scrap (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  production_order_id uuid not null,
  material_id uuid,
  product_id uuid not null,
  quantity numeric(16, 4) not null check (quantity > 0),
  unit_id uuid not null,
  reason text not null,
  lot_id uuid,
  stock_movement_issue_id uuid references public.stock_movements(id) on delete set null,
  idempotency_key text,
  recorded_by uuid references public.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (production_order_id, company_id) references public.production_orders (id, company_id) on delete restrict,
  foreign key (material_id, company_id) references public.production_order_materials (id, company_id) on delete set null,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (unit_id, company_id) references public.units (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create unique index if not exists production_scrap_idempotency_key
  on public.production_scrap (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists production_scrap_order_idx on public.production_scrap (production_order_id);
create index if not exists production_scrap_material_idx on public.production_scrap (material_id);

comment on table public.production_scrap is
  'Perdas/refugos. material_id preenchido = perda de matéria-prima já reservada (gera ISSUE+RELEASE via stock_movement_issue_id, rastreável). material_id nulo = refugo de produto acabado (produced_quantity nunca chegou a entrar no estoque — só o registro para rastreabilidade, sem movimento de estoque). Escrita exclusiva via fn_register_production_scrap.';

-- ==================================================================
-- fn_consume_production_material — baixa efetiva de matéria-prima.
-- consumed_quantity é sempre incremental (nunca um SET): cada chamada
-- soma p_quantity ao que já foi consumido, suportando consumo parcial
-- em múltiplas etapas (seção 14: 100 planejado, 80 consumido, depois
-- mais 20). Bloqueia consumir além do que ainda está
-- reservado-e-não-usado (reserved - consumed - returned - scrapped).
-- ==================================================================
create or replace function public.fn_consume_production_material(
  p_production_order_material_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_serial_numbers jsonb default null,
  p_idempotency_key text default null
)
returns public.production_order_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_material public.production_order_materials;
  v_order public.production_orders;
  v_available_to_consume numeric;
  v_existing public.stock_movements;
begin
  select * into v_material from public.production_order_materials where id = p_production_order_material_id for update;
  if not found then
    raise exception 'Material da ordem de produção não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_order from public.production_orders where id = v_material.production_order_id for update;

  if not public.has_permission(v_order.company_id, 'production_materials.consume') then
    raise exception 'Permissão negada (production_materials.consume).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key || ':issue';
    if found then
      return v_material;
    end if;
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível consumir material de uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade consumida deve ser maior que zero.' using errcode = '22023';
  end if;

  v_available_to_consume := v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity;
  if p_quantity > v_available_to_consume then
    raise exception 'Quantidade a consumir (%) excede o saldo reservado e ainda não utilizado deste material (%).', p_quantity, v_available_to_consume using errcode = 'P0001';
  end if;

  perform public.fn_post_stock_movement(
    p_company_id => v_order.company_id,
    p_product_id => v_material.component_product_id,
    p_location_id => v_order.consumption_location_id,
    p_movement_type => 'ISSUE',
    p_quantity => p_quantity,
    p_lot_id => coalesce(p_lot_id, v_material.lot_id),
    p_reference_type => 'PRODUCTION_ORDER',
    p_reference_id => v_order.id,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':issue' else null end,
    p_created_by => public.current_app_user_id()
  );

  perform public.fn_post_stock_movement(
    p_company_id => v_order.company_id,
    p_product_id => v_material.component_product_id,
    p_location_id => v_order.consumption_location_id,
    p_movement_type => 'RELEASE',
    p_quantity => p_quantity,
    p_lot_id => coalesce(p_lot_id, v_material.lot_id),
    p_reference_type => 'PRODUCTION_ORDER',
    p_reference_id => v_order.id,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':release' else null end,
    p_created_by => public.current_app_user_id()
  );

  update public.production_order_materials
  set consumed_quantity = consumed_quantity + p_quantity,
      lot_id = coalesce(p_lot_id, lot_id),
      serial_numbers = coalesce(serial_numbers, '[]'::jsonb) || coalesce(p_serial_numbers, '[]'::jsonb),
      status = case
        when consumed_quantity + p_quantity + returned_quantity + scrapped_quantity >= reserved_quantity then 'consumed'
        else status
      end
  where id = p_production_order_material_id
  returning * into v_material;

  if p_serial_numbers is not null and jsonb_array_length(p_serial_numbers) > 0 then
    update public.product_serial_numbers
    set status = 'consumed', current_location_id = null
    where company_id = v_order.company_id and product_id = v_material.component_product_id
      and serial_number in (select jsonb_array_elements_text(p_serial_numbers));
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_order_materials', v_material.id, 'CONSUME',
    null, jsonb_build_object('quantity', p_quantity, 'production_order_id', v_order.id));

  return v_material;
end;
$$;

-- ==================================================================
-- fn_return_production_material — devolução de material separado mas
-- não consumido (seção 15). Gera RELEASE (o material nunca saiu de
-- on_hand, só estava reservado) — nunca altera saldo diretamente.
-- ==================================================================
create or replace function public.fn_return_production_material(
  p_production_order_material_id uuid,
  p_quantity numeric,
  p_idempotency_key text default null
)
returns public.production_order_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_material public.production_order_materials;
  v_order public.production_orders;
  v_available_to_return numeric;
  v_existing public.stock_movements;
begin
  select * into v_material from public.production_order_materials where id = p_production_order_material_id for update;
  if not found then
    raise exception 'Material da ordem de produção não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_order from public.production_orders where id = v_material.production_order_id for update;

  if not public.has_permission(v_order.company_id, 'production_materials.return') then
    raise exception 'Permissão negada (production_materials.return).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_material;
    end if;
  end if;

  if v_order.status not in ('in_progress', 'on_hold') then
    raise exception 'Só é possível devolver material de uma ordem em andamento ou em espera (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade devolvida deve ser maior que zero.' using errcode = '22023';
  end if;

  v_available_to_return := v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity;
  if p_quantity > v_available_to_return then
    raise exception 'Quantidade a devolver (%) excede o saldo ainda reservado e não utilizado deste material (%).', p_quantity, v_available_to_return using errcode = 'P0001';
  end if;

  perform public.fn_post_stock_movement(
    p_company_id => v_order.company_id,
    p_product_id => v_material.component_product_id,
    p_location_id => v_order.consumption_location_id,
    p_movement_type => 'RELEASE',
    p_quantity => p_quantity,
    p_lot_id => v_material.lot_id,
    p_reference_type => 'PRODUCTION_ORDER',
    p_reference_id => v_order.id,
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );

  update public.production_order_materials
  set returned_quantity = returned_quantity + p_quantity,
      status = case
        when consumed_quantity + returned_quantity + p_quantity + scrapped_quantity >= reserved_quantity then 'consumed'
        else status
      end
  where id = p_production_order_material_id
  returning * into v_material;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_order_materials', v_material.id, 'RETURN',
    null, jsonb_build_object('quantity', p_quantity, 'production_order_id', v_order.id));

  return v_material;
end;
$$;

-- ==================================================================
-- fn_register_production_output — entrada de produto acabado (seção
-- 16-17). produced_quantity/rejected_quantity do cabeçalho são sempre
-- incrementais — suporta produção parcial em múltiplas chamadas (100
-- planejado: 40, depois 35, depois 25). rejected_quantity aqui é só a
-- contagem no cabeçalho; o registro rastreável de refugo (com motivo)
-- é fn_register_production_scrap, chamada separadamente pelo chamador
-- quando houver rejeição.
-- ==================================================================
create or replace function public.fn_register_production_output(
  p_production_order_id uuid,
  p_produced_quantity numeric default 0,
  p_rejected_quantity numeric default 0,
  p_lot_number text default null,
  p_serial_numbers jsonb default null,
  p_idempotency_key text default null
)
returns public.production_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_product public.products;
  v_lot_id uuid;
  v_existing public.stock_movements;
  v_serial_count integer;
  v_serial text;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_orders.update') then
    raise exception 'Permissão negada (production_orders.update).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_order;
    end if;
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível registrar produção de uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if coalesce(p_produced_quantity, 0) < 0 or coalesce(p_rejected_quantity, 0) < 0 then
    raise exception 'Quantidades não podem ser negativas.' using errcode = '22023';
  end if;

  if coalesce(p_produced_quantity, 0) = 0 and coalesce(p_rejected_quantity, 0) = 0 then
    raise exception 'Informe ao menos uma quantidade produzida ou rejeitada.' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = v_order.product_id;

  if p_produced_quantity > 0 then
    if v_product.batch_controlled then
      if p_lot_number is null or trim(p_lot_number) = '' then
        raise exception 'Produto controla lote — informe o número do lote produzido.' using errcode = '22023';
      end if;
      insert into public.product_lots (company_id, product_id, lot_number, manufactured_at)
      values (v_order.company_id, v_order.product_id, trim(p_lot_number), current_date)
      on conflict (company_id, product_id, lot_number) do nothing;

      select id into v_lot_id from public.product_lots
      where company_id = v_order.company_id and product_id = v_order.product_id and lot_number = trim(p_lot_number);
    end if;

    if v_product.serial_controlled then
      v_serial_count := coalesce(jsonb_array_length(p_serial_numbers), 0);
      if v_serial_count <> p_produced_quantity::integer then
        raise exception 'Produto controla número de série — informe exatamente % série(s) para a quantidade produzida.', p_produced_quantity::integer using errcode = 'P0001';
      end if;
    end if;

    perform public.fn_post_stock_movement(
      p_company_id => v_order.company_id,
      p_product_id => v_order.product_id,
      p_location_id => v_order.output_location_id,
      p_movement_type => 'PRODUCTION_IN',
      p_quantity => p_produced_quantity,
      p_lot_id => v_lot_id,
      p_reference_type => 'PRODUCTION_ORDER',
      p_reference_id => v_order.id,
      p_idempotency_key => p_idempotency_key,
      p_created_by => public.current_app_user_id()
    );

    if v_product.serial_controlled and v_serial_count > 0 then
      for v_serial in select jsonb_array_elements_text(p_serial_numbers)
      loop
        insert into public.product_serial_numbers (company_id, product_id, serial_number, status, current_location_id)
        values (v_order.company_id, v_order.product_id, v_serial, 'in_stock', v_order.output_location_id)
        on conflict (company_id, product_id, serial_number) do nothing;
      end loop;
    end if;
  end if;

  update public.production_orders
  set produced_quantity = produced_quantity + coalesce(p_produced_quantity, 0),
      rejected_quantity = rejected_quantity + coalesce(p_rejected_quantity, 0)
  where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'UPDATE',
    null, jsonb_build_object('produced_quantity', p_produced_quantity, 'rejected_quantity', p_rejected_quantity));

  return v_order;
end;
$$;

-- ==================================================================
-- fn_register_production_scrap — perda rastreável (seção 18).
-- material_id presente = perda de matéria-prima: gera ISSUE (reduz
-- on_hand, a perda é física) + RELEASE (reduz reserved, o que se
-- perdeu não pode continuar reservado) pela quantidade perdida.
-- material_id ausente = refugo de produto acabado: só o registro, sem
-- movimento (o produzido rejeitado nunca chegou a entrar no estoque —
-- ver fn_register_production_output, que já soma em rejected_quantity
-- separadamente; esta função cobre o registro COM motivo/lote para
-- rastreabilidade, podendo ser chamada independentemente).
-- ==================================================================
create or replace function public.fn_register_production_scrap(
  p_production_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_reason text,
  p_material_id uuid default null,
  p_lot_id uuid default null,
  p_idempotency_key text default null
)
returns public.production_scrap
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_material public.production_order_materials;
  v_available_to_scrap numeric;
  v_existing public.production_scrap;
  v_movement public.stock_movements;
  v_scrap public.production_scrap;
begin
  select * into v_order from public.production_orders where id = p_production_order_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_scrap.create') then
    raise exception 'Permissão negada (production_scrap.create).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.production_scrap
    where company_id = v_order.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade perdida deve ser maior que zero.' using errcode = '22023';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Informe o motivo da perda/refugo.' using errcode = '22023';
  end if;

  if p_material_id is not null then
    select * into v_material from public.production_order_materials where id = p_material_id and production_order_id = p_production_order_id for update;
    if not found then
      raise exception 'Material da ordem de produção não encontrado.' using errcode = 'P0002';
    end if;

    v_available_to_scrap := v_material.reserved_quantity - v_material.consumed_quantity - v_material.returned_quantity - v_material.scrapped_quantity;
    if p_quantity > v_available_to_scrap then
      raise exception 'Quantidade perdida (%) excede o saldo reservado e ainda não utilizado deste material (%).', p_quantity, v_available_to_scrap using errcode = 'P0001';
    end if;

    v_movement := public.fn_post_stock_movement(
      p_company_id => v_order.company_id,
      p_product_id => v_material.component_product_id,
      p_location_id => v_order.consumption_location_id,
      p_movement_type => 'ISSUE',
      p_quantity => p_quantity,
      p_lot_id => coalesce(p_lot_id, v_material.lot_id),
      p_reference_type => 'PRODUCTION_SCRAP',
      p_reference_id => p_production_order_id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':issue' else null end,
      p_created_by => public.current_app_user_id()
    );

    perform public.fn_post_stock_movement(
      p_company_id => v_order.company_id,
      p_product_id => v_material.component_product_id,
      p_location_id => v_order.consumption_location_id,
      p_movement_type => 'RELEASE',
      p_quantity => p_quantity,
      p_lot_id => coalesce(p_lot_id, v_material.lot_id),
      p_reference_type => 'PRODUCTION_SCRAP',
      p_reference_id => p_production_order_id,
      p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':release' else null end,
      p_created_by => public.current_app_user_id()
    );

    update public.production_order_materials
    set scrapped_quantity = scrapped_quantity + p_quantity
    where id = p_material_id;
  end if;

  insert into public.production_scrap (
    company_id, production_order_id, material_id, product_id, quantity, unit_id, reason, lot_id,
    stock_movement_issue_id, idempotency_key, recorded_by
  ) values (
    v_order.company_id, p_production_order_id, p_material_id, p_product_id, p_quantity, p_unit_id, trim(p_reason), p_lot_id,
    v_movement.id, p_idempotency_key, public.current_app_user_id()
  )
  returning * into v_scrap;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_scrap', v_scrap.id, 'SCRAP',
    null, jsonb_build_object('production_order_id', p_production_order_id, 'quantity', p_quantity, 'reason', p_reason));

  return v_scrap;
end;
$$;

-- ==================================================================
-- fn_complete_production_order — encerramento explícito (seção 17:
-- "a ordem só deve ser concluída quando as regras definidas para a
-- ordem forem satisfeitas" — aqui a única regra estrutural é estar
-- in_progress; a decisão de negócio de "já produzi o suficiente" é do
-- operador, não travada por produced_quantity >= planned_quantity,
-- para permitir encerrar uma ordem com produção menor que o planejado
-- quando necessário). Idempotente pelo guard de status — chamar duas
-- vezes "Concluir produção" (seção 34) falha claramente na segunda.
-- ==================================================================
create or replace function public.fn_complete_production_order(p_production_order_id uuid)
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

  if not public.has_permission(v_order.company_id, 'production_orders.complete') then
    raise exception 'Permissão negada (production_orders.complete).' using errcode = '42501';
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Só é possível concluir uma ordem em andamento (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.production_orders
  set status = 'completed', finished_at = now()
  where id = p_production_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'production_orders', v_order.id, 'COMPLETE',
    jsonb_build_object('status', 'in_progress'), jsonb_build_object('status', 'completed', 'produced_quantity', v_order.produced_quantity, 'rejected_quantity', v_order.rejected_quantity));

  return v_order;
end;
$$;

revoke all on function public.fn_consume_production_material(uuid, numeric, uuid, jsonb, text) from public;
revoke all on function public.fn_return_production_material(uuid, numeric, text) from public;
revoke all on function public.fn_register_production_output(uuid, numeric, numeric, text, jsonb, text) from public;
revoke all on function public.fn_register_production_scrap(uuid, uuid, numeric, uuid, text, uuid, uuid, text) from public;
revoke all on function public.fn_complete_production_order(uuid) from public;
grant execute on function public.fn_consume_production_material(uuid, numeric, uuid, jsonb, text) to authenticated;
grant execute on function public.fn_return_production_material(uuid, numeric, text) to authenticated;
grant execute on function public.fn_register_production_output(uuid, numeric, numeric, text, jsonb, text) to authenticated;
grant execute on function public.fn_register_production_scrap(uuid, uuid, numeric, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.fn_complete_production_order(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('production_materials.consume', 'production_materials', 'consume', 'Registrar consumo de matéria-prima em uma ordem de produção'),
    ('production_materials.return', 'production_materials', 'return', 'Devolver matéria-prima reservada e não consumida'),
    ('production_scrap.view', 'production_scrap', 'view', 'Consultar perdas/refugos de produção'),
    ('production_scrap.create', 'production_scrap', 'create', 'Registrar perdas/refugos de produção')
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
alter table public.production_scrap enable row level security;

drop policy if exists production_scrap_select on public.production_scrap;
create policy production_scrap_select on public.production_scrap
  for select to authenticated using (public.has_permission(company_id, 'production_scrap.view'));
