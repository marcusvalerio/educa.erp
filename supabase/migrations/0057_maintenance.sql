-- Fase 16 — Manutenção (parte 2): planos, ordens de manutenção,
-- consumo de peças (sempre via fn_post_stock_movement/
-- fn_register_cost_movement, nunca alteração direta de saldo) e
-- histórico do ativo.
--
-- Decisão de desenho: NÃO existe uma tabela "maintenance_order_parts"
-- separada — o consumo de peça já fica totalmente representado em
-- stock_movements (reference_type='maintenance_order') e cost_movements
-- (source_type='maintenance_order'), exatamente como purchase_receipts/
-- production_orders já fazem. Criar uma tabela paralela duplicaria a
-- mesma informação (ver docs/ASSETS.md §seção de decisão).

create table if not exists public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  asset_id uuid references public.assets(id) on delete cascade,
  asset_category_id uuid references public.asset_categories(id) on delete set null,
  plan_type text not null check (plan_type in ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE')),
  periodicity_type text not null check (periodicity_type in ('TIME', 'HOURS', 'CYCLES', 'MILEAGE', 'OTHER')),
  periodicity_value numeric(14, 2),
  periodicity_unit text,
  description text not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.maintenance_plans
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists maintenance_plans_asset_idx on public.maintenance_plans (company_id, asset_id);

comment on table public.maintenance_plans is
  'Plano de manutenção (preventiva/corretiva/preditiva), periodicidade por tempo/horas/ciclos/km/outro. asset_id específico OU asset_category_id (plano genérico para toda uma categoria) — ao menos um dos dois deveria ser informado pela camada de validação (não reforçado por CHECK para permitir planos ainda incompletos em rascunho).';

-- ==================================================================
-- MAINTENANCE_ORDERS — workflow OPEN -> PLANNED -> IN_PROGRESS ->
-- WAITING_PARTS -> COMPLETED, com CANCELLED a partir de qualquer
-- estado não terminal. Transição sempre via fn_transition_
-- maintenance_order_status (FOR UPDATE + mapa de transições válidas).
-- ==================================================================
create sequence if not exists public.maintenance_orders_code_seq;

create table if not exists public.maintenance_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  asset_id uuid not null references public.assets(id) on delete restrict,
  plan_id uuid references public.maintenance_plans(id) on delete set null,
  order_type text not null check (order_type in ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'PLANNED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'CANCELLED')),
  description text not null,
  cause text,
  solution text,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  requested_by uuid references public.users(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create trigger generate_maintenance_order_code before insert on public.maintenance_orders
  for each row execute procedure public.fn_generate_code('OM', 'public.maintenance_orders_code_seq');
create trigger set_updated_at before update on public.maintenance_orders
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists maintenance_orders_asset_idx on public.maintenance_orders (company_id, asset_id);
create index if not exists maintenance_orders_status_idx on public.maintenance_orders (company_id, status);

-- ==================================================================
-- MAINTENANCE_ORDER_COSTS — só SERVICE/EXPENSE (manuais). Custo de
-- PEÇA nunca entra aqui: vive em cost_movements (source_type=
-- 'maintenance_order'), consultado por fn_maintenance_order_cost_summary.
-- ==================================================================
create table if not exists public.maintenance_order_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  maintenance_order_id uuid not null references public.maintenance_orders(id) on delete cascade,
  cost_type text not null check (cost_type in ('SERVICE', 'EXPENSE')),
  description text not null,
  amount numeric(18, 2) not null check (amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_order_costs_order_idx on public.maintenance_order_costs (maintenance_order_id);

-- ==================================================================
-- fn_transition_maintenance_order_status
-- ==================================================================
create or replace function public.fn_transition_maintenance_order_status(p_order_id uuid, p_new_status text)
returns public.maintenance_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.maintenance_orders;
  v_allowed boolean := false;
begin
  select * into v_order from public.maintenance_orders where id = p_order_id for update;
  if not found then
    raise exception 'Ordem de manutenção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'maintenance_orders.transition') then
    raise exception 'Permissão negada (maintenance_orders.transition).' using errcode = '42501';
  end if;

  v_allowed := case v_order.status
    when 'OPEN' then p_new_status in ('PLANNED', 'CANCELLED')
    when 'PLANNED' then p_new_status in ('IN_PROGRESS', 'CANCELLED')
    when 'IN_PROGRESS' then p_new_status in ('WAITING_PARTS', 'COMPLETED', 'CANCELLED')
    when 'WAITING_PARTS' then p_new_status in ('IN_PROGRESS', 'CANCELLED')
    else false
  end;

  if not v_allowed then
    raise exception 'Transição inválida: % -> %.', v_order.status, p_new_status using errcode = 'P0001';
  end if;

  update public.maintenance_orders
  set status = p_new_status,
    started_at = case when p_new_status = 'IN_PROGRESS' and started_at is null then now() else started_at end,
    completed_at = case when p_new_status = 'COMPLETED' then now() else completed_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'maintenance_orders', v_order.id, 'UPDATE',
    jsonb_build_object('status', v_order.status), jsonb_build_object('status', p_new_status));

  return v_order;
end;
$$;

-- ==================================================================
-- fn_consume_maintenance_order_part — ÚNICO caminho de consumo de
-- peça: posta ISSUE em fn_post_stock_movement e registra o custo em
-- fn_register_cost_movement. Nunca altera stock_balances/
-- product_cost_balances diretamente.
-- ==================================================================
create or replace function public.fn_consume_maintenance_order_part(
  p_order_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_notes text default null
)
returns public.cost_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.maintenance_orders;
  v_movement public.stock_movements;
  v_cost public.cost_movements;
begin
  select * into v_order from public.maintenance_orders where id = p_order_id for update;
  if not found then
    raise exception 'Ordem de manutenção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'maintenance_orders.consume_parts') then
    raise exception 'Permissão negada (maintenance_orders.consume_parts).' using errcode = '42501';
  end if;

  if v_order.status not in ('IN_PROGRESS', 'WAITING_PARTS') then
    raise exception 'Só é possível consumir peças com a ordem em andamento ou aguardando peças (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  v_movement := public.fn_post_stock_movement(
    p_company_id => v_order.company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => 'ISSUE',
    p_quantity => p_quantity,
    p_lot_id => p_lot_id,
    p_reference_type => 'maintenance_order',
    p_reference_id => v_order.id,
    p_notes => p_notes,
    p_created_by => public.current_app_user_id()
  );

  v_cost := public.fn_register_cost_movement(v_movement.id, null, 'maintenance_order', v_order.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'maintenance_orders', v_order.id, 'UPDATE', null,
    jsonb_build_object('part_consumed_product_id', p_product_id, 'quantity', p_quantity, 'cost', v_cost.total_cost));

  return v_cost;
end;
$$;

-- ==================================================================
-- fn_add_maintenance_order_cost — só SERVICE/EXPENSE manuais.
-- ==================================================================
create or replace function public.fn_add_maintenance_order_cost(p_order_id uuid, p_cost_type text, p_description text, p_amount numeric)
returns public.maintenance_order_costs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.maintenance_orders;
  v_cost public.maintenance_order_costs;
begin
  if p_cost_type not in ('SERVICE', 'EXPENSE') then
    raise exception 'cost_type inválido: % (use SERVICE ou EXPENSE; custo de peça é automático via consumo de estoque).', p_cost_type using errcode = '22023';
  end if;

  select * into v_order from public.maintenance_orders where id = p_order_id;
  if not found then
    raise exception 'Ordem de manutenção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'maintenance_orders.manage_costs') then
    raise exception 'Permissão negada (maintenance_orders.manage_costs).' using errcode = '42501';
  end if;

  insert into public.maintenance_order_costs (company_id, maintenance_order_id, cost_type, description, amount, created_by)
  values (v_order.company_id, v_order.id, p_cost_type, p_description, p_amount, public.current_app_user_id())
  returning * into v_cost;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'maintenance_order_costs', v_cost.id, 'INSERT', null, to_jsonb(v_cost));

  return v_cost;
end;
$$;

create or replace function public.fn_maintenance_order_cost_summary(p_order_id uuid)
returns table (parts_cost numeric, services_cost numeric, expenses_cost numeric, total_cost numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.maintenance_orders;
  v_parts numeric;
  v_services numeric;
  v_expenses numeric;
begin
  select * into v_order from public.maintenance_orders where id = p_order_id;
  if not found then
    raise exception 'Ordem de manutenção não encontrada.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_order.company_id, 'maintenance_orders.view') then
    raise exception 'Permissão negada (maintenance_orders.view).' using errcode = '42501';
  end if;

  select coalesce(sum(total_cost), 0) into v_parts from public.cost_movements where source_type = 'maintenance_order' and source_id = p_order_id;
  select coalesce(sum(amount), 0) filter (where cost_type = 'SERVICE'), coalesce(sum(amount), 0) filter (where cost_type = 'EXPENSE')
    into v_services, v_expenses
    from public.maintenance_order_costs where maintenance_order_id = p_order_id;

  return query select v_parts, v_services, v_expenses, v_parts + v_services + v_expenses;
end;
$$;

-- ==================================================================
-- fn_asset_history — une (sem duplicar infraestrutura) ordens de
-- manutenção, consumo de peças (cost_movements), custos manuais e
-- auditoria do próprio ativo em uma única linha do tempo.
-- ==================================================================
create or replace function public.fn_asset_history(p_asset_id uuid)
returns table (event_at timestamptz, event_type text, description text, amount numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_asset public.assets;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_asset.company_id, 'assets.view') then
    raise exception 'Permissão negada (assets.view).' using errcode = '42501';
  end if;

  return query
    select mo.created_at, 'MAINTENANCE_ORDER'::text, mo.code || ' — ' || mo.description || ' (' || mo.status || ')', null::numeric
    from public.maintenance_orders mo where mo.asset_id = p_asset_id
    union all
    select cm.created_at, 'PART_CONSUMPTION'::text, 'Consumo de peça na ordem ' || mo.code, cm.total_cost
    from public.cost_movements cm
    join public.maintenance_orders mo on mo.id = cm.source_id and cm.source_type = 'maintenance_order'
    where mo.asset_id = p_asset_id
    union all
    select moc.created_at, 'MAINTENANCE_COST'::text, moc.cost_type || ' — ' || moc.description, moc.amount
    from public.maintenance_order_costs moc
    join public.maintenance_orders mo on mo.id = moc.maintenance_order_id
    where mo.asset_id = p_asset_id
    union all
    select al.created_at, 'AUDIT'::text, al.action || ' em assets', null::numeric
    from public.audit_logs al
    where al.entity = 'assets' and al.entity_id = p_asset_id
    order by 1 desc;
end;
$$;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('maintenance_plans.view', 'maintenance_plans', 'view', 'Consultar planos de manutenção'),
    ('maintenance_plans.create', 'maintenance_plans', 'create', 'Criar planos de manutenção'),
    ('maintenance_plans.update', 'maintenance_plans', 'update', 'Editar planos de manutenção'),
    ('maintenance_orders.view', 'maintenance_orders', 'view', 'Consultar ordens de manutenção'),
    ('maintenance_orders.create', 'maintenance_orders', 'create', 'Criar ordens de manutenção'),
    ('maintenance_orders.update', 'maintenance_orders', 'update', 'Editar dados descritivos da ordem de manutenção'),
    ('maintenance_orders.transition', 'maintenance_orders', 'transition', 'Alterar status da ordem de manutenção'),
    ('maintenance_orders.consume_parts', 'maintenance_orders', 'consume_parts', 'Consumir peças de estoque em uma ordem de manutenção'),
    ('maintenance_orders.manage_costs', 'maintenance_orders', 'manage_costs', 'Lançar custos de serviço/despesa em uma ordem de manutenção')
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
alter table public.maintenance_plans enable row level security;
alter table public.maintenance_orders enable row level security;
alter table public.maintenance_order_costs enable row level security;

drop policy if exists maintenance_plans_select on public.maintenance_plans;
create policy maintenance_plans_select on public.maintenance_plans for select to authenticated using (public.has_permission(company_id, 'maintenance_plans.view'));
drop policy if exists maintenance_plans_insert on public.maintenance_plans;
create policy maintenance_plans_insert on public.maintenance_plans for insert to authenticated with check (public.has_permission(company_id, 'maintenance_plans.create'));
drop policy if exists maintenance_plans_update on public.maintenance_plans;
create policy maintenance_plans_update on public.maintenance_plans for update to authenticated using (public.has_permission(company_id, 'maintenance_plans.update')) with check (public.has_permission(company_id, 'maintenance_plans.update'));

drop policy if exists maintenance_orders_select on public.maintenance_orders;
create policy maintenance_orders_select on public.maintenance_orders for select to authenticated using (public.has_permission(company_id, 'maintenance_orders.view'));
drop policy if exists maintenance_orders_insert on public.maintenance_orders;
create policy maintenance_orders_insert on public.maintenance_orders for insert to authenticated with check (public.has_permission(company_id, 'maintenance_orders.create') and status = 'OPEN');
drop policy if exists maintenance_orders_update on public.maintenance_orders;
create policy maintenance_orders_update on public.maintenance_orders for update to authenticated
  using (public.has_permission(company_id, 'maintenance_orders.update'))
  with check (public.has_permission(company_id, 'maintenance_orders.update'));

comment on policy maintenance_orders_update on public.maintenance_orders is
  'Campos descritivos (description/cause/solution/priority/scheduled_date/notes/assigned_to) via update direto. status só muda via fn_transition_maintenance_order_status (gera auditoria e valida transição) — documentado, mesmo nível de rigor de opportunities.update (0054).';

-- maintenance_order_costs: select-only, escrita exclusiva via função.
drop policy if exists maintenance_order_costs_select on public.maintenance_order_costs;
create policy maintenance_order_costs_select on public.maintenance_order_costs for select to authenticated using (public.has_permission(company_id, 'maintenance_orders.view'));

revoke all on function public.fn_transition_maintenance_order_status(uuid, text) from public;
revoke all on function public.fn_consume_maintenance_order_part(uuid, uuid, uuid, numeric, uuid, text) from public;
revoke all on function public.fn_add_maintenance_order_cost(uuid, text, text, numeric) from public;
revoke all on function public.fn_maintenance_order_cost_summary(uuid) from public;
revoke all on function public.fn_asset_history(uuid) from public;

grant execute on function public.fn_transition_maintenance_order_status(uuid, text) to authenticated;
grant execute on function public.fn_consume_maintenance_order_part(uuid, uuid, uuid, numeric, uuid, text) to authenticated;
grant execute on function public.fn_add_maintenance_order_cost(uuid, text, text, numeric) to authenticated;
grant execute on function public.fn_maintenance_order_cost_summary(uuid) to authenticated;
grant execute on function public.fn_asset_history(uuid) to authenticated;
