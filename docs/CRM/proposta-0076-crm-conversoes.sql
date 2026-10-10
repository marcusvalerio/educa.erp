-- =====================================================================
-- PROPOSTA (NÃO APLICADA) — correções do funil do CRM
-- =====================================================================
-- Status: rascunho para decisão do dono. NÃO está em supabase/migrations
-- nem no plano do Neon (poc/neon-full/plan-prod-equivalente.txt), para que
-- o esquema de destino continue idêntico ao de produção até a sua decisão.
-- Validação local: aplicada numa transação desfeita sobre o banco
-- reconstruído pelo plano; os 3 casos `todo` de tests/crm-funnel-db.test.ts
-- passam (ver docs/CRM/FLUXO-DE-DADOS-CRM.md §8).
--
-- 1) fn_convert_lead_to_customer: a coluna é customers.name (não existe
--    legal_name). Sem isso, converter um lead cujo documento ainda não é
--    cliente falha sempre.
-- 2) fn_convert_lead_to_customer: leads.responsible_user_id é um USUÁRIO;
--    customers.default_sales_representative_id exige um REPRESENTANTE
--    (sales_representatives). Não há vínculo usuário ↔ representante no
--    esquema. DECISÃO PENDENTE: esta proposta deixa o representante vazio
--    (o responsável do lead continua no lead). Alternativa: casar pelo
--    e-mail do usuário com sales_representatives.email.
-- 3) fn_convert_lead_to_opportunity: audit_logs.action aceita 'CREATE',
--    não 'INSERT' (audit_logs_action_check). Sem isso, a conversão falha.
-- 4) Policy leads_update: hoje impede GRAVAR 'CONVERTED', mas permite tirar
--    um lead de 'CONVERTED' por edição direta. A proposta congela o lead
--    convertido para edição pelo usuário (as funções SECURITY DEFINER
--    continuam podendo atualizá-lo).
--
-- Observação: as rotas /api/leads usam o cliente administrativo
-- (service_role), que não passa pela RLS; o item 4 vale para o caminho com
-- RLS. A mesma regra precisa existir na API — ver o relatório.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_convert_lead_to_customer(p_lead_id uuid)
 RETURNS customers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    insert into public.customers (company_id, type, name, trade_name, document, email, phone, default_sales_representative_id)
    values (v_lead.company_id, v_type, coalesce(v_lead.company_name, v_lead.name), v_lead.name, v_lead.document, v_lead.email, v_lead.phone, null)
    returning * into v_customer;
  end if;

  update public.leads set status = 'CONVERTED', converted_customer_id = v_customer.id where id = p_lead_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_lead.company_id, public.current_app_user_id(), 'system', 'leads', v_lead.id, 'UPDATE',
    jsonb_build_object('status', v_lead.status), jsonb_build_object('status', 'CONVERTED', 'converted_customer_id', v_customer.id));

  return v_customer;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_convert_lead_to_opportunity(p_lead_id uuid, p_pipeline_id uuid, p_stage_id uuid, p_title text DEFAULT NULL::text, p_estimated_value numeric DEFAULT 0)
 RETURNS opportunities
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

;

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (public.has_permission(company_id, 'leads.update') and status <> 'CONVERTED')
  with check (public.has_permission(company_id, 'leads.update') and status <> 'CONVERTED');
