-- 0100 — Numerar a NF-e não exige a permissão de configurar sequências.
--
-- Encontrado em produção (20/10): o Gerente, que tem todas as permissões
-- fiscais (criar, calcular, conferir e autorizar documento), recebia
-- "Permissão negada (document_sequences.update)" ao emitir a NF-e, porque a
-- numeração chamava fn_next_document_number, que exige a permissão de
-- CONFIGURAR sequências (administração).
--
-- Mesma correção da 0083 da linha Neon (R2-04/R2-05/R2-06/R2-08), trazida
-- para o Supabase, mais: a série 1 do estabelecimento é criada sozinha na
-- primeira nota (antes exigia document_sequences.create).
--   * fn_next_document_number_internal: próximo número sem checar permissão
--     de configuração; não é executável por usuários, só por funções que já
--     conferiram a permissão do documento.
--   * fn_assign_fiscal_document_number: exige fiscal_documents.calculate;
--     numera em rascunho, calculado, conferido ou rejeitado; nunca troca um
--     número já dado (não abre buraco na série).
--   * Índice único: dois documentos de saída não têm o mesmo número/série no
--     estabelecimento. Antes, a migration confere e PARA se houver repetidos.
-- Pode rodar de novo.

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
revoke all on function public.fn_next_document_number_internal(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.fn_assign_fiscal_document_number(p_fiscal_document_id uuid, p_series_code text default '1')
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_next record;
  v_series text := coalesce(nullif(trim(p_series_code), ''), '1');
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

  -- Primeira nota do estabelecimento: cria a série (numeração da NF-e com 9 dígitos).
  insert into public.document_sequences (company_id, document_type, series_code, establishment_id, description, current_number, padding, status)
  select v_document.company_id, 'FISCAL_DOCUMENT', v_series, v_document.fiscal_establishment_id, format('NF-e série %s', v_series), 0, 9, 'active'
  where not exists (
    select 1 from public.document_sequences s
    where s.company_id = v_document.company_id and s.document_type = 'FISCAL_DOCUMENT' and s.series_code = v_series
      and coalesce(s.establishment_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_document.fiscal_establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  on conflict do nothing;

  select * into v_next from public.fn_next_document_number_internal(
    v_document.company_id, 'FISCAL_DOCUMENT', v_series, v_document.fiscal_establishment_id
  );

  update public.fiscal_documents set number = v_next.number, series = v_series
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'UPDATE',
    jsonb_build_object('number', null), jsonb_build_object('number', v_document.number, 'series', v_document.series));

  return v_document;
end;
$$;
revoke execute on function public.fn_assign_fiscal_document_number(uuid, text) from public, anon;
grant execute on function public.fn_assign_fiscal_document_number(uuid, text) to authenticated, service_role;
