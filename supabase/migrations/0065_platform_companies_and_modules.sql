-- Fase 23 — Empresas como entidades SaaS + módulos habilitados por
-- empresa, com o gate REAL de acesso no banco.
--
-- Regra da etapa: MODULE ENABLEMENT + USER ROLE + PERMISSION = ACCESS.
-- Uma permissão concedida NÃO basta se o módulo não estiver habilitado
-- para a empresa. Em vez de reescrever 309 policies, o gate entra em
-- has_permission() — a função que TODAS as policies e todas as funções
-- de negócio já chamam. Assim o bloqueio é do banco (não do frontend) e
-- vale para RLS, RPC e API ao mesmo tempo.
--
-- Compatibilidade: a ausência de linha em company_modules significa
-- PERMITIDO (o comportamento anterior), e o seed abaixo cria as linhas
-- de todas as empresas existentes já habilitadas. Só um "desabilitado"
-- explícito bloqueia — nenhuma empresa perde acesso por esta migration.

-- ==================================================================
-- PLATFORM_MODULES — o módulo EXISTE na plataforma (catálogo global).
-- ==================================================================
create table if not exists public.platform_modules (
  code text primary key,
  name text not null,
  description text,
  category text not null default 'OPERATIONAL' check (category in ('CORE', 'OPERATIONAL', 'MANAGEMENT')),
  is_core boolean not null default false,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.platform_modules
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.platform_modules is
  'Catálogo de módulos da plataforma (o módulo EXISTE). is_core=true = infraestrutura da conta (usuários, papéis, auditoria, configurações): nunca desabilitável, senão a empresa se tranca para fora da própria administração.';

-- ==================================================================
-- Mapa permissions.module -> platform_modules.code. permissions.module
-- é granular (sales_orders, fiscal_ncms...); o módulo comercial/
-- contratável é mais grosso. Um mapa explícito evita inventar uma
-- convenção de prefixo frágil e mantém permissions (0005) intacta.
-- ==================================================================
create table if not exists public.platform_module_permission_map (
  permission_module text primary key,
  module_code text not null references public.platform_modules(code) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists platform_module_permission_map_module_idx
  on public.platform_module_permission_map (module_code);

comment on table public.platform_module_permission_map is
  'De qual módulo contratável cada permissions.module faz parte. Sem linha = permissão não pertence a nenhum módulo comercial e nunca é bloqueada pelo gate (fail-open deliberado para não travar o que não foi classificado).';

-- ==================================================================
-- COMPANY_PLATFORM_PROFILES — a empresa como entidade SaaS (ciclo de
-- vida contratual). Separado de public.companies, que é o cadastro
-- operacional pertencente ao próprio tenant.
-- ==================================================================
create table if not exists public.company_platform_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  lifecycle_status text not null default 'ACTIVE' check (lifecycle_status in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED')),
  plan_code text,
  contracted_at timestamptz not null default now(),
  suspended_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.company_platform_profiles
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.company_platform_profiles is
  'Ciclo de vida da empresa como cliente do SaaS (TRIAL/ACTIVE/SUSPENDED/CANCELLED), administrado pela plataforma. SUSPENDED/CANCELLED derruba o acesso operacional do tenant inteiro via has_permission — não é um flag cosmético.';

-- ==================================================================
-- COMPANY_MODULES — o módulo está HABILITADO para a empresa.
-- Duas dimensões, deliberadamente separadas:
--   contracted        -> decisão da PLATAFORMA (comercial/contrato)
--   enabled_by_company -> decisão do COMPANY ADMIN (uso interno)
-- Efetivo = contracted AND enabled_by_company.
-- ==================================================================
create table if not exists public.company_modules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_code text not null references public.platform_modules(code) on delete cascade,
  contracted boolean not null default true,
  enabled_by_company boolean not null default true,
  contracted_at timestamptz not null default now(),
  disabled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, module_code)
);

create trigger set_updated_at before update on public.company_modules
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists company_modules_company_idx on public.company_modules (company_id);

comment on table public.company_modules is
  'Habilitação de módulo por empresa. contracted é da plataforma, enabled_by_company é do Company Admin — um não sobrescreve o outro; o acesso exige os dois.';

-- ==================================================================
-- Gate de acesso.
-- ==================================================================
create or replace function public.fn_company_operational(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select cpp.lifecycle_status in ('TRIAL', 'ACTIVE')
    from public.company_platform_profiles cpp
    where cpp.company_id = p_company_id
  ), true);
$$;

create or replace function public.fn_company_module_enabled(p_company_id uuid, p_module_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select cm.contracted and cm.enabled_by_company
    from public.company_modules cm
    where cm.company_id = p_company_id and cm.module_code = p_module_code
  ), true);
$$;

create or replace function public.fn_permission_module_enabled(p_company_id uuid, p_permission_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select cm.contracted and cm.enabled_by_company
    from public.platform_module_permission_map mp
    join public.company_modules cm
      on cm.module_code = mp.module_code and cm.company_id = p_company_id
    where mp.permission_module = p_permission_module
  ), true);
$$;

comment on function public.fn_permission_module_enabled(uuid, text) is
  'Resolve a habilitação do módulo a partir do permissions.module. Sem mapa ou sem linha de company_modules -> true (compatibilidade); só o desabilitado explícito bloqueia.';

-- ==================================================================
-- has_permission — MESMA assinatura, mesmo contrato de retorno. Ganha
-- o gate de módulo e o de ciclo de vida da empresa. Nenhum bypass de
-- plataforma foi adicionado: um Platform Owner/Admin que não seja
-- usuário da empresa continua recebendo false aqui, como antes.
-- ==================================================================
create or replace function public.has_permission(p_company_id uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.fn_company_operational(p_company_id)
  and exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where u.auth_user_id = auth.uid()
      and u.company_id = p_company_id
      and u.status = 'active'
      and r.status = 'active'
      and p.code = p_code
      and public.fn_permission_module_enabled(p_company_id, p.module)
  );
$$;

comment on function public.has_permission(uuid, text) is
  'Autorização de TENANT: papel do usuário na empresa + permissão + módulo habilitado + empresa operacional. É o ponto único onde MODULE ENABLEMENT + ROLE + PERMISSION = ACCESS é decidido, e por isso vale igualmente para RLS, RPC e API.';

-- current_user_permissions passa a refletir o mesmo gate, para que a UI
-- nunca receba uma permissão que o banco não honraria.
create or replace function public.current_user_permissions(p_company_id uuid)
returns table(code text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct p.code
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where u.auth_user_id = auth.uid()
    and u.company_id = p_company_id
    and u.status = 'active'
    and r.status = 'active'
    and public.fn_company_operational(p_company_id)
    and public.fn_permission_module_enabled(p_company_id, p.module);
$$;

-- ==================================================================
-- Escrita — plataforma.
-- ==================================================================
create or replace function public.fn_platform_set_company_lifecycle(
  p_company_id uuid,
  p_lifecycle_status text,
  p_notes text default null
)
returns public.company_platform_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.company_platform_profiles;
  v_profile public.company_platform_profiles;
begin
  if p_lifecycle_status not in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED') then
    raise exception 'lifecycle_status inválido: %.', p_lifecycle_status using errcode = '22023';
  end if;

  if not public.has_platform_permission('platform.companies.lifecycle') then
    raise exception 'Permissão negada (platform.companies.lifecycle).' using errcode = '42501';
  end if;

  select * into v_old from public.company_platform_profiles where company_id = p_company_id;

  insert into public.company_platform_profiles (company_id, lifecycle_status, notes, suspended_at, cancelled_at)
  values (
    p_company_id, p_lifecycle_status, p_notes,
    case when p_lifecycle_status = 'SUSPENDED' then now() else null end,
    case when p_lifecycle_status = 'CANCELLED' then now() else null end
  )
  on conflict (company_id) do update
    set lifecycle_status = excluded.lifecycle_status,
        notes = coalesce(excluded.notes, public.company_platform_profiles.notes),
        suspended_at = case when excluded.lifecycle_status = 'SUSPENDED' then now() else null end,
        cancelled_at = case when excluded.lifecycle_status = 'CANCELLED' then now() else null end
  returning * into v_profile;

  perform public.fn_log_platform_audit(
    'company_platform_profiles', p_company_id,
    case p_lifecycle_status when 'SUSPENDED' then 'SUSPEND' when 'CANCELLED' then 'CANCEL' else 'RESUME' end,
    case when v_old.company_id is null then null else jsonb_build_object('lifecycle_status', v_old.lifecycle_status) end,
    jsonb_build_object('lifecycle_status', p_lifecycle_status)
  );

  return v_profile;
end;
$$;

create or replace function public.fn_platform_set_company_module(
  p_company_id uuid,
  p_module_code text,
  p_contracted boolean,
  p_notes text default null
)
returns public.company_modules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_module public.platform_modules;
  v_old public.company_modules;
  v_row public.company_modules;
begin
  if not public.has_platform_permission('platform.company_modules.manage') then
    raise exception 'Permissão negada (platform.company_modules.manage).' using errcode = '42501';
  end if;

  select * into v_module from public.platform_modules where code = p_module_code;
  if not found then
    raise exception 'Módulo % não existe no catálogo da plataforma.', p_module_code using errcode = 'P0002';
  end if;

  if v_module.is_core and not p_contracted then
    raise exception 'O módulo % é core e não pode ser descontratado.', p_module_code using errcode = 'P0001';
  end if;

  select * into v_old from public.company_modules where company_id = p_company_id and module_code = p_module_code;

  insert into public.company_modules (company_id, module_code, contracted, notes, disabled_at)
  values (p_company_id, p_module_code, p_contracted, p_notes, case when p_contracted then null else now() end)
  on conflict (company_id, module_code) do update
    set contracted = excluded.contracted,
        notes = coalesce(excluded.notes, public.company_modules.notes),
        disabled_at = case when excluded.contracted then null else now() end
  returning * into v_row;

  perform public.fn_log_platform_audit(
    'company_modules', v_row.id,
    case when p_contracted then 'ENABLE' else 'DISABLE' end,
    case when v_old.id is null then null else jsonb_build_object('contracted', v_old.contracted) end,
    jsonb_build_object('company_id', p_company_id, 'module_code', p_module_code, 'contracted', p_contracted)
  );

  return v_row;
end;
$$;

-- ==================================================================
-- Escrita — Company Admin. Só alterna dentro do que foi contratado, e
-- nunca desliga um módulo core (que trancaria a própria administração).
-- ==================================================================
create or replace function public.fn_company_set_module_enabled(
  p_company_id uuid,
  p_module_code text,
  p_enabled boolean
)
returns public.company_modules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_module public.platform_modules;
  v_row public.company_modules;
  v_old public.company_modules;
begin
  if not public.has_permission(p_company_id, 'company_modules.manage') then
    raise exception 'Permissão negada (company_modules.manage).' using errcode = '42501';
  end if;

  select * into v_module from public.platform_modules where code = p_module_code;
  if not found then
    raise exception 'Módulo % não existe no catálogo da plataforma.', p_module_code using errcode = 'P0002';
  end if;

  if v_module.is_core and not p_enabled then
    raise exception 'O módulo % é core e não pode ser desabilitado.', p_module_code using errcode = 'P0001';
  end if;

  select * into v_old from public.company_modules where company_id = p_company_id and module_code = p_module_code;

  if p_enabled and (v_old.id is null or not v_old.contracted) then
    raise exception 'O módulo % não está contratado para esta empresa.', p_module_code using errcode = 'P0001';
  end if;

  insert into public.company_modules (company_id, module_code, enabled_by_company, disabled_at)
  values (p_company_id, p_module_code, p_enabled, case when p_enabled then null else now() end)
  on conflict (company_id, module_code) do update
    set enabled_by_company = excluded.enabled_by_company,
        disabled_at = case when excluded.enabled_by_company then null else now() end
  returning * into v_row;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'company_modules', v_row.id,
    case when p_enabled then 'ENABLE' else 'DISABLE' end,
    case when v_old.id is null then null else jsonb_build_object('enabled_by_company', v_old.enabled_by_company) end,
    jsonb_build_object('module_code', p_module_code, 'enabled_by_company', p_enabled));

  return v_row;
end;
$$;

revoke all on function public.fn_platform_set_company_lifecycle(uuid, text, text) from public;
revoke all on function public.fn_platform_set_company_module(uuid, text, boolean, text) from public;
revoke all on function public.fn_company_set_module_enabled(uuid, text, boolean) from public;
grant execute on function public.fn_platform_set_company_lifecycle(uuid, text, text) to authenticated;
grant execute on function public.fn_platform_set_company_module(uuid, text, boolean, text) to authenticated;
grant execute on function public.fn_company_set_module_enabled(uuid, text, boolean) to authenticated;
grant execute on function public.fn_company_operational(uuid) to authenticated;
grant execute on function public.fn_company_module_enabled(uuid, text) to authenticated;
grant execute on function public.fn_permission_module_enabled(uuid, text) to authenticated;

-- ==================================================================
-- SEED — catálogo de módulos.
-- ==================================================================
insert into public.platform_modules (code, name, description, category, is_core, sort_order)
select v.code, v.name, v.description, v.category, v.is_core, v.sort_order
from (
  values
    ('core', 'Núcleo', 'Usuários, papéis, permissões, organização, auditoria e configurações', 'CORE', true, 10),
    ('cadastros', 'Cadastros', 'Produtos, clientes, fornecedores, transportadoras, motoristas, veículos e atributos', 'CORE', true, 20),
    ('estoque', 'Estoque', 'Saldos, movimentações, armazéns, locais, lotes e números de série', 'OPERATIONAL', false, 30),
    ('compras', 'Compras', 'Solicitações, cotações, pedidos e recebimentos de compra', 'OPERATIONAL', false, 40),
    ('comercial', 'Comercial', 'Orçamentos, pedidos de venda, tabelas de preço e representantes', 'OPERATIONAL', false, 50),
    ('logistica', 'Logística', 'Separação, expedição e entregas', 'OPERATIONAL', false, 60),
    ('producao', 'Produção', 'Ordens de produção, BOM, operações, consumo e apontamentos', 'OPERATIONAL', false, 70),
    ('financeiro', 'Financeiro', 'Contas a pagar/receber, contas, transações, conciliação e fluxo de caixa', 'OPERATIONAL', false, 80),
    ('fiscal', 'Fiscal', 'Classificação fiscal, regras tributárias e documentos fiscais', 'OPERATIONAL', false, 90),
    ('custos', 'Custos', 'Custo médio móvel, custo padrão e movimentos de custo', 'MANAGEMENT', false, 100),
    ('controladoria', 'Controladoria', 'Períodos de competência, rateios, orçamento e DRE gerencial', 'MANAGEMENT', false, 110),
    ('crm', 'CRM', 'Leads, oportunidades, pipeline e atividades', 'OPERATIONAL', false, 120),
    ('ativos', 'Ativos', 'Cadastro de ativos, categorias e locais de instalação', 'OPERATIONAL', false, 130),
    ('manutencao', 'Manutenção', 'Planos e ordens de manutenção', 'OPERATIONAL', false, 140),
    ('qualidade', 'Qualidade', 'Checklists, inspeções, não conformidades e ações', 'OPERATIONAL', false, 150),
    ('projetos', 'Projetos e Serviços', 'Projetos, tarefas, apontamentos e ordens de serviço', 'OPERATIONAL', false, 160),
    ('workflow', 'Workflow e Aprovações', 'Motor de aprovações configurável por alçada', 'MANAGEMENT', false, 170),
    ('import_export', 'Importação e Exportação', 'Importação em lote e exportação de dados', 'MANAGEMENT', false, 180),
    ('relatorios', 'Relatórios', 'Relatórios operacionais e gerenciais consolidados', 'MANAGEMENT', false, 190)
) as v(code, name, description, category, is_core, sort_order)
on conflict (code) do nothing;

-- ==================================================================
-- SEED — mapa permissions.module -> módulo contratável.
-- ==================================================================
insert into public.platform_module_permission_map (permission_module, module_code)
select v.permission_module, v.module_code
from (
  values
    ('users', 'core'), ('rbac', 'core'), ('audit', 'core'), ('branches', 'core'),
    ('settings', 'core'), ('settings_company', 'core'), ('settings_establishment', 'core'),
    ('document_sequences', 'core'), ('company_modules', 'core'),
    ('products', 'cadastros'), ('catalog', 'cadastros'), ('customers', 'cadastros'),
    ('suppliers', 'cadastros'), ('carriers', 'cadastros'), ('drivers', 'cadastros'),
    ('vehicles', 'cadastros'), ('product_attributes', 'cadastros'),
    ('party_addresses', 'cadastros'), ('party_contacts', 'cadastros'),
    ('stock', 'estoque'), ('warehouses', 'estoque'), ('warehouse_locations', 'estoque'),
    ('product_lots', 'estoque'), ('product_serial_numbers', 'estoque'),
    ('inventory_reports', 'estoque'), ('inventory_valuation', 'estoque'),
    ('purchase_requests', 'compras'), ('purchase_quotes', 'compras'), ('purchase_orders', 'compras'),
    ('purchase_receipts', 'compras'), ('purchase_reports', 'compras'), ('receipts', 'compras'),
    ('sales_quotes', 'comercial'), ('sales_orders', 'comercial'), ('price_lists', 'comercial'),
    ('payment_terms', 'comercial'), ('sales_representatives', 'comercial'), ('commercial_reports', 'comercial'),
    ('pick_lists', 'logistica'), ('shipments', 'logistica'), ('deliveries', 'logistica'),
    ('logistics_reports', 'logistica'),
    ('production_orders', 'producao'), ('production_boms', 'producao'), ('production_materials', 'producao'),
    ('production_operations', 'producao'), ('production_scrap', 'producao'), ('production_reports', 'producao'),
    ('accounts_payable', 'financeiro'), ('accounts_receivable', 'financeiro'), ('payments', 'financeiro'),
    ('financial_accounts', 'financeiro'), ('financial_categories', 'financeiro'),
    ('financial_transactions', 'financeiro'), ('bank_reconciliation', 'financeiro'),
    ('financial_reports', 'financeiro'), ('cost_centers', 'financeiro'),
    ('fiscal_ncms', 'fiscal'), ('fiscal_cfops', 'fiscal'), ('fiscal_operation_natures', 'fiscal'),
    ('fiscal_tax_codes', 'fiscal'), ('fiscal_establishments', 'fiscal'), ('fiscal_documents', 'fiscal'),
    ('fiscal_document_events', 'fiscal'), ('fiscal_document_files', 'fiscal'),
    ('fiscal_document_packages', 'fiscal'), ('fiscal_document_references', 'fiscal'),
    ('fiscal_provider_configs', 'fiscal'), ('fiscal_reports', 'fiscal'),
    ('tax_rules', 'fiscal'), ('product_fiscal_profiles', 'fiscal'),
    ('costs', 'custos'), ('standard_costs', 'custos'),
    ('controlling', 'controladoria'), ('controlling_budget', 'controladoria'), ('controlling_forecast', 'controladoria'),
    ('leads', 'crm'), ('lead_origins', 'crm'), ('opportunities', 'crm'), ('pipelines', 'crm'),
    ('activities', 'crm'), ('crm_reports', 'crm'),
    ('assets', 'ativos'), ('asset_categories', 'ativos'), ('asset_locations', 'ativos'),
    ('maintenance_orders', 'manutencao'), ('maintenance_plans', 'manutencao'),
    ('quality_checklists', 'qualidade'), ('quality_inspections', 'qualidade'),
    ('nonconformities', 'qualidade'), ('quality_actions', 'qualidade'), ('quality_reports', 'qualidade'),
    ('projects', 'projetos'), ('project_tasks', 'projetos'), ('time_entries', 'projetos'),
    ('service_orders', 'projetos'),
    ('workflow', 'workflow'),
    ('import_export', 'import_export'),
    ('reports', 'relatorios')
) as v(permission_module, module_code)
on conflict (permission_module) do nothing;

-- ==================================================================
-- PERMISSIONS de tenant desta camada (Company Admin).
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('company_modules.view', 'company_modules', 'view', 'Consultar os módulos contratados/habilitados da própria empresa'),
    ('company_modules.manage', 'company_modules', 'manage', 'Habilitar/desabilitar internamente um módulo já contratado')
) as v(code, module, action, description)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'admin' and p.code in ('company_modules.view', 'company_modules.manage')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code in ('operador', 'leitura') and p.code = 'company_modules.view'
on conflict (role_id, permission_id) do nothing;

-- ==================================================================
-- SEED — empresas existentes: perfil de plataforma ativo e todos os
-- módulos habilitados (nenhuma empresa perde acesso nesta migration).
-- ==================================================================
insert into public.company_platform_profiles (company_id, lifecycle_status)
select c.id, 'ACTIVE' from public.companies c
on conflict (company_id) do nothing;

insert into public.company_modules (company_id, module_code, contracted, enabled_by_company)
select c.id, m.code, true, true
from public.companies c cross join public.platform_modules m
on conflict (company_id, module_code) do nothing;

-- Empresa nova nasce com perfil e módulos habilitados.
create or replace function public.fn_seed_company_platform_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_platform_profiles (company_id, lifecycle_status)
  values (NEW.id, 'ACTIVE')
  on conflict (company_id) do nothing;

  insert into public.company_modules (company_id, module_code, contracted, enabled_by_company)
  select NEW.id, m.code, true, true from public.platform_modules m
  on conflict (company_id, module_code) do nothing;

  return NEW;
end;
$$;

drop trigger if exists seed_company_platform_defaults on public.companies;
create trigger seed_company_platform_defaults
  after insert on public.companies
  for each row execute procedure public.fn_seed_company_platform_defaults();

-- ==================================================================
-- RLS.
-- ==================================================================
alter table public.platform_modules enable row level security;
alter table public.platform_module_permission_map enable row level security;
alter table public.company_platform_profiles enable row level security;
alter table public.company_modules enable row level security;

-- Catálogo de módulos: legível por qualquer autenticado (é catálogo
-- global, sem dado de tenant — mesmo critério de public.permissions).
drop policy if exists platform_modules_select on public.platform_modules;
create policy platform_modules_select on public.platform_modules
  for select to authenticated using (true);

drop policy if exists platform_module_permission_map_select on public.platform_module_permission_map;
create policy platform_module_permission_map_select on public.platform_module_permission_map
  for select to authenticated using (true);

-- Perfil SaaS da empresa: plataforma vê todos; a empresa vê o seu.
drop policy if exists company_platform_profiles_select on public.company_platform_profiles;
create policy company_platform_profiles_select on public.company_platform_profiles
  for select to authenticated
  using (
    public.has_platform_permission('platform.companies.view')
    or company_id in (select public.current_user_company_ids())
  );

drop policy if exists company_modules_select on public.company_modules;
create policy company_modules_select on public.company_modules
  for select to authenticated
  using (
    public.has_platform_permission('platform.company_modules.view')
    or company_id in (select public.current_user_company_ids())
  );

comment on policy company_modules_select on public.company_modules is
  'A empresa enxerga a própria habilitação (necessário para a navegação saber o que existe); a plataforma enxerga todas — e nada além disso: esta é uma tabela de contrato, não de dados operacionais.';
