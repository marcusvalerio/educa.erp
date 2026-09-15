-- Fase 15 — CRM (parte 1): cadastros base + pipeline/oportunidades.
--
-- Inspeção prévia (seção "antes de codificar"): customers (0002/0019),
-- sales_representatives/price_lists/payment_terms (0019), sales_quotes
-- (0020), sales_orders (0021), party_addresses/party_contacts (0051),
-- audit_logs (0003), permissions/has_permission (0005/0006). Nenhuma
-- dessas entidades é duplicada aqui — leads/opportunities SÃO clientes
-- em potencial, nunca uma segunda tabela de "cliente"; a conversão
-- (migration 0055) sempre reaproveita public.customers.

-- ==================================================================
-- LEAD_ORIGINS — origens de lead configuráveis (seção 15.2), cadastro
-- simples (mesmo padrão de product_categories/financial_categories:
-- código informado pelo usuário, não gerado por sequence).
-- ==================================================================
create table if not exists public.lead_origins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create trigger set_updated_at before update on public.lead_origins
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.lead_origins is
  'Origens de lead configuráveis por empresa (site, indicação, evento, prospecção ativa...) — nunca hardcoded no frontend.';

-- ==================================================================
-- LEADS (seção 15.1) — cadastro simples; conversão para cliente/
-- oportunidade é sempre via função (migration 0055), nunca update
-- direto de status='CONVERTED'/converted_customer_id.
-- ==================================================================
create sequence if not exists public.leads_code_seq;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  company_name text,
  document text,
  email text,
  phone text,
  origin_id uuid references public.lead_origins(id) on delete set null,
  responsible_user_id uuid references public.users(id) on delete set null,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED')),
  qualification text check (qualification is null or qualification in ('COLD', 'WARM', 'HOT')),
  disqualify_reason text,
  converted_customer_id uuid references public.customers(id) on delete set null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create trigger generate_lead_code before insert on public.leads
  for each row execute procedure public.fn_generate_code('LEAD', 'public.leads_code_seq');
create trigger set_updated_at before update on public.leads
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists leads_company_status_idx on public.leads (company_id, status);
create index if not exists leads_origin_idx on public.leads (company_id, origin_id);

comment on table public.leads is
  'Leads comerciais. converted_customer_id só é preenchido por fn_convert_lead_to_customer (0055) — nunca via update direto, para nunca duplicar um customer já existente.';

-- ==================================================================
-- PIPELINES / PIPELINE_STAGES (seção 15.1) — funis configuráveis com
-- estágios ordenados. is_won/is_lost marcam os estágios terminais.
-- ==================================================================
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.pipelines
  for each row execute procedure extensions.moddatetime(updated_at);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null,
  code text not null,
  name text not null,
  sequence integer not null default 0,
  probability_default numeric(5, 2) not null default 0 check (probability_default between 0 and 100),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, code),
  unique (id, pipeline_id),
  foreign key (pipeline_id, company_id) references public.pipelines (id, company_id) on delete cascade,
  check (not (is_won and is_lost))
);

create trigger set_updated_at before update on public.pipeline_stages
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, sequence);

comment on table public.pipeline_stages is
  'Estágios de um pipeline, ordenados por sequence. is_won/is_lost marcam estágio terminal (mutuamente exclusivos) — usado por fn_move_opportunity_stage/fn_close_opportunity (0055) para decidir se o movimento fecha a oportunidade.';

-- ==================================================================
-- OPPORTUNITIES (seção 15.1) — transacional: campos descritivos têm
-- update direto via RLS (opportunities.update), mas mudança de estágio
-- e fechamento (ganha/perdida) são sempre via função (0055), para
-- manter opportunity_stage_history e a auditoria corretas — mesmo
-- nível de rigor de party_addresses.is_primary (0051).
-- ==================================================================
create sequence if not exists public.opportunities_code_seq;

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  title text not null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  estimated_value numeric(18, 2) not null default 0 check (estimated_value >= 0),
  probability numeric(5, 2) not null default 0 check (probability between 0 and 100),
  owner_user_id uuid references public.users(id) on delete set null,
  expected_close_date date,
  origin_id uuid references public.lead_origins(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN', 'WON', 'LOST')),
  lost_reason text,
  closed_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (pipeline_id, company_id) references public.pipelines (id, company_id) on delete restrict,
  foreign key (stage_id, pipeline_id) references public.pipeline_stages (id, pipeline_id) on delete restrict,
  foreign key (lead_id, company_id) references public.leads (id, company_id) on delete set null
);

create trigger generate_opportunity_code before insert on public.opportunities
  for each row execute procedure public.fn_generate_code('OPP', 'public.opportunities_code_seq');
create trigger set_updated_at before update on public.opportunities
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists opportunities_company_status_idx on public.opportunities (company_id, status);
create index if not exists opportunities_stage_idx on public.opportunities (company_id, stage_id);
create index if not exists opportunities_owner_idx on public.opportunities (company_id, owner_user_id);
create index if not exists opportunities_customer_idx on public.opportunities (company_id, customer_id);

comment on table public.opportunities is
  'Oportunidades comerciais. customer_id e/ou lead_id (uma oportunidade pode nascer de um lead ainda não convertido). status WON/LOST e mudança de stage_id são sempre via função (0055).';

-- ==================================================================
-- OPPORTUNITY_STAGE_HISTORY — histórico de tempo por estágio (seção
-- "tempo médio por estágio"). Não é redundante com audit_logs: é um
-- fato estruturado (entered_at/exited_at por estágio), não um log
-- genérico de mudança de campo.
-- ==================================================================
create table if not exists public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  stage_id uuid not null,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_stage_history_opp_idx on public.opportunity_stage_history (opportunity_id, entered_at);
create index if not exists opportunity_stage_history_open_idx on public.opportunity_stage_history (opportunity_id) where exited_at is null;

comment on table public.opportunity_stage_history is
  'Uma linha por permanência da oportunidade em um estágio. exited_at nulo = estágio atual. Escrita exclusiva por fn_move_opportunity_stage/fn_close_opportunity (0055).';

-- ==================================================================
-- Integração aditiva com Comercial (seção "Oportunidade -> Orçamento/
-- Pedido"): sales_quotes/sales_orders ganham source_type/source_id
-- polimórfico (mesmo padrão de cost_movements.source_type/source_id,
-- fiscal_documents.source_type/source_id) — nenhuma coluna existente é
-- alterada, workflow de orçamento/pedido continua exatamente como está.
-- ==================================================================
alter table public.sales_quotes add column if not exists source_type text;
alter table public.sales_quotes add column if not exists source_id uuid;
alter table public.sales_orders add column if not exists source_type text;
alter table public.sales_orders add column if not exists source_id uuid;
create index if not exists sales_quotes_source_idx on public.sales_quotes (source_type, source_id);
create index if not exists sales_orders_source_idx on public.sales_orders (source_type, source_id);

comment on column public.sales_quotes.source_type is
  'Origem polimórfica opcional (ex.: ''opportunity'', ''project'', ''service_order'') — preenchida pelas funções de conversão (0055/0059), nunca obrigatória (orçamento avulso continua funcionando sem origem).';
comment on column public.sales_orders.source_type is
  'Mesmo padrão de sales_quotes.source_type.';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('lead_origins.view', 'lead_origins', 'view', 'Consultar origens de lead'),
    ('lead_origins.create', 'lead_origins', 'create', 'Criar origens de lead'),
    ('lead_origins.update', 'lead_origins', 'update', 'Editar origens de lead'),
    ('leads.view', 'leads', 'view', 'Consultar leads'),
    ('leads.create', 'leads', 'create', 'Criar leads'),
    ('leads.update', 'leads', 'update', 'Editar leads'),
    ('leads.convert', 'leads', 'convert', 'Converter lead em cliente/oportunidade'),
    ('pipelines.view', 'pipelines', 'view', 'Consultar pipelines e estágios'),
    ('pipelines.create', 'pipelines', 'create', 'Criar pipelines e estágios'),
    ('pipelines.update', 'pipelines', 'update', 'Editar pipelines e estágios'),
    ('opportunities.view', 'opportunities', 'view', 'Consultar oportunidades'),
    ('opportunities.create', 'opportunities', 'create', 'Criar oportunidades'),
    ('opportunities.update', 'opportunities', 'update', 'Editar dados descritivos da oportunidade'),
    ('opportunities.move_stage', 'opportunities', 'move_stage', 'Mover oportunidade entre estágios do pipeline'),
    ('opportunities.close', 'opportunities', 'close', 'Fechar oportunidade como ganha ou perdida'),
    ('opportunities.convert', 'opportunities', 'convert', 'Converter oportunidade em orçamento/pedido de venda'),
    ('crm_reports.view', 'crm_reports', 'view', 'Consultar indicadores de CRM')
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
alter table public.lead_origins enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_stage_history enable row level security;

do $$
declare
  t record;
begin
  for t in select * from (values ('lead_origins'), ('pipelines')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))', t.table_name, t.table_name, t.table_name || '.view');
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))', t.table_name, t.table_name, t.table_name || '.create');
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))', t.table_name, t.table_name, t.table_name || '.update', t.table_name || '.update');
  end loop;
end;
$$;

drop policy if exists pipeline_stages_select on public.pipeline_stages;
create policy pipeline_stages_select on public.pipeline_stages for select to authenticated using (public.has_permission(company_id, 'pipelines.view'));
drop policy if exists pipeline_stages_insert on public.pipeline_stages;
create policy pipeline_stages_insert on public.pipeline_stages for insert to authenticated with check (public.has_permission(company_id, 'pipelines.create'));
drop policy if exists pipeline_stages_update on public.pipeline_stages;
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated using (public.has_permission(company_id, 'pipelines.update')) with check (public.has_permission(company_id, 'pipelines.update'));

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated using (public.has_permission(company_id, 'leads.view'));
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated with check (public.has_permission(company_id, 'leads.create') and status = 'NEW' and converted_customer_id is null);
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (public.has_permission(company_id, 'leads.update'))
  with check (public.has_permission(company_id, 'leads.update') and status <> 'CONVERTED');

comment on policy leads_update on public.leads is
  'status=CONVERTED só é atingível via fn_convert_lead_to_customer/fn_convert_lead_to_opportunity (0055, SECURITY DEFINER) — bloqueado aqui por update direto.';

drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities for select to authenticated using (public.has_permission(company_id, 'opportunities.view'));
drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities for insert to authenticated with check (public.has_permission(company_id, 'opportunities.create') and status = 'OPEN');
drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities for update to authenticated
  using (public.has_permission(company_id, 'opportunities.update'))
  with check (public.has_permission(company_id, 'opportunities.update') and status = 'OPEN');

comment on policy opportunities_update on public.opportunities is
  'Fechar (WON/LOST) é sempre via fn_close_opportunity — update direto nunca sai de status=OPEN. Mudança de estágio é permitida via update direto aqui (campo simples), mas fn_move_opportunity_stage (0055) é o caminho recomendado por manter opportunity_stage_history consistente.';

drop policy if exists opportunity_stage_history_select on public.opportunity_stage_history;
create policy opportunity_stage_history_select on public.opportunity_stage_history for select to authenticated using (public.has_permission(company_id, 'opportunities.view'));
