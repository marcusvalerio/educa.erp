-- Fase 9 — Fiscal Operacional: estado READY (conferência fiscal) entre
-- CALCULATED e AUTHORIZED, deepening de transporte/XML/volumes no
-- cabeçalho, e imutabilidade dos dados fiscais consolidados.
--
-- Ciclo de vida final: DRAFT -> CALCULATED -> READY -> AUTHORIZED ->
-- CANCELLED, com REJECTED/DENIED/CONTINGENCY como estados de erro já
-- existentes desde 0039. Autorização continua sendo só uma
-- representação interna (seção 2) — nenhuma comunicação com SEFAZ.

-- ==================================================================
-- Amplia fiscal_documents.status (+READY) e fiscal_document_events.
-- event_type (+READY/INUTILIZATION/MANIFESTATION, seção 12) via lookup
-- dinâmico do nome da constraint — mesma técnica de audit_logs.action
-- desde 0031, nunca hardcoded.
-- ==================================================================
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
  check (status in ('DRAFT', 'CALCULATED', 'READY', 'AUTHORIZED', 'CANCELLED', 'DENIED', 'REJECTED', 'CONTINGENCY'));

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
    'CREATED', 'CALCULATED', 'READY', 'AUTHORIZED', 'CANCELLED', 'REJECTED', 'DENIED',
    'CONTINGENCY', 'CORRECTION_LETTER', 'INUTILIZATION', 'MANIFESTATION', 'OTHER'
  ));

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.fiscal_documents'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%source_type%';
  if v_conname is not null then
    execute format('alter table public.fiscal_documents drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.fiscal_documents
  add constraint fiscal_documents_source_type_check
  check (source_type is null or source_type in (
    'purchase_receipt', 'sales_order', 'shipment', 'manual', 'return', 'transfer_out', 'transfer_in'
  ));

comment on column public.fiscal_documents.source_type is
  'Referência polimórfica (sem FK). transfer_out/transfer_in (seção 7) permitem que as duas pernas de uma transferência entre estabelecimentos compartilhem o mesmo source_id (o stock_transfer) sem colidir no índice único de idempotência por origem — cada perna tem seu próprio source_type.';

-- ==================================================================
-- Deepening de cabeçalho (seções 9-13): transporte (peso/volumes),
-- metadados de integração futura (ambiente/serviço/retorno) — nenhuma
-- comunicação externa implementada, só os campos preparados.
-- ==================================================================
alter table public.fiscal_documents add column if not exists freight_mode text;
alter table public.fiscal_documents add column if not exists gross_weight numeric(12, 3);
alter table public.fiscal_documents add column if not exists net_weight numeric(12, 3);
alter table public.fiscal_documents add column if not exists volumes_quantity integer;
alter table public.fiscal_documents add column if not exists environment text not null default 'HOMOLOGATION';
alter table public.fiscal_documents add column if not exists service text;
alter table public.fiscal_documents add column if not exists return_message text;
alter table public.fiscal_documents add column if not exists authorized_at timestamptz;
alter table public.fiscal_documents add column if not exists xml_sent_reference text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_freight_mode_check') then
    alter table public.fiscal_documents
      add constraint fiscal_documents_freight_mode_check
      check (freight_mode is null or freight_mode in ('EMITENTE', 'DESTINATARIO', 'TERCEIROS', 'SEM_FRETE', 'OTHER'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_gross_weight_check') then
    alter table public.fiscal_documents add constraint fiscal_documents_gross_weight_check check (gross_weight is null or gross_weight >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_net_weight_check') then
    alter table public.fiscal_documents add constraint fiscal_documents_net_weight_check check (net_weight is null or net_weight >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_volumes_quantity_check') then
    alter table public.fiscal_documents add constraint fiscal_documents_volumes_quantity_check check (volumes_quantity is null or volumes_quantity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_environment_check') then
    alter table public.fiscal_documents add constraint fiscal_documents_environment_check check (environment in ('PRODUCTION', 'HOMOLOGATION'));
  end if;
end;
$$;

comment on column public.fiscal_documents.environment is
  'Ambiente de emissão futura (produção/homologação) — só um rótulo preparado nesta etapa (seção 13), default HOMOLOGATION. Nenhuma emissão real acontece.';
comment on column public.fiscal_documents.xml_sent_reference is
  'Ponteiro para um XML ENVIADO futuro — xml_storage_reference (0039) permanece o ponteiro do XML de RETORNO/autorizado. Nenhum armazenamento de arquivo ou certificado implementado.';

-- ==================================================================
-- fn_mark_fiscal_document_ready — conferência fiscal (seção 3). Valida
-- que o documento está completo antes de liberar para autorização;
-- nenhuma transição arbitrária (só CALCULATED -> READY).
-- ==================================================================
create or replace function public.fn_mark_fiscal_document_ready(p_fiscal_document_id uuid)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_establishment public.fiscal_establishments;
  v_nature public.fiscal_operation_natures;
  v_item_count integer;
  v_incomplete_items integer;
  v_expected_total numeric;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.ready') then
    raise exception 'Permissão negada (fiscal_documents.ready).' using errcode = '42501';
  end if;

  if v_document.status <> 'CALCULATED' then
    raise exception 'Só é possível confirmar a conferência fiscal de um documento calculado (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  select * into v_establishment from public.fiscal_establishments where id = v_document.fiscal_establishment_id;
  if not found or v_establishment.status <> 'active' then
    raise exception 'Estabelecimento fiscal inválido ou inativo.' using errcode = 'P0001';
  end if;

  select * into v_nature from public.fiscal_operation_natures where id = v_document.operation_nature_id;
  if not found or v_nature.status <> 'active' then
    raise exception 'Natureza de operação inválida ou inativa.' using errcode = 'P0001';
  end if;

  if v_document.direction = 'SAIDA' and v_document.customer_id is null then
    raise exception 'Documento de saída precisa de um cliente.' using errcode = 'P0001';
  end if;
  if v_document.direction = 'ENTRADA' and v_document.supplier_id is null then
    raise exception 'Documento de entrada precisa de um fornecedor.' using errcode = 'P0001';
  end if;

  select count(*) into v_item_count from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id;
  if v_item_count = 0 then
    raise exception 'Documento sem itens não pode ser confirmado.' using errcode = 'P0001';
  end if;

  select count(*) into v_incomplete_items
  from public.fiscal_document_items
  where fiscal_document_id = p_fiscal_document_id
    and (ncm_code is null or trim(ncm_code) = '' or cfop_code is null or trim(cfop_code) = ''
      or origin_code is null or quantity <= 0 or unit_price < 0 or unit is null or trim(unit) = '');
  if v_incomplete_items > 0 then
    raise exception '% item(ns) com dados fiscais incompletos (NCM/CFOP/origem/unidade/quantidade).', v_incomplete_items using errcode = 'P0001';
  end if;

  if v_document.products_amount <= 0 then
    raise exception 'Valor de produtos deve ser maior que zero.' using errcode = 'P0001';
  end if;

  v_expected_total := v_document.products_amount - v_document.discount_amount + v_document.freight_amount
    + v_document.insurance_amount + v_document.other_expenses_amount + v_document.taxes_amount;
  if round(v_expected_total, 2) <> round(v_document.total_amount, 2) then
    raise exception 'Totalização inconsistente: esperado %, armazenado %. Recalcule o documento.', v_expected_total, v_document.total_amount using errcode = 'P0001';
  end if;

  update public.fiscal_documents set status = 'READY' where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, message, created_by)
  values (v_document.company_id, v_document.id, 'READY', 'Conferência fiscal concluída — documento pronto para autorização.', public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'UPDATE',
    jsonb_build_object('status', 'CALCULATED'), jsonb_build_object('status', 'READY'));

  return v_document;
end;
$$;

revoke all on function public.fn_mark_fiscal_document_ready(uuid) from public;
grant execute on function public.fn_mark_fiscal_document_ready(uuid) to authenticated;

-- ==================================================================
-- fn_register_fiscal_document_event — create or replace (0040): amplia
-- o vocabulário aceito para registro manual (+INUTILIZATION/
-- MANIFESTATION, seção 12). READY/CREATED/CALCULATED/AUTHORIZED/
-- REJECTED/CANCELLED continuam exclusivos do ciclo de vida automático.
-- ==================================================================
create or replace function public.fn_register_fiscal_document_event(
  p_fiscal_document_id uuid,
  p_event_type text,
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
  v_event public.fiscal_document_events;
begin
  if p_event_type not in ('CONTINGENCY', 'CORRECTION_LETTER', 'OTHER', 'DENIED', 'INUTILIZATION', 'MANIFESTATION') then
    raise exception 'Tipo de evento inválido para registro manual: % (CREATED/CALCULATED/READY/AUTHORIZED/REJECTED/CANCELLED são gravados automaticamente pelo ciclo de vida do documento).', p_event_type using errcode = '22023';
  end if;

  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_document_events.create') then
    raise exception 'Permissão negada (fiscal_document_events.create).' using errcode = '42501';
  end if;

  insert into public.fiscal_document_events (
    company_id, fiscal_document_id, event_type, protocol, status_code, message, payload_reference, created_by
  ) values (
    v_document.company_id, p_fiscal_document_id, p_event_type, p_protocol, p_status_code, p_message, p_payload_reference, public.current_app_user_id()
  )
  returning * into v_event;

  if p_event_type = 'DENIED' then
    update public.fiscal_documents set status = 'DENIED' where id = p_fiscal_document_id;
  elsif p_event_type = 'CONTINGENCY' then
    update public.fiscal_documents set status = 'CONTINGENCY' where id = p_fiscal_document_id and status not in ('CANCELLED', 'AUTHORIZED');
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_document_events', v_event.id, 'EVENT',
    null, jsonb_build_object('fiscal_document_id', p_fiscal_document_id, 'event_type', p_event_type));

  return v_event;
end;
$$;

-- ==================================================================
-- fn_calculate_fiscal_document — create or replace IDÊNTICA a 0039,
-- só troca a permissão exigida para a mais específica desta fase
-- (seção 16). Nunca editar 0039 diretamente.
-- ==================================================================
create or replace function public.fn_calculate_fiscal_document(p_fiscal_document_id uuid)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_establishment public.fiscal_establishments;
  v_customer public.customers;
  v_supplier public.suppliers;
  v_origin_uf text;
  v_destination_uf text;
  v_item record;
  v_tax record;
  v_basis numeric;
  v_amount numeric;
  v_products_amount numeric := 0;
  v_taxes_amount numeric := 0;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.calculate') then
    raise exception 'Permissão negada (fiscal_documents.calculate).' using errcode = '42501';
  end if;

  if v_document.status not in ('DRAFT', 'CALCULATED') then
    raise exception 'Só é possível calcular um documento em rascunho ou já calculado (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id) then
    raise exception 'O documento precisa de ao menos um item para ser calculado.' using errcode = 'P0001';
  end if;

  select * into v_establishment from public.fiscal_establishments where id = v_document.fiscal_establishment_id;
  if v_document.customer_id is not null then
    select * into v_customer from public.customers where id = v_document.customer_id;
  end if;
  if v_document.supplier_id is not null then
    select * into v_supplier from public.suppliers where id = v_document.supplier_id;
  end if;

  if v_document.direction = 'SAIDA' then
    v_origin_uf := v_establishment.state;
    v_destination_uf := v_customer.state;
  else
    v_origin_uf := v_supplier.state;
    v_destination_uf := v_establishment.state;
  end if;

  delete from public.fiscal_document_item_taxes
  where fiscal_document_item_id in (select id from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id);

  for v_item in select * from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id
  loop
    v_products_amount := v_products_amount + v_item.total_amount;

    for v_tax in
      select * from public.fn_resolve_applicable_tax_rules(
        v_document.company_id, v_item.product_id, v_item.ncm_id, v_item.origin_code, v_item.cfop_id,
        v_document.operation_nature_id, v_origin_uf, v_destination_uf, v_establishment.tax_regime,
        v_document.customer_id, v_document.supplier_id, v_document.issue_date
      )
    loop
      v_basis := round(v_item.total_amount * (1 - v_tax.reduction_percentage / 100), 4);
      v_amount := round(v_basis * v_tax.rate / 100, 4);
      v_taxes_amount := v_taxes_amount + v_amount;

      insert into public.fiscal_document_item_taxes (
        company_id, fiscal_document_item_id, tax_type, cst, csosn, calculation_basis, rate, reduction_percentage, amount, source_tax_rule_id
      ) values (
        v_document.company_id, v_item.id, v_tax.tax_type, v_tax.cst, v_tax.csosn, v_basis, v_tax.rate, v_tax.reduction_percentage, v_amount, v_tax.tax_rule_id
      );
    end loop;
  end loop;

  update public.fiscal_documents
  set products_amount = v_products_amount,
      taxes_amount = v_taxes_amount,
      total_amount = v_products_amount - discount_amount + freight_amount + insurance_amount + other_expenses_amount + v_taxes_amount,
      status = 'CALCULATED'
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, message, created_by)
  values (v_document.company_id, v_document.id, 'CALCULATED',
    format('Total: %s (produtos %s + impostos %s)', v_document.total_amount, v_products_amount, v_taxes_amount), public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'UPDATE',
    null, jsonb_build_object('status', 'CALCULATED', 'total_amount', v_document.total_amount));

  return v_document;
end;
$$;

-- ==================================================================
-- fn_authorize_fiscal_document — create or replace: agora exige READY
-- (não mais CALCULATED, seção 2) e permissão específica (seção 16).
-- Continua sendo só uma representação interna — nenhuma comunicação
-- com SEFAZ.
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

  if v_document.status <> 'READY' then
    raise exception 'Só é possível autorizar um documento com conferência fiscal concluída (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  update public.fiscal_documents
  set status = 'AUTHORIZED', access_key = p_access_key, protocol = p_protocol, receipt_number = p_receipt_number, authorized_at = now()
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, protocol, message, created_by)
  values (v_document.company_id, v_document.id, 'AUTHORIZED', p_protocol, 'Documento autorizado.', public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'AUTHORIZE',
    jsonb_build_object('status', 'READY'), jsonb_build_object('status', 'AUTHORIZED', 'access_key', p_access_key));

  return v_document;
end;
$$;

-- ==================================================================
-- Imutabilidade (seção 14): dados fiscais consolidados de um documento
-- em READY/AUTHORIZED nunca mudam, mesmo que NCM/CFOP/regra tributária
-- sejam alterados depois. status em si continua mutável (cancelamento
-- é sempre uma troca pura de status). Itens e tributos ficam travados
-- a partir do primeiro status que não seja DRAFT/CALCULATED.
-- ==================================================================
create or replace function public.fn_guard_fiscal_document_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if OLD.status in ('READY', 'AUTHORIZED') then
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

drop trigger if exists guard_snapshot on public.fiscal_documents;
create trigger guard_snapshot before update on public.fiscal_documents
  for each row execute procedure public.fn_guard_fiscal_document_snapshot();

create or replace function public.fn_guard_fiscal_document_items_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from public.fiscal_documents where id = coalesce(NEW.fiscal_document_id, OLD.fiscal_document_id);
  if v_status is not null and v_status not in ('DRAFT', 'CALCULATED') then
    raise exception 'Itens de um documento fiscal no status % são imutáveis.', v_status using errcode = 'P0001';
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists guard_items_immutable on public.fiscal_document_items;
create trigger guard_items_immutable before update or delete on public.fiscal_document_items
  for each row execute procedure public.fn_guard_fiscal_document_items_immutable();

create or replace function public.fn_guard_fiscal_document_item_taxes_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select fd.status into v_status
  from public.fiscal_document_items fi
  join public.fiscal_documents fd on fd.id = fi.fiscal_document_id
  where fi.id = coalesce(NEW.fiscal_document_item_id, OLD.fiscal_document_item_id);
  if v_status is not null and v_status not in ('DRAFT', 'CALCULATED') then
    raise exception 'Tributos de um documento fiscal no status % são imutáveis.', v_status using errcode = 'P0001';
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists guard_item_taxes_immutable on public.fiscal_document_item_taxes;
create trigger guard_item_taxes_immutable before update or delete on public.fiscal_document_item_taxes
  for each row execute procedure public.fn_guard_fiscal_document_item_taxes_immutable();

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('fiscal_documents.calculate', 'fiscal_documents', 'calculate', 'Calcular (ou recalcular) os tributos de um documento fiscal'),
    ('fiscal_documents.ready', 'fiscal_documents', 'ready', 'Confirmar a conferência fiscal de um documento calculado (READY)'),
    ('fiscal_documents.authorize', 'fiscal_documents', 'authorize', 'Autorizar um documento fiscal com conferência concluída (representação interna)')
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
