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

  select * into v_instance_step from public.workflow_instance_steps where id = v_approval.workflow_instance_step_id for update;
  if not found then
    raise exception 'Etapa de instância não encontrada.' using errcode = 'P0002';
  end if;

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
      where ur.user_id = v_current_user and ur.role_id = v_approval.role_id
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

  select count(*) into v_received from public.approval_decisions
  where workflow_instance_step_id = v_instance_step.id and decision = 'APPROVED';

  update public.workflow_instance_steps set received_approvals = v_received where id = v_instance_step.id;

  if v_received < v_instance_step.required_approvals then
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
        select 1 from public.user_roles ur where ur.user_id = v_user and ur.role_id = a.role_id
      ))
    )
  order by wis.due_at nulls last, wis.started_at;
end;
$$;
