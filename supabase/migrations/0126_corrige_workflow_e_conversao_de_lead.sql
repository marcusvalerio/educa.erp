-- 0126 — Correções de falhas reais (reaplicável).
--
-- 1. fn_start_workflow declarava v_step como "record" e o passava para
--    fn_materialize_workflow_instance_step(..., p_step workflow_steps, ...):
--    nenhuma instância de workflow iniciava (erro 500). Agora v_step tem o
--    tipo da tabela. Corpo idêntico ao da 0061, só a declaração mudou.
-- 2. fn_convert_lead_to_opportunity gravava a auditoria com a ação 'INSERT',
--    fora do CHECK de audit_logs: converter lead em oportunidade sempre
--    falhava. Corpo idêntico ao da 0055, só a ação vira 'CREATE'.
-- "create or replace" preserva os grants existentes.

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
  v_step public.workflow_steps;
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
  values (v_lead.company_id, public.current_app_user_id(), 'system', 'opportunities', v_opp.id, 'CREATE', null,
    jsonb_build_object('lead_id', v_lead.id, 'pipeline_id', p_pipeline_id, 'stage_id', p_stage_id));

  return v_opp;
end;
$$;
