-- Fase 21 — Importação + Exportação: infraestrutura genérica e
-- reutilizável (seção 21). Um único mecanismo de import job por
-- entidade — nunca um importador isolado por cadastro. O PARSING do
-- arquivo (CSV/XLSX) acontece em TypeScript (Node, fora do banco); esta
-- migration cobre o ESTADO rastreável do processo (job -> linhas
-- encenadas -> erros), a mesma separação já usada pelo resto do ERP
-- entre "o que é regra transacional" (no banco) e "o que é
-- parsing/E-S de arquivo" (na API).

-- ==================================================================
-- IMPORT_JOBS — cabeçalho do processo de importação (seção 21.2).
-- ==================================================================
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null,
  entity_type text not null,
  format text not null check (format in ('CSV', 'XLSX')),
  original_filename text,
  status text not null default 'UPLOADED' check (status in (
    'UPLOADED', 'VALIDATING', 'READY', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'
  )),
  column_mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  success_rows integer not null default 0 check (success_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  started_by uuid references public.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.import_jobs
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists import_jobs_company_status_idx on public.import_jobs (company_id, status);
create index if not exists import_jobs_entity_idx on public.import_jobs (company_id, entity_type);

comment on table public.import_jobs is
  'Cabeçalho de um processo de importação (seção 21.2). Estados: UPLOADED -> VALIDATING -> READY -> PROCESSING -> COMPLETED/COMPLETED_WITH_ERRORS, com FAILED (erro fatal, ex.: zero linhas válidas) e CANCELLED (a partir de qualquer estado não terminal) como saídas alternativas.';

-- ==================================================================
-- IMPORT_JOB_ROWS — linha encenada (seção 21.2/21.3): nenhum registro é
-- persistido na tabela de destino só por causa do upload — raw_data é o
-- dado bruto da linha do arquivo (chave = cabeçalho da coluna, valor =
-- texto), sempre preservado mesmo depois de processado.
-- ==================================================================
create table if not exists public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_job_id uuid not null,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'VALID', 'INVALID', 'PROCESSED', 'FAILED', 'SKIPPED')),
  natural_key text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (import_job_id, row_number),
  unique (id, company_id),
  foreign key (import_job_id, company_id) references public.import_jobs (id, company_id) on delete cascade
);

create index if not exists import_job_rows_job_idx on public.import_job_rows (import_job_id, row_number);
create index if not exists import_job_rows_job_status_idx on public.import_job_rows (import_job_id, status);

comment on table public.import_job_rows is
  'Linha encenada de um import job. status PROCESSED é terminal e nunca reprocessado de novo (seção 21.8: "registros concluídos não devem ser duplicados") — um reprocessamento só atua sobre linhas FAILED.';

-- ==================================================================
-- IMPORT_JOB_ERRORS — erro/aviso por linha (seção 21.6).
-- ==================================================================
create table if not exists public.import_job_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_job_id uuid not null,
  import_job_row_id uuid,
  row_number integer not null,
  column_name text,
  value_text text,
  error_code text,
  message text not null,
  severity text not null default 'ERROR' check (severity in ('ERROR', 'WARNING')),
  created_at timestamptz not null default now(),
  foreign key (import_job_id, company_id) references public.import_jobs (id, company_id) on delete cascade,
  foreign key (import_job_row_id, company_id) references public.import_job_rows (id, company_id) on delete cascade
);

create index if not exists import_job_errors_job_idx on public.import_job_errors (import_job_id, row_number);

comment on table public.import_job_errors is
  'Erro/aviso de uma linha (seção 21.6): row_number/column_name/value_text/error_code/message/severity — o suficiente para o usuário localizar e corrigir a origem sem reabrir o arquivo.';

-- ==================================================================
-- EXPORT_JOBS — auditoria de exportação (seção 21.12/21.14). A geração
-- em si é síncrona (a API gera e devolve o arquivo na mesma chamada);
-- esta tabela é só o registro de auditoria do que foi exportado, não
-- uma fila assíncrona.
-- ==================================================================
create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null,
  entity_type text not null,
  format text not null check (format in ('CSV', 'XLSX')),
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  status text not null default 'COMPLETED' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  total_rows integer not null default 0 check (total_rows >= 0),
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists export_jobs_company_idx on public.export_jobs (company_id, created_at desc);

comment on table public.export_jobs is
  'Registro de auditoria de uma exportação (seção 21.12: usuário/empresa/arquivo/entidade/quantidade/resultado/data-hora) — geração síncrona, não uma fila.';

-- ==================================================================
-- fn_create_import_job
-- ==================================================================
create or replace function public.fn_create_import_job(
  p_company_id uuid,
  p_module text,
  p_entity_type text,
  p_format text,
  p_original_filename text default null
)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  if not public.has_permission(p_company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  insert into public.import_jobs (company_id, module, entity_type, format, original_filename, started_by)
  values (p_company_id, p_module, p_entity_type, p_format, p_original_filename, public.current_app_user_id())
  returning * into v_job;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'import_jobs', v_job.id, 'CREATE', null,
    jsonb_build_object('module', p_module, 'entity_type', p_entity_type, 'format', p_format));

  return v_job;
end;
$$;

-- ==================================================================
-- fn_stage_import_rows — encenação em lote (seção 21.2/21.3): recebe um
-- array json com o conteúdo já parseado em TypeScript (o parsing de
-- CSV/XLSX nunca acontece no banco) e grava as linhas de uma vez.
-- Só permitido enquanto o job está UPLOADED (a primeira e única carga).
-- ==================================================================
create or replace function public.fn_stage_import_rows(p_import_job_id uuid, p_rows jsonb)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
  v_count integer;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status <> 'UPLOADED' then
    raise exception 'Só é possível encenar linhas em um job recém-enviado (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  insert into public.import_job_rows (company_id, import_job_id, row_number, raw_data)
  select v_job.company_id, p_import_job_id, (row_number() over ())::integer, elem
  from jsonb_array_elements(p_rows) as elem;

  get diagnostics v_count = row_count;

  update public.import_jobs set total_rows = v_count where id = p_import_job_id returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.fn_set_import_job_mapping(p_import_job_id uuid, p_mapping jsonb)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status not in ('UPLOADED', 'VALIDATING', 'FAILED') then
    raise exception 'Só é possível alterar o mapeamento antes do processamento (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  update public.import_jobs set column_mapping = p_mapping, status = 'UPLOADED' where id = p_import_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.fn_start_import_validation(p_import_job_id uuid)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status <> 'UPLOADED' then
    raise exception 'Só é possível validar um job recém-enviado (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  if v_job.column_mapping = '{}'::jsonb then
    raise exception 'Configure o mapeamento de colunas antes de validar.' using errcode = 'P0001';
  end if;

  update public.import_jobs set status = 'VALIDATING' where id = p_import_job_id returning * into v_job;
  return v_job;
end;
$$;

-- ==================================================================
-- fn_record_import_row_validation — chamada uma vez por linha pelo
-- motor em TypeScript, durante VALIDATING (seção 21.5).
-- ==================================================================
create or replace function public.fn_record_import_row_validation(p_import_job_row_id uuid, p_status text, p_natural_key text default null)
returns public.import_job_rows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.import_job_rows;
  v_job public.import_jobs;
begin
  if p_status not in ('VALID', 'INVALID') then
    raise exception 'Status de validação inválido: %.', p_status using errcode = '22023';
  end if;

  select * into v_row from public.import_job_rows where id = p_import_job_row_id;
  if not found then
    raise exception 'Linha de importação não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_job from public.import_jobs where id = v_row.import_job_id;
  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;
  if v_job.status <> 'VALIDATING' then
    raise exception 'O job não está em validação (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  update public.import_job_rows set status = p_status, natural_key = p_natural_key where id = p_import_job_row_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.fn_record_import_error(
  p_import_job_id uuid,
  p_import_job_row_id uuid,
  p_row_number integer,
  p_column_name text,
  p_value_text text,
  p_error_code text,
  p_message text,
  p_severity text default 'ERROR'
)
returns public.import_job_errors
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
  v_error public.import_job_errors;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  insert into public.import_job_errors (
    company_id, import_job_id, import_job_row_id, row_number, column_name, value_text, error_code, message, severity
  ) values (
    v_job.company_id, p_import_job_id, p_import_job_row_id, p_row_number, p_column_name, p_value_text, p_error_code,
    p_message, coalesce(p_severity, 'ERROR')
  )
  returning * into v_error;

  return v_error;
end;
$$;

-- ==================================================================
-- fn_complete_import_validation — fecha a contagem de VALIDATING
-- (seção 21.3/21.6): READY se houver ao menos 1 linha VALID, senão
-- FAILED (nenhuma linha aproveitável — erro fatal do arquivo).
-- ==================================================================
-- ==================================================================
-- fn_clear_import_job_errors — limpa os erros de uma tentativa de
-- validação anterior antes de revalidar (ex.: depois de corrigir o
-- mapeamento de colunas) — evita acumular erros obsoletos de uma
-- tentativa que não reflete mais o mapeamento atual.
-- ==================================================================
create or replace function public.fn_clear_import_job_errors(p_import_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  delete from public.import_job_errors where import_job_id = p_import_job_id;
end;
$$;

create or replace function public.fn_complete_import_validation(p_import_job_id uuid)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
  v_valid_count integer;
  v_error_count integer;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status <> 'VALIDATING' then
    raise exception 'O job não está em validação (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  select count(*) filter (where status = 'VALID') into v_valid_count from public.import_job_rows where import_job_id = p_import_job_id;
  select count(*) into v_error_count from public.import_job_errors where import_job_id = p_import_job_id and severity = 'ERROR';

  update public.import_jobs
  set status = case when v_valid_count > 0 then 'READY' else 'FAILED' end,
      error_rows = v_error_count,
      finished_at = case when v_valid_count = 0 then now() else null end
  where id = p_import_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.fn_start_import_processing(p_import_job_id uuid)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status <> 'READY' then
    raise exception 'Só é possível processar um job pronto (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  update public.import_jobs set status = 'PROCESSING' where id = p_import_job_id returning * into v_job;
  return v_job;
end;
$$;

-- ==================================================================
-- fn_record_import_row_result — trava import_jobs FOR UPDATE antes de
-- incrementar os contadores (seção 21.7/21.8: concorrência — duas
-- linhas processadas "ao mesmo tempo" pela mesma chamada da API nunca
-- perdem incremento, mesmo padrão de fn_decide_approval).
-- ==================================================================
create or replace function public.fn_record_import_row_result(p_import_job_row_id uuid, p_success boolean, p_entity_id uuid default null)
returns public.import_job_rows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.import_job_rows;
  v_job public.import_jobs;
begin
  select * into v_row from public.import_job_rows where id = p_import_job_row_id;
  if not found then
    raise exception 'Linha de importação não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_job from public.import_jobs where id = v_row.import_job_id for update;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;
  if v_job.status <> 'PROCESSING' then
    raise exception 'O job não está em processamento (status atual: %).', v_job.status using errcode = 'P0001';
  end if;
  if v_row.status = 'PROCESSED' then
    raise exception 'Esta linha já foi processada com sucesso — nunca reprocessada (linha %).', v_row.row_number using errcode = 'P0001';
  end if;

  update public.import_job_rows
  set status = case when p_success then 'PROCESSED' else 'FAILED' end,
      entity_id = case when p_success then p_entity_id else entity_id end,
      processed_at = now()
  where id = p_import_job_row_id
  returning * into v_row;

  update public.import_jobs
  set processed_rows = processed_rows + 1,
      success_rows = success_rows + case when p_success then 1 else 0 end,
      error_rows = error_rows + case when p_success then 0 else 1 end
  where id = v_job.id;

  return v_row;
end;
$$;

create or replace function public.fn_finish_import_job(p_import_job_id uuid)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status <> 'PROCESSING' then
    raise exception 'O job não está em processamento (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  update public.import_jobs
  set status = case when v_job.error_rows > 0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,
      finished_at = now()
  where id = p_import_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- ==================================================================
-- fn_reopen_import_job_for_reprocess — reabre um job COMPLETED_WITH_ERRORS
-- ou FAILED para PROCESSING de novo (seção 21.8): as linhas FAILED
-- voltam para PENDING (única forma de "tentar de novo"); linhas
-- PROCESSED nunca são tocadas (nunca duplicadas).
-- ==================================================================
create or replace function public.fn_reopen_import_job_for_reprocess(p_import_job_id uuid)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
  v_pending_count integer;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.import') then
    raise exception 'Permissão negada (import_export.import).' using errcode = '42501';
  end if;

  if v_job.status not in ('COMPLETED_WITH_ERRORS', 'FAILED') then
    raise exception 'Só é possível reprocessar um job com erros ou falho (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  update public.import_job_rows set status = 'PENDING' where import_job_id = p_import_job_id and status = 'FAILED';
  get diagnostics v_pending_count = row_count;

  if v_pending_count = 0 then
    raise exception 'Não há linhas com falha para reprocessar.' using errcode = 'P0001';
  end if;

  update public.import_jobs
  set status = 'READY', finished_at = null, processed_rows = processed_rows - v_pending_count, error_rows = error_rows - v_pending_count
  where id = p_import_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.fn_cancel_import_job(p_import_job_id uuid, p_reason text default null)
returns public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.import_jobs;
begin
  select * into v_job from public.import_jobs where id = p_import_job_id for update;
  if not found then
    raise exception 'Processo de importação não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_job.company_id, 'import_export.cancel') then
    raise exception 'Permissão negada (import_export.cancel).' using errcode = '42501';
  end if;

  if v_job.status in ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED') then
    raise exception 'Não é possível cancelar um job já finalizado (status atual: %).', v_job.status using errcode = 'P0001';
  end if;

  update public.import_jobs set status = 'CANCELLED', finished_at = now() where id = p_import_job_id
  returning * into v_job;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_job.company_id, public.current_app_user_id(), 'system', 'import_jobs', v_job.id, 'CANCEL', null,
    jsonb_build_object('reason', p_reason));

  return v_job;
end;
$$;

create or replace function public.fn_create_export_job(
  p_company_id uuid,
  p_module text,
  p_entity_type text,
  p_format text,
  p_filters jsonb,
  p_columns jsonb,
  p_total_rows integer
)
returns public.export_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_export public.export_jobs;
begin
  if not public.has_permission(p_company_id, 'import_export.export') then
    raise exception 'Permissão negada (import_export.export).' using errcode = '42501';
  end if;

  insert into public.export_jobs (company_id, module, entity_type, format, filters, columns, total_rows, requested_by, finished_at)
  values (p_company_id, p_module, p_entity_type, p_format, coalesce(p_filters, '{}'::jsonb), coalesce(p_columns, '[]'::jsonb),
    coalesce(p_total_rows, 0), public.current_app_user_id(), now())
  returning * into v_export;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'export_jobs', v_export.id, 'EXPORT', null,
    jsonb_build_object('entity_type', p_entity_type, 'format', p_format, 'total_rows', p_total_rows));

  return v_export;
end;
$$;

revoke all on function public.fn_create_import_job(uuid, text, text, text, text) from public;
revoke all on function public.fn_stage_import_rows(uuid, jsonb) from public;
revoke all on function public.fn_set_import_job_mapping(uuid, jsonb) from public;
revoke all on function public.fn_start_import_validation(uuid) from public;
revoke all on function public.fn_record_import_row_validation(uuid, text, text) from public;
revoke all on function public.fn_record_import_error(uuid, uuid, integer, text, text, text, text, text) from public;
revoke all on function public.fn_clear_import_job_errors(uuid) from public;
revoke all on function public.fn_complete_import_validation(uuid) from public;
revoke all on function public.fn_start_import_processing(uuid) from public;
revoke all on function public.fn_record_import_row_result(uuid, boolean, uuid) from public;
revoke all on function public.fn_finish_import_job(uuid) from public;
revoke all on function public.fn_reopen_import_job_for_reprocess(uuid) from public;
revoke all on function public.fn_cancel_import_job(uuid, text) from public;
revoke all on function public.fn_create_export_job(uuid, text, text, text, jsonb, jsonb, integer) from public;
grant execute on function public.fn_create_import_job(uuid, text, text, text, text) to authenticated;
grant execute on function public.fn_stage_import_rows(uuid, jsonb) to authenticated;
grant execute on function public.fn_set_import_job_mapping(uuid, jsonb) to authenticated;
grant execute on function public.fn_start_import_validation(uuid) to authenticated;
grant execute on function public.fn_record_import_row_validation(uuid, text, text) to authenticated;
grant execute on function public.fn_record_import_error(uuid, uuid, integer, text, text, text, text, text) to authenticated;
grant execute on function public.fn_clear_import_job_errors(uuid) to authenticated;
grant execute on function public.fn_complete_import_validation(uuid) to authenticated;
grant execute on function public.fn_start_import_processing(uuid) to authenticated;
grant execute on function public.fn_record_import_row_result(uuid, boolean, uuid) to authenticated;
grant execute on function public.fn_finish_import_job(uuid) to authenticated;
grant execute on function public.fn_reopen_import_job_for_reprocess(uuid) to authenticated;
grant execute on function public.fn_cancel_import_job(uuid, text) to authenticated;
grant execute on function public.fn_create_export_job(uuid, text, text, text, jsonb, jsonb, integer) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('import_export.view', 'import_export', 'view', 'Consultar processos de importação/exportação'),
    ('import_export.import', 'import_export', 'import', 'Enviar, mapear, validar, processar e reprocessar importações'),
    ('import_export.export', 'import_export', 'export', 'Exportar dados em CSV/XLSX'),
    ('import_export.cancel', 'import_export', 'cancel', 'Cancelar um processo de importação em andamento')
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
alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;
alter table public.import_job_errors enable row level security;
alter table public.export_jobs enable row level security;

drop policy if exists import_jobs_select on public.import_jobs;
create policy import_jobs_select on public.import_jobs
  for select to authenticated using (public.has_permission(company_id, 'import_export.view'));

drop policy if exists import_job_rows_select on public.import_job_rows;
create policy import_job_rows_select on public.import_job_rows
  for select to authenticated using (public.has_permission(company_id, 'import_export.view'));

drop policy if exists import_job_errors_select on public.import_job_errors;
create policy import_job_errors_select on public.import_job_errors
  for select to authenticated using (public.has_permission(company_id, 'import_export.view'));

drop policy if exists export_jobs_select on public.export_jobs;
create policy export_jobs_select on public.export_jobs
  for select to authenticated using (public.has_permission(company_id, 'import_export.view'));
