-- Fase 23 — Contexto do usuário e base do dashboard CONTEXTUAL.
--
-- Esta migration NÃO cria dashboard, card, gráfico ou tela: cria a base
-- de dados que permite responder, no banco, "o que é relevante para
-- ESTE usuário". A composição visual é a próxima fase e fica livre.
--
-- Regra absoluta mantida: DASHBOARD NÃO É SEGURANÇA. fn_dashboard_context
-- apenas ORDENA e FILTRA o que já é acessível — ela nunca concede nada.
-- Todo foco declara o módulo a que pertence e (quando existe) a
-- permissão exigida; o resultado é interseção com o que has_permission
-- já autorizaria, nunca um atalho para além dele.
--
-- Estrutura deliberadamente flexível: um catálogo de focos + regras
-- (escopo -> foco -> prioridade). Nada de card_1/card_2/card_3.

-- ==================================================================
-- DASHBOARD_FOCUS_AREAS — catálogo de "assuntos" que um dashboard pode
-- priorizar. Global (da plataforma), porque é vocabulário de produto.
-- ==================================================================
create table if not exists public.dashboard_focus_areas (
  code text primary key,
  name text not null,
  description text,
  module_code text not null references public.platform_modules(code) on delete cascade,
  required_permission text references public.permissions(code) on delete set null,
  default_priority integer not null default 100,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists dashboard_focus_areas_module_idx on public.dashboard_focus_areas (module_code);

comment on table public.dashboard_focus_areas is
  'Catálogo de focos possíveis de dashboard (entregas de hoje, contas a pagar, rupturas...). module_code e required_permission amarram cada foco ao módulo e à permissão correspondentes — é isso que impede o dashboard de sugerir algo que o usuário não poderia acessar.';

-- ==================================================================
-- DASHBOARD_FOCUS_RULES — o que priorizar para qual escopo.
-- company_id nulo = regra padrão da plataforma (ponto de partida);
-- company_id preenchido = regra da própria empresa, que pode acrescentar
-- prioridade própria ou suprimir um foco que não faz sentido para ela.
-- ==================================================================
create table if not exists public.dashboard_focus_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  scope_type text not null check (scope_type in ('DEPARTMENT', 'POSITION', 'ROLE')),
  scope_value text not null,
  focus_code text not null references public.dashboard_focus_areas(code) on delete cascade,
  priority integer not null default 100,
  is_suppressed boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.dashboard_focus_rules
  for each row execute procedure extensions.moddatetime(updated_at);

create unique index if not exists dashboard_focus_rules_global_key
  on public.dashboard_focus_rules (scope_type, scope_value, focus_code) where company_id is null;
create unique index if not exists dashboard_focus_rules_company_key
  on public.dashboard_focus_rules (company_id, scope_type, scope_value, focus_code) where company_id is not null;
create index if not exists dashboard_focus_rules_company_idx on public.dashboard_focus_rules (company_id, scope_type, scope_value);

comment on table public.dashboard_focus_rules is
  'Regra de priorização: para um escopo (setor, cargo ou papel), qual foco importa e com que prioridade. É a base de composição da experiência — a decisão visual (formato, tamanho, agrupamento) NÃO mora aqui.';

-- ==================================================================
-- fn_user_context — tudo que o sistema sabe sobre o usuário logado
-- dentro de uma empresa: empresa, unidade(s), setor, cargo, papéis,
-- permissões efetivas e módulos habilitados.
-- ==================================================================
create or replace function public.fn_user_context(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_result jsonb;
begin
  select * into v_user
  from public.users
  where auth_user_id = auth.uid() and company_id = p_company_id and status = 'active';

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'user', jsonb_build_object('id', v_user.id, 'name', v_user.name, 'email', v_user.email, 'code', v_user.code),
    'company', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name,
        'lifecycle_status', coalesce(cpp.lifecycle_status, 'ACTIVE'),
        'operational', public.fn_company_operational(c.id)
      )
      from public.companies c
      left join public.company_platform_profiles cpp on cpp.company_id = c.id
      where c.id = p_company_id
    ),
    'branch', (
      select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name)
      from public.branches b where b.id = v_user.branch_id
    ),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name) order by b.code)
      from public.branches b
      where b.company_id = p_company_id
        and b.status = 'active'
        and public.fn_user_has_branch_access(p_company_id, b.id)
    ), '[]'::jsonb),
    'department', (
      select jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name)
      from public.departments d where d.id = v_user.department_id
    ),
    'position', (
      select jsonb_build_object('id', pos.id, 'code', pos.code, 'name', pos.name, 'seniority_level', pos.seniority_level)
      from public.positions pos where pos.id = v_user.position_id
    ),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'is_system', r.is_system) order by r.code)
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = v_user.id and r.company_id = p_company_id and r.status = 'active'
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(ep.code order by ep.code)
      from public.fn_user_effective_permissions(p_company_id) ep
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(m.code order by m.sort_order)
      from public.platform_modules m
      where m.status = 'active' and public.fn_company_module_enabled(p_company_id, m.code)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.fn_user_context(uuid) is
  'Contexto completo do usuário autenticado na empresa (empresa, unidades acessíveis, setor, cargo, papéis, permissões efetivas, módulos). Só devolve o contexto do PRÓPRIO usuário — não é uma função de consulta de terceiros.';

-- ==================================================================
-- fn_dashboard_context — o que priorizar para este usuário. Ordena e
-- filtra; nunca concede. Um foco só aparece se:
--   1) o módulo dele está habilitado para a empresa, E
--   2) o usuário tem a permissão exigida (quando o foco declara uma), E
--   3) a empresa não suprimiu esse foco.
-- ==================================================================
create or replace function public.fn_dashboard_context(p_company_id uuid)
returns table (
  focus_code text,
  name text,
  description text,
  module_code text,
  priority integer,
  matched_scope_type text,
  matched_scope_value text
)
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select u.id as user_id,
           d.code as department_code,
           pos.code as position_code
    from public.users u
    left join public.departments d on d.id = u.department_id
    left join public.positions pos on pos.id = u.position_id
    where u.auth_user_id = auth.uid()
      and u.company_id = p_company_id
      and u.status = 'active'
  ),
  role_codes as (
    select r.code
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join ctx on ctx.user_id = ur.user_id
    where r.company_id = p_company_id and r.status = 'active'
  ),
  applicable as (
    select fr.focus_code, fr.priority, fr.scope_type, fr.scope_value
    from public.dashboard_focus_rules fr
    cross join ctx
    where fr.status = 'active'
      and fr.is_suppressed = false
      and (fr.company_id is null or fr.company_id = p_company_id)
      and (
        (fr.scope_type = 'DEPARTMENT' and fr.scope_value = ctx.department_code)
        or (fr.scope_type = 'POSITION' and fr.scope_value = ctx.position_code)
        or (fr.scope_type = 'ROLE' and fr.scope_value in (select code from role_codes))
      )
  ),
  ranked as (
    select a.focus_code,
           min(a.priority) as priority,
           (array_agg(a.scope_type order by a.priority))[1] as matched_scope_type,
           (array_agg(a.scope_value order by a.priority))[1] as matched_scope_value
    from applicable a
    group by a.focus_code
  )
  select fa.code, fa.name, fa.description, fa.module_code,
         r.priority, r.matched_scope_type, r.matched_scope_value
  from ranked r
  join public.dashboard_focus_areas fa on fa.code = r.focus_code
  where fa.status = 'active'
    and public.fn_company_module_enabled(p_company_id, fa.module_code)
    and (fa.required_permission is null or public.has_permission(p_company_id, fa.required_permission))
    and not exists (
      select 1 from public.dashboard_focus_rules s
      where s.company_id = p_company_id
        and s.focus_code = fa.code
        and s.is_suppressed = true
        and s.status = 'active'
    )
  order by r.priority, fa.code;
$$;

comment on function public.fn_dashboard_context(uuid) is
  'Prioridades de dashboard para o usuário autenticado. NÃO é mecanismo de segurança: esconder um foco não protege dado nenhum — a proteção real continua em RLS + has_permission. Esta função apenas evita mostrar como "relevante" algo que o usuário sequer poderia abrir.';

-- ==================================================================
-- Escrita das regras da empresa — auditada.
-- ==================================================================
create or replace function public.fn_set_company_focus_rule(
  p_company_id uuid,
  p_scope_type text,
  p_scope_value text,
  p_focus_code text,
  p_priority integer default 100,
  p_is_suppressed boolean default false
)
returns public.dashboard_focus_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.dashboard_focus_rules;
begin
  if not public.has_permission(p_company_id, 'dashboard.configure') then
    raise exception 'Permissão negada (dashboard.configure).' using errcode = '42501';
  end if;

  if p_scope_type not in ('DEPARTMENT', 'POSITION', 'ROLE') then
    raise exception 'scope_type inválido: %.', p_scope_type using errcode = '22023';
  end if;

  if not exists (select 1 from public.dashboard_focus_areas where code = p_focus_code) then
    raise exception 'Foco % não existe no catálogo.', p_focus_code using errcode = 'P0002';
  end if;

  insert into public.dashboard_focus_rules (company_id, scope_type, scope_value, focus_code, priority, is_suppressed, created_by)
  values (p_company_id, p_scope_type, p_scope_value, p_focus_code, coalesce(p_priority, 100), coalesce(p_is_suppressed, false), public.current_app_user_id())
  on conflict (company_id, scope_type, scope_value, focus_code) where company_id is not null
  do update set priority = excluded.priority, is_suppressed = excluded.is_suppressed, status = 'active'
  returning * into v_row;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'dashboard_focus_rules', v_row.id, 'CONFIGURE', null,
    jsonb_build_object('scope_type', p_scope_type, 'scope_value', p_scope_value, 'focus_code', p_focus_code,
                       'priority', v_row.priority, 'is_suppressed', v_row.is_suppressed));

  return v_row;
end;
$$;

revoke all on function public.fn_set_company_focus_rule(uuid, text, text, text, integer, boolean) from public;
grant execute on function public.fn_set_company_focus_rule(uuid, text, text, text, integer, boolean) to authenticated;
grant execute on function public.fn_user_context(uuid) to authenticated;
grant execute on function public.fn_dashboard_context(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS desta camada.
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('dashboard.view', 'dashboard', 'view', 'Consultar o próprio contexto de dashboard'),
    ('dashboard.configure', 'dashboard', 'configure', 'Configurar as prioridades de dashboard da empresa')
) as v(code, module, action, description)
on conflict (code) do nothing;

insert into public.platform_module_permission_map (permission_module, module_code)
values ('dashboard', 'core')
on conflict (permission_module) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'admin' and p.module = 'dashboard'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code in ('operador', 'leitura') and p.code = 'dashboard.view'
on conflict (role_id, permission_id) do nothing;

-- ==================================================================
-- SEED — catálogo de focos. Cada foco amarrado a módulo + permissão.
-- ==================================================================
insert into public.dashboard_focus_areas (code, name, description, module_code, required_permission, default_priority)
select v.code, v.name, v.description, v.module_code, v.required_permission, v.default_priority
from (
  values
    ('logistics.deliveries_today', 'Entregas de hoje', 'Entregas previstas para a data corrente', 'logistica', 'deliveries.view', 10),
    ('logistics.deliveries_late', 'Entregas atrasadas', 'Entregas fora do prazo previsto', 'logistica', 'deliveries.view', 20),
    ('logistics.shipping', 'Expedição', 'Expedições em preparação e em trânsito', 'logistica', 'shipments.view', 30),
    ('logistics.picking', 'Separação', 'Listas de separação abertas', 'logistica', 'pick_lists.view', 40),
    ('logistics.incidents', 'Ocorrências', 'Ocorrências registradas nas entregas', 'logistica', 'deliveries.view', 50),
    ('logistics.performance', 'Desempenho logístico', 'Indicadores de prazo e cumprimento', 'logistica', 'logistics_reports.view', 60),
    ('logistics.drivers', 'Motoristas', 'Disponibilidade e alocação de motoristas', 'cadastros', 'drivers.read', 70),
    ('logistics.vehicles', 'Veículos', 'Disponibilidade e alocação de veículos', 'cadastros', 'vehicles.read', 80),
    ('finance.payables', 'Contas a pagar', 'Títulos a pagar em aberto', 'financeiro', 'accounts_payable.view', 10),
    ('finance.receivables', 'Contas a receber', 'Títulos a receber em aberto', 'financeiro', 'accounts_receivable.view', 20),
    ('finance.due_dates', 'Vencimentos', 'Vencimentos do período', 'financeiro', 'accounts_payable.view', 30),
    ('finance.delinquency', 'Inadimplência', 'Títulos vencidos e não liquidados', 'financeiro', 'accounts_receivable.view', 40),
    ('finance.cash_flow', 'Fluxo de caixa', 'Entradas e saídas realizadas', 'financeiro', 'financial_reports.view', 50),
    ('finance.projections', 'Projeções', 'Projeção de caixa futura', 'financeiro', 'financial_reports.view', 60),
    ('inventory.available', 'Estoque disponível', 'Saldo disponível por produto/local', 'estoque', 'stock.view', 10),
    ('inventory.minimum', 'Estoque mínimo', 'Itens no limite ou abaixo do mínimo', 'estoque', 'stock.view', 20),
    ('inventory.stockouts', 'Rupturas', 'Itens sem saldo disponível', 'estoque', 'stock.view', 30),
    ('inventory.excess', 'Excesso', 'Itens acima do nível recomendado', 'estoque', 'stock.view', 40),
    ('inventory.counts', 'Inventário', 'Contagens abertas e divergências', 'estoque', 'stock.view', 50),
    ('inventory.reservations', 'Reservas', 'Saldo reservado por pedido', 'estoque', 'stock.view', 60),
    ('inventory.lots', 'Lotes', 'Lotes em estoque', 'estoque', 'product_lots.read', 70),
    ('inventory.expiry', 'Validade', 'Lotes próximos do vencimento', 'estoque', 'product_lots.read', 80),
    ('inventory.turnover', 'Giro', 'Giro de estoque por período', 'estoque', 'inventory_reports.view', 90),
    ('commercial.sales', 'Vendas', 'Vendas do período', 'comercial', 'commercial_reports.view', 10),
    ('commercial.orders', 'Pedidos', 'Pedidos de venda em aberto', 'comercial', 'sales_orders.view', 20),
    ('commercial.pipeline', 'Pipeline', 'Funil comercial por estágio', 'crm', 'crm_reports.view', 30),
    ('commercial.opportunities', 'Oportunidades', 'Oportunidades abertas', 'crm', 'opportunities.view', 40),
    ('commercial.customers', 'Clientes', 'Carteira de clientes', 'cadastros', 'customers.read', 50),
    ('commercial.targets', 'Metas', 'Acompanhamento de metas comerciais', 'comercial', 'commercial_reports.view', 60),
    ('commercial.conversion', 'Conversão', 'Taxa de conversão de oportunidades', 'crm', 'crm_reports.view', 70),
    ('production.orders', 'Ordens de produção', 'Ordens abertas e em andamento', 'producao', 'production_orders.view', 10),
    ('production.today', 'Produção do dia', 'Apontamentos do dia', 'producao', 'production_reports.view', 20),
    ('production.consumption', 'Consumo', 'Consumo de materiais na produção', 'producao', 'production_materials.view', 30),
    ('production.capacity', 'Capacidade', 'Ocupação de centros de trabalho', 'producao', 'production_reports.view', 40),
    ('production.delays', 'Atrasos', 'Ordens fora do prazo', 'producao', 'production_orders.view', 50),
    ('production.materials', 'Materiais', 'Disponibilidade de materiais para as ordens', 'producao', 'production_materials.view', 60),
    ('production.efficiency', 'Eficiência', 'Eficiência e refugo', 'producao', 'production_reports.view', 70),
    ('purchasing.orders', 'Pedidos de compra', 'Pedidos em aberto', 'compras', 'purchase_orders.view', 10),
    ('purchasing.receipts', 'Recebimentos', 'Recebimentos pendentes', 'compras', 'purchase_receipts.view', 20),
    ('purchasing.requests', 'Solicitações', 'Solicitações de compra aguardando tratamento', 'compras', 'purchase_requests.view', 30),
    ('fiscal.documents', 'Documentos fiscais', 'Documentos emitidos e pendentes', 'fiscal', 'fiscal_documents.view', 10),
    ('fiscal.pending', 'Pendências fiscais', 'Documentos rejeitados ou em contingência', 'fiscal', 'fiscal_documents.view', 20),
    ('quality.inspections', 'Inspeções', 'Inspeções pendentes e em andamento', 'qualidade', 'quality_inspections.view', 10),
    ('quality.nonconformities', 'Não conformidades', 'Não conformidades abertas', 'qualidade', 'nonconformities.view', 20),
    ('maintenance.orders', 'Ordens de manutenção', 'Ordens abertas e programadas', 'manutencao', 'maintenance_orders.view', 10),
    ('projects.open', 'Projetos', 'Projetos em andamento', 'projetos', 'projects.view', 10),
    ('projects.service_orders', 'Ordens de serviço', 'Ordens de serviço em aberto', 'projetos', 'service_orders.view', 20),
    ('executive.kpis', 'Indicadores consolidados', 'Visão consolidada dos indicadores da empresa', 'relatorios', 'reports.view', 10),
    ('executive.revenue', 'Faturamento', 'Faturamento do período', 'relatorios', 'reports.view', 20),
    ('executive.margin', 'Margem', 'Margem por produto/cliente/pedido', 'controladoria', 'controlling.view', 30),
    ('executive.inventory_overview', 'Estoque (visão geral)', 'Posição consolidada de estoque', 'estoque', 'inventory_reports.view', 40),
    ('executive.purchasing_overview', 'Compras (visão geral)', 'Posição consolidada de compras', 'compras', 'purchase_reports.view', 50),
    ('executive.production_overview', 'Produção (visão geral)', 'Posição consolidada da produção', 'producao', 'production_reports.view', 60),
    ('executive.logistics_overview', 'Logística (visão geral)', 'Posição consolidada da logística', 'logistica', 'logistics_reports.view', 70),
    ('executive.finance_overview', 'Financeiro (visão geral)', 'Posição consolidada do financeiro', 'financeiro', 'financial_reports.view', 80),
    ('executive.critical_alerts', 'Alertas críticos', 'Alertas que exigem ação imediata', 'relatorios', 'reports.view', 90),
    ('workflow.pending_approvals', 'Aprovações pendentes', 'Itens aguardando decisão do usuário', 'workflow', 'workflow.view', 5)
) as v(code, name, description, module_code, required_permission, default_priority)
on conflict (code) do nothing;

-- ==================================================================
-- SEED — regras padrão da plataforma, por SETOR. A empresa pode
-- sobrescrever prioridade ou suprimir focos via fn_set_company_focus_rule.
-- ==================================================================
insert into public.dashboard_focus_rules (company_id, scope_type, scope_value, focus_code, priority)
select null, 'DEPARTMENT', v.scope_value, v.focus_code, v.priority
from (
  values
    ('LOGISTICA', 'logistics.deliveries_today', 10),
    ('LOGISTICA', 'logistics.deliveries_late', 20),
    ('LOGISTICA', 'logistics.shipping', 30),
    ('LOGISTICA', 'logistics.picking', 40),
    ('LOGISTICA', 'logistics.incidents', 50),
    ('LOGISTICA', 'logistics.performance', 60),
    ('LOGISTICA', 'logistics.drivers', 70),
    ('LOGISTICA', 'logistics.vehicles', 80),
    ('FINANCEIRO', 'finance.payables', 10),
    ('FINANCEIRO', 'finance.receivables', 20),
    ('FINANCEIRO', 'finance.due_dates', 30),
    ('FINANCEIRO', 'finance.delinquency', 40),
    ('FINANCEIRO', 'finance.cash_flow', 50),
    ('FINANCEIRO', 'finance.projections', 60),
    ('ESTOQUE', 'inventory.available', 10),
    ('ESTOQUE', 'inventory.minimum', 20),
    ('ESTOQUE', 'inventory.stockouts', 30),
    ('ESTOQUE', 'inventory.excess', 40),
    ('ESTOQUE', 'inventory.counts', 50),
    ('ESTOQUE', 'inventory.reservations', 60),
    ('ESTOQUE', 'inventory.lots', 70),
    ('ESTOQUE', 'inventory.expiry', 80),
    ('ESTOQUE', 'inventory.turnover', 90),
    ('ALMOXARIFADO', 'inventory.available', 10),
    ('ALMOXARIFADO', 'inventory.minimum', 20),
    ('ALMOXARIFADO', 'inventory.stockouts', 30),
    ('COMERCIAL', 'commercial.sales', 10),
    ('COMERCIAL', 'commercial.orders', 20),
    ('COMERCIAL', 'commercial.pipeline', 30),
    ('COMERCIAL', 'commercial.opportunities', 40),
    ('COMERCIAL', 'commercial.customers', 50),
    ('COMERCIAL', 'commercial.targets', 60),
    ('COMERCIAL', 'commercial.conversion', 70),
    ('ATENDIMENTO', 'commercial.pipeline', 10),
    ('ATENDIMENTO', 'commercial.opportunities', 20),
    ('ATENDIMENTO', 'commercial.customers', 30),
    ('PRODUCAO', 'production.orders', 10),
    ('PRODUCAO', 'production.today', 20),
    ('PRODUCAO', 'production.consumption', 30),
    ('PRODUCAO', 'production.capacity', 40),
    ('PRODUCAO', 'production.delays', 50),
    ('PRODUCAO', 'production.materials', 60),
    ('PRODUCAO', 'production.efficiency', 70),
    ('COMPRAS', 'purchasing.requests', 10),
    ('COMPRAS', 'purchasing.orders', 20),
    ('COMPRAS', 'purchasing.receipts', 30),
    ('FISCAL', 'fiscal.documents', 10),
    ('FISCAL', 'fiscal.pending', 20),
    ('QUALIDADE', 'quality.inspections', 10),
    ('QUALIDADE', 'quality.nonconformities', 20),
    ('MANUTENCAO', 'maintenance.orders', 10),
    ('PROJETOS', 'projects.open', 10),
    ('PROJETOS', 'projects.service_orders', 20),
    ('CONTROLADORIA', 'executive.margin', 10),
    ('CONTROLADORIA', 'executive.kpis', 20),
    ('CONTROLADORIA', 'finance.cash_flow', 30),
    ('DIRETORIA', 'executive.kpis', 10),
    ('DIRETORIA', 'executive.revenue', 20),
    ('DIRETORIA', 'executive.margin', 30),
    ('DIRETORIA', 'executive.inventory_overview', 40),
    ('DIRETORIA', 'executive.purchasing_overview', 50),
    ('DIRETORIA', 'executive.production_overview', 60),
    ('DIRETORIA', 'executive.logistics_overview', 70),
    ('DIRETORIA', 'executive.finance_overview', 80),
    ('DIRETORIA', 'executive.critical_alerts', 90),
    ('TI', 'executive.kpis', 50)
) as v(scope_value, focus_code, priority)
on conflict do nothing;

-- Refinamento por CARGO: quem aprova vê primeiro o que está parado
-- aguardando decisão sua, independentemente do setor.
insert into public.dashboard_focus_rules (company_id, scope_type, scope_value, focus_code, priority)
select null, 'POSITION', v.scope_value, v.focus_code, v.priority
from (
  values
    ('DIRETOR', 'workflow.pending_approvals', 1),
    ('DIRETOR', 'executive.kpis', 5),
    ('DIRETOR', 'executive.critical_alerts', 8),
    ('GERENTE', 'workflow.pending_approvals', 2),
    ('COORDENADOR', 'workflow.pending_approvals', 3),
    ('SUPERVISOR', 'workflow.pending_approvals', 4)
) as v(scope_value, focus_code, priority)
on conflict do nothing;

-- ==================================================================
-- RLS.
-- ==================================================================
alter table public.dashboard_focus_areas enable row level security;
alter table public.dashboard_focus_rules enable row level security;

drop policy if exists dashboard_focus_areas_select on public.dashboard_focus_areas;
create policy dashboard_focus_areas_select on public.dashboard_focus_areas
  for select to authenticated using (true);

drop policy if exists dashboard_focus_rules_select on public.dashboard_focus_rules;
create policy dashboard_focus_rules_select on public.dashboard_focus_rules
  for select to authenticated
  using (company_id is null or company_id in (select public.current_user_company_ids()));

comment on policy dashboard_focus_rules_select on public.dashboard_focus_rules is
  'Regras globais são catálogo (visíveis a qualquer autenticado); regras de empresa só para a própria empresa. Escrita exclusivamente via fn_set_company_focus_rule.';
