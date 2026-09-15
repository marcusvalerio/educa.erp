-- Fase 20 — Workflow + Aprovações: EXECUÇÃO (instâncias, aprovações,
-- decisões, histórico). Ver 0060 para a definição (workflow -> versão
-- -> etapas -> aprovadores -> regras).
--
-- Concorrência (seção 20.9/20.14): fn_decide_approval trava a linha de
-- public.workflow_instance_steps (FOR UPDATE) antes de reler o status e
-- os contadores — duas decisões simultâneas na mesma etapa serializam
-- nesta trava, nunca produzem uma contagem perdida (mesmo padrão de
-- fn_next_document_number, 0053).

-- ==================================================================
-- WORKFLOW_INSTANCES — referencia o DOCUMENTO original só por
-- (entity_type, entity_id), polimórfico e sem FK (seção 20.10: "não
-- duplicar Sales Order, Purchase Order etc. — workflow referencia o
-- documento"). entity_snapshot é o conjunto de atributos que o
-- chamador decidiu expor para avaliação de alçada (workflow_rules) no
-- momento do início — não é atualizado depois (a alçada é decidida com
-- os dados de quando a aprovação foi solicitada).
-- ==================================================================
create table if not exists public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null,
  workflow_version_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED')),
  current_step_id uuid,
  entity_snapshot jsonb not null default '{}'::jsonb,
  started_by uuid references public.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (workflow_id, company_id) references public.workflows (id, company_id) on delete restrict,
  foreign key (workflow_version_id, company_id) references public.workflow_versions (id, company_id) on delete restrict
);

-- Idempotência (seção 20.10/20.14): uma mesma entidade não pode ter duas
-- instâncias simultaneamente em aberto — reenviar a mesma entidade
-- enquanto já existe uma instância PENDING/IN_PROGRESS devolve a
-- existente (fn_start_workflow), nunca duplica.
create unique index if not exists workflow_instances_open_unique
  on public.workflow_instances (company_id, entity_type, entity_id)
  where status in ('PENDING', 'IN_PROGRESS');
create index if not exists workflow_instances_company_status_idx on public.workflow_instances (company_id, status);
create index if not exists workflow_instances_entity_idx on public.workflow_instances (company_id, entity_type, entity_id);

comment on table public.workflow_instances is
  'Execução de um workflow sobre um documento específico. entity_id é polimórfico (sem FK, mesmo padrão de stock_movements.reference_id/fiscal_documents.source_id) — o motor nunca lê nem escreve a tabela de negócio, só é referenciado por ela.';

-- ==================================================================
-- WORKFLOW_INSTANCE_STEPS — materialização, POR INSTÂNCIA, das etapas
-- da versão que passaram no filtro de workflow_rules (seção 20.7).
-- ==================================================================
create table if not exists public.workflow_instance_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_instance_id uuid not null,
  workflow_step_id uuid not null,
  step_order integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED', 'CANCELLED')),
  required_approvals integer not null check (required_approvals > 0),
  received_approvals integer not null default 0 check (received_approvals >= 0),
  due_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_instance_id, step_order),
  unique (id, company_id),
  foreign key (workflow_instance_id, company_id) references public.workflow_instances (id, company_id) on delete cascade,
  foreign key (workflow_step_id, company_id) references public.workflow_steps (id, company_id) on delete restrict
);

create index if not exists workflow_instance_steps_instance_idx on public.workflow_instance_steps (workflow_instance_id, step_order);
create index if not exists workflow_instance_steps_status_idx on public.workflow_instance_steps (company_id, status);

alter table public.workflow_instances
  add constraint workflow_instances_current_step_fk
  foreign key (current_step_id, company_id) references public.workflow_instance_steps (id, company_id) on delete set null;

comment on table public.workflow_instance_steps is
  'Etapa materializada de uma instância — só as etapas cujas workflow_rules casaram com o entity_snapshot aparecem aqui (as demais são omitidas, não "SKIPPED"; SKIPPED fica reservado para uma etapa que entrou mas foi pulada por decisão futura). due_at = started_at + workflow_steps.sla_hours (seção 20.12), calculado no momento em que a etapa vira IN_PROGRESS.';

-- ==================================================================
-- APPROVALS — tarefa de aprovação atribuída (quem PODE decidir), uma
-- linha por aprovador elegível materializado a partir de
-- workflow_step_approvers no momento em que a etapa vira IN_PROGRESS.
-- ==================================================================
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_instance_step_id uuid not null,
  approver_type text not null check (approver_type in ('USER', 'ROLE')),
  user_id uuid,
  role_id uuid,
  status text not null default 'PENDING' check (status in ('PENDING', 'DECIDED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  foreign key (workflow_instance_step_id, company_id) references public.workflow_instance_steps (id, company_id) on delete cascade,
  check (
    (approver_type = 'USER' and user_id is not null and role_id is null) or
    (approver_type = 'ROLE' and role_id is not null and user_id is null)
  )
);

create index if not exists approvals_step_idx on public.approvals (workflow_instance_step_id);
create index if not exists approvals_user_pending_idx on public.approvals (user_id, status) where status = 'PENDING';
create index if not exists approvals_role_pending_idx on public.approvals (role_id, status) where status = 'PENDING';

comment on table public.approvals is
  'Tarefa de aprovação atribuída (quem PODE decidir) — uma linha por aprovador elegível da etapa, materializada quando ela vira IN_PROGRESS. Distinta de approval_decisions (o que FOI decidido): permite a um aprovador por papel (ROLE) qualquer usuário com aquele papel decidir a mesma linha (a primeira decisão a travar a linha "ganha", seção 20.9 — concorrência).';

-- ==================================================================
-- APPROVAL_DECISIONS — o que foi decidido, por quem, quando.
-- ==================================================================
create table if not exists public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  approval_id uuid not null,
  workflow_instance_step_id uuid not null,
  decided_by uuid references public.users(id) on delete set null,
  decision text not null check (decision in ('APPROVED', 'REJECTED', 'RETURNED')),
  justification text,
  context jsonb,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (approval_id, company_id) references public.approvals (id, company_id) on delete cascade,
  foreign key (workflow_instance_step_id, company_id) references public.workflow_instance_steps (id, company_id) on delete cascade
);

create index if not exists approval_decisions_step_idx on public.approval_decisions (workflow_instance_step_id);

comment on table public.approval_decisions is
  'Decisão individual registrada (seção 20.8). justification é obrigatória quando decision=REJECTED e a etapa exige (workflow_steps.require_justification_on_reject) — validado em fn_decide_approval, nunca só no frontend.';

-- ==================================================================
-- APPROVAL_HISTORY — ledger append-only da instância (seção 20.11).
-- ==================================================================
create table if not exists public.approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_instance_id uuid not null,
  workflow_instance_step_id uuid,
  event_type text not null check (event_type in (
    'STARTED', 'STEP_ADVANCED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'FINISHED'
  )),
  actor_user_id uuid references public.users(id) on delete set null,
  message text,
  payload jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (workflow_instance_id, company_id) references public.workflow_instances (id, company_id) on delete cascade
);

create index if not exists approval_history_instance_idx on public.approval_history (workflow_instance_id, occurred_at);

comment on table public.approval_history is
  'Ledger insert-only da instância (seção 20.11) — nunca atualizado ou apagado, mesmo padrão de fiscal_document_events (0039) e stock_movements.';

-- ==================================================================
-- fn_materialize_workflow_instance_step — função interna (não exposta
-- a `authenticated`): cria a linha de workflow_instance_steps para uma
-- etapa aplicável e já materializa suas approvals a partir de
-- workflow_step_approvers. Reaproveitada tanto pelo início da instância
-- quanto pelo avanço para a próxima etapa.
-- ==================================================================
create or replace function public.fn_materialize_workflow_instance_step(
  p_workflow_instance_id uuid,
  p_company_id uuid,
  p_step public.workflow_steps,
  p_activate boolean
)
returns public.workflow_instance_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_instance_step public.workflow_instance_steps;
  v_approver_count integer;
  v_required integer;
begin
  select count(*) into v_approver_count from public.workflow_step_approvers where workflow_step_id = p_step.id;
  if v_approver_count = 0 then
    raise exception 'Etapa "%" não possui aprovadores configurados.', p_step.name using errcode = 'P0001';
  end if;

  v_required := case p_step.approval_policy
    when 'ANY' then 1
    when 'QUORUM' then p_step.quorum_count
    else v_approver_count
  end;

  insert into public.workflow_instance_steps (
    company_id, workflow_instance_id, workflow_step_id, step_order, status, required_approvals,
    due_at, started_at
  ) values (
    p_company_id, p_workflow_instance_id, p_step.id, p_step.step_order,
    case when p_activate then 'IN_PROGRESS' else 'PENDING' end,
    v_required,
    case when p_activate and p_step.sla_hours is not null then now() + make_interval(hours => p_step.sla_hours) else null end,
    case when p_activate then now() else null end
  )
  returning * into v_instance_step;

  if p_activate then
    insert into public.approvals (company_id, workflow_instance_step_id, approver_type, user_id, role_id)
    select p_company_id, v_instance_step.id, wsa.approver_type, wsa.user_id, wsa.role_id
    from public.workflow_step_approvers wsa
    where wsa.workflow_step_id = p_step.id;
  end if;

  return v_instance_step;
end;
$$;

revoke all on function public.fn_materialize_workflow_instance_step(uuid, uuid, public.workflow_steps, boolean) from public;
revoke all on function public.fn_materialize_workflow_instance_step(uuid, uuid, public.workflow_steps, boolean) from authenticated;

-- ==================================================================
-- fn_start_workflow — ponto de entrada explícito de integração (seção
-- 20.13/20.14): nunca disparado automaticamente por um trigger em uma
-- tabela de negócio — sempre uma chamada explícita da API/módulo
-- chamador. Idempotente por entidade em aberto.
-- ==================================================================
create or replace function public.fn_start_workflow(
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_snapshot jsonb default '{}'::jsonb,
  p_workflow_code text default null
)
returns public.workflow_instances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow public.workflows;
  v_version public.workflow_versions;
  v_existing public.workflow_instances;
  v_instance public.workflow_instances;
  v_step record;
  v_instance_step public.workflow_instance_steps;
  v_first_step_id uuid;
  v_is_first boolean;
  v_applicable boolean;
  v_rule record;
  v_match_count integer;
begin
  if not public.has_permission(p_company_id, 'workflow.execute') then
    raise exception 'Permissão negada (workflow.execute).' using errcode = '42501';
  end if;

  select * into v_existing from public.workflow_instances
  where company_id = p_company_id and entity_type = p_entity_type and entity_id = p_entity_id
    and status in ('PENDING', 'IN_PROGRESS');
  if found then
    return v_existing;
  end if;

  if p_workflow_code is not null then
    select * into v_workflow from public.workflows
    where company_id = p_company_id and code = p_workflow_code and status = 'active';
    if not found then
      raise exception 'Workflow "%" não encontrado ou inativo.', p_workflow_code using errcode = 'P0002';
    end if;
  else
    -- SELECT INTO só toma a primeira linha silenciosamente mesmo com
    -- mais de um resultado (sem STRICT) — por isso a ambiguidade é
    -- detectada por COUNT explícito, nunca inferida de "not found".
    select count(*) into v_match_count from public.workflows
    where company_id = p_company_id and entity_type = p_entity_type and status = 'active';

    if v_match_count = 0 then
      raise exception 'Nenhum workflow ativo encontrado para entity_type=%.', p_entity_type using errcode = 'P0002';
    elsif v_match_count > 1 then
      raise exception 'Mais de um workflow ativo encontrado para entity_type=% — informe workflowCode explicitamente.', p_entity_type using errcode = 'P0001';
    end if;

    select * into v_workflow from public.workflows
    where company_id = p_company_id and entity_type = p_entity_type and status = 'active';
  end if;

  select * into v_version from public.workflow_versions where workflow_id = v_workflow.id and status = 'PUBLISHED';
  if not found then
    raise exception 'Workflow "%" não possui versão publicada.', v_workflow.code using errcode = 'P0001';
  end if;

  insert into public.workflow_instances (
    company_id, workflow_id, workflow_version_id, entity_type, entity_id, status, entity_snapshot, started_by
  ) values (
    p_company_id, v_workflow.id, v_version.id, p_entity_type, p_entity_id, 'IN_PROGRESS', coalesce(p_entity_snapshot, '{}'::jsonb),
    public.current_app_user_id()
  )
  returning * into v_instance;

  v_is_first := true;
  for v_step in select * from public.workflow_steps where workflow_version_id = v_version.id order by step_order
  loop
    v_applicable := true;
    for v_rule in select * from public.workflow_rules where workflow_step_id = v_step.id
    loop
      if not public.fn_evaluate_workflow_rule(v_instance.entity_snapshot, v_rule.attribute, v_rule.operator, v_rule.value) then
        v_applicable := false;
        exit;
      end if;
    end loop;

    if v_applicable then
      v_instance_step := public.fn_materialize_workflow_instance_step(v_instance.id, p_company_id, v_step, v_is_first);
      if v_is_first then
        v_first_step_id := v_instance_step.id;
        v_is_first := false;
      end if;
    end if;
  end loop;

  if v_first_step_id is null then
    raise exception 'Nenhuma etapa aplicável para os critérios informados (verifique as regras de alçada do workflow "%").', v_workflow.code using errcode = 'P0001';
  end if;

  update public.workflow_instances set current_step_id = v_first_step_id where id = v_instance.id
  returning * into v_instance;

  insert into public.approval_history (company_id, workflow_instance_id, workflow_instance_step_id, event_type, actor_user_id, message)
  values (p_company_id, v_instance.id, v_first_step_id, 'STARTED', public.current_app_user_id(),
    format('Workflow "%s" iniciado para %s/%s.', v_workflow.code, p_entity_type, p_entity_id));

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'workflow_instances', v_instance.id, 'CREATE', null,
    jsonb_build_object('workflow_code', v_workflow.code, 'entity_type', p_entity_type, 'entity_id', p_entity_id));

  return v_instance;
end;
$$;

-- ==================================================================
-- fn_decide_approval — núcleo transacional (seção 20.14). Trava
-- workflow_instance_steps FOR UPDATE antes de qualquer leitura de
-- contador — serializa decisões concorrentes na mesma etapa.
-- ==================================================================
create or replace function public.fn_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_justification text default null
)
returns public.workflow_instances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_approval public.approvals;
  v_instance_step public.workflow_instance_steps;
  v_step public.workflow_steps;
  v_instance public.workflow_instances;
  v_eligible boolean;
  v_received integer;
  v_next_step record;
  v_next_instance_step public.workflow_instance_steps;
  v_current_user uuid;
begin
  if p_decision not in ('APPROVED', 'REJECTED', 'RETURNED') then
    raise exception 'Decisão inválida: %.', p_decision using errcode = '22023';
  end if;

  select * into v_approval from public.approvals where id = p_approval_id;
  if not found then
    raise exception 'Aprovação não encontrada.' using errcode = 'P0002';
  end if;

  -- Trava a etapa (não só a linha de approvals): garante que a leitura/
  -- escrita de received_approvals e o avanço de etapa fiquem
  -- serializados mesmo que duas approvals distintas da mesma etapa
  -- sejam decididas ao mesmo tempo.
  select * into v_instance_step from public.workflow_instance_steps where id = v_approval.workflow_instance_step_id for update;
  if not found then
    raise exception 'Etapa de instância não encontrada.' using errcode = 'P0002';
  end if;

  -- Relê a approval já sob a trava da etapa (idempotência: uma segunda
  -- chamada para a mesma approval falha aqui, nunca decide duas vezes).
  select * into v_approval from public.approvals where id = p_approval_id;
  if v_approval.status <> 'PENDING' then
    raise exception 'Esta aprovação já foi decidida ou cancelada.' using errcode = 'P0001';
  end if;

  if v_instance_step.status <> 'IN_PROGRESS' then
    raise exception 'Esta etapa não está aguardando decisão (status atual: %).', v_instance_step.status using errcode = 'P0001';
  end if;

  select * into v_step from public.workflow_steps where id = v_instance_step.workflow_step_id;
  select * into v_instance from public.workflow_instances where id = v_instance_step.workflow_instance_id;

  if not public.has_permission(v_instance.company_id, case when p_decision = 'REJECTED' then 'workflow.reject' else 'workflow.approve' end) then
    raise exception 'Permissão negada (%).', case when p_decision = 'REJECTED' then 'workflow.reject' else 'workflow.approve' end using errcode = '42501';
  end if;

  v_current_user := public.current_app_user_id();
  if v_approval.approver_type = 'USER' then
    v_eligible := v_approval.user_id = v_current_user;
  else
    v_eligible := exists (
      select 1 from public.user_roles ur
      where ur.company_id = v_instance.company_id and ur.user_id = v_current_user and ur.role_id = v_approval.role_id
    );
  end if;

  if not v_eligible then
    raise exception 'Você não é um aprovador elegível para esta etapa.' using errcode = '42501';
  end if;

  if p_decision = 'REJECTED' and v_step.require_justification_on_reject and coalesce(trim(p_justification), '') = '' then
    raise exception 'Justificativa obrigatória para rejeitar esta etapa.' using errcode = 'P0001';
  end if;

  insert into public.approval_decisions (company_id, approval_id, workflow_instance_step_id, decided_by, decision, justification)
  values (v_instance.company_id, p_approval_id, v_instance_step.id, v_current_user, p_decision, p_justification);

  update public.approvals set status = 'DECIDED' where id = p_approval_id;

  insert into public.approval_history (company_id, workflow_instance_id, workflow_instance_step_id, event_type, actor_user_id, message)
  values (v_instance.company_id, v_instance.id, v_instance_step.id, p_decision, v_current_user,
    coalesce(p_justification, format('Decisão: %s.', p_decision)));

  if p_decision = 'REJECTED' then
    update public.workflow_instance_steps set status = 'REJECTED', finished_at = now() where id = v_instance_step.id;
    update public.workflow_instances set status = 'REJECTED', finished_at = now() where id = v_instance.id returning * into v_instance;
    insert into public.approval_history (company_id, workflow_instance_id, event_type, actor_user_id, message)
    values (v_instance.company_id, v_instance.id, 'FINISHED', v_current_user, 'Workflow finalizado: rejeitado.');
    return v_instance;
  end if;

  if p_decision = 'RETURNED' then
    update public.workflow_instance_steps set status = 'RETURNED', finished_at = now() where id = v_instance_step.id;
    update public.workflow_instances set status = 'RETURNED', finished_at = now() where id = v_instance.id returning * into v_instance;
    insert into public.approval_history (company_id, workflow_instance_id, event_type, actor_user_id, message)
    values (v_instance.company_id, v_instance.id, 'FINISHED', v_current_user, 'Workflow finalizado: retornado para correção.');
    return v_instance;
  end if;

  -- APPROVED
  select count(*) into v_received from public.approval_decisions
  where workflow_instance_step_id = v_instance_step.id and decision = 'APPROVED';

  update public.workflow_instance_steps set received_approvals = v_received where id = v_instance_step.id;

  if v_received < v_instance_step.required_approvals then
    -- Etapa ainda aguarda mais decisões (ANY já teria fechado com 1;
    -- ALL/QUORUM continuam IN_PROGRESS).
    return v_instance;
  end if;

  update public.workflow_instance_steps set status = 'APPROVED', finished_at = now() where id = v_instance_step.id;

  select ws.* into v_next_step from public.workflow_steps ws
  join public.workflow_instance_steps wis on wis.workflow_step_id = ws.id and wis.workflow_instance_id = v_instance.id
  where wis.step_order > v_instance_step.step_order and wis.status = 'PENDING'
  order by wis.step_order
  limit 1;

  if found then
    select wis.* into v_next_instance_step from public.workflow_instance_steps wis
    where wis.workflow_instance_id = v_instance.id and wis.workflow_step_id = v_next_step.id;

    update public.workflow_instance_steps
    set status = 'IN_PROGRESS', started_at = now(),
        due_at = case when v_next_step.sla_hours is not null then now() + make_interval(hours => v_next_step.sla_hours) else null end
    where id = v_next_instance_step.id;

    insert into public.approvals (company_id, workflow_instance_step_id, approver_type, user_id, role_id)
    select v_instance.company_id, v_next_instance_step.id, wsa.approver_type, wsa.user_id, wsa.role_id
    from public.workflow_step_approvers wsa
    where wsa.workflow_step_id = v_next_step.id;

    update public.workflow_instances set current_step_id = v_next_instance_step.id where id = v_instance.id returning * into v_instance;

    insert into public.approval_history (company_id, workflow_instance_id, workflow_instance_step_id, event_type, actor_user_id, message)
    values (v_instance.company_id, v_instance.id, v_next_instance_step.id, 'STEP_ADVANCED', v_current_user,
      format('Avançou para a etapa "%s".', v_next_step.name));
  else
    update public.workflow_instances set status = 'APPROVED', finished_at = now() where id = v_instance.id returning * into v_instance;
    insert into public.approval_history (company_id, workflow_instance_id, event_type, actor_user_id, message)
    values (v_instance.company_id, v_instance.id, 'FINISHED', v_current_user, 'Workflow finalizado: aprovado.');
  end if;

  return v_instance;
end;
$$;

-- ==================================================================
-- fn_cancel_workflow_instance
-- ==================================================================
create or replace function public.fn_cancel_workflow_instance(p_workflow_instance_id uuid, p_reason text default null)
returns public.workflow_instances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_instance public.workflow_instances;
begin
  select * into v_instance from public.workflow_instances where id = p_workflow_instance_id for update;
  if not found then
    raise exception 'Instância de workflow não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_instance.company_id, 'workflow.cancel') then
    raise exception 'Permissão negada (workflow.cancel).' using errcode = '42501';
  end if;

  if v_instance.status not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'Só é possível cancelar uma instância pendente/em andamento (status atual: %).', v_instance.status using errcode = 'P0001';
  end if;

  update public.workflow_instance_steps set status = 'CANCELLED', finished_at = now()
  where workflow_instance_id = p_workflow_instance_id and status in ('PENDING', 'IN_PROGRESS');

  update public.approvals set status = 'CANCELLED'
  where status = 'PENDING' and workflow_instance_step_id in (
    select id from public.workflow_instance_steps where workflow_instance_id = p_workflow_instance_id
  );

  update public.workflow_instances set status = 'CANCELLED', finished_at = now() where id = p_workflow_instance_id
  returning * into v_instance;

  insert into public.approval_history (company_id, workflow_instance_id, event_type, actor_user_id, message)
  values (v_instance.company_id, v_instance.id, 'CANCELLED', public.current_app_user_id(), coalesce(p_reason, 'Workflow cancelado.'));

  return v_instance;
end;
$$;

-- ==================================================================
-- fn_workflow_pending_approvals — pendências do usuário autenticado
-- (seção 20.15 "pendências"), diretas (USER) ou por papel (ROLE).
-- ==================================================================
create or replace function public.fn_workflow_pending_approvals(p_company_id uuid)
returns table (
  approval_id uuid,
  workflow_instance_id uuid,
  workflow_instance_step_id uuid,
  workflow_code text,
  workflow_name text,
  step_name text,
  entity_type text,
  entity_id uuid,
  approver_type text,
  due_at timestamptz,
  started_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  if not public.has_permission(p_company_id, 'workflow.view') then
    raise exception 'Permissão negada (workflow.view).' using errcode = '42501';
  end if;

  v_user := public.current_app_user_id();

  return query
  select a.id, wi.id, wis.id, w.code, w.name, ws.name, wi.entity_type, wi.entity_id, a.approver_type, wis.due_at, wis.started_at
  from public.approvals a
  join public.workflow_instance_steps wis on wis.id = a.workflow_instance_step_id
  join public.workflow_instances wi on wi.id = wis.workflow_instance_id
  join public.workflows w on w.id = wi.workflow_id
  join public.workflow_steps ws on ws.id = wis.workflow_step_id
  where a.company_id = p_company_id
    and a.status = 'PENDING'
    and wis.status = 'IN_PROGRESS'
    and (
      (a.approver_type = 'USER' and a.user_id = v_user)
      or (a.approver_type = 'ROLE' and exists (
        select 1 from public.user_roles ur where ur.company_id = p_company_id and ur.user_id = v_user and ur.role_id = a.role_id
      ))
    )
  order by wis.due_at nulls last, wis.started_at;
end;
$$;

revoke all on function public.fn_start_workflow(uuid, text, uuid, jsonb, text) from public;
revoke all on function public.fn_decide_approval(uuid, text, text) from public;
revoke all on function public.fn_cancel_workflow_instance(uuid, text) from public;
revoke all on function public.fn_workflow_pending_approvals(uuid) from public;
grant execute on function public.fn_start_workflow(uuid, text, uuid, jsonb, text) to authenticated;
grant execute on function public.fn_decide_approval(uuid, text, text) to authenticated;
grant execute on function public.fn_cancel_workflow_instance(uuid, text) to authenticated;
grant execute on function public.fn_workflow_pending_approvals(uuid) to authenticated;

-- ==================================================================
-- RLS — select-only; toda escrita via função.
-- ==================================================================
alter table public.workflow_instances enable row level security;
alter table public.workflow_instance_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.approval_history enable row level security;

drop policy if exists workflow_instances_select on public.workflow_instances;
create policy workflow_instances_select on public.workflow_instances
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists workflow_instance_steps_select on public.workflow_instance_steps;
create policy workflow_instance_steps_select on public.workflow_instance_steps
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists approval_decisions_select on public.approval_decisions;
create policy approval_decisions_select on public.approval_decisions
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));

drop policy if exists approval_history_select on public.approval_history;
create policy approval_history_select on public.approval_history
  for select to authenticated using (public.has_permission(company_id, 'workflow.view'));
