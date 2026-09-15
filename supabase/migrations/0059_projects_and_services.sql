-- Fase 18 — Projetos e Serviços (explicitamente SEM RH: time_entries é
-- apontamento operacional de projeto/serviço, nunca folha de
-- pagamento/ponto/benefícios — ver docs/PROJECTS_SERVICES.md).
--
-- Consumo de material reaproveita fn_post_stock_movement/
-- fn_register_cost_movement (mesma decisão da Fase 16/17): nenhuma
-- tabela "project_materials" nova — o vínculo já existe via
-- stock_movements.reference_type/reference_id.

create sequence if not exists public.projects_code_seq;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  customer_id uuid references public.customers(id) on delete set null,
  description text,
  responsible_user_id uuid references public.users(id) on delete set null,
  status text not null default 'PLANNING' check (status in ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  start_date date,
  forecast_end_date date,
  end_date date,
  budget numeric(18, 2),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create trigger generate_project_code before insert on public.projects
  for each row execute procedure public.fn_generate_code('PROJ', 'public.projects_code_seq');
create trigger set_updated_at before update on public.projects
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists projects_company_status_idx on public.projects (company_id, status);
create index if not exists projects_customer_idx on public.projects (company_id, customer_id);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_task_id uuid,
  name text not null,
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
  due_date date,
  estimated_hours numeric(10, 2),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (parent_task_id, company_id) references public.project_tasks (id, company_id) on delete set null
);

create trigger set_updated_at before update on public.project_tasks
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists project_tasks_project_idx on public.project_tasks (project_id, status);

create or replace function public.fn_guard_project_task_hierarchy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_depth integer := 0;
begin
  if NEW.parent_task_id is null then
    return NEW;
  end if;
  if NEW.parent_task_id = NEW.id then
    raise exception 'Uma tarefa não pode ser sua própria tarefa pai.' using errcode = 'P0001';
  end if;
  v_current := NEW.parent_task_id;
  while v_current is not null loop
    if v_current = NEW.id then
      raise exception 'Ciclo de hierarquia detectado em project_tasks.' using errcode = 'P0001';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Hierarquia de tarefas excede a profundidade máxima suportada (100 níveis).' using errcode = 'P0001';
    end if;
    select parent_task_id into v_current from public.project_tasks where id = v_current;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists guard_project_task_hierarchy on public.project_tasks;
create trigger guard_project_task_hierarchy
  before insert or update of parent_task_id on public.project_tasks
  for each row execute procedure public.fn_guard_project_task_hierarchy();

-- ==================================================================
-- PROJECT_TASK_DEPENDENCIES — grafo de dependências (uma tarefa pode
-- depender de várias outras), prevenção de ciclo via CTE recursiva
-- (grafo, não árvore — o padrão while-loop de parent_id não se aplica).
-- ==================================================================
create table if not exists public.project_task_dependencies (
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.project_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id)
);

create or replace function public.fn_guard_project_task_dependency_cycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cycle boolean;
begin
  if NEW.task_id = NEW.depends_on_task_id then
    raise exception 'Uma tarefa não pode depender de si mesma.' using errcode = 'P0001';
  end if;

  with recursive chain(id, depth) as (
    select NEW.depends_on_task_id, 1
    union all
    select d.depends_on_task_id, chain.depth + 1
    from public.project_task_dependencies d
    join chain on d.task_id = chain.id
    where chain.depth < 500
  )
  select exists (select 1 from chain where id = NEW.task_id) into v_cycle;

  if v_cycle then
    raise exception 'Ciclo de dependência detectado entre tarefas.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_project_task_dependency_cycle on public.project_task_dependencies;
create trigger guard_project_task_dependency_cycle
  before insert on public.project_task_dependencies
  for each row execute procedure public.fn_guard_project_task_dependency_cycle();

-- ==================================================================
-- TIME_ENTRIES (seção 18.1) — apontamento OPERACIONAL de projeto/
-- serviço (horas trabalhadas em uma tarefa/ordem de serviço). NÃO é
-- ponto/timesheet de RH, NÃO alimenta folha de pagamento — nenhuma
-- tabela de cargo/benefício/férias é criada nesta ou em qualquer fase.
-- ==================================================================
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete set null,
  service_order_id uuid,
  entry_date date not null default current_date,
  duration_minutes integer not null check (duration_minutes > 0),
  description text,
  user_id uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (project_id is not null or service_order_id is not null)
);

create index if not exists time_entries_project_idx on public.time_entries (company_id, project_id);
create index if not exists time_entries_service_order_idx on public.time_entries (company_id, service_order_id);

comment on table public.time_entries is
  'Apontamento operacional de horas em projeto/tarefa OU ordem de serviço (seção 18: explicitamente não é RH/folha/ponto). service_order_id é resolvido sem FK aqui porque service_orders é definida mais abaixo nesta mesma migration — validado pelo guard abaixo.';

-- ==================================================================
-- SERVICE_ORDERS (seção 18.1) — workflow OPEN -> SCHEDULED ->
-- IN_PROGRESS -> WAITING -> COMPLETED, CANCELLED a partir de qualquer
-- estado não terminal.
-- ==================================================================
create sequence if not exists public.service_orders_code_seq;

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'OPEN' check (status in ('OPEN', 'SCHEDULED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  responsible_user_id uuid references public.users(id) on delete set null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create trigger generate_service_order_code before insert on public.service_orders
  for each row execute procedure public.fn_generate_code('OS', 'public.service_orders_code_seq');
create trigger set_updated_at before update on public.service_orders
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists service_orders_company_status_idx on public.service_orders (company_id, status);
create index if not exists service_orders_customer_idx on public.service_orders (company_id, customer_id);

alter table public.time_entries
  add constraint time_entries_service_order_fk foreign key (service_order_id, company_id) references public.service_orders (id, company_id) on delete set null;

-- ==================================================================
-- PROJECT_SERVICE_COSTS — só SERVICE/EXPENSE manuais (mesmo desenho
-- de maintenance_order_costs, 0057). Custo de MATERIAL vive em
-- cost_movements (source_type='project'/'service_order').
-- ==================================================================
create table if not exists public.project_service_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null check (source_type in ('project', 'service_order')),
  source_id uuid not null,
  cost_type text not null check (cost_type in ('SERVICE', 'EXPENSE')),
  description text not null,
  amount numeric(18, 2) not null check (amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_service_costs_source_idx on public.project_service_costs (source_type, source_id);

create or replace function public.fn_assert_project_or_service_exists(p_company_id uuid, p_source_type text, p_source_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  case p_source_type
    when 'project' then select exists (select 1 from public.projects where id = p_source_id and company_id = p_company_id) into v_found;
    when 'service_order' then select exists (select 1 from public.service_orders where id = p_source_id and company_id = p_company_id) into v_found;
    else raise exception 'source_type inválido: %', p_source_type using errcode = '22023';
  end case;
  if not v_found then
    raise exception '% % não encontrado nesta empresa.', p_source_type, p_source_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fn_assert_project_or_service_exists(uuid, text, uuid) from public;

create or replace function public.fn_guard_project_service_cost_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_project_or_service_exists(NEW.company_id, NEW.source_type, NEW.source_id);
  return NEW;
end;
$$;

drop trigger if exists guard_project_service_cost_reference on public.project_service_costs;
create trigger guard_project_service_cost_reference
  before insert on public.project_service_costs
  for each row execute procedure public.fn_guard_project_service_cost_reference();

-- ==================================================================
-- fn_transition_service_order_status
-- ==================================================================
create or replace function public.fn_transition_service_order_status(p_order_id uuid, p_new_status text)
returns public.service_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.service_orders;
  v_allowed boolean;
begin
  select * into v_order from public.service_orders where id = p_order_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'service_orders.transition') then
    raise exception 'Permissão negada (service_orders.transition).' using errcode = '42501';
  end if;

  v_allowed := case v_order.status
    when 'OPEN' then p_new_status in ('SCHEDULED', 'CANCELLED')
    when 'SCHEDULED' then p_new_status in ('IN_PROGRESS', 'CANCELLED')
    when 'IN_PROGRESS' then p_new_status in ('WAITING', 'COMPLETED', 'CANCELLED')
    when 'WAITING' then p_new_status in ('IN_PROGRESS', 'CANCELLED')
    else false
  end;
  if not v_allowed then
    raise exception 'Transição inválida: % -> %.', v_order.status, p_new_status using errcode = 'P0001';
  end if;

  update public.service_orders
  set status = p_new_status,
    started_at = case when p_new_status = 'IN_PROGRESS' and started_at is null then now() else started_at end,
    completed_at = case when p_new_status = 'COMPLETED' then now() else completed_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'service_orders', v_order.id, 'UPDATE',
    jsonb_build_object('status', v_order.status), jsonb_build_object('status', p_new_status));

  return v_order;
end;
$$;

-- ==================================================================
-- fn_consume_project_service_material — único caminho de consumo de
-- material em projeto/serviço, via fn_post_stock_movement +
-- fn_register_cost_movement.
-- ==================================================================
create or replace function public.fn_consume_project_service_material(
  p_source_type text,
  p_source_id uuid,
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
  v_company_id uuid;
  v_permission text;
  v_movement public.stock_movements;
  v_cost public.cost_movements;
begin
  if p_source_type = 'project' then
    select company_id into v_company_id from public.projects where id = p_source_id;
    v_permission := 'projects.consume_materials';
  elsif p_source_type = 'service_order' then
    select company_id into v_company_id from public.service_orders where id = p_source_id;
    v_permission := 'service_orders.consume_materials';
  else
    raise exception 'source_type inválido: %.', p_source_type using errcode = '22023';
  end if;

  if v_company_id is null then
    raise exception '% % não encontrado.', p_source_type, p_source_id using errcode = 'P0002';
  end if;

  if not public.has_permission(v_company_id, v_permission) then
    raise exception 'Permissão negada (%).', v_permission using errcode = '42501';
  end if;

  v_movement := public.fn_post_stock_movement(
    p_company_id => v_company_id, p_product_id => p_product_id, p_location_id => p_location_id,
    p_movement_type => 'ISSUE', p_quantity => p_quantity, p_lot_id => p_lot_id,
    p_reference_type => p_source_type, p_reference_id => p_source_id, p_notes => p_notes,
    p_created_by => public.current_app_user_id()
  );
  v_cost := public.fn_register_cost_movement(v_movement.id, null, p_source_type, p_source_id);

  return v_cost;
end;
$$;

create or replace function public.fn_add_project_service_cost(p_source_type text, p_source_id uuid, p_cost_type text, p_description text, p_amount numeric)
returns public.project_service_costs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_permission text;
  v_cost public.project_service_costs;
begin
  if p_cost_type not in ('SERVICE', 'EXPENSE') then
    raise exception 'cost_type inválido: % (custo de material é automático via consumo de estoque).', p_cost_type using errcode = '22023';
  end if;

  if p_source_type = 'project' then
    select company_id into v_company_id from public.projects where id = p_source_id;
    v_permission := 'projects.manage_costs';
  elsif p_source_type = 'service_order' then
    select company_id into v_company_id from public.service_orders where id = p_source_id;
    v_permission := 'service_orders.manage_costs';
  else
    raise exception 'source_type inválido: %.', p_source_type using errcode = '22023';
  end if;

  if v_company_id is null then
    raise exception '% % não encontrado.', p_source_type, p_source_id using errcode = 'P0002';
  end if;

  if not public.has_permission(v_company_id, v_permission) then
    raise exception 'Permissão negada (%).', v_permission using errcode = '42501';
  end if;

  insert into public.project_service_costs (company_id, source_type, source_id, cost_type, description, amount, created_by)
  values (v_company_id, p_source_type, p_source_id, p_cost_type, p_description, p_amount, public.current_app_user_id())
  returning * into v_cost;

  return v_cost;
end;
$$;

create or replace function public.fn_project_service_cost_summary(p_source_type text, p_source_id uuid)
returns table (materials_cost numeric, services_cost numeric, expenses_cost numeric, total_cost numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_materials numeric;
  v_services numeric;
  v_expenses numeric;
begin
  select coalesce(sum(total_cost), 0) into v_materials from public.cost_movements where source_type = p_source_type and source_id = p_source_id;
  select coalesce(sum(amount), 0) filter (where cost_type = 'SERVICE'), coalesce(sum(amount), 0) filter (where cost_type = 'EXPENSE')
    into v_services, v_expenses
    from public.project_service_costs where source_type = p_source_type and source_id = p_source_id;

  return query select v_materials, v_services, v_expenses, v_materials + v_services + v_expenses;
end;
$$;

-- ==================================================================
-- Integração comercial (seção "Projeto/Serviço -> Orçamento -> Pedido
-- -> Fiscal -> Financeiro") — reaproveita fn_create_sales_quote (0020),
-- marca source_type/source_id (coluna criada em 0054). Nunca gera
-- fatura/documento fiscal automaticamente — só o orçamento, a pedido
-- explícito do usuário.
-- ==================================================================
create or replace function public.fn_create_sales_quote_from_project(p_project_id uuid, p_items jsonb, p_valid_until date default null, p_notes text default null)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
  v_quote public.sales_quotes;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Projeto não encontrado.' using errcode = 'P0002';
  end if;
  if v_project.customer_id is null then
    raise exception 'Projeto não tem cliente vinculado.' using errcode = 'P0001';
  end if;
  if not public.has_permission(v_project.company_id, 'projects.convert') then
    raise exception 'Permissão negada (projects.convert).' using errcode = '42501';
  end if;

  v_quote := public.fn_create_sales_quote(v_project.company_id, v_project.customer_id, p_items, null, null, null, p_valid_until, 0, 0, p_notes);
  update public.sales_quotes set source_type = 'project', source_id = v_project.id where id = v_quote.id returning * into v_quote;
  return v_quote;
end;
$$;

create or replace function public.fn_create_sales_quote_from_service_order(p_service_order_id uuid, p_items jsonb, p_valid_until date default null, p_notes text default null)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.service_orders;
  v_quote public.sales_quotes;
begin
  select * into v_order from public.service_orders where id = p_service_order_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_order.company_id, 'service_orders.convert') then
    raise exception 'Permissão negada (service_orders.convert).' using errcode = '42501';
  end if;

  v_quote := public.fn_create_sales_quote(v_order.company_id, v_order.customer_id, p_items, null, null, null, p_valid_until, 0, 0, p_notes);
  update public.sales_quotes set source_type = 'service_order', source_id = v_order.id where id = v_quote.id returning * into v_quote;
  return v_quote;
end;
$$;

-- ==================================================================
-- Integração com Qualidade (seção "Ordem de Serviço -> Inspeção de
-- Qualidade") — cria a inspeção vinculada; nunca finaliza/aprova
-- automaticamente.
-- ==================================================================
create or replace function public.fn_create_quality_inspection_from_service_order(p_service_order_id uuid, p_checklist_id uuid default null)
returns public.quality_inspections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.service_orders;
  v_inspection public.quality_inspections;
begin
  select * into v_order from public.service_orders where id = p_service_order_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_order.company_id, 'quality_inspections.create') then
    raise exception 'Permissão negada (quality_inspections.create).' using errcode = '42501';
  end if;

  insert into public.quality_inspections (company_id, inspection_type, checklist_id, source_type, source_id, created_by)
  values (v_order.company_id, 'OTHER', p_checklist_id, 'service_order', v_order.id, public.current_app_user_id())
  returning * into v_inspection;

  return v_inspection;
end;
$$;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('projects.view', 'projects', 'view', 'Consultar projetos'),
    ('projects.create', 'projects', 'create', 'Criar projetos'),
    ('projects.update', 'projects', 'update', 'Editar projetos'),
    ('projects.consume_materials', 'projects', 'consume_materials', 'Consumir materiais de estoque em um projeto'),
    ('projects.manage_costs', 'projects', 'manage_costs', 'Lançar custos de serviço/despesa em um projeto'),
    ('projects.convert', 'projects', 'convert', 'Gerar orçamento de venda a partir de um projeto'),
    ('project_tasks.view', 'project_tasks', 'view', 'Consultar tarefas de projeto'),
    ('project_tasks.create', 'project_tasks', 'create', 'Criar tarefas de projeto'),
    ('project_tasks.update', 'project_tasks', 'update', 'Editar tarefas de projeto'),
    ('time_entries.view', 'time_entries', 'view', 'Consultar apontamentos de horas'),
    ('time_entries.create', 'time_entries', 'create', 'Lançar apontamento de horas'),
    ('time_entries.update', 'time_entries', 'update', 'Editar apontamento de horas'),
    ('service_orders.view', 'service_orders', 'view', 'Consultar ordens de serviço'),
    ('service_orders.create', 'service_orders', 'create', 'Criar ordens de serviço'),
    ('service_orders.update', 'service_orders', 'update', 'Editar dados descritivos da ordem de serviço'),
    ('service_orders.transition', 'service_orders', 'transition', 'Alterar status da ordem de serviço'),
    ('service_orders.consume_materials', 'service_orders', 'consume_materials', 'Consumir materiais de estoque em uma ordem de serviço'),
    ('service_orders.manage_costs', 'service_orders', 'manage_costs', 'Lançar custos de serviço/despesa em uma ordem de serviço'),
    ('service_orders.convert', 'service_orders', 'convert', 'Gerar orçamento de venda a partir de uma ordem de serviço')
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
alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_task_dependencies enable row level security;
alter table public.time_entries enable row level security;
alter table public.service_orders enable row level security;
alter table public.project_service_costs enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (public.has_permission(company_id, 'projects.view'));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (public.has_permission(company_id, 'projects.create'));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using (public.has_permission(company_id, 'projects.update')) with check (public.has_permission(company_id, 'projects.update'));

drop policy if exists project_tasks_select on public.project_tasks;
create policy project_tasks_select on public.project_tasks for select to authenticated using (public.has_permission(company_id, 'project_tasks.view'));
drop policy if exists project_tasks_insert on public.project_tasks;
create policy project_tasks_insert on public.project_tasks for insert to authenticated with check (public.has_permission(company_id, 'project_tasks.create'));
drop policy if exists project_tasks_update on public.project_tasks;
create policy project_tasks_update on public.project_tasks for update to authenticated using (public.has_permission(company_id, 'project_tasks.update')) with check (public.has_permission(company_id, 'project_tasks.update'));

drop policy if exists project_task_dependencies_select on public.project_task_dependencies;
create policy project_task_dependencies_select on public.project_task_dependencies for select to authenticated using (
  exists (select 1 from public.project_tasks t where t.id = task_id and public.has_permission(t.company_id, 'project_tasks.view'))
);
drop policy if exists project_task_dependencies_insert on public.project_task_dependencies;
create policy project_task_dependencies_insert on public.project_task_dependencies for insert to authenticated with check (
  exists (select 1 from public.project_tasks t where t.id = task_id and public.has_permission(t.company_id, 'project_tasks.update'))
);
drop policy if exists project_task_dependencies_delete on public.project_task_dependencies;
create policy project_task_dependencies_delete on public.project_task_dependencies for delete to authenticated using (
  exists (select 1 from public.project_tasks t where t.id = task_id and public.has_permission(t.company_id, 'project_tasks.update'))
);

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries for select to authenticated using (public.has_permission(company_id, 'time_entries.view'));
drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries for insert to authenticated with check (public.has_permission(company_id, 'time_entries.create'));
drop policy if exists time_entries_update on public.time_entries;
create policy time_entries_update on public.time_entries for update to authenticated using (public.has_permission(company_id, 'time_entries.update')) with check (public.has_permission(company_id, 'time_entries.update'));

drop policy if exists service_orders_select on public.service_orders;
create policy service_orders_select on public.service_orders for select to authenticated using (public.has_permission(company_id, 'service_orders.view'));
drop policy if exists service_orders_insert on public.service_orders;
create policy service_orders_insert on public.service_orders for insert to authenticated with check (public.has_permission(company_id, 'service_orders.create') and status = 'OPEN');
drop policy if exists service_orders_update on public.service_orders;
create policy service_orders_update on public.service_orders for update to authenticated using (public.has_permission(company_id, 'service_orders.update')) with check (public.has_permission(company_id, 'service_orders.update'));

comment on policy service_orders_update on public.service_orders is
  'status só muda via fn_transition_service_order_status — mesmo nível de rigor de maintenance_orders.update (0057).';

-- project_service_costs: select-only, escrita via função.
drop policy if exists project_service_costs_select on public.project_service_costs;
create policy project_service_costs_select on public.project_service_costs for select to authenticated using (
  (source_type = 'project' and exists (select 1 from public.projects p where p.id = source_id and public.has_permission(p.company_id, 'projects.view')))
  or (source_type = 'service_order' and exists (select 1 from public.service_orders so where so.id = source_id and public.has_permission(so.company_id, 'service_orders.view')))
);

revoke all on function public.fn_transition_service_order_status(uuid, text) from public;
revoke all on function public.fn_consume_project_service_material(text, uuid, uuid, uuid, numeric, uuid, text) from public;
revoke all on function public.fn_add_project_service_cost(text, uuid, text, text, numeric) from public;
revoke all on function public.fn_project_service_cost_summary(text, uuid) from public;
revoke all on function public.fn_create_sales_quote_from_project(uuid, jsonb, date, text) from public;
revoke all on function public.fn_create_sales_quote_from_service_order(uuid, jsonb, date, text) from public;
revoke all on function public.fn_create_quality_inspection_from_service_order(uuid, uuid) from public;

grant execute on function public.fn_transition_service_order_status(uuid, text) to authenticated;
grant execute on function public.fn_consume_project_service_material(text, uuid, uuid, uuid, numeric, uuid, text) to authenticated;
grant execute on function public.fn_add_project_service_cost(text, uuid, text, text, numeric) to authenticated;
grant execute on function public.fn_project_service_cost_summary(text, uuid) to authenticated;
grant execute on function public.fn_create_sales_quote_from_project(uuid, jsonb, date, text) to authenticated;
grant execute on function public.fn_create_sales_quote_from_service_order(uuid, jsonb, date, text) to authenticated;
grant execute on function public.fn_create_quality_inspection_from_service_order(uuid, uuid) to authenticated;
