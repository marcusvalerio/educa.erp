-- Fase 15 — CRM (parte 2): atividades, conversões e indicadores.
-- Depende de 0054 (leads/pipelines/opportunities).

-- ==================================================================
-- ACTIVITIES (seção 15.1) — histórico de interações (ligação, reunião,
-- tarefa, contato, follow-up, nota). related_type/related_id é
-- polimórfico (lead/opportunity/customer), mesmo padrão de
-- party_addresses — guardado por fn_assert_crm_related_exists.
-- ==================================================================
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  activity_type text not null check (activity_type in ('CALL', 'MEETING', 'TASK', 'CONTACT', 'FOLLOW_UP', 'NOTE')),
  subject text not null,
  description text,
  related_type text not null check (related_type in ('lead', 'opportunity', 'customer')),
  related_id uuid not null,
  due_date timestamptz,
  completed_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'CANCELLED')),
  owner_user_id uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.activities
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists activities_related_idx on public.activities (company_id, related_type, related_id);
create index if not exists activities_owner_idx on public.activities (company_id, owner_user_id, status);

create or replace function public.fn_assert_crm_related_exists(p_company_id uuid, p_related_type text, p_related_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  case p_related_type
    when 'lead' then select exists (select 1 from public.leads where id = p_related_id and company_id = p_company_id) into v_found;
    when 'opportunity' then select exists (select 1 from public.opportunities where id = p_related_id and company_id = p_company_id) into v_found;
    when 'customer' then select exists (select 1 from public.customers where id = p_related_id and company_id = p_company_id) into v_found;
    else raise exception 'related_type inválido: %', p_related_type using errcode = '22023';
  end case;
  if not v_found then
    raise exception '% % não encontrado nesta empresa.', p_related_type, p_related_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fn_assert_crm_related_exists(uuid, text, uuid) from public;

create or replace function public.fn_guard_activity_related_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_crm_related_exists(NEW.company_id, NEW.related_type, NEW.related_id);
  return NEW;
end;
$$;

drop trigger if exists guard_activity_related_reference on public.activities;
create trigger guard_activity_related_reference
  before insert or update of related_type, related_id on public.activities
  for each row execute procedure public.fn_guard_activity_related_reference();

-- ==================================================================
-- Histórico inicial de estágio — garante que toda oportunidade nasce
-- com uma linha aberta em opportunity_stage_history, sem depender de
-- cada função de criação (direta via RLS ou via conversão) lembrar
-- de inserir.
-- ==================================================================
create or replace function public.fn_opportunity_initial_stage_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.opportunity_stage_history (company_id, opportunity_id, stage_id, entered_at)
  values (NEW.company_id, NEW.id, NEW.stage_id, NEW.created_at);
  return NEW;
end;
$$;

drop trigger if exists opportunity_initial_stage_history on public.opportunities;
create trigger opportunity_initial_stage_history
  after insert on public.opportunities
  for each row execute procedure public.fn_opportunity_initial_stage_history();

-- ==================================================================
-- fn_move_opportunity_stage — move a oportunidade para outro estágio
-- do MESMO pipeline, encerrando a linha de histórico atual e abrindo
-- uma nova (FOR UPDATE evita corrida entre dois movimentos
-- concorrentes da mesma oportunidade).
-- ==================================================================
create or replace function public.fn_move_opportunity_stage(p_opportunity_id uuid, p_stage_id uuid)
returns public.opportunities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp public.opportunities;
  v_stage public.pipeline_stages;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_opp.company_id, 'opportunities.move_stage') then
    raise exception 'Permissão negada (opportunities.move_stage).' using errcode = '42501';
  end if;

  if v_opp.status <> 'OPEN' then
    raise exception 'Só é possível mover o estágio de uma oportunidade aberta (status atual: %).', v_opp.status using errcode = 'P0001';
  end if;

  select * into v_stage from public.pipeline_stages where id = p_stage_id and pipeline_id = v_opp.pipeline_id;
  if not found then
    raise exception 'Estágio não pertence ao pipeline desta oportunidade.' using errcode = '22023';
  end if;

  update public.opportunity_stage_history
  set exited_at = now()
  where opportunity_id = p_opportunity_id and exited_at is null;

  insert into public.opportunity_stage_history (company_id, opportunity_id, stage_id, entered_at)
  values (v_opp.company_id, v_opp.id, p_stage_id, now());

  update public.opportunities
  set stage_id = p_stage_id, probability = v_stage.probability_default
  where id = p_opportunity_id
  returning * into v_opp;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_opp.company_id, public.current_app_user_id(), 'system', 'opportunities', v_opp.id, 'UPDATE',
    jsonb_build_object('stage_id', v_opp.stage_id), jsonb_build_object('stage_id', p_stage_id));

  return v_opp;
end;
$$;

-- ==================================================================
-- fn_close_opportunity — fecha como GANHA ou PERDIDA, encerrando a
-- linha de histórico do estágio atual.
-- ==================================================================
create or replace function public.fn_close_opportunity(p_opportunity_id uuid, p_outcome text, p_lost_reason text default null)
returns public.opportunities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp public.opportunities;
begin
  if p_outcome not in ('WON', 'LOST') then
    raise exception 'Resultado inválido: % (use WON ou LOST).', p_outcome using errcode = '22023';
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_opp.company_id, 'opportunities.close') then
    raise exception 'Permissão negada (opportunities.close).' using errcode = '42501';
  end if;

  if v_opp.status <> 'OPEN' then
    raise exception 'Oportunidade já está fechada (status atual: %).', v_opp.status using errcode = 'P0001';
  end if;

  update public.opportunity_stage_history
  set exited_at = now()
  where opportunity_id = p_opportunity_id and exited_at is null;

  update public.opportunities
  set status = p_outcome, closed_at = now(), lost_reason = case when p_outcome = 'LOST' then p_lost_reason else null end,
    probability = case when p_outcome = 'WON' then 100 when p_outcome = 'LOST' then 0 else probability end
  where id = p_opportunity_id
  returning * into v_opp;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_opp.company_id, public.current_app_user_id(), 'system', 'opportunities', v_opp.id, 'UPDATE',
    jsonb_build_object('status', 'OPEN'), jsonb_build_object('status', p_outcome, 'lost_reason', v_opp.lost_reason));

  return v_opp;
end;
$$;

-- ==================================================================
-- fn_convert_lead_to_customer — nunca duplica um customer: reaproveita
-- por documento se já existir na empresa; senão cria um novo. Idempotente
-- (chamar de novo com o mesmo lead já convertido retorna o mesmo customer).
-- ==================================================================
create or replace function public.fn_convert_lead_to_customer(p_lead_id uuid)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads;
  v_customer public.customers;
  v_type text;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_lead.company_id, 'leads.convert') then
    raise exception 'Permissão negada (leads.convert).' using errcode = '42501';
  end if;

  if v_lead.converted_customer_id is not null then
    select * into v_customer from public.customers where id = v_lead.converted_customer_id;
    return v_customer;
  end if;

  if v_lead.document is not null then
    select * into v_customer from public.customers where company_id = v_lead.company_id and document = v_lead.document;
  end if;

  if v_customer.id is null then
    v_type := case when v_lead.document is not null and length(regexp_replace(v_lead.document, '\D', '', 'g')) = 11 then 'individual' else 'company' end;
    insert into public.customers (company_id, type, legal_name, trade_name, document, email, phone, default_sales_representative_id)
    values (v_lead.company_id, v_type, coalesce(v_lead.company_name, v_lead.name), v_lead.name, v_lead.document, v_lead.email, v_lead.phone, v_lead.responsible_user_id)
    returning * into v_customer;
  end if;

  update public.leads set status = 'CONVERTED', converted_customer_id = v_customer.id where id = p_lead_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_lead.company_id, public.current_app_user_id(), 'system', 'leads', v_lead.id, 'UPDATE',
    jsonb_build_object('status', v_lead.status), jsonb_build_object('status', 'CONVERTED', 'converted_customer_id', v_customer.id));

  return v_customer;
end;
$$;

-- ==================================================================
-- fn_convert_lead_to_opportunity — cria a oportunidade a partir do
-- lead (customer_id fica nulo se o lead ainda não foi convertido em
-- cliente — uma oportunidade pode existir antes do cliente "oficial").
-- ==================================================================
create or replace function public.fn_convert_lead_to_opportunity(
  p_lead_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_title text default null,
  p_estimated_value numeric default 0
)
returns public.opportunities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads;
  v_opp public.opportunities;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_lead.company_id, 'leads.convert') then
    raise exception 'Permissão negada (leads.convert).' using errcode = '42501';
  end if;

  insert into public.opportunities (
    company_id, title, customer_id, lead_id, pipeline_id, stage_id,
    estimated_value, owner_user_id, origin_id, created_by
  ) values (
    v_lead.company_id, coalesce(p_title, v_lead.name), v_lead.converted_customer_id, v_lead.id, p_pipeline_id, p_stage_id,
    coalesce(p_estimated_value, 0), v_lead.responsible_user_id, v_lead.origin_id, public.current_app_user_id()
  )
  returning * into v_opp;

  if v_lead.status = 'NEW' then
    update public.leads set status = 'QUALIFIED' where id = p_lead_id;
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_lead.company_id, public.current_app_user_id(), 'system', 'opportunities', v_opp.id, 'INSERT', null,
    jsonb_build_object('lead_id', v_lead.id, 'pipeline_id', p_pipeline_id, 'stage_id', p_stage_id));

  return v_opp;
end;
$$;

-- ==================================================================
-- fn_convert_opportunity_to_sales_quote / _sales_order — reaproveitam
-- fn_create_sales_quote/fn_create_sales_order (0020/0021) sem alterá-las;
-- só marcam source_type/source_id='opportunity' após a criação (seção
-- "nunca gerar fatura automaticamente" não se aplica aqui — orçamento/
-- pedido continuam rascunho, exigindo os passos normais de aprovação).
-- ==================================================================
create or replace function public.fn_convert_opportunity_to_sales_quote(
  p_opportunity_id uuid,
  p_items jsonb,
  p_valid_until date default null,
  p_notes text default null
)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp public.opportunities;
  v_quote public.sales_quotes;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_opp.company_id, 'opportunities.convert') then
    raise exception 'Permissão negada (opportunities.convert).' using errcode = '42501';
  end if;

  if v_opp.customer_id is null then
    raise exception 'Oportunidade ainda não tem cliente vinculado — converta o lead em cliente antes (fn_convert_lead_to_customer).' using errcode = 'P0001';
  end if;

  v_quote := public.fn_create_sales_quote(v_opp.company_id, v_opp.customer_id, p_items, null, null, null, p_valid_until, 0, 0, p_notes);

  update public.sales_quotes set source_type = 'opportunity', source_id = v_opp.id where id = v_quote.id
  returning * into v_quote;

  return v_quote;
end;
$$;

create or replace function public.fn_convert_opportunity_to_sales_order(
  p_opportunity_id uuid,
  p_items jsonb default null,
  p_sales_quote_id uuid default null,
  p_notes text default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp public.opportunities;
  v_order public.sales_orders;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_opp.company_id, 'opportunities.convert') then
    raise exception 'Permissão negada (opportunities.convert).' using errcode = '42501';
  end if;

  if v_opp.customer_id is null then
    raise exception 'Oportunidade ainda não tem cliente vinculado — converta o lead em cliente antes (fn_convert_lead_to_customer).' using errcode = 'P0001';
  end if;

  v_order := public.fn_create_sales_order(
    v_opp.company_id, v_opp.customer_id, p_items, p_sales_quote_id,
    null, null, null, 0, 0, null, null, null, null, null, null, null, null, p_notes
  );

  update public.sales_orders set source_type = 'opportunity', source_id = v_opp.id where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- ==================================================================
-- INDICADORES (seção "funções de indicador") — padrão de tabela larga
-- já usado em Controladoria/Relatórios (0045-0048).
-- ==================================================================
create or replace function public.fn_crm_leads_by_origin(p_company_id uuid, p_date_from date default null, p_date_to date default null)
returns table (origin_id uuid, origin_name text, lead_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select lo.id, lo.name, count(l.id)::integer
    from public.lead_origins lo
    left join public.leads l on l.origin_id = lo.id and l.company_id = p_company_id
      and (p_date_from is null or l.created_at::date >= p_date_from)
      and (p_date_to is null or l.created_at::date <= p_date_to)
    where lo.company_id = p_company_id
    group by lo.id, lo.name
    order by lo.name;
end;
$$;

create or replace function public.fn_crm_lead_conversion_rate(p_company_id uuid, p_date_from date default null, p_date_to date default null)
returns table (total_leads integer, converted_leads integer, conversion_rate_pct numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_total integer;
  v_converted integer;
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where status = 'CONVERTED')
  into v_total, v_converted
  from public.leads
  where company_id = p_company_id
    and (p_date_from is null or created_at::date >= p_date_from)
    and (p_date_to is null or created_at::date <= p_date_to);

  return query select v_total, v_converted, case when v_total = 0 then 0 else round(v_converted * 100.0 / v_total, 2) end;
end;
$$;

create or replace function public.fn_crm_opportunities_by_stage(p_company_id uuid, p_pipeline_id uuid default null)
returns table (stage_id uuid, stage_name text, sequence integer, opportunity_count integer, total_value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select ps.id, ps.name, ps.sequence, count(o.id)::integer, coalesce(sum(o.estimated_value), 0)
    from public.pipeline_stages ps
    left join public.opportunities o on o.stage_id = ps.id and o.company_id = p_company_id and o.status = 'OPEN'
    where ps.company_id = p_company_id
      and (p_pipeline_id is null or ps.pipeline_id = p_pipeline_id)
    group by ps.id, ps.name, ps.sequence
    order by ps.sequence;
end;
$$;

create or replace function public.fn_crm_pipeline_summary(p_company_id uuid, p_pipeline_id uuid default null)
returns table (open_count integer, total_open_value numeric, weighted_pipeline_value numeric, won_value numeric, lost_value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select
      count(*) filter (where status = 'OPEN')::integer,
      coalesce(sum(estimated_value) filter (where status = 'OPEN'), 0),
      coalesce(sum(estimated_value * probability / 100.0) filter (where status = 'OPEN'), 0),
      coalesce(sum(estimated_value) filter (where status = 'WON'), 0),
      coalesce(sum(estimated_value) filter (where status = 'LOST'), 0)
    from public.opportunities
    where company_id = p_company_id
      and (p_pipeline_id is null or pipeline_id = p_pipeline_id);
end;
$$;

create or replace function public.fn_crm_sales_by_rep(p_company_id uuid, p_date_from date default null, p_date_to date default null)
returns table (owner_user_id uuid, owner_name text, won_count integer, won_value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select u.id, u.name, count(o.id)::integer, coalesce(sum(o.estimated_value), 0)
    from public.opportunities o
    join public.users u on u.id = o.owner_user_id
    where o.company_id = p_company_id and o.status = 'WON'
      and (p_date_from is null or o.closed_at::date >= p_date_from)
      and (p_date_to is null or o.closed_at::date <= p_date_to)
    group by u.id, u.name
    order by won_value desc;
end;
$$;

create or replace function public.fn_crm_activities_summary(p_company_id uuid, p_date_from date default null, p_date_to date default null)
returns table (activity_type text, total_count integer, completed_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select a.activity_type, count(*)::integer, count(*) filter (where a.status = 'DONE')::integer
    from public.activities a
    where a.company_id = p_company_id
      and (p_date_from is null or a.created_at::date >= p_date_from)
      and (p_date_to is null or a.created_at::date <= p_date_to)
    group by a.activity_type
    order by a.activity_type;
end;
$$;

create or replace function public.fn_crm_won_lost_opportunities(p_company_id uuid, p_date_from date default null, p_date_to date default null)
returns table (won_count integer, won_value numeric, lost_count integer, lost_value numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select
      count(*) filter (where status = 'WON')::integer,
      coalesce(sum(estimated_value) filter (where status = 'WON'), 0),
      count(*) filter (where status = 'LOST')::integer,
      coalesce(sum(estimated_value) filter (where status = 'LOST'), 0)
    from public.opportunities
    where company_id = p_company_id and status in ('WON', 'LOST')
      and (p_date_from is null or closed_at::date >= p_date_from)
      and (p_date_to is null or closed_at::date <= p_date_to);
end;
$$;

create or replace function public.fn_crm_avg_time_per_stage(p_company_id uuid, p_pipeline_id uuid default null)
returns table (stage_id uuid, stage_name text, avg_days numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission(p_company_id, 'crm_reports.view') then
    raise exception 'Permissão negada (crm_reports.view).' using errcode = '42501';
  end if;
  return query
    select ps.id, ps.name,
      coalesce(round(avg(extract(epoch from (coalesce(h.exited_at, now()) - h.entered_at)) / 86400.0), 2), 0)
    from public.pipeline_stages ps
    left join public.opportunity_stage_history h on h.stage_id = ps.id and h.company_id = p_company_id
    where ps.company_id = p_company_id
      and (p_pipeline_id is null or ps.pipeline_id = p_pipeline_id)
    group by ps.id, ps.name
    order by ps.name;
end;
$$;

-- ==================================================================
-- PERMISSIONS + RBAC seed
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('activities.view', 'activities', 'view', 'Consultar atividades de CRM'),
    ('activities.create', 'activities', 'create', 'Criar atividades de CRM'),
    ('activities.update', 'activities', 'update', 'Editar/concluir atividades de CRM')
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
-- RLS — activities
-- ==================================================================
alter table public.activities enable row level security;

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (public.has_permission(company_id, 'activities.view'));
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated with check (public.has_permission(company_id, 'activities.create'));
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update to authenticated using (public.has_permission(company_id, 'activities.update')) with check (public.has_permission(company_id, 'activities.update'));

-- ==================================================================
-- Funções transacionais/relatório — execução restrita a authenticated,
-- verificação de permissão interna em cada função (mesmo padrão de
-- todas as fases anteriores).
-- ==================================================================
revoke all on function public.fn_move_opportunity_stage(uuid, uuid) from public;
revoke all on function public.fn_close_opportunity(uuid, text, text) from public;
revoke all on function public.fn_convert_lead_to_customer(uuid) from public;
revoke all on function public.fn_convert_lead_to_opportunity(uuid, uuid, uuid, text, numeric) from public;
revoke all on function public.fn_convert_opportunity_to_sales_quote(uuid, jsonb, date, text) from public;
revoke all on function public.fn_convert_opportunity_to_sales_order(uuid, jsonb, uuid, text) from public;
revoke all on function public.fn_crm_leads_by_origin(uuid, date, date) from public;
revoke all on function public.fn_crm_lead_conversion_rate(uuid, date, date) from public;
revoke all on function public.fn_crm_opportunities_by_stage(uuid, uuid) from public;
revoke all on function public.fn_crm_pipeline_summary(uuid, uuid) from public;
revoke all on function public.fn_crm_sales_by_rep(uuid, date, date) from public;
revoke all on function public.fn_crm_activities_summary(uuid, date, date) from public;
revoke all on function public.fn_crm_won_lost_opportunities(uuid, date, date) from public;
revoke all on function public.fn_crm_avg_time_per_stage(uuid, uuid) from public;

grant execute on function public.fn_move_opportunity_stage(uuid, uuid) to authenticated;
grant execute on function public.fn_close_opportunity(uuid, text, text) to authenticated;
grant execute on function public.fn_convert_lead_to_customer(uuid) to authenticated;
grant execute on function public.fn_convert_lead_to_opportunity(uuid, uuid, uuid, text, numeric) to authenticated;
grant execute on function public.fn_convert_opportunity_to_sales_quote(uuid, jsonb, date, text) to authenticated;
grant execute on function public.fn_convert_opportunity_to_sales_order(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.fn_crm_leads_by_origin(uuid, date, date) to authenticated;
grant execute on function public.fn_crm_lead_conversion_rate(uuid, date, date) to authenticated;
grant execute on function public.fn_crm_opportunities_by_stage(uuid, uuid) to authenticated;
grant execute on function public.fn_crm_pipeline_summary(uuid, uuid) to authenticated;
grant execute on function public.fn_crm_sales_by_rep(uuid, date, date) to authenticated;
grant execute on function public.fn_crm_activities_summary(uuid, date, date) to authenticated;
grant execute on function public.fn_crm_won_lost_opportunities(uuid, date, date) to authenticated;
grant execute on function public.fn_crm_avg_time_per_stage(uuid, uuid) to authenticated;
