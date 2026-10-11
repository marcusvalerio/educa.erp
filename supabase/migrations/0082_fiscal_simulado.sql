-- 0082 — Rodada 2 (48 usuários): provedor fiscal SIMULADO para a homologação.
--
-- O ATLAS.ERP já tinha o caminho de autorização por provedor
-- (fn_begin_fiscal_document_authorization → fn_process_fiscal_authorization_response,
-- tentativas em fiscal_authorization_attempts, eventos e auditoria), mas não
-- tinha provedor. Esta migration cria o provedor SIMULACAO, que:
--   * só funciona em documento de HOMOLOGAÇÃO e só com o provedor configurado
--     explicitamente no estabelecimento (fn_configure_fiscal_provider);
--   * NÃO fala com SEFAZ, não usa certificado nem provedor real;
--   * confere o documento como um validador faria e rejeita com códigos
--     PRÓPRIOS "SIM-1xx" (não imita códigos oficiais);
--   * aprovado: chave de 44 dígitos no formato da NF-e (DV módulo 11) e
--     protocolo "SIMULACAO-…" — o protocolo deixa claro que não é autorização real;
--   * cancelamento simulado: justificativa >= 15 caracteres, prazo de 24 h.

-- ------------------------------------------------------------ chave de acesso
create or replace function public.fn_uf_ibge_code(p_uf text)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_uf, ''))
    when 'RO' then '11' when 'AC' then '12' when 'AM' then '13' when 'RR' then '14' when 'PA' then '15'
    when 'AP' then '16' when 'TO' then '17' when 'MA' then '21' when 'PI' then '22' when 'CE' then '23'
    when 'RN' then '24' when 'PB' then '25' when 'PE' then '26' when 'AL' then '27' when 'SE' then '28'
    when 'BA' then '29' when 'MG' then '31' when 'ES' then '32' when 'RJ' then '33' when 'SP' then '35'
    when 'PR' then '41' when 'SC' then '42' when 'RS' then '43' when 'MS' then '50' when 'MT' then '51'
    when 'GO' then '52' when 'DF' then '53' else '99' end;
$$;

-- Dígito verificador módulo 11 (pesos 2..9 da direita para a esquerda).
create or replace function public.fn_access_key_check_digit(p_base text)
returns integer
language plpgsql
immutable
as $$
declare
  v_sum integer := 0;
  v_weight integer := 2;
  v_rest integer;
  i integer;
begin
  for i in reverse length(p_base)..1 loop
    v_sum := v_sum + substr(p_base, i, 1)::integer * v_weight;
    v_weight := case when v_weight = 9 then 2 else v_weight + 1 end;
  end loop;
  v_rest := v_sum % 11;
  return case when v_rest < 2 then 0 else 11 - v_rest end;
end;
$$;

create or replace function public.fn_fiscal_simulated_access_key(p_fiscal_document_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.fiscal_documents;
  v_est public.fiscal_establishments;
  v_base text;
  v_cnf text;
begin
  select * into v_doc from public.fiscal_documents where id = p_fiscal_document_id;
  select * into v_est from public.fiscal_establishments where id = v_doc.fiscal_establishment_id;
  -- Código numérico "aleatório" estável derivado do id (8 dígitos).
  v_cnf := lpad((abs(('x' || substr(md5(v_doc.id::text), 1, 8))::bit(32)::bigint) % 100000000)::text, 8, '0');
  v_base := public.fn_uf_ibge_code(v_est.state)
    || to_char(coalesce(v_doc.issue_date, current_date), 'YYMM')
    || lpad(regexp_replace(coalesce(v_est.cnpj, ''), '\D', '', 'g'), 14, '0')
    || lpad(coalesce(nullif(regexp_replace(coalesce(v_doc.model, '55'), '\D', '', 'g'), ''), '55'), 2, '0')
    || lpad(coalesce(nullif(regexp_replace(coalesce(v_doc.series, '1'), '\D', '', 'g'), ''), '1'), 3, '0')
    || lpad(coalesce(v_doc.number, 0)::text, 9, '0')
    || '1'
    || v_cnf;
  return v_base || public.fn_access_key_check_digit(v_base)::text;
end;
$$;

-- ------------------------------------------------------------ validação simulada
-- Devolve a 1ª inconsistência encontrada (código SIM-1xx e mensagem) ou nada.
create or replace function public.fn_fiscal_simulated_validation(p_fiscal_document_id uuid)
returns table(code text, message text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.fiscal_documents;
  v_est public.fiscal_establishments;
  v_partner_doc text;
  v_partner_state text;
  v_bad record;
  v_expected numeric;
begin
  select * into v_doc from public.fiscal_documents where id = p_fiscal_document_id;
  select * into v_est from public.fiscal_establishments where id = v_doc.fiscal_establishment_id;

  if not exists (select 1 from public.fiscal_document_items where fiscal_document_id = v_doc.id) then
    return query select 'SIM-101'::text, 'Documento sem itens.'::text; return;
  end if;

  select i.description, i.ncm_code, i.cfop_code into v_bad
  from public.fiscal_document_items i
  where i.fiscal_document_id = v_doc.id
    and (coalesce(regexp_replace(i.ncm_code, '\D', '', 'g'), '') !~ '^\d{8}$' or coalesce(i.cfop_code, '') !~ '^\d{4}$')
  limit 1;
  if found then
    return query select 'SIM-102'::text, format('Item "%s" com NCM (%s) ou CFOP (%s) inválido.', v_bad.description, coalesce(v_bad.ncm_code, 'vazio'), coalesce(v_bad.cfop_code, 'vazio')); return;
  end if;

  if v_doc.customer_id is not null then
    select regexp_replace(coalesce(c.document, ''), '\D', '', 'g'), c.state into v_partner_doc, v_partner_state from public.customers c where c.id = v_doc.customer_id;
  elsif v_doc.supplier_id is not null then
    select regexp_replace(coalesce(s.document, ''), '\D', '', 'g'), s.state into v_partner_doc, v_partner_state from public.suppliers s where s.id = v_doc.supplier_id;
  end if;
  if coalesce(length(v_partner_doc), 0) not in (11, 14) then
    return query select 'SIM-103'::text, 'Destinatário/remetente sem CPF ou CNPJ válido.'::text; return;
  end if;

  v_expected := v_doc.products_amount - v_doc.discount_amount + v_doc.freight_amount + v_doc.insurance_amount
    + v_doc.other_expenses_amount + v_doc.taxes_amount;
  if abs(v_doc.total_amount - v_expected) > 0.01 then
    return query select 'SIM-104'::text, format('Total do documento (%s) diferente da soma das parcelas (%s).', v_doc.total_amount, v_expected); return;
  end if;

  select i.description, i.cfop_code into v_bad
  from public.fiscal_document_items i
  where i.fiscal_document_id = v_doc.id
    and ((v_doc.direction = 'SAIDA' and left(i.cfop_code, 1) not in ('5', '6', '7'))
      or (v_doc.direction = 'ENTRADA' and left(i.cfop_code, 1) not in ('1', '2', '3')))
  limit 1;
  if found then
    return query select 'SIM-105'::text, format('CFOP %s não é de %s.', v_bad.cfop_code, case when v_doc.direction = 'SAIDA' then 'saída' else 'entrada' end); return;
  end if;

  if v_partner_state is not null and v_est.state is not null then
    select i.description, i.cfop_code into v_bad
    from public.fiscal_document_items i
    where i.fiscal_document_id = v_doc.id
      and left(i.cfop_code, 1) in ('1', '2', '5', '6')
      and ((upper(v_partner_state) = upper(v_est.state) and left(i.cfop_code, 1) in ('2', '6'))
        or (upper(v_partner_state) <> upper(v_est.state) and left(i.cfop_code, 1) in ('1', '5')))
    limit 1;
    if found then
      return query select 'SIM-106'::text, format('CFOP %s incompatível com o destino (%s → %s).', v_bad.cfop_code, v_est.state, v_partner_state); return;
    end if;
  end if;
  return;
end;
$$;

-- ------------------------------------------------------------ autorização simulada
create or replace function public.fn_simulate_fiscal_authorization(p_fiscal_document_id uuid)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.fiscal_documents;
  v_attempt public.fiscal_authorization_attempts;
  v_err record;
  v_key text;
  v_protocol text;
begin
  -- Trava: três pessoas autorizando ao mesmo tempo → uma autoriza, as outras
  -- encontram o documento já autorizado.
  select * into v_doc from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_doc.company_id, 'fiscal_documents.submit_authorization') then
    raise exception 'Permissão negada (fiscal_documents.submit_authorization).' using errcode = '42501';
  end if;

  if v_doc.status = 'AUTHORIZED' then
    raise exception 'O documento % já foi autorizado (simulação), chave %. Nada foi refeito.', v_doc.code, v_doc.access_key using errcode = 'P0001';
  end if;

  if v_doc.environment <> 'HOMOLOGATION' then
    raise exception 'A autorização simulada só pode ser usada em documentos de homologação.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.fiscal_provider_configs
    where fiscal_establishment_id = v_doc.fiscal_establishment_id and provider_code = 'SIMULACAO'
      and status = 'active' and environment = 'HOMOLOGATION'
  ) then
    raise exception 'O estabelecimento não tem o provedor de simulação configurado. Configure o provedor SIMULACAO (homologação) antes de autorizar na simulação.' using errcode = 'P0001';
  end if;

  if v_doc.number is null then
    raise exception 'O documento % está sem número. Numere-o antes de autorizar.', v_doc.code using errcode = 'P0001';
  end if;

  v_attempt := public.fn_begin_fiscal_document_authorization(p_fiscal_document_id, 'SIMULACAO', 'SIMULACAO-REQ-' || v_doc.code);

  select * into v_err from public.fn_fiscal_simulated_validation(p_fiscal_document_id) limit 1;
  if found then
    perform public.fn_process_fiscal_authorization_response(v_attempt.id, 'REJECTED', null, null, null, v_err.code, v_err.message, 'SIMULACAO');
  else
    v_key := public.fn_fiscal_simulated_access_key(p_fiscal_document_id);
    v_protocol := 'SIMULACAO-' || to_char(clock_timestamp(), 'YYMMDDHH24MISS') || lpad(v_attempt.attempt_number::text, 5, '0');
    perform public.fn_process_fiscal_authorization_response(v_attempt.id, 'AUTHORIZED', v_key, v_protocol, v_protocol, null, null, 'SIMULACAO');
  end if;

  select * into v_doc from public.fiscal_documents where id = p_fiscal_document_id;
  return v_doc;
end;
$$;

-- ------------------------------------------------------------ cancelamento simulado
create or replace function public.fn_simulate_fiscal_cancellation(p_fiscal_document_id uuid, p_reason text)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.fiscal_documents;
  v_protocol text;
begin
  select * into v_doc from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_doc.company_id, 'fiscal_documents.cancel') then
    raise exception 'Permissão negada (fiscal_documents.cancel).' using errcode = '42501';
  end if;

  if v_doc.status = 'CANCELLED' then
    raise exception 'O documento % já está cancelado. Nada foi refeito.', v_doc.code using errcode = 'P0001';
  end if;
  if v_doc.status <> 'AUTHORIZED' then
    raise exception 'Só é possível cancelar na simulação um documento autorizado (status atual: %).', v_doc.status using errcode = 'P0001';
  end if;
  if coalesce(v_doc.protocol, '') not like 'SIMULACAO-%' then
    raise exception 'O documento % não foi autorizado na simulação; o cancelamento simulado não se aplica.', v_doc.code using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 15 then
    raise exception 'Informe a justificativa do cancelamento com pelo menos 15 caracteres.' using errcode = '22023';
  end if;
  if v_doc.authorized_at is not null and v_doc.authorized_at < now() - interval '24 hours' then
    raise exception 'Prazo de cancelamento encerrado: o documento foi autorizado há mais de 24 horas (SIM-135).' using errcode = 'P0001';
  end if;

  v_doc := public.fn_cancel_fiscal_document(p_fiscal_document_id, trim(p_reason));
  v_protocol := 'SIMULACAO-CANC-' || to_char(clock_timestamp(), 'YYMMDDHH24MISS');
  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, protocol, status_code, message, created_by)
  values (v_doc.company_id, v_doc.id, 'OTHER', v_protocol, 'SIM-135', 'Cancelamento registrado na simulação (sem transmissão à SEFAZ).', public.current_app_user_id());

  return v_doc;
end;
$$;

revoke all on function public.fn_simulate_fiscal_authorization(uuid) from public;
grant execute on function public.fn_simulate_fiscal_authorization(uuid) to authenticated;
revoke all on function public.fn_simulate_fiscal_cancellation(uuid, text) from public;
grant execute on function public.fn_simulate_fiscal_cancellation(uuid, text) to authenticated;
revoke all on function public.fn_fiscal_simulated_access_key(uuid) from public;
grant execute on function public.fn_fiscal_simulated_access_key(uuid) to authenticated;
revoke all on function public.fn_fiscal_simulated_validation(uuid) from public;
grant execute on function public.fn_fiscal_simulated_validation(uuid) to authenticated;
