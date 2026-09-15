-- Fase 17 — Qualidade.
--
-- Inspeção prévia: warehouse_locations.purpose='QUARANTINE' (0013) é
-- reaproveitada tal como está — nenhuma segunda infraestrutura de
-- estoque é criada para quarentena. product_lots (0008), stock_movements
-- (0009), purchase_receipt_items/shipment_items/production_order_materials
-- (0018/0024/0028) já carregam lot_id — a rastreabilidade (seção
-- "cadeia de rastreabilidade") é uma função de consulta que une essas
-- tabelas existentes, nunca um ledger paralelo.

create table if not exists public.quality_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  inspection_type text not null check (inspection_type in ('RECEIVING', 'PRODUCTION', 'SHIPPING', 'RETURN', 'PROCESS', 'OTHER')),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.quality_checklists
  for each row execute procedure extensions.moddatetime(updated_at);

create table if not exists public.quality_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  checklist_id uuid not null references public.quality_checklists(id) on delete cascade,
  sequence integer not null default 0,
  description text not null,
  criteria_type text not null check (criteria_type in ('PASS_FAIL', 'NUMERIC', 'TEXT', 'YES_NO', 'RANGE')),
  expected_value text,
  min_value numeric(18, 4),
  max_value numeric(18, 4),
  unit text,
  is_mandatory boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists quality_checklist_items_checklist_idx on public.quality_checklist_items (checklist_id, sequence);

comment on table public.quality_checklist_items is
  'Critério de um checklist: PASS_FAIL (aprova/reprova direto), NUMERIC/RANGE (compara com min_value/max_value), YES_NO (compara com expected_value), TEXT (só registra, sem resultado automático).';

-- ==================================================================
-- QUALITY_INSPECTIONS — source_type/source_id polimórfico (mesmo
-- padrão de cost_movements/fiscal_documents) para integrar com
-- Recebimento/Produção/Expedição/Entrega/Ativo/Ordem de Manutenção
-- sem FK real (são origens de naturezas diferentes).
-- ==================================================================
create sequence if not exists public.quality_inspections_code_seq;

create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  inspection_type text not null check (inspection_type in ('RECEIVING', 'PRODUCTION', 'SHIPPING', 'RETURN', 'PROCESS', 'OTHER')),
  checklist_id uuid references public.quality_checklists(id) on delete set null,
  source_type text check (source_type is null or source_type in ('purchase_receipt', 'production_order', 'production_operation', 'shipment', 'delivery_event', 'asset', 'maintenance_order', 'service_order', 'other')),
  source_id uuid,
  product_id uuid references public.products(id) on delete set null,
  lot_id uuid,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'PARTIALLY_APPROVED')),
  inspector_user_id uuid references public.users(id) on delete set null,
  inspected_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete set null
);

create trigger generate_quality_inspection_code before insert on public.quality_inspections
  for each row execute procedure public.fn_generate_code('INSP', 'public.quality_inspections_code_seq');
create trigger set_updated_at before update on public.quality_inspections
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists quality_inspections_source_idx on public.quality_inspections (source_type, source_id);
create index if not exists quality_inspections_status_idx on public.quality_inspections (company_id, status);
create index if not exists quality_inspections_lot_idx on public.quality_inspections (lot_id);

create table if not exists public.quality_inspection_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.quality_inspections(id) on delete cascade,
  checklist_item_id uuid not null references public.quality_checklist_items(id) on delete restrict,
  value_found text,
  numeric_value numeric(18, 4),
  result text check (result is null or result in ('PASS', 'FAIL')),
  notes text,
  recorded_by uuid references public.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (inspection_id, checklist_item_id)
);

create index if not exists quality_inspection_results_inspection_idx on public.quality_inspection_results (inspection_id);

-- ==================================================================
-- NONCONFORMITIES / QUALITY_ACTIONS — ações corretivas e preventivas
-- unificadas em UMA tabela com action_type (mesmo princípio de
-- document_sequences 0053: não criar duas tabelas quase idênticas).
-- ==================================================================
create sequence if not exists public.nonconformities_code_seq;

create table if not exists public.nonconformities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  inspection_id uuid references public.quality_inspections(id) on delete set null,
  origin_type text check (origin_type is null or origin_type in ('purchase_receipt', 'production_order', 'shipment', 'delivery_event', 'asset', 'maintenance_order', 'service_order', 'quality_inspection', 'other')),
  origin_id uuid,
  severity text not null default 'MEDIUM' check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  cause text,
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_ANALYSIS', 'IN_TREATMENT', 'CLOSED')),
  responsible_user_id uuid references public.users(id) on delete set null,
  evidence_notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create trigger generate_nonconformity_code before insert on public.nonconformities
  for each row execute procedure public.fn_generate_code('NC', 'public.nonconformities_code_seq');
create trigger set_updated_at before update on public.nonconformities
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists nonconformities_status_idx on public.nonconformities (company_id, status);

create table if not exists public.quality_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nonconformity_id uuid references public.nonconformities(id) on delete cascade,
  action_type text not null check (action_type in ('CORRECTIVE', 'PREVENTIVE')),
  description text not null,
  responsible_user_id uuid references public.users(id) on delete set null,
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  completed_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.quality_actions
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists quality_actions_nc_idx on public.quality_actions (nonconformity_id);

-- ==================================================================
-- fn_record_inspection_result — upsert de resultado por item do
-- checklist, calculando PASS/FAIL automaticamente quando o
-- criteria_type permite (PASS_FAIL/YES_NO/NUMERIC/RANGE); TEXT nunca
-- calcula resultado automático.
-- ==================================================================
create or replace function public.fn_record_inspection_result(
  p_inspection_id uuid,
  p_checklist_item_id uuid,
  p_value_found text default null,
  p_numeric_value numeric default null,
  p_notes text default null
)
returns public.quality_inspection_results
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inspection public.quality_inspections;
  v_item public.quality_checklist_items;
  v_result text;
  v_row public.quality_inspection_results;
begin
  select * into v_inspection from public.quality_inspections where id = p_inspection_id;
  if not found then
    raise exception 'Inspeção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_inspection.company_id, 'quality_inspections.record_result') then
    raise exception 'Permissão negada (quality_inspections.record_result).' using errcode = '42501';
  end if;

  if v_inspection.status not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'Só é possível registrar resultado com a inspeção pendente ou em andamento (status atual: %).', v_inspection.status using errcode = 'P0001';
  end if;

  select * into v_item from public.quality_checklist_items where id = p_checklist_item_id;
  if not found then
    raise exception 'Item de checklist não encontrado.' using errcode = 'P0002';
  end if;

  v_result := case v_item.criteria_type
    when 'PASS_FAIL' then case when upper(p_value_found) = 'PASS' then 'PASS' when upper(p_value_found) = 'FAIL' then 'FAIL' else null end
    when 'YES_NO' then case when upper(p_value_found) = upper(coalesce(v_item.expected_value, 'YES')) then 'PASS' else 'FAIL' end
    when 'NUMERIC', 'RANGE' then case
      when p_numeric_value is null then null
      when (v_item.min_value is null or p_numeric_value >= v_item.min_value) and (v_item.max_value is null or p_numeric_value <= v_item.max_value) then 'PASS'
      else 'FAIL'
    end
    else null
  end;

  insert into public.quality_inspection_results (company_id, inspection_id, checklist_item_id, value_found, numeric_value, result, notes, recorded_by)
  values (v_inspection.company_id, p_inspection_id, p_checklist_item_id, p_value_found, p_numeric_value, v_result, p_notes, public.current_app_user_id())
  on conflict (inspection_id, checklist_item_id) do update
    set value_found = excluded.value_found, numeric_value = excluded.numeric_value, result = excluded.result,
      notes = excluded.notes, recorded_by = excluded.recorded_by, recorded_at = now()
  returning * into v_row;

  update public.quality_inspections set status = 'IN_PROGRESS' where id = p_inspection_id and status = 'PENDING';

  return v_row;
end;
$$;

-- ==================================================================
-- fn_finalize_inspection — fecha a inspeção com o resultado final.
-- ==================================================================
create or replace function public.fn_finalize_inspection(p_inspection_id uuid, p_status text, p_notes text default null)
returns public.quality_inspections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inspection public.quality_inspections;
begin
  if p_status not in ('APPROVED', 'REJECTED', 'PARTIALLY_APPROVED') then
    raise exception 'Status final inválido: %.', p_status using errcode = '22023';
  end if;

  select * into v_inspection from public.quality_inspections where id = p_inspection_id for update;
  if not found then
    raise exception 'Inspeção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_inspection.company_id, 'quality_inspections.finalize') then
    raise exception 'Permissão negada (quality_inspections.finalize).' using errcode = '42501';
  end if;

  if v_inspection.status not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'Inspeção já finalizada (status atual: %).', v_inspection.status using errcode = 'P0001';
  end if;

  update public.quality_inspections
  set status = p_status, inspected_at = now(), inspector_user_id = coalesce(inspector_user_id, public.current_app_user_id()),
    notes = coalesce(p_notes, notes)
  where id = p_inspection_id
  returning * into v_inspection;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_inspection.company_id, public.current_app_user_id(), 'system', 'quality_inspections', v_inspection.id, 'UPDATE',
    jsonb_build_object('status', 'PENDING'), jsonb_build_object('status', p_status));

  return v_inspection;
end;
$$;

-- ==================================================================
-- fn_create_nonconformity_from_inspection — integração explícita
-- (nunca automática): quem decide abrir a não conformidade chama esta
-- função depois de ver o resultado da inspeção.
-- ==================================================================
create or replace function public.fn_create_nonconformity_from_inspection(
  p_inspection_id uuid,
  p_severity text,
  p_description text,
  p_cause text default null,
  p_responsible_user_id uuid default null
)
returns public.nonconformities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inspection public.quality_inspections;
  v_nc public.nonconformities;
begin
  select * into v_inspection from public.quality_inspections where id = p_inspection_id;
  if not found then
    raise exception 'Inspeção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_inspection.company_id, 'nonconformities.create') then
    raise exception 'Permissão negada (nonconformities.create).' using errcode = '42501';
  end if;

  insert into public.nonconformities (company_id, inspection_id, origin_type, origin_id, severity, cause, description, responsible_user_id, created_by)
  values (v_inspection.company_id, v_inspection.id, 'quality_inspection', v_inspection.id, p_severity, p_cause, p_description, p_responsible_user_id, public.current_app_user_id())
  returning * into v_nc;

  return v_nc;
end;
$$;

create or replace function public.fn_transition_nonconformity_status(p_nonconformity_id uuid, p_new_status text)
returns public.nonconformities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nc public.nonconformities;
  v_allowed boolean;
begin
  select * into v_nc from public.nonconformities where id = p_nonconformity_id for update;
  if not found then
    raise exception 'Não conformidade não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_nc.company_id, 'nonconformities.update') then
    raise exception 'Permissão negada (nonconformities.update).' using errcode = '42501';
  end if;

  v_allowed := case v_nc.status
    when 'OPEN' then p_new_status = 'IN_ANALYSIS'
    when 'IN_ANALYSIS' then p_new_status = 'IN_TREATMENT'
    when 'IN_TREATMENT' then p_new_status = 'CLOSED'
    else false
  end;
  if not v_allowed then
    raise exception 'Transição inválida: % -> %.', v_nc.status, p_new_status using errcode = 'P0001';
  end if;

  update public.nonconformities
  set status = p_new_status, closed_at = case when p_new_status = 'CLOSED' then now() else closed_at end
  where id = p_nonconformity_id
  returning * into v_nc;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_nc.company_id, public.current_app_user_id(), 'system', 'nonconformities', v_nc.id, 'UPDATE',
    jsonb_build_object('status', v_nc.status), jsonb_build_object('status', p_new_status));

  return v_nc;
end;
$$;

create or replace function public.fn_transition_quality_action_status(p_action_id uuid, p_new_status text)
returns public.quality_actions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.quality_actions;
  v_allowed boolean;
begin
  select * into v_action from public.quality_actions where id = p_action_id for update;
  if not found then
    raise exception 'Ação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_action.company_id, 'quality_actions.update') then
    raise exception 'Permissão negada (quality_actions.update).' using errcode = '42501';
  end if;

  v_allowed := case v_action.status
    when 'OPEN' then p_new_status in ('IN_PROGRESS', 'CANCELLED')
    when 'IN_PROGRESS' then p_new_status in ('COMPLETED', 'CANCELLED')
    else false
  end;
  if not v_allowed then
    raise exception 'Transição inválida: % -> %.', v_action.status, p_new_status using errcode = 'P0001';
  end if;

  update public.quality_actions
  set status = p_new_status, completed_at = case when p_new_status = 'COMPLETED' then now() else completed_at end
  where id = p_action_id
  returning * into v_action;

  return v_action;
end;
$$;

-- ==================================================================
-- fn_send_to_quarantine — reaproveita fn_post_stock_movement (TRANSFER_
-- OUT/TRANSFER_IN) e fn_register_cost_movement; exige explicitamente
-- que o local de destino tenha purpose='QUARANTINE' (nunca escolhido
-- implicitamente).
-- ==================================================================
create or replace function public.fn_send_to_quarantine(
  p_inspection_id uuid,
  p_product_id uuid,
  p_from_location_id uuid,
  p_quarantine_location_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inspection public.quality_inspections;
  v_location public.warehouse_locations;
  v_out public.stock_movements;
  v_in public.stock_movements;
  v_out_cost public.cost_movements;
begin
  select * into v_inspection from public.quality_inspections where id = p_inspection_id;
  if not found then
    raise exception 'Inspeção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_inspection.company_id, 'quality_inspections.quarantine') then
    raise exception 'Permissão negada (quality_inspections.quarantine).' using errcode = '42501';
  end if;

  select * into v_location from public.warehouse_locations where id = p_quarantine_location_id and company_id = v_inspection.company_id;
  if not found or v_location.purpose <> 'QUARANTINE' then
    raise exception 'Local de destino precisa ter purpose=QUARANTINE.' using errcode = 'P0001';
  end if;

  v_out := public.fn_post_stock_movement(
    p_company_id => v_inspection.company_id, p_product_id => p_product_id, p_location_id => p_from_location_id,
    p_movement_type => 'TRANSFER_OUT', p_quantity => p_quantity, p_lot_id => p_lot_id,
    p_reference_type => 'quality_inspection', p_reference_id => v_inspection.id, p_created_by => public.current_app_user_id()
  );
  v_out_cost := public.fn_register_cost_movement(v_out.id, null, 'quality_inspection', v_inspection.id);

  v_in := public.fn_post_stock_movement(
    p_company_id => v_inspection.company_id, p_product_id => p_product_id, p_location_id => p_quarantine_location_id,
    p_movement_type => 'TRANSFER_IN', p_quantity => p_quantity, p_lot_id => p_lot_id,
    p_reference_type => 'quality_inspection', p_reference_id => v_inspection.id, p_created_by => public.current_app_user_id()
  );
  perform public.fn_register_cost_movement(v_in.id, coalesce(v_out_cost.unit_cost, 0), 'quality_inspection', v_inspection.id);

  return v_in;
end;
$$;

-- ==================================================================
-- fn_quality_traceability — fornecedor -> lote -> recebimento ->
-- inspeção -> estoque -> produção -> expedição, só leitura, unindo
-- tabelas já existentes pelo lot_id.
-- ==================================================================
create or replace function public.fn_quality_traceability(p_lot_id uuid)
returns table (event_at timestamptz, stage text, description text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot public.product_lots;
begin
  select * into v_lot from public.product_lots where id = p_lot_id;
  if not found then
    raise exception 'Lote não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_lot.company_id, 'quality_reports.view') then
    raise exception 'Permissão negada (quality_reports.view).' using errcode = '42501';
  end if;

  return query
    select pr.created_at, 'RECEIVING'::text, 'Recebimento ' || pr.code || ' — fornecedor ' || coalesce(s.trade_name, s.legal_name)
    from public.purchase_receipt_items pri
    join public.purchase_receipts pr on pr.id = pri.receipt_id
    left join public.suppliers s on s.id = pr.supplier_id
    where pri.lot_id = p_lot_id
    union all
    select qi.created_at, 'INSPECTION'::text, 'Inspeção ' || qi.code || ' — ' || qi.status
    from public.quality_inspections qi where qi.lot_id = p_lot_id
    union all
    select sm.created_at, 'STOCK_MOVEMENT'::text, sm.movement_type || ' — quantidade ' || sm.quantity
    from public.stock_movements sm where sm.lot_id = p_lot_id
    union all
    select po.created_at, 'PRODUCTION'::text, 'Consumo na ordem de produção ' || po.code
    from public.production_order_materials pom
    join public.production_orders po on po.id = pom.production_order_id
    where pom.lot_id = p_lot_id
    union all
    select sh.created_at, 'SHIPMENT'::text, 'Expedição ' || sh.code
    from public.shipment_items shi
    join public.shipments sh on sh.id = shi.shipment_id
    where shi.lot_id = p_lot_id
    order by 1;
end;
$$;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('quality_checklists.view', 'quality_checklists', 'view', 'Consultar checklists de qualidade'),
    ('quality_checklists.create', 'quality_checklists', 'create', 'Criar checklists de qualidade'),
    ('quality_checklists.update', 'quality_checklists', 'update', 'Editar checklists de qualidade'),
    ('quality_inspections.view', 'quality_inspections', 'view', 'Consultar inspeções de qualidade'),
    ('quality_inspections.create', 'quality_inspections', 'create', 'Criar inspeções de qualidade'),
    ('quality_inspections.update', 'quality_inspections', 'update', 'Editar dados descritivos da inspeção'),
    ('quality_inspections.record_result', 'quality_inspections', 'record_result', 'Registrar resultado de item de checklist'),
    ('quality_inspections.finalize', 'quality_inspections', 'finalize', 'Finalizar (aprovar/reprovar) uma inspeção'),
    ('quality_inspections.quarantine', 'quality_inspections', 'quarantine', 'Enviar produto para quarentena a partir de uma inspeção'),
    ('nonconformities.view', 'nonconformities', 'view', 'Consultar não conformidades'),
    ('nonconformities.create', 'nonconformities', 'create', 'Criar não conformidades'),
    ('nonconformities.update', 'nonconformities', 'update', 'Editar/transicionar não conformidades'),
    ('quality_actions.view', 'quality_actions', 'view', 'Consultar ações corretivas/preventivas'),
    ('quality_actions.create', 'quality_actions', 'create', 'Criar ações corretivas/preventivas'),
    ('quality_actions.update', 'quality_actions', 'update', 'Editar/transicionar ações corretivas/preventivas'),
    ('quality_reports.view', 'quality_reports', 'view', 'Consultar rastreabilidade e indicadores de qualidade')
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
alter table public.quality_checklists enable row level security;
alter table public.quality_checklist_items enable row level security;
alter table public.quality_inspections enable row level security;
alter table public.quality_inspection_results enable row level security;
alter table public.nonconformities enable row level security;
alter table public.quality_actions enable row level security;

drop policy if exists quality_checklists_select on public.quality_checklists;
create policy quality_checklists_select on public.quality_checklists for select to authenticated using (public.has_permission(company_id, 'quality_checklists.view'));
drop policy if exists quality_checklists_insert on public.quality_checklists;
create policy quality_checklists_insert on public.quality_checklists for insert to authenticated with check (public.has_permission(company_id, 'quality_checklists.create'));
drop policy if exists quality_checklists_update on public.quality_checklists;
create policy quality_checklists_update on public.quality_checklists for update to authenticated using (public.has_permission(company_id, 'quality_checklists.update')) with check (public.has_permission(company_id, 'quality_checklists.update'));

drop policy if exists quality_checklist_items_select on public.quality_checklist_items;
create policy quality_checklist_items_select on public.quality_checklist_items for select to authenticated using (public.has_permission(company_id, 'quality_checklists.view'));
drop policy if exists quality_checklist_items_insert on public.quality_checklist_items;
create policy quality_checklist_items_insert on public.quality_checklist_items for insert to authenticated with check (public.has_permission(company_id, 'quality_checklists.create'));
drop policy if exists quality_checklist_items_update on public.quality_checklist_items;
create policy quality_checklist_items_update on public.quality_checklist_items for update to authenticated using (public.has_permission(company_id, 'quality_checklists.update')) with check (public.has_permission(company_id, 'quality_checklists.update'));

drop policy if exists quality_inspections_select on public.quality_inspections;
create policy quality_inspections_select on public.quality_inspections for select to authenticated using (public.has_permission(company_id, 'quality_inspections.view'));
drop policy if exists quality_inspections_insert on public.quality_inspections;
create policy quality_inspections_insert on public.quality_inspections for insert to authenticated with check (public.has_permission(company_id, 'quality_inspections.create') and status = 'PENDING');
drop policy if exists quality_inspections_update on public.quality_inspections;
create policy quality_inspections_update on public.quality_inspections for update to authenticated
  using (public.has_permission(company_id, 'quality_inspections.update'))
  with check (public.has_permission(company_id, 'quality_inspections.update') and status in ('PENDING', 'IN_PROGRESS'));

comment on policy quality_inspections_update on public.quality_inspections is
  'Finalizar (APPROVED/REJECTED/PARTIALLY_APPROVED) é sempre via fn_finalize_inspection — update direto nunca sai de PENDING/IN_PROGRESS.';

-- quality_inspection_results: select-only, escrita via fn_record_inspection_result.
drop policy if exists quality_inspection_results_select on public.quality_inspection_results;
create policy quality_inspection_results_select on public.quality_inspection_results for select to authenticated using (public.has_permission(company_id, 'quality_inspections.view'));

drop policy if exists nonconformities_select on public.nonconformities;
create policy nonconformities_select on public.nonconformities for select to authenticated using (public.has_permission(company_id, 'nonconformities.view'));
drop policy if exists nonconformities_insert on public.nonconformities;
create policy nonconformities_insert on public.nonconformities for insert to authenticated with check (public.has_permission(company_id, 'nonconformities.create'));
drop policy if exists nonconformities_update on public.nonconformities;
create policy nonconformities_update on public.nonconformities for update to authenticated using (public.has_permission(company_id, 'nonconformities.update')) with check (public.has_permission(company_id, 'nonconformities.update'));

drop policy if exists quality_actions_select on public.quality_actions;
create policy quality_actions_select on public.quality_actions for select to authenticated using (public.has_permission(company_id, 'quality_actions.view'));
drop policy if exists quality_actions_insert on public.quality_actions;
create policy quality_actions_insert on public.quality_actions for insert to authenticated with check (public.has_permission(company_id, 'quality_actions.create'));
drop policy if exists quality_actions_update on public.quality_actions;
create policy quality_actions_update on public.quality_actions for update to authenticated using (public.has_permission(company_id, 'quality_actions.update')) with check (public.has_permission(company_id, 'quality_actions.update'));

revoke all on function public.fn_record_inspection_result(uuid, uuid, text, numeric, text) from public;
revoke all on function public.fn_finalize_inspection(uuid, text, text) from public;
revoke all on function public.fn_create_nonconformity_from_inspection(uuid, text, text, text, uuid) from public;
revoke all on function public.fn_transition_nonconformity_status(uuid, text) from public;
revoke all on function public.fn_transition_quality_action_status(uuid, text) from public;
revoke all on function public.fn_send_to_quarantine(uuid, uuid, uuid, uuid, numeric, uuid) from public;
revoke all on function public.fn_quality_traceability(uuid) from public;

grant execute on function public.fn_record_inspection_result(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.fn_finalize_inspection(uuid, text, text) to authenticated;
grant execute on function public.fn_create_nonconformity_from_inspection(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.fn_transition_nonconformity_status(uuid, text) to authenticated;
grant execute on function public.fn_transition_quality_action_status(uuid, text) to authenticated;
grant execute on function public.fn_send_to_quarantine(uuid, uuid, uuid, uuid, numeric, uuid) to authenticated;
grant execute on function public.fn_quality_traceability(uuid) to authenticated;
