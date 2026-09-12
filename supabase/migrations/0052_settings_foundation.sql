-- Fase 14 — Configuração e Parametrização do ERP: fundação.
--
-- UMA tabela (system_settings), não "settings(key, value)" em JSON sem
-- tipo (seção 14, aviso explícito) e não dezenas de tabelas por módulo
-- (seção 14.4). O namespace do módulo vive no próprio par module/key
-- (ex.: module='inventory', key='default_cost_method') — "inventory.*"
-- (seção 14.4) é module='inventory'. Os TRÊS níveis (seção 14.1) são
-- representados por company_id/establishment_id NULOS, não três
-- tabelas: GLOBAL (ambos nulos) < COMPANY (só company_id) <
-- ESTABLISHMENT (ambos preenchidos) — a mesma linha nunca representa
-- dois níveis.

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  establishment_id uuid,
  module text not null,
  key text not null,
  value_type text not null check (value_type in ('STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'JSON')),
  value_string text,
  value_integer bigint,
  value_decimal numeric(18, 6),
  value_boolean boolean,
  value_date date,
  value_json jsonb,
  description text,
  valid_from date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (establishment_id, company_id) references public.fiscal_establishments (id, company_id) on delete cascade,
  check (establishment_id is null or company_id is not null),
  check (valid_from is null or valid_until is null or valid_from <= valid_until),
  constraint system_settings_one_value_check check (
    (case when value_type = 'STRING' then (value_string is not null)::int else 0 end)
    + (case when value_type = 'INTEGER' then (value_integer is not null)::int else 0 end)
    + (case when value_type = 'DECIMAL' then (value_decimal is not null)::int else 0 end)
    + (case when value_type = 'BOOLEAN' then (value_boolean is not null)::int else 0 end)
    + (case when value_type = 'DATE' then (value_date is not null)::int else 0 end)
    + (case when value_type = 'JSON' then (value_json is not null)::int else 0 end)
    = 1
  )
);

create trigger set_updated_at before update on public.system_settings
  for each row execute procedure extensions.moddatetime(updated_at);

create unique index if not exists system_settings_scope_key on public.system_settings (
  module, key,
  (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index if not exists system_settings_company_idx on public.system_settings (company_id, module);
create index if not exists system_settings_establishment_idx on public.system_settings (establishment_id, module);

comment on table public.system_settings is
  'Configuração tipada em 3 níveis (GLOBAL/COMPANY/ESTABLISHMENT — seção 14.1), nunca um key-value JSON sem tipo. establishment_id exige company_id (CHECK) e referencia fiscal_establishments (seção 14.3 — integra com o que já existe, nunca uma segunda tabela de estabelecimento). Nenhum segredo é armazenável: value_type não inclui um tipo "SECRET"/"TOKEN" — a ausência é a proteção (seção 14.20/20), nunca confiar em convenção de nome de chave.';
comment on constraint system_settings_one_value_check on public.system_settings is
  'Exatamente a coluna de valor correspondente a value_type é preenchida — nunca ambíguo sobre qual campo é o valor real (seção 14.5).';

-- ==================================================================
-- fn_resolve_setting — resolução determinística (seção 14.7/14.18):
-- ESTABLISHMENT > COMPANY > GLOBAL. Uma única query, ordenada por
-- especificidade (linha mais específica que casa primeiro), LIMIT 1 —
-- nunca duas queries com fallback implícito no código do chamador.
-- Respeita vigência (valid_from/valid_until) e status='active'.
-- ==================================================================
create or replace function public.fn_resolve_setting(
  p_company_id uuid,
  p_establishment_id uuid,
  p_module text,
  p_key text,
  p_reference_date date default current_date
)
returns public.system_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_setting public.system_settings;
begin
  if not public.has_permission(p_company_id, 'settings.view') then
    raise exception 'Permissão negada (settings.view).' using errcode = '42501';
  end if;

  select * into v_setting
  from public.system_settings
  where module = p_module and key = p_key and status = 'active'
    and (company_id is null or company_id = p_company_id)
    and (establishment_id is null or establishment_id = p_establishment_id)
    and (valid_from is null or valid_from <= p_reference_date)
    and (valid_until is null or valid_until >= p_reference_date)
  order by (establishment_id is not null) desc, (company_id is not null) desc
  limit 1;

  return v_setting;
end;
$$;

revoke all on function public.fn_resolve_setting(uuid, uuid, text, text, date) from public;
grant execute on function public.fn_resolve_setting(uuid, uuid, text, text, date) to authenticated;

-- ==================================================================
-- fn_upsert_setting — único ponto de escrita. Permissão depende do
-- nível sendo escrito (seção 14.22): ESTABLISHMENT exige
-- settings.establishment.update; COMPANY exige settings.company.update;
-- GLOBAL (ambos nulos) exige settings.create (linha nova) ou
-- settings.update (linha já existente) — distinção real entre criar e
-- atualizar, não as duas fundidas na mesma permissão.
-- ==================================================================
create or replace function public.fn_upsert_setting(
  p_company_id uuid,
  p_establishment_id uuid,
  p_module text,
  p_key text,
  p_value_type text,
  p_value_string text default null,
  p_value_integer bigint default null,
  p_value_decimal numeric default null,
  p_value_boolean boolean default null,
  p_value_date date default null,
  p_value_json jsonb default null,
  p_description text default null,
  p_valid_from date default null,
  p_valid_until date default null
)
returns public.system_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.system_settings;
  v_setting public.system_settings;
  v_scope_key uuid;
  v_check_company_id uuid;
begin
  select id into v_existing
  from public.system_settings
  where module = p_module and key = p_key
    and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_establishment_id, '00000000-0000-0000-0000-000000000000'::uuid);

  if p_establishment_id is not null then
    if p_company_id is null then
      raise exception 'Configuração de estabelecimento exige company_id.' using errcode = '22023';
    end if;
    v_check_company_id := p_company_id;
    if not public.has_permission(v_check_company_id, 'settings.establishment.update') then
      raise exception 'Permissão negada (settings.establishment.update).' using errcode = '42501';
    end if;
  elsif p_company_id is not null then
    v_check_company_id := p_company_id;
    if not public.has_permission(v_check_company_id, 'settings.company.update') then
      raise exception 'Permissão negada (settings.company.update).' using errcode = '42501';
    end if;
  else
    -- Nível GLOBAL: has_permission exige um company_id de contexto
    -- mesmo para a permissão "global" (mesma convenção RBAC do
    -- restante do sistema, escopada por empresa do usuário logado) —
    -- usa-se o company_id do chamador só para resolver QUEM pode
    -- escrever, nunca gravado na linha (que continua null = global).
    v_check_company_id := coalesce(p_company_id, (select company_id from public.user_companies where user_id = public.current_app_user_id() limit 1));
    if v_existing is null then
      if not public.has_permission(v_check_company_id, 'settings.create') then
        raise exception 'Permissão negada (settings.create).' using errcode = '42501';
      end if;
    else
      if not public.has_permission(v_check_company_id, 'settings.update') then
        raise exception 'Permissão negada (settings.update).' using errcode = '42501';
      end if;
    end if;
  end if;

  insert into public.system_settings (
    company_id, establishment_id, module, key, value_type,
    value_string, value_integer, value_decimal, value_boolean, value_date, value_json,
    description, valid_from, valid_until, created_by
  ) values (
    p_company_id, p_establishment_id, p_module, p_key, p_value_type,
    p_value_string, p_value_integer, p_value_decimal, p_value_boolean, p_value_date, p_value_json,
    p_description, p_valid_from, p_valid_until, public.current_app_user_id()
  )
  on conflict (module, key, (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set
    value_type = excluded.value_type, value_string = excluded.value_string, value_integer = excluded.value_integer,
    value_decimal = excluded.value_decimal, value_boolean = excluded.value_boolean, value_date = excluded.value_date,
    value_json = excluded.value_json, description = coalesce(excluded.description, public.system_settings.description),
    valid_from = excluded.valid_from, valid_until = excluded.valid_until
  returning * into v_setting;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'system_settings', v_setting.id,
    case when v_existing is null then 'CREATE' else 'UPDATE' end,
    case when v_existing is not null then jsonb_build_object('module', p_module, 'key', p_key) else null end,
    jsonb_build_object('module', p_module, 'key', p_key, 'value_type', p_value_type));

  return v_setting;
end;
$$;

revoke all on function public.fn_upsert_setting(uuid, uuid, text, text, text, text, bigint, numeric, boolean, date, jsonb, text, date, date) from public;
grant execute on function public.fn_upsert_setting(uuid, uuid, text, text, text, text, bigint, numeric, boolean, date, jsonb, text, date, date) to authenticated;

-- ==================================================================
-- Seed de defaults GLOBAIS (seção 14.6) — company_id/establishment_id
-- nulos, o "padrão do sistema" que fn_resolve_setting devolve quando
-- nem empresa nem estabelecimento configuraram nada.
-- ==================================================================
insert into public.system_settings (company_id, establishment_id, module, key, value_type, value_string, description)
select null, null, v.module, v.key, 'STRING', v.value, v.description
from (
  values
    ('inventory', 'default_cost_method', 'MOVING_AVERAGE', 'Método de custo padrão (seção 14.8) — mesmo vocabulário de cost_movements.cost_method (Fase 10), nunca duplicado'),
    ('sales', 'default_payment_term', '', 'Condição de pagamento padrão para pedidos de venda quando o cliente não tem uma própria (seção 14.10)'),
    ('purchasing', 'default_warehouse', '', 'Armazém padrão de recebimento de compras (seção 14.9)'),
    ('logistics', 'default_carrier', '', 'Transportadora padrão de expedição (seção 14.12)'),
    ('fiscal', 'default_tax_regime', 'SIMPLES_NACIONAL', 'Regime tributário padrão (seção 14.14) — mesmo vocabulário de fiscal_establishments.tax_regime')
) as v(module, key, value, description)
on conflict (module, key, (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)))
do nothing;

insert into public.system_settings (company_id, establishment_id, module, key, value_type, value_string, description)
values (null, null, 'company', 'default_currency', 'STRING', 'BRL', 'Moeda padrão (seção 14.2) — ISO 4217, mesmo padrão de financial_accounts.currency_code')
on conflict (module, key, (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)))
do nothing;

insert into public.system_settings (company_id, establishment_id, module, key, value_type, value_string, description)
values (null, null, 'company', 'timezone', 'STRING', 'America/Sao_Paulo', 'Timezone padrão (seção 14.2)')
on conflict (module, key, (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)))
do nothing;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('settings.view', 'settings', 'view', 'Consultar configurações resolvidas (fn_resolve_setting)'),
    ('settings.create', 'settings', 'create', 'Criar uma nova configuração de nível GLOBAL'),
    ('settings.update', 'settings', 'update', 'Editar uma configuração de nível GLOBAL já existente'),
    ('settings.company.view', 'settings_company', 'view', 'Consultar configurações de nível empresa'),
    ('settings.company.update', 'settings_company', 'update', 'Criar/editar configurações de nível empresa'),
    ('settings.establishment.view', 'settings_establishment', 'view', 'Consultar configurações de nível estabelecimento'),
    ('settings.establishment.update', 'settings_establishment', 'update', 'Criar/editar configurações de nível estabelecimento')
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
-- RLS — select-only (linhas GLOBAIS, company_id nulo, são visíveis a
-- qualquer authenticated — não há empresa para isolar; linhas COMPANY/
-- ESTABLISHMENT exigem o has_permission de nível correspondente). Toda
-- escrita via fn_upsert_setting.
-- ==================================================================
alter table public.system_settings enable row level security;

drop policy if exists system_settings_select on public.system_settings;
create policy system_settings_select on public.system_settings
  for select to authenticated
  using (
    company_id is null
    or (establishment_id is null and public.has_permission(company_id, 'settings.company.view'))
    or (establishment_id is not null and public.has_permission(company_id, 'settings.establishment.view'))
  );
