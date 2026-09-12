-- Fase 14 — Configuração e Parametrização do ERP: numeração documental
-- profissional (seção 14.16/14.17).
--
-- Distinção importante (documentada em docs/SETTINGS.md): isto NÃO
-- substitui fn_generate_code (0002) — o mecanismo de CÓDIGO INTERNO
-- (PV-0001, PC-0001, DF-0001...) usado por sales_orders/purchase_orders/
-- fiscal_documents/etc. continua exatamente como está, via sequence
-- Postgres nativa por tabela (já concorrente-segura, nunca MAX+1).
-- document_sequences resolve um problema DIFERENTE que fn_generate_code
-- não cobre: uma numeração OFICIAL por EMPRESA (e opcionalmente por
-- ESTABELECIMENTO+SÉRIE) — as sequences de fn_generate_code são globais
-- por tabela (compartilhadas entre todas as empresas), o que é
-- suficiente para um identificador interno mas não para uma numeração
-- fiscal/documental que precisa começar do 1 por empresa/série (ex.:
-- fiscal_documents.number, hoje informado manualmente pelo chamador —
-- 0039 — por não existir ainda um gerador seguro para isso).
--
-- SEQUÊNCIA e SÉRIE ficam na MESMA linha (seção 14.17: "não criar uma
-- sequência separada para cada caso se a estrutura de série já puder
-- representar isso") — document_sequences já é a série (código +
-- descrição + estabelecimento + tipo de documento) com seu contador
-- embutido, não duas tabelas.

create table if not exists public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  establishment_id uuid,
  document_type text not null check (document_type in (
    'SALES_ORDER', 'PURCHASE_ORDER', 'FISCAL_DOCUMENT', 'TRANSFER', 'SHIPMENT', 'OTHER'
  )),
  series_code text not null default '1',
  description text,
  prefix text,
  current_number bigint not null default 0 check (current_number >= 0),
  padding integer not null default 6 check (padding between 1 and 12),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (establishment_id, company_id) references public.fiscal_establishments (id, company_id) on delete cascade
);

create trigger set_updated_at before update on public.document_sequences
  for each row execute procedure extensions.moddatetime(updated_at);

create unique index if not exists document_sequences_scope_key on public.document_sequences (
  company_id, document_type, series_code, (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index if not exists document_sequences_company_status_idx on public.document_sequences (company_id, status);

comment on table public.document_sequences is
  'Série + contador de numeração documental oficial, por empresa (e opcionalmente por estabelecimento — seção 14.3). Não confundir com o "código" interno de fn_generate_code (0002), que continua servindo cada tabela transacional sem alteração. Escrita do contador exclusiva via fn_next_document_number (nunca MAX+1, seção 14.16).';

-- ==================================================================
-- fn_create_document_sequence — cadastro explícito (nunca criada
-- silenciosamente na primeira chamada de fn_next_document_number, para
-- forçar prefixo/padding configurados deliberadamente).
-- ==================================================================
create or replace function public.fn_create_document_sequence(
  p_company_id uuid,
  p_document_type text,
  p_series_code text default '1',
  p_prefix text default null,
  p_padding integer default 6,
  p_establishment_id uuid default null,
  p_description text default null
)
returns public.document_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence public.document_sequences;
begin
  if not public.has_permission(p_company_id, 'document_sequences.create') then
    raise exception 'Permissão negada (document_sequences.create).' using errcode = '42501';
  end if;

  insert into public.document_sequences (
    company_id, establishment_id, document_type, series_code, prefix, padding, description
  ) values (
    p_company_id, p_establishment_id, p_document_type, coalesce(p_series_code, '1'), p_prefix, coalesce(p_padding, 6), p_description
  )
  returning * into v_sequence;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'document_sequences', v_sequence.id, 'CREATE',
    null, jsonb_build_object('document_type', p_document_type, 'series_code', p_series_code, 'prefix', p_prefix));

  return v_sequence;
end;
$$;

create or replace function public.fn_update_document_sequence(
  p_sequence_id uuid,
  p_prefix text default null,
  p_padding integer default null,
  p_description text default null,
  p_status text default null
)
returns public.document_sequences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence public.document_sequences;
begin
  select * into v_sequence from public.document_sequences where id = p_sequence_id;
  if not found then
    raise exception 'Sequência documental não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_sequence.company_id, 'document_sequences.update') then
    raise exception 'Permissão negada (document_sequences.update).' using errcode = '42501';
  end if;

  update public.document_sequences
  set prefix = coalesce(p_prefix, prefix),
      padding = coalesce(p_padding, padding),
      description = coalesce(p_description, description),
      status = coalesce(p_status, status)
  where id = p_sequence_id
  returning * into v_sequence;

  return v_sequence;
end;
$$;

-- ==================================================================
-- fn_next_document_number — TRANSACIONAL, concorrente-seguro (seção
-- 14.16/14.27): trava a linha (FOR UPDATE) antes de ler o contador
-- atual, incrementa e grava numa única instrução — nunca
-- "SELECT MAX(numero) + 1" (proibido explicitamente pela seção 14.16;
-- essa técnica permite duas transações concorrentes lerem o mesmo MAX
-- e gravarem o número duplicado). Duas chamadas concorrentes para a
-- MESMA sequência serializam nesta trava, cada uma recebe um número
-- distinto e sequencial (1, 2, 3, 4 — nunca 1, 1, 2, 3).
-- ==================================================================
create or replace function public.fn_next_document_number(
  p_company_id uuid,
  p_document_type text,
  p_series_code text default '1',
  p_establishment_id uuid default null
)
returns table (sequence_id uuid, number bigint, formatted_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence public.document_sequences;
  v_next bigint;
  v_formatted text;
begin
  if not public.has_permission(p_company_id, 'document_sequences.update') then
    raise exception 'Permissão negada (document_sequences.update).' using errcode = '42501';
  end if;

  select * into v_sequence from public.document_sequences
  where company_id = p_company_id and document_type = p_document_type and series_code = coalesce(p_series_code, '1')
    and coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  for update;

  if not found then
    raise exception 'Sequência documental não configurada para % / série % — crie-a antes (fn_create_document_sequence).', p_document_type, coalesce(p_series_code, '1') using errcode = 'P0002';
  end if;

  if v_sequence.status <> 'active' then
    raise exception 'Sequência documental % / série % está inativa.', p_document_type, v_sequence.series_code using errcode = 'P0001';
  end if;

  v_next := v_sequence.current_number + 1;

  update public.document_sequences set current_number = v_next where id = v_sequence.id;

  v_formatted := coalesce(v_sequence.prefix || '-', '') || lpad(v_next::text, v_sequence.padding, '0');

  return query select v_sequence.id, v_next, v_formatted;
end;
$$;

revoke all on function public.fn_create_document_sequence(uuid, text, text, text, integer, uuid, text) from public;
revoke all on function public.fn_update_document_sequence(uuid, text, integer, text, text) from public;
revoke all on function public.fn_next_document_number(uuid, text, text, uuid) from public;
grant execute on function public.fn_create_document_sequence(uuid, text, text, text, integer, uuid, text) to authenticated;
grant execute on function public.fn_update_document_sequence(uuid, text, integer, text, text) to authenticated;
grant execute on function public.fn_next_document_number(uuid, text, text, uuid) to authenticated;

-- ==================================================================
-- fn_assign_fiscal_document_number — integração opcional e aditiva
-- (seção "integração com sistema existente": "se puder integrar sem
-- risco, integrar"). fn_create_fiscal_document (0039) continua exatamente
-- como está — number/series continuam informáveis manualmente pelo
-- chamador. Esta função é um CAMINHO ADICIONAL: quem preferir uma
-- numeração oficial concorrente-seguro por estabelecimento chama esta
-- função em vez de informar o número na mão. Nunca chamada
-- automaticamente por fn_create_fiscal_document — nenhum workflow
-- antigo foi alterado.
-- ==================================================================
create or replace function public.fn_assign_fiscal_document_number(
  p_fiscal_document_id uuid,
  p_series_code text default '1'
)
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

  if v_document.status <> 'DRAFT' then
    raise exception 'Só é possível atribuir numeração a um documento em rascunho (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  select * into v_next from public.fn_next_document_number(
    p_company_id => v_document.company_id,
    p_document_type => 'FISCAL_DOCUMENT',
    p_series_code => p_series_code,
    p_establishment_id => v_document.fiscal_establishment_id
  );

  update public.fiscal_documents set number = v_next.number, series = p_series_code where id = p_fiscal_document_id
  returning * into v_document;

  return v_document;
end;
$$;

revoke all on function public.fn_assign_fiscal_document_number(uuid, text) from public;
grant execute on function public.fn_assign_fiscal_document_number(uuid, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('document_sequences.view', 'document_sequences', 'view', 'Consultar séries/sequências de numeração documental'),
    ('document_sequences.create', 'document_sequences', 'create', 'Criar séries de numeração documental'),
    ('document_sequences.update', 'document_sequences', 'update', 'Editar séries e obter o próximo número (fn_next_document_number)')
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
alter table public.document_sequences enable row level security;

drop policy if exists document_sequences_select on public.document_sequences;
create policy document_sequences_select on public.document_sequences
  for select to authenticated using (public.has_permission(company_id, 'document_sequences.view'));
