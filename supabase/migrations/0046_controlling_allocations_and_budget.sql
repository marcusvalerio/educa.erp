-- Fase 11 — Controladoria Gerencial: rateio (cost allocation) e
-- orçamento (budget).
--
-- Rateio (seção 11.10-11.11): uma VISÃO GERENCIAL de como uma
-- despesa/custo se distribui entre centros de custo — nunca altera o
-- lançamento financeiro original (accounts_payable/financial_transactions
-- permanecem exatamente como foram criados). cost_allocations/
-- cost_allocation_items são aditivos, sempre somam exatamente ao valor
-- de origem (seção 11.10: "fechar exatamente 100%").
--
-- Orçamento (seção 11.12): base para comparar ORÇADO x REALIZADO —
-- budget_items nunca gera um lançamento financeiro real (nunca é
-- inserido em accounts_payable/accounts_receivable/financial_transactions).

create sequence if not exists public.cost_allocations_code_seq;

create table if not exists public.cost_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  source_type text not null default 'manual' check (source_type in ('manual', 'accounts_payable', 'financial_transaction')),
  source_id uuid,
  competence_period_id uuid,
  total_amount numeric(16, 4) not null check (total_amount > 0),
  criterion text not null check (criterion in ('PERCENTAGE', 'FIXED_VALUE', 'QUANTITY', 'REVENUE', 'COST', 'HEADCOUNT', 'AREA')),
  status text not null default 'applied' check (status in ('applied', 'cancelled')),
  description text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (competence_period_id, company_id) references public.financial_competence_periods (id, company_id) on delete set null
);

create trigger set_code before insert on public.cost_allocations
  for each row execute procedure public.fn_generate_code('RAT', 'public.cost_allocations_code_seq');
create index if not exists cost_allocations_company_status_idx on public.cost_allocations (company_id, status);
create index if not exists cost_allocations_source_idx on public.cost_allocations (source_type, source_id);
create index if not exists cost_allocations_period_idx on public.cost_allocations (competence_period_id);

comment on table public.cost_allocations is
  'Rateio gerencial (seção 10) — nunca altera accounts_payable/financial_transactions (source_type/source_id são só referência polimórfica, sem FK, mesmo padrão de stock_movements.reference_id). criterion=PERCENTAGE/FIXED_VALUE são validados estruturalmente (fn_create_cost_allocation); QUANTITY/REVENUE/COST/HEADCOUNT/AREA são rótulos do critério usado pelo analista para calcular os itens fora do banco (seção 11.11: sem dado de headcount/área modelado ainda) — o fechamento em 100%/valor total é validado igualmente para todos os critérios.';

create table if not exists public.cost_allocation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  allocation_id uuid not null,
  cost_center_id uuid not null,
  percentage numeric(7, 4),
  amount numeric(16, 4) not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (allocation_id, company_id) references public.cost_allocations (id, company_id) on delete cascade,
  foreign key (cost_center_id, company_id) references public.cost_centers (id, company_id) on delete restrict
);

create index if not exists cost_allocation_items_allocation_idx on public.cost_allocation_items (allocation_id);
create index if not exists cost_allocation_items_cost_center_idx on public.cost_allocation_items (cost_center_id);

comment on table public.cost_allocation_items is
  'Item do rateio — amount é sempre o valor final atribuído ao centro de custo (calculado a partir de percentage quando o critério é PERCENTAGE, informado diretamente nos demais). A soma de amount de todos os itens de um allocation_id é sempre exatamente total_amount (validado em fn_create_cost_allocation, nunca só por convenção).';

-- ==================================================================
-- fn_create_cost_allocation — transacional. p_items: jsonb array de
-- {"cost_center_id": uuid, "percentage": number|null, "amount": number|null}.
-- PERCENTAGE: soma de percentage deve fechar em 100 (± 0.01); amount de
-- cada item é derivado (total * percentage / 100), com o ÚLTIMO item
-- absorvendo o arredondamento (mesmo padrão de fn_create_accounts_payable
-- para parcelas) para garantir soma EXATA de amount = total_amount.
-- Demais critérios: amount é informado diretamente por item; soma deve
-- fechar exatamente em total_amount.
-- ==================================================================
create or replace function public.fn_create_cost_allocation(
  p_company_id uuid,
  p_total_amount numeric,
  p_criterion text,
  p_items jsonb,
  p_source_type text default 'manual',
  p_source_id uuid default null,
  p_competence_period_id uuid default null,
  p_description text default null,
  p_notes text default null
)
returns public.cost_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allocation public.cost_allocations;
  v_item jsonb;
  v_count integer;
  v_index integer := 0;
  v_sum_percentage numeric := 0;
  v_sum_amount numeric := 0;
  v_amount numeric;
  v_percentage numeric;
begin
  if not public.has_permission(p_company_id, 'controlling.allocate') then
    raise exception 'Permissão negada (controlling.allocate).' using errcode = '42501';
  end if;

  perform public.fn_assert_competence_period_open(p_competence_period_id);

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Valor total do rateio deve ser maior que zero.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O rateio precisa de ao menos um item.' using errcode = '22023';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_items);

  insert into public.cost_allocations (
    company_id, source_type, source_id, competence_period_id, total_amount, criterion, description, notes, created_by
  ) values (
    p_company_id, coalesce(p_source_type, 'manual'), p_source_id, p_competence_period_id, p_total_amount, p_criterion, p_description, p_notes, public.current_app_user_id()
  )
  returning * into v_allocation;

  if p_criterion = 'PERCENTAGE' then
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_sum_percentage := v_sum_percentage + coalesce((v_item->>'percentage')::numeric, 0);
    end loop;

    if abs(v_sum_percentage - 100) > 0.01 then
      raise exception 'A soma dos percentuais do rateio (%) precisa fechar em 100.', v_sum_percentage using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
      v_index := v_index + 1;
      v_percentage := (v_item->>'percentage')::numeric;
      if v_index = v_count then
        v_amount := p_total_amount - v_sum_amount;
      else
        v_amount := round(p_total_amount * v_percentage / 100, 4);
      end if;
      v_sum_amount := v_sum_amount + v_amount;

      insert into public.cost_allocation_items (company_id, allocation_id, cost_center_id, percentage, amount, notes)
      values (p_company_id, v_allocation.id, (v_item->>'cost_center_id')::uuid, v_percentage, v_amount, nullif(v_item->>'notes', ''));
    end loop;
  else
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_sum_amount := v_sum_amount + coalesce((v_item->>'amount')::numeric, 0);
    end loop;

    if abs(v_sum_amount - p_total_amount) > 0.01 then
      raise exception 'A soma dos valores do rateio (%) precisa fechar no valor total (%).', v_sum_amount, p_total_amount using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
      insert into public.cost_allocation_items (company_id, allocation_id, cost_center_id, percentage, amount, notes)
      values (
        p_company_id, v_allocation.id, (v_item->>'cost_center_id')::uuid,
        nullif(v_item->>'percentage', '')::numeric, (v_item->>'amount')::numeric, nullif(v_item->>'notes', '')
      );
    end loop;
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'cost_allocations', v_allocation.id, 'CREATE',
    null, jsonb_build_object('total_amount', p_total_amount, 'criterion', p_criterion, 'items', v_count));

  select * into v_allocation from public.cost_allocations where id = v_allocation.id;
  return v_allocation;
end;
$$;

-- ==================================================================
-- fn_cancel_cost_allocation — nunca apaga (seção 30, mesmo princípio
-- de todo o sistema). Marca status='cancelled'; os itens permanecem
-- (histórico do que foi decidido). Nunca toca accounts_payable/
-- financial_transactions — nunca tocou, então não há nada para
-- reverter lá.
-- ==================================================================
create or replace function public.fn_cancel_cost_allocation(p_allocation_id uuid, p_reason text default null)
returns public.cost_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allocation public.cost_allocations;
begin
  select * into v_allocation from public.cost_allocations where id = p_allocation_id for update;
  if not found then
    raise exception 'Rateio não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_allocation.company_id, 'controlling.allocate') then
    raise exception 'Permissão negada (controlling.allocate).' using errcode = '42501';
  end if;

  if v_allocation.status = 'cancelled' then
    raise exception 'Rateio já cancelado.' using errcode = 'P0001';
  end if;

  perform public.fn_assert_competence_period_open(v_allocation.competence_period_id);

  update public.cost_allocations set status = 'cancelled' where id = p_allocation_id
  returning * into v_allocation;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_allocation.company_id, public.current_app_user_id(), 'system', 'cost_allocations', v_allocation.id, 'CANCEL',
    null, jsonb_build_object('reason', p_reason));

  return v_allocation;
end;
$$;

revoke all on function public.fn_create_cost_allocation(uuid, numeric, text, jsonb, text, uuid, uuid, text, text) from public;
revoke all on function public.fn_cancel_cost_allocation(uuid, text) from public;
grant execute on function public.fn_create_cost_allocation(uuid, numeric, text, jsonb, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.fn_cancel_cost_allocation(uuid, text) to authenticated;

-- ==================================================================
-- ORÇAMENTO — budget_headers/budget_items (seção 11.12). Nunca gera
-- lançamento financeiro real; só a base para comparação com o
-- realizado (fn_get_budget_vs_actual).
-- ==================================================================
create sequence if not exists public.budget_headers_code_seq;

create table if not exists public.budget_headers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'closed')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (period_end >= period_start)
);

create trigger set_code before insert on public.budget_headers
  for each row execute procedure public.fn_generate_code('ORC', 'public.budget_headers_code_seq');
create trigger set_updated_at before update on public.budget_headers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists budget_headers_company_status_idx on public.budget_headers (company_id, status);

comment on table public.budget_headers is
  'Orçamento gerencial por período. draft -> approved -> closed (encerrado, não mais editável). Nunca gera accounts_payable/accounts_receivable/financial_transactions — é só a base do ORÇADO para comparação com o realizado.';

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  budget_header_id uuid not null,
  cost_center_id uuid,
  financial_category_id uuid,
  planned_amount numeric(16, 4) not null check (planned_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (budget_header_id, company_id) references public.budget_headers (id, company_id) on delete cascade,
  foreign key (cost_center_id, company_id) references public.cost_centers (id, company_id) on delete set null,
  foreign key (financial_category_id, company_id) references public.financial_categories (id, company_id) on delete set null
);

create index if not exists budget_items_header_idx on public.budget_items (budget_header_id);
create index if not exists budget_items_cost_center_idx on public.budget_items (cost_center_id);
create index if not exists budget_items_category_idx on public.budget_items (financial_category_id);

-- ==================================================================
-- fn_create_budget
-- ==================================================================
create or replace function public.fn_create_budget(
  p_company_id uuid,
  p_name text,
  p_period_start date,
  p_period_end date,
  p_items jsonb,
  p_notes text default null
)
returns public.budget_headers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_budget public.budget_headers;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'controlling.budget.create') then
    raise exception 'Permissão negada (controlling.budget.create).' using errcode = '42501';
  end if;

  if p_period_end < p_period_start then
    raise exception 'Data final do orçamento não pode ser anterior à inicial.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O orçamento precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.budget_headers (company_id, name, period_start, period_end, notes, created_by)
  values (p_company_id, p_name, p_period_start, p_period_end, p_notes, public.current_app_user_id())
  returning * into v_budget;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.budget_items (company_id, budget_header_id, cost_center_id, financial_category_id, planned_amount, notes)
    values (
      p_company_id, v_budget.id,
      nullif(v_item->>'cost_center_id', '')::uuid,
      nullif(v_item->>'financial_category_id', '')::uuid,
      (v_item->>'planned_amount')::numeric,
      nullif(v_item->>'notes', '')
    );
  end loop;

  return v_budget;
end;
$$;

create or replace function public.fn_approve_budget(p_budget_header_id uuid)
returns public.budget_headers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_budget public.budget_headers;
begin
  select * into v_budget from public.budget_headers where id = p_budget_header_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_budget.company_id, 'controlling.budget.update') then
    raise exception 'Permissão negada (controlling.budget.update).' using errcode = '42501';
  end if;

  if v_budget.status <> 'draft' then
    raise exception 'Só é possível aprovar um orçamento em rascunho (status atual: %).', v_budget.status using errcode = 'P0001';
  end if;

  update public.budget_headers
  set status = 'approved', approved_by = public.current_app_user_id(), approved_at = now()
  where id = p_budget_header_id
  returning * into v_budget;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_budget.company_id, public.current_app_user_id(), 'system', 'budget_headers', v_budget.id, 'APPROVE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'approved'));

  return v_budget;
end;
$$;

create or replace function public.fn_close_budget(p_budget_header_id uuid)
returns public.budget_headers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_budget public.budget_headers;
begin
  select * into v_budget from public.budget_headers where id = p_budget_header_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_budget.company_id, 'controlling.budget.update') then
    raise exception 'Permissão negada (controlling.budget.update).' using errcode = '42501';
  end if;

  if v_budget.status <> 'approved' then
    raise exception 'Só é possível encerrar um orçamento aprovado (status atual: %).', v_budget.status using errcode = 'P0001';
  end if;

  update public.budget_headers set status = 'closed' where id = p_budget_header_id
  returning * into v_budget;

  return v_budget;
end;
$$;

-- ==================================================================
-- fn_get_budget_vs_actual — ORÇADO x REALIZADO (seção 11.12). Realizado
-- vem de accounts_payable (categorias EXPENSE) e accounts_receivable
-- (categorias INCOME) por issue_date dentro do período do orçamento —
-- nunca recalcula nem duplica: só agrega o que já existe.
-- ==================================================================
create or replace function public.fn_get_budget_vs_actual(p_budget_header_id uuid)
returns table (
  cost_center_id uuid,
  financial_category_id uuid,
  planned_amount numeric,
  actual_amount numeric,
  variance_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_budget public.budget_headers;
begin
  select * into v_budget from public.budget_headers where id = p_budget_header_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_budget.company_id, 'controlling.budget.view') then
    raise exception 'Permissão negada (controlling.budget.view).' using errcode = '42501';
  end if;

  return query
  with grouped as (
    select
      bi.cost_center_id,
      bi.financial_category_id,
      sum(bi.planned_amount) as planned_amount,
      coalesce((
        select sum(ap.updated_amount) from public.accounts_payable ap
        join public.financial_categories fc on fc.id = ap.category_id
        where ap.company_id = v_budget.company_id and fc.type = 'EXPENSE' and ap.status <> 'CANCELLED'
          and ap.issue_date between v_budget.period_start and v_budget.period_end
          and ap.category_id is not distinct from bi.financial_category_id
          and ap.cost_center_id is not distinct from bi.cost_center_id
      ), 0)
      +
      coalesce((
        select sum(ar.updated_amount) from public.accounts_receivable ar
        join public.financial_categories fc on fc.id = ar.category_id
        where ar.company_id = v_budget.company_id and fc.type = 'INCOME' and ar.status <> 'CANCELLED'
          and ar.issue_date between v_budget.period_start and v_budget.period_end
          and ar.category_id is not distinct from bi.financial_category_id
          and ar.cost_center_id is not distinct from bi.cost_center_id
      ), 0) as actual_amount
    from public.budget_items bi
    where bi.budget_header_id = p_budget_header_id
    group by bi.cost_center_id, bi.financial_category_id
  )
  select g.cost_center_id, g.financial_category_id, g.planned_amount, g.actual_amount, g.actual_amount - g.planned_amount as variance_amount
  from grouped g;
end;
$$;

revoke all on function public.fn_create_budget(uuid, text, date, date, jsonb, text) from public;
revoke all on function public.fn_approve_budget(uuid) from public;
revoke all on function public.fn_close_budget(uuid) from public;
revoke all on function public.fn_get_budget_vs_actual(uuid) from public;
grant execute on function public.fn_create_budget(uuid, text, date, date, jsonb, text) to authenticated;
grant execute on function public.fn_approve_budget(uuid) to authenticated;
grant execute on function public.fn_close_budget(uuid) to authenticated;
grant execute on function public.fn_get_budget_vs_actual(uuid) to authenticated;

-- ==================================================================
-- RLS — select-only; toda escrita via função.
-- ==================================================================
alter table public.cost_allocations enable row level security;
alter table public.cost_allocation_items enable row level security;
alter table public.budget_headers enable row level security;
alter table public.budget_items enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('cost_allocations'), ('cost_allocation_items')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'controlling.view'
    );
  end loop;

  for t in
    select * from (values ('budget_headers'), ('budget_items')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'controlling.budget.view'
    );
  end loop;
end;
$$;
