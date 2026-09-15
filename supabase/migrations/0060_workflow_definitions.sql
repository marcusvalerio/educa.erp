-- Fase 20 — Workflow + Aprovações: MOTOR genérico e reutilizável (seção
-- 20). Não é um sistema de aprovação isolado por módulo: qualquer
-- entidade (sales_orders, purchase_orders, financial_payables, etc.)
-- pode ser submetida ao mesmo motor via fn_start_workflow (0061),
-- identificada só por (entity_type, entity_id) — nenhuma FK direta
-- deste domínio para as tabelas de negócio (mesmo padrão polimórfico já
-- usado por stock_movements.reference_id / fiscal_documents.source_id).
--
-- Esta migration cobre a DEFINIÇÃO (workflow -> versão -> etapas ->
-- aprovadores -> regras/alçadas). A EXECUÇÃO (instâncias, aprovações,
-- decisões, histórico) fica em 0061 — separação proposital: a definição
-- é dado de configuração (raramente muda), a execução é dado
-- transacional de alto volume.

-- ==================================================================
-- WORKFLOWS — cabeçalho. code é único por empresa; entity_type é o
-- identificador polimórfico (ex.: 'sales_order', 'purchase_order',
-- 'financial_payable') que fn_start_workflow usa para resolver qual
-- workflow ativo atende uma entidade, quando o chamador não informa o
-- código explicitamente.
-- ==================================================================
create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  module text not null,
  entity_type text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.workflows
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists workflows_company_status_idx on public.workflows (company_id, status);
create index if not exists workflows_entity_type_idx on public.workflows (company_id, entity_type, status);

comment on table public.workflows is
  'Cabeçalho de um fluxo de aprovação reutilizável (seção 20.2). entity_type é polimórfico (ex.: sales_order/purchase_order/financial_payable/production_order/stock_adjustment/service_order/project) — o motor não é limitado a uma lista fixa; qualquer módulo pode registrar seu próprio código aqui sem alterar esta tabela.';

-- ==================================================================
-- WORKFLOW_VERSIONS — versionamento (seção 20.3). Só uma versão
-- PUBLISHED por workflow fica "ativa" (fn_publish_workflow_version
-- arquiva a anterior). Etapas só podem ser adicionadas/alteradas
-- enquanto a versão está DRAFT — depois de PUBLISHED, a versão é
-- congelada (nenhuma alteração estrutural destrutiva é possível
-- enquanto a versão já pode ter instâncias em andamento, seção 20.3);
-- uma mudança estrutural exige criar uma nova versão.
-- ==================================================================
create table if not exists public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  notes text,
  published_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_number),
  unique (id, company_id),
  foreign key (workflow_id, company_id) references public.workflows (id, company_id) on delete cascade
);

-- Só pode existir uma versão PUBLISHED por workflow ao mesmo tempo —
-- fn_publish_workflow_version arquiva a anterior na mesma transação
-- antes de publicar a nova, nunca duas simultâneas.
create unique index if not exists workflow_versions_one_published_idx
  on public.workflow_versions (workflow_id) where status = 'PUBLISHED';
create index if not exists workflow_versions_company_idx on public.workflow_versions (company_id);

comment on table public.workflow_versions is
  'Versão de um workflow. DRAFT = editável (etapas/regras/aprovadores). PUBLISHED = congelada, é a que fn_start_workflow usa para novas instâncias. ARCHIVED = substituída por uma versão mais nova, preservada só para instâncias antigas que já a referenciam (workflow_instances.workflow_version_id).';

-- ==================================================================
-- WORKFLOW_STEPS — etapas de uma versão (seção 20.4). approval_policy
-- resolve aprovação múltipla (seção 20.9: ALL/ANY/QUORUM).
-- quorum_count só é obrigatório quando approval_policy = 'QUORUM'.
-- ==================================================================
create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_version_id uuid not null,
  step_order integer not null check (step_order > 0),
  name text not null,
  description text,
  step_type text not null default 'APPROVAL' check (step_type in ('APPROVAL', 'REVIEW', 'NOTIFICATION')),
  approval_policy text not null default 'ALL' check (approval_policy in ('ALL', 'ANY', 'QUORUM')),
  quorum_count integer check (quorum_count is null or quorum_count > 0),
  is_mandatory boolean not null default true,
  require_justification_on_reject boolean not null default true,
  sla_hours integer check (sla_hours is null or sla_hours > 0),
  created_at timestamptz not null default now(),
  unique (workflow_version_id, step_order),
  unique (id, company_id),
  foreign key (workflow_version_id, company_id) references public.workflow_versions (id, company_id) on delete cascade,
  check (approval_policy <> 'QUORUM' or quorum_count is not null)
);

create index if not exists workflow_steps_version_order_idx on public.workflow_steps (workflow_version_id, step_order);

comment on table public.workflow_steps is
  'Etapa de uma versão de workflow (seção 20.4). approval_policy=ALL exige decisão de todos os aprovadores atribuídos (workflow_step_approvers); ANY exige 1; QUORUM exige quorum_count dentre os atribuídos. sla_hours é só o prazo configurado (seção 20.12) — nenhuma notificação automática implementada nesta fase, estrutura preparada.';

-- ==================================================================
-- WORKFLOW_STEP_APPROVERS — quem pode decidir uma etapa (seção 20.5).
-- Nunca uma estrutura de "funcionário" — sempre usuário (public.users)
-- ou papel (public.roles) já existentes do RBAC (0005).
-- ==================================================================
create table if not exists public.workflow_step_approvers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_step_id uuid not null,
  approver_type text not null check (approver_type in ('USER', 'ROLE')),
  user_id uuid,
  role_id uuid,
  created_at timestamptz not null default now(),
  foreign key (workflow_step_id, company_id) references public.workflow_steps (id, company_id) on delete cascade,
  foreign key (user_id, company_id) references public.user_companies (user_id, company_id) on delete cascade,
  foreign key (role_id, company_id) references public.roles (id, company_id) on delete cascade,
  check (
    (approver_type = 'USER' and user_id is not null and role_id is null) or
    (approver_type = 'ROLE' and role_id is not null and user_id is null)
  )
);

create index if not exists workflow_step_approvers_step_idx on public.workflow_step_approvers (workflow_step_id);

comment on table public.workflow_step_approvers is
  'Aprovador elegível de uma etapa: usuário direto ou qualquer usuário com o papel indicado (aprovação por perfil/grupo, seção 20.5) — resolvida em tempo de execução por fn_start_workflow/fn_decide_approval (0061), nunca fixada estaticamente por nome.';

-- ==================================================================
-- WORKFLOW_RULES — condições/alçadas (seção 20.6/20.7). Uma etapa só
-- entra na instância se TODAS as suas regras forem satisfeitas contra o
-- entity_snapshot (jsonb) capturado no início da instância (0061). Sem
-- regras = etapa sempre aplicável. Base extensível por atributo livre
-- (não fixa em "valor"): qualquer chave presente no snapshot que o
-- módulo chamador decidiu enviar (amount, cost_center_id, document_type,
-- priority, establishment_id, etc.) pode virar uma condição.
-- ==================================================================
create table if not exists public.workflow_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_step_id uuid not null,
  attribute text not null,
  operator text not null check (operator in ('eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'not_in')),
  value jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (workflow_step_id, company_id) references public.workflow_steps (id, company_id) on delete cascade
);

create index if not exists workflow_rules_step_idx on public.workflow_rules (workflow_step_id);

comment on table public.workflow_rules is
  'Condição de alçada de uma etapa (seção 20.6/20.7): a etapa só é materializada na instância se fn_evaluate_workflow_rule(entity_snapshot, attribute, operator, value) for verdadeiro para TODAS as linhas desta etapa (AND). Exemplo de alçada por valor: 3 etapas com regras amount<=1000 / amount>1000 AND amount<=10000 / amount>10000 (duas regras na mesma etapa = AND).';

-- ==================================================================
-- fn_evaluate_workflow_rule — avaliação de uma condição contra o
-- snapshot da entidade. Suporta número, texto e (para in/not_in) array
-- json — nunca assume que o atributo é sempre numérico.
-- ==================================================================
create or replace function public.fn_evaluate_workflow_rule(p_snapshot jsonb, p_attribute text, p_operator text, p_value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_field jsonb;
begin
  v_field := p_snapshot -> p_attribute;
  if v_field is null then
    return false;
  end if;

  if p_operator = 'in' then
    return exists (select 1 from jsonb_array_elements(p_value) v where v = v_field);
  elsif p_operator = 'not_in' then
    return not exists (select 1 from jsonb_array_elements(p_value) v where v = v_field);
  end if;

  -- Comparação numérica quando ambos os lados forem número json;
  -- caso contrário, comparação textual (>=/<= em texto é raro mas não
  -- proibido — ex.: comparar datas ISO como string funciona igual).
  if jsonb_typeof(v_field) = 'number' and jsonb_typeof(p_value) = 'number' then
    return case p_operator
      when 'eq' then (v_field)::text::numeric = (p_value)::text::numeric
      when 'ne' then (v_field)::text::numeric <> (p_value)::text::numeric
      when 'lt' then (v_field)::text::numeric < (p_value)::text::numeric
      when 'lte' then (v_field)::text::numeric <= (p_value)::text::numeric
      when 'gt' then (v_field)::text::numeric > (p_value)::text::numeric
      when 'gte' then (v_field)::text::numeric >= (p_value)::text::numeric
      else false
    end;
  end if;

  return case p_operator
    when 'eq' then v_field = p_value
    when 'ne' then v_field <> p_value
    when 'lt' then v_field::text < p_value::text
    when 'lte' then v_field::text <= p_value::text
    when 'gt' then v_field::text > p_value::text
    when 'gte' then v_field::text >= p_value::text
    else false
  end;
end;
$$;

-- ==================================================================
-- fn_create_workflow
-- ==================================================================
create or replace function public.fn_create_workflow(
  p_company_id uuid,
  p_code text,
  p_name text,
  p_module text,
  p_entity_type text,
  p_description text default null
)
returns public.workflows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow public.workflows;
begin
  if not public.has_permission(p_company_id, 'workflow.create') then
    raise exception 'Permissão negada (workflow.create).' using errcode = '42501';
  end if;

  insert into public.workflows (company_id, code, name, module, entity_type, description, created_by)
  values (p_company_id, p_code, p_name, p_module, p_entity_type, p_description, public.current_app_user_id())
  returning * into v_workflow;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'workflows', v_workflow.id, 'CREATE', null,
    jsonb_build_object('code', p_code, 'entity_type', p_entity_type));

  return v_workflow;
end;
$$;

create or replace function public.fn_update_workflow(
  p_workflow_id uuid,
  p_name text default null,
  p_description text default null
)
returns public.workflows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow public.workflows;
begin
  select * into v_workflow from public.workflows where id = p_workflow_id;
  if not found then
    raise exception 'Workflow não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_workflow.company_id, 'workflow.update') then
    raise exception 'Permissão negada (workflow.update).' using errcode = '42501';
  end if;

  update public.workflows
  set name = coalesce(p_name, name), description = coalesce(p_description, description)
  where id = p_workflow_id
  returning * into v_workflow;

  return v_workflow;
end;
$$;

create or replace function public.fn_set_workflow_status(p_workflow_id uuid, p_status text)
returns public.workflows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow public.workflows;
begin
  if p_status not in ('active', 'inactive') then
    raise exception 'Status inválido: %.', p_status using errcode = '22023';
  end if;

  select * into v_workflow from public.workflows where id = p_workflow_id;
  if not found then
    raise exception 'Workflow não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_workflow.company_id, 'workflow.activate') then
    raise exception 'Permissão negada (workflow.activate).' using errcode = '42501';
  end if;

  update public.workflows set status = p_status where id = p_workflow_id returning * into v_workflow;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_workflow.company_id, public.current_app_user_id(), 'system', 'workflows', v_workflow.id,
    case when p_status = 'active' then 'ACTIVATE' else 'INACTIVATE' end, null, jsonb_build_object('status', p_status));

  return v_workflow;
end;
$$;

-- ==================================================================
-- fn_create_workflow_version — próximo número sequencial por workflow
-- (nunca MAX+1 solto: calculado e inserido na mesma instrução, e a
-- unicidade (workflow_id, version_number) é a rede de segurança contra
-- duas criações concorrentes colidirem no mesmo número).
-- ==================================================================
create or replace function public.fn_create_workflow_version(p_workflow_id uuid, p_notes text default null)
returns public.workflow_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow public.workflows;
  v_version public.workflow_versions;
  v_next_number integer;
begin
  select * into v_workflow from public.workflows where id = p_workflow_id for update;
  if not found then
    raise exception 'Workflow não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_workflow.company_id, 'workflow.admin') then
    raise exception 'Permissão negada (workflow.admin).' using errcode = '42501';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_number
  from public.workflow_versions where workflow_id = p_workflow_id;

  insert into public.workflow_versions (company_id, workflow_id, version_number, notes, created_by)
  values (v_workflow.company_id, p_workflow_id, v_next_number, p_notes, public.current_app_user_id())
  returning * into v_version;

  return v_version;
end;
$$;

create or replace function public.fn_add_workflow_step(
  p_workflow_version_id uuid,
  p_step_order integer,
  p_name text,
  p_description text default null,
  p_step_type text default 'APPROVAL',
  p_approval_policy text default 'ALL',
  p_quorum_count integer default null,
  p_is_mandatory boolean default true,
  p_require_justification_on_reject boolean default true,
  p_sla_hours integer default null
)
returns public.workflow_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version public.workflow_versions;
  v_step public.workflow_steps;
begin
  select * into v_version from public.workflow_versions where id = p_workflow_version_id for update;
  if not found then
    raise exception 'Versão de workflow não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_version.company_id, 'workflow.admin') then
    raise exception 'Permissão negada (workflow.admin).' using errcode = '42501';
  end if;

  if v_version.status <> 'DRAFT' then
    raise exception 'Só é possível adicionar etapas a uma versão em rascunho (status atual: %). Crie uma nova versão.', v_version.status using errcode = 'P0001';
  end if;

  insert into public.workflow_steps (
    company_id, workflow_version_id, step_order, name, description, step_type, approval_policy, quorum_count,
    is_mandatory, require_justification_on_reject, sla_hours
  ) values (
    v_version.company_id, p_workflow_version_id, p_step_order, p_name, p_description, coalesce(p_step_type, 'APPROVAL'),
    coalesce(p_approval_policy, 'ALL'), p_quorum_count, coalesce(p_is_mandatory, true),
    coalesce(p_require_justification_on_reject, true), p_sla_hours
  )
  returning * into v_step;

  return v_step;
end;
$$;

create or replace function public.fn_add_workflow_step_approver(
  p_workflow_step_id uuid,
  p_approver_type text,
  p_user_id uuid default null,
  p_role_id uuid default null
)
returns public.workflow_step_approvers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.workflow_steps;
  v_version public.workflow_versions;
  v_approver public.workflow_step_approvers;
begin
  select * into v_step from public.workflow_steps where id = p_workflow_step_id;
  if not found then
    raise exception 'Etapa de workflow não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_version from public.workflow_versions where id = v_step.workflow_version_id;

  if not public.has_permission(v_step.company_id, 'workflow.admin') then
    raise exception 'Permissão negada (workflow.admin).' using errcode = '42501';
  end if;

  if v_version.status <> 'DRAFT' then
    raise exception 'Só é possível editar aprovadores de uma versão em rascunho (status atual: %).', v_version.status using errcode = 'P0001';
  end if;

  insert into public.workflow_step_approvers (company_id, workflow_step_id, approver_type, user_id, role_id)
  values (v_step.company_id, p_workflow_step_id, p_approver_type, p_user_id, p_role_id)
  returning * into v_approver;

  return v_approver;
end;
$$;

create or replace function public.fn_add_workflow_rule(
  p_workflow_step_id uuid,
  p_attribute text,
  p_operator text,
  p_value jsonb
)
returns public.workflow_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.workflow_steps;
  v_version public.workflow_versions;
  v_rule public.workflow_rules;
begin
  select * into v_step from public.workflow_steps where id = p_workflow_step_id;
  if not found then
    raise exception 'Etapa de workflow não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_version from public.workflow_versions where id = v_step.workflow_version_id;

  if not public.has_permission(v_step.company_id, 'workflow.admin') then
    raise exception 'Permissão negada (workflow.admin).' using errcode = '42501';
  end if;

  if v_version.status <> 'DRAFT' then
    raise exception 'Só é possível editar regras de uma versão em rascunho (status atual: %).', v_version.status using errcode = 'P0001';
  end if;

  insert into public.workflow_rules (company_id, workflow_step_id, attribute, operator, value)
  values (v_step.company_id, p_workflow_step_id, p_attribute, p_operator, p_value)
  returning * into v_rule;

  return v_rule;
end;
$$;

-- ==================================================================
-- fn_publish_workflow_version — congela a versão (DRAFT -> PUBLISHED) e
-- arquiva a versão PUBLISHED anterior do mesmo workflow, se existir, na
-- MESMA transação (nunca duas PUBLISHED simultâneas — reforçado também
-- pelo índice único parcial workflow_versions_one_published_idx).
-- ==================================================================
create or replace function public.fn_publish_workflow_version(p_workflow_version_id uuid)
returns public.workflow_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version public.workflow_versions;
  v_step_count integer;
begin
  select * into v_version from public.workflow_versions where id = p_workflow_version_id for update;
  if not found then
    raise exception 'Versão de workflow não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_version.company_id, 'workflow.admin') then
    raise exception 'Permissão negada (workflow.admin).' using errcode = '42501';
  end if;

  if v_version.status <> 'DRAFT' then
    raise exception 'Só é possível publicar uma versão em rascunho (status atual: %).', v_version.status using errcode = 'P0001';
  end if;

  select count(*) into v_step_count from public.workflow_steps where workflow_version_id = p_workflow_version_id;
  if v_step_count = 0 then
    raise exception 'A versão precisa de ao menos uma etapa para ser publicada.' using errcode = 'P0001';
  end if;

  update public.workflow_versions
  set status = 'ARCHIVED'
  where workflow_id = v_version.workflow_id and status = 'PUBLISHED';

  update public.workflow_versions
  set status = 'PUBLISHED', published_at = now()
  where id = p_workflow_version_id
  returning * into v_version;

  return v_version;
end;
$$;

revoke all on function public.fn_create_workflow(uuid, text, text, text, text, text) from public;
revoke all on function public.fn_update_workflow(uuid, text, text) from public;
revoke all on function public.fn_set_workflow_status(uuid, text) from public;
revoke all on function public.fn_create_workflow_version(uuid, text) from public;
revoke all on function public.fn_add_workflow_step(uuid, integer, text, text, text, text, integer, boolean, boolean, integer) from public;
revoke all on function public.fn_add_workflow_step_approver(uuid, text, uuid, uuid) from public;
revoke all on function public.fn_add_workflow_rule(uuid, text, text, jsonb) from public;
revoke all on function public.fn_publish_workflow_version(uuid) from public;
grant execute on function public.fn_create_workflow(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.fn_update_workflow(uuid, text, text) to authenticated;
grant execute on function public.fn_set_workflow_status(uuid, text) to authenticated;
grant execute on function public.fn_create_workflow_version(uuid, text) to authenticated;
grant execute on function public.fn_add_workflow_step(uuid, integer, text, text, text, text, integer, boolean, boolean, integer) to authenticated;
grant execute on function public.fn_add_workflow_step_approver(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.fn_add_workflow_rule(uuid, text, text, jsonb) to authenticated;
grant execute on function public.fn_publish_workflow_version(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('workflow.view', 'workflow', 'view', 'Consultar workflows, versões, etapas e instâncias'),
    ('workflow.create', 'workflow', 'create', 'Criar workflows'),
    ('workflow.update', 'workflow', 'update', 'Editar nome/descrição de um workflow'),
    ('workflow.activate', 'workflow', 'activate', 'Ativar/desativar um workflow'),
    ('workflow.admin', 'workflow', 'admin', 'Gerenciar versões, etapas, aprovadores e regras de alçada de um workflow'),
    ('workflow.execute', 'workflow', 'execute', 'Iniciar uma instância de workflow para um documento'),
    ('workflow.approve', 'workflow', 'approve', 'Aprovar ou retornar uma etapa de workflow pendente'),
    ('workflow.reject', 'workflow', 'reject', 'Rejeitar uma etapa de workflow pendente'),
    ('workflow.cancel', 'workflow', 'cancel', 'Cancelar uma instância de workflow em andamento')
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
alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_step_approvers enable row level security;
alter table public.workflow_rules enable row level security;

drop policy if exists workflows_select on public.workflows;
create policy workflows_select on public.workflows
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists workflow_versions_select on public.workflow_versions;
create policy workflow_versions_select on public.workflow_versions
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists workflow_steps_select on public.workflow_steps;
create policy workflow_steps_select on public.workflow_steps
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists workflow_step_approvers_select on public.workflow_step_approvers;
create policy workflow_step_approvers_select on public.workflow_step_approvers
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists workflow_rules_select on public.workflow_rules;
create policy workflow_rules_select on public.workflow_rules
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));
