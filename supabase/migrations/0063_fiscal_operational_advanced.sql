-- Fase 22 — Fiscal Operacional Avançado: evolução do Fiscal já
-- existente (0036-0042/9-053). NÃO recria o Fiscal Core — todas as
-- tabelas/funções abaixo são ADITIVAS, e as únicas alterações em
-- funções já existentes são substituições de MESMA assinatura (nunca
-- adicionam/removem parâmetro), então nenhum chamador existente quebra.
--
-- ==================================================================
-- 22.1 — CICLO FISCAL: insere AUTHORIZING entre READY e AUTHORIZED
-- ==================================================================
-- Ciclo final: DRAFT -> CALCULATED -> READY -> AUTHORIZING -> AUTHORIZED,
-- com REJECTED/DENIED/CONTINGENCY/CANCELLED como estados já existentes
-- desde 0039/0041 — nenhum estado removido, nenhuma transição antiga
-- invalidada. AUTHORIZING é OPCIONAL: fn_authorize_fiscal_document
-- continua aceitando a chamada direta a partir de READY (fluxo antigo,
-- inalterado) E agora também a partir de AUTHORIZING (fluxo novo, via
-- fn_begin_fiscal_document_authorization + fn_process_fiscal_authorization_response).

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.fiscal_documents'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if v_conname is not null then
    execute format('alter table public.fiscal_documents drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.fiscal_documents
  add constraint fiscal_documents_status_check
  check (status in ('DRAFT', 'CALCULATED', 'READY', 'AUTHORIZING', 'AUTHORIZED', 'CANCELLED', 'DENIED', 'REJECTED', 'CONTINGENCY'));

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.fiscal_document_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%event_type%';
  if v_conname is not null then
    execute format('alter table public.fiscal_document_events drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.fiscal_document_events
  add constraint fiscal_document_events_event_type_check
  check (event_type in (
    'CREATED', 'CALCULATED', 'READY', 'AUTHORIZING', 'AUTHORIZED', 'CANCELLED', 'REJECTED', 'DENIED',
    'CONTINGENCY', 'CORRECTION_LETTER', 'INUTILIZATION', 'MANIFESTATION', 'OTHER'
  ));

-- ==================================================================
-- fn_authorize_fiscal_document — create or replace de MESMA assinatura
-- (uuid, text, text, text), só amplia o guard de status (seção 22.1).
-- ==================================================================
create or replace function public.fn_authorize_fiscal_document(
  p_fiscal_document_id uuid,
  p_access_key text,
  p_protocol text default null,
  p_receipt_number text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.authorize') then
    raise exception 'Permissão negada (fiscal_documents.authorize).' using errcode = '42501';
  end if;

  if v_document.status not in ('READY', 'AUTHORIZING') then
    raise exception 'Só é possível autorizar um documento com conferência fiscal concluída ou em processo de autorização (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  update public.fiscal_documents
  set status = 'AUTHORIZED', access_key = p_access_key, protocol = p_protocol, receipt_number = p_receipt_number, authorized_at = now()
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, protocol, message, created_by)
  values (v_document.company_id, v_document.id, 'AUTHORIZED', p_protocol, 'Documento autorizado.', public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'AUTHORIZE',
    jsonb_build_object('status', 'READY/AUTHORIZING'), jsonb_build_object('status', 'AUTHORIZED', 'access_key', p_access_key));

  return v_document;
end;
$$;

-- ==================================================================
-- fn_reject_fiscal_document — create or replace de MESMA assinatura
-- (uuid, text, text), só amplia o guard de status: agora também
-- aceita rejeição vinda do provedor externo (via
-- fn_process_fiscal_authorization_response) enquanto AUTHORIZING.
-- ==================================================================
create or replace function public.fn_reject_fiscal_document(
  p_fiscal_document_id uuid,
  p_return_code text default null,
  p_rejection_reason text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.update') then
    raise exception 'Permissão negada (fiscal_documents.update).' using errcode = '42501';
  end if;

  if v_document.status not in ('CALCULATED', 'AUTHORIZING') then
    raise exception 'Só é possível rejeitar um documento calculado ou em processo de autorização (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  update public.fiscal_documents
  set status = 'REJECTED', return_code = p_return_code, rejection_reason = p_rejection_reason
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, status_code, message, created_by)
  values (v_document.company_id, v_document.id, 'REJECTED', p_return_code, p_rejection_reason, public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'REJECT',
    jsonb_build_object('status', 'CALCULATED/AUTHORIZING'), jsonb_build_object('status', 'REJECTED', 'return_code', p_return_code));

  return v_document;
end;
$$;

-- ==================================================================
-- fn_guard_fiscal_document_snapshot — create or replace de MESMA
-- assinatura (trigger, sem parâmetros): amplia o allowlist de
-- imutabilidade para cobrir AUTHORIZING também (seção 22.16 — um
-- documento em processo de autorização não pode ter seus dados
-- consolidados alterados por baixo do provedor).
-- ==================================================================
create or replace function public.fn_guard_fiscal_document_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if OLD.status in ('READY', 'AUTHORIZING', 'AUTHORIZED') then
    if NEW.fiscal_establishment_id is distinct from OLD.fiscal_establishment_id
      or NEW.type is distinct from OLD.type
      or NEW.direction is distinct from OLD.direction
      or NEW.operation_nature_id is distinct from OLD.operation_nature_id
      or NEW.customer_id is distinct from OLD.customer_id
      or NEW.supplier_id is distinct from OLD.supplier_id
      or NEW.products_amount is distinct from OLD.products_amount
      or NEW.taxes_amount is distinct from OLD.taxes_amount
      or NEW.total_amount is distinct from OLD.total_amount
      or NEW.discount_amount is distinct from OLD.discount_amount
      or NEW.freight_amount is distinct from OLD.freight_amount
      or NEW.insurance_amount is distinct from OLD.insurance_amount
      or NEW.other_expenses_amount is distinct from OLD.other_expenses_amount
    then
      raise exception 'Documento fiscal % (status %) tem dados fiscais consolidados imutáveis — não é possível alterar estabelecimento/natureza/parceiro/valores após a conferência.', OLD.code, OLD.status using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

-- ==================================================================
-- 22.8 — IDEMPOTÊNCIA DE EVENTOS: chave opcional em fiscal_document_events
-- (aditiva — coluna nullable, não afeta os inserts já existentes) +
-- função nova fn_register_fiscal_document_event_idempotent (não altera
-- a assinatura de fn_register_fiscal_document_event já em uso pelo
-- fluxo manual da UI, seção "nunca alterar assinatura existente").
-- ==================================================================
alter table public.fiscal_document_events add column if not exists idempotency_key text;

create unique index if not exists fiscal_document_events_idempotency_idx
  on public.fiscal_document_events (fiscal_document_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.fiscal_document_events.idempotency_key is
  'Chave de idempotência opcional (seção 22.8) — usada por integrações automáticas (provedor externo, reprocessamento) via fn_register_fiscal_document_event_idempotent; eventos registrados manualmente pela UI continuam sem chave, como antes.';

create or replace function public.fn_register_fiscal_document_event_idempotent(
  p_fiscal_document_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_protocol text default null,
  p_status_code text default null,
  p_message text default null,
  p_payload_reference text default null
)
returns public.fiscal_document_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_existing public.fiscal_document_events;
  v_event public.fiscal_document_events;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Chave de idempotência obrigatória.' using errcode = '22023';
  end if;

  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_existing from public.fiscal_document_events
  where fiscal_document_id = p_fiscal_document_id and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  v_event := public.fn_register_fiscal_document_event(p_fiscal_document_id, p_event_type, p_protocol, p_status_code, p_message, p_payload_reference);

  update public.fiscal_document_events set idempotency_key = p_idempotency_key where id = v_event.id
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.fn_register_fiscal_document_event_idempotent(uuid, text, text, text, text, text, text) from public;
grant execute on function public.fn_register_fiscal_document_event_idempotent(uuid, text, text, text, text, text, text) to authenticated;

-- ==================================================================
-- 22.6 — PROVIDER ABSTRACTION: fiscal_domain -> provider interface ->
-- adapter -> SEFAZ/provedor externo (seção 22.6). Nenhum provedor real
-- implementado — provider_code='NONE' é o único valor operacional
-- nesta fase; a tabela e as funções existem para que uma integração
-- futura plugue sem redesenhar o domínio.
-- ==================================================================
create table if not exists public.fiscal_provider_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_establishment_id uuid not null,
  provider_code text not null default 'NONE',
  environment text not null default 'HOMOLOGATION' check (environment in ('PRODUCTION', 'HOMOLOGATION')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fiscal_establishment_id, provider_code),
  unique (id, company_id),
  foreign key (fiscal_establishment_id, company_id) references public.fiscal_establishments (id, company_id) on delete cascade
);

create trigger set_updated_at before update on public.fiscal_provider_configs
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_provider_configs_company_idx on public.fiscal_provider_configs (company_id, status);

comment on table public.fiscal_provider_configs is
  'Configuração do PROVEDOR fiscal por estabelecimento (seção 22.6) — camada de domínio nunca depende de uma implementação específica. config (jsonb) é só configuração NÃO sensível (timeout, endpoint lógico, flags); nenhum segredo/senha/certificado é armazenado aqui — ver fiscal_digital_certificates.';

-- ==================================================================
-- 22.5 — CERTIFICADO DIGITAL: metadados apenas. NUNCA senha/chave
-- privada em texto puro, nunca no frontend, nunca em migration.
-- external_secret_reference é um PONTEIRO (nome/id) para um secret
-- manager externo que não existe nesta fase — nunca o segredo em si.
-- ==================================================================
create table if not exists public.fiscal_digital_certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_establishment_id uuid not null,
  alias text not null,
  certificate_type text not null check (certificate_type in ('A1', 'A3')),
  subject_name text,
  issuer_name text,
  valid_from date,
  valid_until date,
  external_secret_reference text,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired', 'revoked')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (fiscal_establishment_id, company_id) references public.fiscal_establishments (id, company_id) on delete cascade
);

create trigger set_updated_at before update on public.fiscal_digital_certificates
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_digital_certificates_company_idx on public.fiscal_digital_certificates (company_id, status);

comment on table public.fiscal_digital_certificates is
  'Metadados de certificado digital (seção 22.5) — alias/tipo/validade/emissor SÓ para controle administrativo (ex.: alertar vencimento). Nenhuma senha, chave privada ou bytes do certificado são armazenados aqui ou em qualquer outra tabela deste ERP. external_secret_reference é um ponteiro textual (nome de segredo) para um secret manager externo — não existe secret manager integrado nesta fase, então este campo fica nulo até que exista um adapter real.';

-- ==================================================================
-- fn_configure_fiscal_provider / fn_register_fiscal_certificate —
-- CRUD mínimo, nunca aceitam um campo de segredo (a assinatura da
-- função não tem parâmetro de senha/chave — impossível chamá-la com
-- um segredo mesmo por engano).
-- ==================================================================
create or replace function public.fn_configure_fiscal_provider(
  p_fiscal_establishment_id uuid,
  p_provider_code text default 'NONE',
  p_environment text default 'HOMOLOGATION',
  p_config jsonb default '{}'::jsonb
)
returns public.fiscal_provider_configs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_establishment public.fiscal_establishments;
  v_config public.fiscal_provider_configs;
begin
  select * into v_establishment from public.fiscal_establishments where id = p_fiscal_establishment_id;
  if not found then
    raise exception 'Estabelecimento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_establishment.company_id, 'fiscal_provider_configs.manage') then
    raise exception 'Permissão negada (fiscal_provider_configs.manage).' using errcode = '42501';
  end if;

  insert into public.fiscal_provider_configs (company_id, fiscal_establishment_id, provider_code, environment, config)
  values (v_establishment.company_id, p_fiscal_establishment_id, coalesce(p_provider_code, 'NONE'), coalesce(p_environment, 'HOMOLOGATION'), coalesce(p_config, '{}'::jsonb))
  on conflict (fiscal_establishment_id, provider_code) do update
    set environment = excluded.environment, config = excluded.config, status = 'active'
  returning * into v_config;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_establishment.company_id, public.current_app_user_id(), 'system', 'fiscal_provider_configs', v_config.id, 'CONFIGURE',
    null, jsonb_build_object('provider_code', p_provider_code, 'environment', p_environment));

  return v_config;
end;
$$;

create or replace function public.fn_register_fiscal_certificate(
  p_fiscal_establishment_id uuid,
  p_alias text,
  p_certificate_type text,
  p_subject_name text default null,
  p_issuer_name text default null,
  p_valid_from date default null,
  p_valid_until date default null,
  p_external_secret_reference text default null
)
returns public.fiscal_digital_certificates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_establishment public.fiscal_establishments;
  v_certificate public.fiscal_digital_certificates;
begin
  select * into v_establishment from public.fiscal_establishments where id = p_fiscal_establishment_id;
  if not found then
    raise exception 'Estabelecimento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_establishment.company_id, 'fiscal_provider_configs.manage') then
    raise exception 'Permissão negada (fiscal_provider_configs.manage).' using errcode = '42501';
  end if;

  insert into public.fiscal_digital_certificates (
    company_id, fiscal_establishment_id, alias, certificate_type, subject_name, issuer_name, valid_from, valid_until,
    external_secret_reference, created_by
  ) values (
    v_establishment.company_id, p_fiscal_establishment_id, p_alias, p_certificate_type, p_subject_name, p_issuer_name,
    p_valid_from, p_valid_until, p_external_secret_reference, public.current_app_user_id()
  )
  returning * into v_certificate;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_establishment.company_id, public.current_app_user_id(), 'system', 'fiscal_digital_certificates', v_certificate.id, 'CREATE',
    null, jsonb_build_object('alias', p_alias, 'certificate_type', p_certificate_type));

  return v_certificate;
end;
$$;

create or replace function public.fn_deactivate_fiscal_certificate(p_certificate_id uuid)
returns public.fiscal_digital_certificates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_certificate public.fiscal_digital_certificates;
begin
  select * into v_certificate from public.fiscal_digital_certificates where id = p_certificate_id;
  if not found then
    raise exception 'Certificado não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_certificate.company_id, 'fiscal_provider_configs.manage') then
    raise exception 'Permissão negada (fiscal_provider_configs.manage).' using errcode = '42501';
  end if;

  update public.fiscal_digital_certificates set status = 'inactive' where id = p_certificate_id returning * into v_certificate;
  return v_certificate;
end;
$$;

revoke all on function public.fn_configure_fiscal_provider(uuid, text, text, jsonb) from public;
revoke all on function public.fn_register_fiscal_certificate(uuid, text, text, text, text, date, date, text) from public;
revoke all on function public.fn_deactivate_fiscal_certificate(uuid) from public;
grant execute on function public.fn_configure_fiscal_provider(uuid, text, text, jsonb) to authenticated;
grant execute on function public.fn_register_fiscal_certificate(uuid, text, text, text, text, date, date, text) to authenticated;
grant execute on function public.fn_deactivate_fiscal_certificate(uuid) to authenticated;

-- ==================================================================
-- 22.7 — AUTORIZAÇÃO: enviar/receber/consultar/processar retorno/
-- armazenar protocolo/processar rejeição/reprocessar. fiscal_authorization_attempts
-- é o ledger de tentativas (uma linha por tentativa, nunca sobrescrita).
--
-- IMPORTANTE (seção 22.6/instrução final: "não fingir autorização"):
-- fn_begin_fiscal_document_authorization NUNCA autoriza o documento —
-- só marca "em processo" e registra a tentativa. fn_process_fiscal_authorization_response
-- exige que o CHAMADOR informe explicitamente o resultado (p_result,
-- sem valor default) — nenhuma das duas funções chama um provedor
-- real (nenhum existe) nem decide sozinha que algo foi autorizado.
-- ==================================================================
create table if not exists public.fiscal_authorization_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_id uuid not null,
  provider_code text not null default 'NONE',
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'AUTHORIZED', 'REJECTED', 'ERROR')),
  request_reference text,
  response_reference text,
  protocol text,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  unique (fiscal_document_id, attempt_number),
  unique (id, company_id),
  foreign key (fiscal_document_id, company_id) references public.fiscal_documents (id, company_id) on delete cascade
);

create index if not exists fiscal_authorization_attempts_document_idx on public.fiscal_authorization_attempts (fiscal_document_id, attempt_number desc);

comment on table public.fiscal_authorization_attempts is
  'Ledger de tentativas de autorização (seção 22.7/22.9) — uma linha por tentativa, nunca sobrescrita. request_reference/response_reference são ponteiros (mesmo padrão de xml_storage_reference), nenhum payload real armazenado aqui nesta fase.';

create or replace function public.fn_begin_fiscal_document_authorization(
  p_fiscal_document_id uuid,
  p_provider_code text default 'NONE',
  p_request_reference text default null
)
returns public.fiscal_authorization_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_next_attempt integer;
  v_attempt public.fiscal_authorization_attempts;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.submit_authorization') then
    raise exception 'Permissão negada (fiscal_documents.submit_authorization).' using errcode = '42501';
  end if;

  if v_document.status not in ('READY', 'REJECTED') then
    raise exception 'Só é possível iniciar a autorização de um documento pronto ou rejeitado (para nova tentativa, status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_next_attempt
  from public.fiscal_authorization_attempts where fiscal_document_id = p_fiscal_document_id;

  insert into public.fiscal_authorization_attempts (
    company_id, fiscal_document_id, provider_code, attempt_number, status, request_reference, created_by
  ) values (
    v_document.company_id, p_fiscal_document_id, coalesce(p_provider_code, 'NONE'), v_next_attempt, 'SENT', p_request_reference, public.current_app_user_id()
  )
  returning * into v_attempt;

  update public.fiscal_documents set status = 'AUTHORIZING' where id = p_fiscal_document_id;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, message, created_by)
  values (v_document.company_id, v_document.id, 'AUTHORIZING',
    format('Tentativa %s de autorização enviada ao provedor "%s".', v_next_attempt, coalesce(p_provider_code, 'NONE')), public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_authorization_attempts', v_attempt.id, 'CREATE',
    null, jsonb_build_object('fiscal_document_id', p_fiscal_document_id, 'attempt_number', v_next_attempt));

  return v_attempt;
end;
$$;

-- ==================================================================
-- fn_process_fiscal_authorization_response — o único ponto que marca
-- AUTHORIZED/REJECTED a partir de uma tentativa; delega para
-- fn_authorize_fiscal_document/fn_reject_fiscal_document (nunca
-- duplica a lógica de transição). ERROR mantém o documento em
-- AUTHORIZING (retomável por uma nova tentativa via
-- fn_begin_fiscal_document_authorization só depois de o chamador
-- decidir tratar como REJECTED, ou por uma futura função de timeout —
-- não implementada nesta fase).
-- ==================================================================
create or replace function public.fn_process_fiscal_authorization_response(
  p_attempt_id uuid,
  p_result text,
  p_access_key text default null,
  p_protocol text default null,
  p_receipt_number text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_response_reference text default null
)
returns public.fiscal_authorization_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.fiscal_authorization_attempts;
  v_document public.fiscal_documents;
begin
  if p_result not in ('AUTHORIZED', 'REJECTED', 'ERROR') then
    raise exception 'Resultado inválido: % (esperado AUTHORIZED, REJECTED ou ERROR).', p_result using errcode = '22023';
  end if;

  select * into v_attempt from public.fiscal_authorization_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'Tentativa de autorização não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_document from public.fiscal_documents where id = v_attempt.fiscal_document_id;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.submit_authorization') then
    raise exception 'Permissão negada (fiscal_documents.submit_authorization).' using errcode = '42501';
  end if;

  if v_attempt.status not in ('PENDING', 'SENT') then
    raise exception 'Esta tentativa já foi finalizada (status atual: %).', v_attempt.status using errcode = 'P0001';
  end if;

  update public.fiscal_authorization_attempts
  set status = p_result, protocol = p_protocol, error_code = p_error_code, error_message = p_error_message,
      response_reference = p_response_reference, finished_at = now()
  where id = p_attempt_id
  returning * into v_attempt;

  if p_result = 'AUTHORIZED' then
    perform public.fn_authorize_fiscal_document(v_attempt.fiscal_document_id, p_access_key, coalesce(p_protocol, v_attempt.request_reference), p_receipt_number);
  elsif p_result = 'REJECTED' then
    perform public.fn_reject_fiscal_document(v_attempt.fiscal_document_id, p_error_code, p_error_message);
  else
    insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, status_code, message, created_by)
    values (v_document.company_id, v_document.id, 'OTHER', p_error_code,
      coalesce(p_error_message, 'Erro técnico na tentativa de autorização — documento permanece em AUTHORIZING para nova tentativa.'), public.current_app_user_id());
  end if;

  return v_attempt;
end;
$$;

revoke all on function public.fn_begin_fiscal_document_authorization(uuid, text, text) from public;
revoke all on function public.fn_process_fiscal_authorization_response(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.fn_begin_fiscal_document_authorization(uuid, text, text) to authenticated;
grant execute on function public.fn_process_fiscal_authorization_response(uuid, text, text, text, text, text, text, text) to authenticated;

-- ==================================================================
-- 22.3 — XML: infraestrutura de referência/versionamento (nunca
-- armazenamento de arquivo real nesta fase — mesmo padrão de
-- xml_storage_reference/xml_sent_reference, 0039/0041, agora
-- generalizado para múltiplos tipos/versões).
-- ==================================================================
create table if not exists public.fiscal_document_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_id uuid not null,
  file_type text not null check (file_type in ('XML_SENT', 'XML_AUTHORIZED', 'XML_CANCELLATION', 'XML_CORRECTION_LETTER', 'XML_EVENT', 'OTHER')),
  version integer not null default 1 check (version > 0),
  storage_reference text not null,
  content_hash text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, file_type, version),
  foreign key (fiscal_document_id, company_id) references public.fiscal_documents (id, company_id) on delete cascade
);

create index if not exists fiscal_document_files_document_idx on public.fiscal_document_files (fiscal_document_id, file_type, version desc);

comment on table public.fiscal_document_files is
  'Referência (não o arquivo em si) a um XML do documento fiscal, versionado por tipo (seção 22.3). storage_reference é um ponteiro textual — nenhum armazenamento de arquivo implementado nesta fase (mesmo padrão documentado desde 0039); quando um storage real existir, storage_reference passa a apontar para lá sem mudança de schema.';

create or replace function public.fn_register_fiscal_document_file(
  p_fiscal_document_id uuid,
  p_file_type text,
  p_storage_reference text,
  p_content_hash text default null
)
returns public.fiscal_document_files
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_next_version integer;
  v_file public.fiscal_document_files;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_document_files.create') then
    raise exception 'Permissão negada (fiscal_document_files.create).' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.fiscal_document_files where fiscal_document_id = p_fiscal_document_id and file_type = p_file_type;

  insert into public.fiscal_document_files (company_id, fiscal_document_id, file_type, version, storage_reference, content_hash, created_by)
  values (v_document.company_id, p_fiscal_document_id, p_file_type, v_next_version, p_storage_reference, p_content_hash, public.current_app_user_id())
  returning * into v_file;

  return v_file;
end;
$$;

revoke all on function public.fn_register_fiscal_document_file(uuid, text, text, text) from public;
grant execute on function public.fn_register_fiscal_document_file(uuid, text, text, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('fiscal_provider_configs.view', 'fiscal_provider_configs', 'view', 'Consultar configuração de provedor fiscal e certificados'),
    ('fiscal_provider_configs.manage', 'fiscal_provider_configs', 'manage', 'Configurar provedor fiscal e registrar/desativar certificados (metadados apenas)'),
    ('fiscal_documents.submit_authorization', 'fiscal_documents', 'submit_authorization', 'Iniciar e processar o resultado de uma tentativa de autorização junto a um provedor externo'),
    ('fiscal_document_files.view', 'fiscal_document_files', 'view', 'Consultar referências de XML de documentos fiscais'),
    ('fiscal_document_files.create', 'fiscal_document_files', 'create', 'Registrar referência de XML de um documento fiscal')
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
alter table public.fiscal_provider_configs enable row level security;
alter table public.fiscal_digital_certificates enable row level security;
alter table public.fiscal_authorization_attempts enable row level security;
alter table public.fiscal_document_files enable row level security;

drop policy if exists fiscal_provider_configs_select on public.fiscal_provider_configs;
create policy fiscal_provider_configs_select on public.fiscal_provider_configs
  for select to authenticated using (public.has_permission(company_id, 'fiscal_provider_configs.view'));

drop policy if exists fiscal_digital_certificates_select on public.fiscal_digital_certificates;
create policy fiscal_digital_certificates_select on public.fiscal_digital_certificates
  for select to authenticated using (public.has_permission(company_id, 'fiscal_provider_configs.view'));

drop policy if exists fiscal_authorization_attempts_select on public.fiscal_authorization_attempts;
create policy fiscal_authorization_attempts_select on public.fiscal_authorization_attempts
  for select to authenticated using (public.has_permission(company_id, 'fiscal_documents.view'));

drop policy if exists fiscal_document_files_select on public.fiscal_document_files;
create policy fiscal_document_files_select on public.fiscal_document_files
  for select to authenticated using (public.has_permission(company_id, 'fiscal_document_files.view'));
