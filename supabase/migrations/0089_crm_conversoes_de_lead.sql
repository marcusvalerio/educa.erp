-- =====================================================================
-- 0089 — Conversões de lead do CRM (defeitos A, B, C e D)
-- =====================================================================
-- Reproduzido em banco descartável reconstruído pelo plano equivalente à
-- produção (docs/homologacao/RELATORIO-CORRECOES-CRM-E-PAINEIS.md):
--
-- A) fn_convert_lead_to_customer gravava em customers.legal_name (a coluna é
--    customers.name) → "column legal_name does not exist". Também: o cliente
--    exige documento (customers.document NOT NULL); um lead sem CPF/CNPJ
--    falhava com erro técnico.
-- B) fn_convert_lead_to_opportunity gravava audit_logs.action = 'INSERT',
--    fora de audit_logs_action_check. A restrição NÃO é alterada: a ação
--    correta para a criação da oportunidade é 'CREATE'.
-- C) leads.responsible_user_id (USUÁRIO) era gravado em
--    customers.default_sales_representative_id, que referencia
--    sales_representatives (outra entidade, sem vínculo com usuários no
--    esquema). Não há mapeamento inequívoco: o representante fica vazio e a
--    escolha continua decisão de negócio pendente. O responsável continua
--    registrado no lead (e vai para a oportunidade como owner_user_id, que é
--    usuário — esse vínculo é inequívoco e foi mantido).
-- D) Integridade: trava no lead (já existia), trava curta por empresa +
--    documento (só os dígitos) para duas conversões de leads diferentes com o
--    mesmo CPF/CNPJ, reaproveitamento do cliente com o mesmo documento com ou
--    sem máscara, conversão em oportunidade recusada se o lead já tem
--    oportunidade aberta (duplo clique / chamadas simultâneas), auditoria das
--    criações e lead convertido congelado também para edição direta (RLS).
--
-- Mantido: permissões (leads.convert), SECURITY DEFINER, assinatura e tipo de
-- retorno das duas funções, regra de NEW → QUALIFIED na conversão em
-- oportunidade, actor_label 'system' com o user_id real (padrão das funções
-- do CRM).
-- =====================================================================

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
  v_digits text;
  v_matches integer;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_lead.company_id, 'leads.convert') then
    raise exception 'Permissão negada (leads.convert).' using errcode = '42501';
  end if;

  -- Repetição (inclusive a 2ª de duas chamadas simultâneas, que espera a
  -- trava acima): devolve o mesmo cliente, sem criar outro.
  if v_lead.converted_customer_id is not null then
    select * into v_customer from public.customers
     where id = v_lead.converted_customer_id and company_id = v_lead.company_id;
    if found then
      return v_customer;
    end if;
  end if;

  v_digits := nullif(regexp_replace(coalesce(v_lead.document, ''), '\D', '', 'g'), '');
  if v_digits is null then
    raise exception 'O lead % não tem CPF/CNPJ. Informe o documento no lead antes de convertê-lo em cliente.', v_lead.code
      using errcode = 'P0001';
  end if;

  -- Leads diferentes com o mesmo documento convertidos ao mesmo tempo:
  -- serializa só esse documento nesta empresa (sem trava global).
  perform pg_advisory_xact_lock(hashtextextended(v_lead.company_id::text || ':customer-document:' || v_digits, 0));

  select count(*) into v_matches from public.customers
   where company_id = v_lead.company_id and regexp_replace(document, '\D', '', 'g') = v_digits;
  if v_matches > 1 then
    raise exception 'Há mais de um cliente com o documento do lead %. Revise os clientes duplicados antes de converter.', v_lead.code
      using errcode = 'P0001';
  end if;
  if v_matches = 1 then
    select * into v_customer from public.customers
     where company_id = v_lead.company_id and regexp_replace(document, '\D', '', 'g') = v_digits;
  end if;

  if v_customer.id is null then
    v_type := case when length(v_digits) = 11 then 'individual' else 'company' end;
    insert into public.customers (company_id, type, name, trade_name, document, email, phone, default_sales_representative_id)
    values (v_lead.company_id, v_type, coalesce(nullif(v_lead.company_name, ''), v_lead.name), v_lead.name, v_lead.document, v_lead.email, v_lead.phone, null)
    returning * into v_customer;

    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_lead.company_id, public.current_app_user_id(), 'system', 'customers', v_customer.id, 'CREATE', null,
      jsonb_build_object('code', v_customer.code, 'document', v_customer.document, 'source', 'lead', 'lead_id', v_lead.id, 'lead_code', v_lead.code));
  end if;

  update public.leads set status = 'CONVERTED', converted_customer_id = v_customer.id where id = p_lead_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_lead.company_id, public.current_app_user_id(), 'system', 'leads', v_lead.id, 'UPDATE',
    jsonb_build_object('status', v_lead.status),
    jsonb_build_object('status', 'CONVERTED', 'converted_customer_id', v_customer.id, 'customer_code', v_customer.code));

  return v_customer;
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
  v_open_code text;
begin
  -- A trava no lead serializa conversões simultâneas do mesmo lead.
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_lead.company_id, 'leads.convert') then
    raise exception 'Permissão negada (leads.convert).' using errcode = '42501';
  end if;

  select code into v_open_code from public.opportunities
   where company_id = v_lead.company_id and lead_id = v_lead.id and status = 'OPEN'
   order by created_at limit 1;
  if v_open_code is not null then
    raise exception 'O lead % já tem a oportunidade % em aberto. Continue por ela (ou encerre-a antes de criar outra).', v_lead.code, v_open_code
      using errcode = 'P0001';
  end if;

  -- pipeline/estágio de outra empresa ou estágio de outro pipeline são
  -- recusados pelas FKs compostas de opportunities.
  insert into public.opportunities (
    company_id, title, customer_id, lead_id, pipeline_id, stage_id,
    estimated_value, owner_user_id, origin_id, created_by
  ) values (
    v_lead.company_id, coalesce(nullif(p_title, ''), v_lead.name), v_lead.converted_customer_id, v_lead.id, p_pipeline_id, p_stage_id,
    coalesce(p_estimated_value, 0), v_lead.responsible_user_id, v_lead.origin_id, public.current_app_user_id()
  )
  returning * into v_opp;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_lead.company_id, public.current_app_user_id(), 'system', 'opportunities', v_opp.id, 'CREATE', null,
    jsonb_build_object('code', v_opp.code, 'lead_id', v_lead.id, 'lead_code', v_lead.code, 'pipeline_id', p_pipeline_id, 'stage_id', p_stage_id));

  if v_lead.status = 'NEW' then
    update public.leads set status = 'QUALIFIED' where id = p_lead_id;
    insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
    values (v_lead.company_id, public.current_app_user_id(), 'system', 'leads', v_lead.id, 'UPDATE',
      jsonb_build_object('status', 'NEW'), jsonb_build_object('status', 'QUALIFIED', 'opportunity_id', v_opp.id, 'opportunity_code', v_opp.code));
  end if;

  return v_opp;
end;
$$;

-- Lead convertido: nem o usuário com leads.update o altera por edição direta,
-- e ninguém vincula um cliente ao lead fora da função de conversão. As
-- funções de conversão (SECURITY DEFINER, dono da tabela) não passam pela RLS.
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (public.has_permission(company_id, 'leads.update') and status <> 'CONVERTED')
  with check (public.has_permission(company_id, 'leads.update') and status <> 'CONVERTED' and converted_customer_id is null);
