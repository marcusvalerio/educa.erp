-- 0083 — Rodada 2 (48 usuários): numeração e autorização da NF-e.
--
-- Encontrado no roteiro fiscal (antes: 2 PASS / 11 FAIL na Vértice):
--   R2-04  o papel Fiscal (e o Gerente) NÃO conseguia numerar: a numeração
--          exigia a permissão de configurar sequências (document_sequences.update).
--   R2-05  documento conferido ("pronto") sem número ficava travado: só se
--          numerava em rascunho.
--   R2-06  numerar duas vezes trocava o número e abria buraco na série.
--   R2-07  a autorização MANUAL aceitava documento sem número e qualquer texto
--          como chave de acesso ("123").
--   R2-08  dois documentos de SAÍDA podiam ter o mesmo número/série no
--          estabelecimento (nada no banco impedia).
--   R2-09  o checklist da 1ª NF-e dizia "pronto" sem série de numeração.
--
-- Antes do índice único a migration CONFERE números de saída repetidos e
-- PARA se encontrar (não renumera documento sozinha).

do $$
declare
  v_dup text;
begin
  select string_agg(format('%s (série %s, nº %s)', docs, serie, number), '; ')
  into v_dup
  from (
    select company_id, fiscal_establishment_id, coalesce(model, '55') model, coalesce(series, '1') serie, number,
           string_agg(code, ', ' order by created_at) docs
    from public.fiscal_documents
    where direction = 'SAIDA' and number is not null
    group by 1, 2, 3, 4, 5 having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Há documentos de saída com o mesmo número na mesma série: %. Trate-os antes de aplicar esta migration.', v_dup;
  end if;
end $$;

create unique index if not exists fiscal_documents_own_number_unique
  on public.fiscal_documents (company_id, fiscal_establishment_id, coalesce(model, '55'), coalesce(series, '1'), number)
  where direction = 'SAIDA' and number is not null;

-- Próximo número SEM checar permissão de configuração: só chamada por funções
-- que já conferiram a permissão do documento (não exposta a usuários).
create or replace function public.fn_next_document_number_internal(
  p_company_id uuid, p_document_type text, p_series_code text default '1', p_establishment_id uuid default null
)
returns table(sequence_id uuid, number bigint, formatted_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence public.document_sequences;
  v_next bigint;
begin
  select * into v_sequence from public.document_sequences
  where company_id = p_company_id and document_type = p_document_type and series_code = coalesce(p_series_code, '1')
    and coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  for update;
  if not found then
    raise exception 'Não há série de numeração de documento fiscal (série %) para este estabelecimento. Cadastre a série antes de numerar.', coalesce(p_series_code, '1') using errcode = 'P0001';
  end if;
  if v_sequence.status <> 'active' then
    raise exception 'A série de numeração % está inativa.', v_sequence.series_code using errcode = 'P0001';
  end if;
  v_next := v_sequence.current_number + 1;
  update public.document_sequences set current_number = v_next where id = v_sequence.id;
  return query select v_sequence.id, v_next, coalesce(v_sequence.prefix || '-', '') || lpad(v_next::text, v_sequence.padding, '0');
end;
$$;
revoke all on function public.fn_next_document_number_internal(uuid, text, text, uuid) from public;
revoke all on function public.fn_next_document_number_internal(uuid, text, text, uuid) from authenticated;

create or replace function public.fn_assign_fiscal_document_number(p_fiscal_document_id uuid, p_series_code text default '1')
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_next record;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.calculate') then
    raise exception 'Permissão negada (fiscal_documents.calculate).' using errcode = '42501';
  end if;

  if v_document.number is not null then
    raise exception 'O documento % já tem o número % (série %). Número de documento não é trocado.', v_document.code, v_document.number, coalesce(v_document.series, '1') using errcode = 'P0001';
  end if;

  if v_document.status not in ('DRAFT', 'CALCULATED', 'READY', 'REJECTED') then
    raise exception 'Só é possível numerar um documento ainda não autorizado (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  select * into v_next from public.fn_next_document_number_internal(
    v_document.company_id, 'FISCAL_DOCUMENT', coalesce(p_series_code, '1'), v_document.fiscal_establishment_id
  );

  update public.fiscal_documents set number = v_next.number, series = coalesce(p_series_code, '1')
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'UPDATE',
    jsonb_build_object('number', null), jsonb_build_object('number', v_document.number, 'series', v_document.series));

  return v_document;
end;
$$;

-- Chave de acesso: 44 dígitos e DV módulo 11 correto.
create or replace function public.fn_fiscal_access_key_is_valid(p_key text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_key, '') ~ '^\d{44}$'
    and public.fn_access_key_check_digit(left(p_key, 43)) = right(p_key, 1)::integer;
$$;

create or replace function public.fn_authorize_fiscal_document(p_fiscal_document_id uuid, p_access_key text, p_protocol text default null, p_receipt_number text default null)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_key text := regexp_replace(coalesce(p_access_key, ''), '\s', '', 'g');
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.authorize') then
    raise exception 'Permissão negada (fiscal_documents.authorize).' using errcode = '42501';
  end if;

  if v_document.status = 'AUTHORIZED' then
    raise exception 'O documento % já está autorizado (chave %). Nada foi refeito.', v_document.code, v_document.access_key using errcode = 'P0001';
  end if;

  if v_document.status not in ('READY', 'AUTHORIZING') then
    raise exception 'Só é possível autorizar um documento com conferência fiscal concluída ou em processo de autorização (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  if v_document.number is null then
    raise exception 'O documento % está sem número. Numere-o antes de autorizar.', v_document.code using errcode = 'P0001';
  end if;

  if not public.fn_fiscal_access_key_is_valid(v_key) then
    raise exception 'Chave de acesso inválida: informe os 44 dígitos da chave, com o dígito verificador correto.' using errcode = '22023';
  end if;

  if substr(v_key, 26, 9)::bigint <> v_document.number then
    raise exception 'A chave de acesso informada é de outro número de documento (a chave traz o nº %, o documento é o nº %).', substr(v_key, 26, 9)::bigint, v_document.number using errcode = '22023';
  end if;

  update public.fiscal_documents
  set status = 'AUTHORIZED', access_key = v_key, protocol = p_protocol, receipt_number = p_receipt_number, authorized_at = now()
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, protocol, message, created_by)
  values (v_document.company_id, v_document.id, 'AUTHORIZED', p_protocol,
    case when coalesce(p_protocol, '') like 'SIMULACAO-%' then 'Documento autorizado na SIMULAÇÃO (sem valor fiscal, sem transmissão à SEFAZ).' else 'Documento autorizado.' end,
    public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'AUTHORIZE',
    jsonb_build_object('status', 'READY/AUTHORIZING'), jsonb_build_object('status', 'AUTHORIZED', 'access_key', v_key));

  return v_document;
end;
$$;

-- Checklist da 1ª NF-e passa a contar as séries de numeração ativas.
drop function if exists public.fn_fiscal_setup_status(uuid);
create function public.fn_fiscal_setup_status(p_company_id uuid)
returns table(establishments integer, outbound_natures integer, outbound_natures_with_cfop integer, cfops integer, ncms integer,
  active_products integer, products_with_ncm integer, fiscal_series integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'fiscal_documents.view') then
    raise exception 'Permissão negada (fiscal_documents.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.fiscal_establishments fe where fe.company_id = p_company_id and fe.status = 'active'),
    (select count(*)::integer from public.fiscal_operation_natures n where n.company_id = p_company_id and n.status = 'active' and n.direction = 'SAIDA'),
    (select count(*)::integer from public.fiscal_operation_natures n where n.company_id = p_company_id and n.status = 'active' and n.direction = 'SAIDA' and n.default_cfop_id is not null),
    (select count(*)::integer from public.fiscal_cfops c where c.company_id = p_company_id and c.status = 'active'),
    (select count(*)::integer from public.fiscal_ncms n where n.company_id = p_company_id and n.status = 'active'),
    (select count(*)::integer from public.products p where p.company_id = p_company_id and p.status = 'active'),
    (select count(distinct pf.product_id)::integer from public.product_fiscal_profiles pf
      join public.products p on p.id = pf.product_id and p.status = 'active'
      where pf.company_id = p_company_id and pf.status = 'active' and pf.ncm_id is not null),
    (select count(*)::integer from public.document_sequences ds
      where ds.company_id = p_company_id and ds.document_type = 'FISCAL_DOCUMENT' and ds.status = 'active');
end;
$$;
revoke all on function public.fn_fiscal_setup_status(uuid) from public;
grant execute on function public.fn_fiscal_setup_status(uuid) to authenticated;
revoke all on function public.fn_fiscal_access_key_is_valid(text) from public;
grant execute on function public.fn_fiscal_access_key_is_valid(text) to authenticated;
