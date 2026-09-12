-- Fase 13 — Cadastros Mestres Avançados: endereços e contatos
-- compartilháveis (seção 13.11/13.12) + segmentação formal de clientes
-- (seção 13.18).
--
-- party_addresses/party_contacts são polimórficas por party_type
-- (customer/supplier/carrier) + party_id — mesmo padrão de
-- source_type/source_id usado em todo o sistema (stock_movements,
-- fiscal_documents, cost_movements) — evita copiar endereço/contato em
-- tabelas separadas por tipo de parceiro (seção 13.11: "não copiar
-- endereço para customers e suppliers em tabelas diferentes").
-- customers/suppliers/carriers continuam com seus campos de endereço
-- únicos (zip_code/state/city/...) intocados — representam o endereço
-- PRINCIPAL do cadastro rápido; party_addresses é para quando um
-- parceiro precisa de MAIS de um endereço (cobrança ≠ entrega, etc.).

create table if not exists public.party_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  party_type text not null check (party_type in ('customer', 'supplier', 'carrier')),
  party_id uuid not null,
  address_type text not null check (address_type in ('billing', 'delivery', 'invoicing', 'commercial', 'correspondence', 'main')),
  is_primary boolean not null default false,
  zip_code text,
  state text,
  city text,
  neighborhood text,
  address text,
  address_number text,
  address_complement text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.party_addresses
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists party_addresses_party_idx on public.party_addresses (company_id, party_type, party_id);
create unique index if not exists party_addresses_one_primary_per_party on public.party_addresses (company_id, party_type, party_id) where is_primary = true;

comment on table public.party_addresses is
  'Endereços adicionais de clientes/fornecedores/transportadoras (party_type+party_id, sem FK — polimórfico, mesmo padrão de stock_movements.reference_id). O cadastro principal (customers/suppliers/carriers) mantém seus próprios campos de endereço únicos; esta tabela é para MÚLTIPLOS endereços por parceiro.';

create table if not exists public.party_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  party_type text not null check (party_type in ('customer', 'supplier', 'carrier')),
  party_id uuid not null,
  name text not null,
  role text,
  phone text,
  email text,
  contact_type text not null default 'commercial' check (contact_type in ('commercial', 'financial', 'technical', 'other')),
  is_primary boolean not null default false,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.party_contacts
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists party_contacts_party_idx on public.party_contacts (company_id, party_type, party_id);
create unique index if not exists party_contacts_one_primary_per_party on public.party_contacts (company_id, party_type, party_id) where is_primary = true;

comment on table public.party_contacts is
  'Contatos de clientes/fornecedores/transportadoras — um parceiro pode ter vários (seção 13.12). Polimórfico por party_type+party_id, mesmo padrão de party_addresses.';

-- ==================================================================
-- fn_assert_party_exists — guarda de qualidade de dados (seção 13.21):
-- valida que party_id realmente existe na tabela correspondente a
-- party_type E pertence à mesma empresa, antes de aceitar o endereço/
-- contato — sem isso, um typo no id ficaria silenciosamente órfão
-- (nenhuma FK é possível aqui por ser polimórfico).
-- ==================================================================
create or replace function public.fn_assert_party_exists(p_company_id uuid, p_party_type text, p_party_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  case p_party_type
    when 'customer' then
      select exists (select 1 from public.customers where id = p_party_id and company_id = p_company_id) into v_found;
    when 'supplier' then
      select exists (select 1 from public.suppliers where id = p_party_id and company_id = p_company_id) into v_found;
    when 'carrier' then
      select exists (select 1 from public.carriers where id = p_party_id and company_id = p_company_id) into v_found;
    else
      raise exception 'party_type inválido: %', p_party_type using errcode = '22023';
  end case;

  if not v_found then
    raise exception '% % não encontrado nesta empresa.', p_party_type, p_party_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fn_assert_party_exists(uuid, text, uuid) from public;

create or replace function public.fn_guard_party_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_party_exists(NEW.company_id, NEW.party_type, NEW.party_id);
  return NEW;
end;
$$;

drop trigger if exists guard_party_reference on public.party_addresses;
create trigger guard_party_reference
  before insert or update of party_type, party_id on public.party_addresses
  for each row execute procedure public.fn_guard_party_reference();

drop trigger if exists guard_party_reference on public.party_contacts;
create trigger guard_party_reference
  before insert or update of party_type, party_id on public.party_contacts
  for each row execute procedure public.fn_guard_party_reference();

-- ==================================================================
-- fn_set_primary_party_address / fn_set_primary_party_contact —
-- atomicamente desmarca o primário anterior e marca o novo (o índice
-- único parcial impediria dois primários simultâneos; estas funções
-- evitam o chamador precisar de duas chamadas separadas e uma janela
-- inconsistente entre elas).
-- ==================================================================
create or replace function public.fn_set_primary_party_address(p_address_id uuid)
returns public.party_addresses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_address public.party_addresses;
begin
  select * into v_address from public.party_addresses where id = p_address_id for update;
  if not found then
    raise exception 'Endereço não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_address.company_id, 'party_addresses.update') then
    raise exception 'Permissão negada (party_addresses.update).' using errcode = '42501';
  end if;

  update public.party_addresses set is_primary = false
  where company_id = v_address.company_id and party_type = v_address.party_type and party_id = v_address.party_id and is_primary = true;

  update public.party_addresses set is_primary = true where id = p_address_id
  returning * into v_address;

  return v_address;
end;
$$;

create or replace function public.fn_set_primary_party_contact(p_contact_id uuid)
returns public.party_contacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact public.party_contacts;
begin
  select * into v_contact from public.party_contacts where id = p_contact_id for update;
  if not found then
    raise exception 'Contato não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_contact.company_id, 'party_contacts.update') then
    raise exception 'Permissão negada (party_contacts.update).' using errcode = '42501';
  end if;

  update public.party_contacts set is_primary = false
  where company_id = v_contact.company_id and party_type = v_contact.party_type and party_id = v_contact.party_id and is_primary = true;

  update public.party_contacts set is_primary = true where id = p_contact_id
  returning * into v_contact;

  return v_contact;
end;
$$;

revoke all on function public.fn_set_primary_party_address(uuid) from public;
revoke all on function public.fn_set_primary_party_contact(uuid) from public;
grant execute on function public.fn_set_primary_party_address(uuid) to authenticated;
grant execute on function public.fn_set_primary_party_contact(uuid) to authenticated;

-- ==================================================================
-- CUSTOMERS.segment — formaliza o vocabulário (seção 13.18). A coluna
-- já existe desde 0019 (texto livre); esta migration só adiciona o
-- CHECK, sem alterar dados existentes fora do vocabulário (nenhum
-- valor é sobrescrito — se algum dado antigo não bater, o CHECK só
-- passa a valer para novas escritas via NOT VALID + validação
-- separada, para nunca quebrar uma migration por dado histórico).
-- ==================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_segment_check') then
    alter table public.customers
      add constraint customers_segment_check
      check (segment is null or segment in ('WHOLESALE', 'RETAIL', 'INDUSTRY', 'OTHER')) not valid;
  end if;
end;
$$;

comment on column public.customers.segment is
  'Segmentação comercial (WHOLESALE/RETAIL/INDUSTRY/OTHER, seção 13.18) — coluna já existia desde 0019 como texto livre; vocabulário formalizado aqui via CHECK NOT VALID (não força revalidação de dados históricos que porventura estejam fora do vocabulário nesta migration — validação plena fica para quando um backfill explícito for feito).';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('party_addresses.view', 'party_addresses', 'view', 'Consultar endereços de clientes/fornecedores/transportadoras'),
    ('party_addresses.create', 'party_addresses', 'create', 'Criar endereços de clientes/fornecedores/transportadoras'),
    ('party_addresses.update', 'party_addresses', 'update', 'Editar endereços e definir o endereço principal'),
    ('party_contacts.view', 'party_contacts', 'view', 'Consultar contatos de clientes/fornecedores/transportadoras'),
    ('party_contacts.create', 'party_contacts', 'create', 'Criar contatos de clientes/fornecedores/transportadoras'),
    ('party_contacts.update', 'party_contacts', 'update', 'Editar contatos e definir o contato principal')
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
-- RLS — CRUD completo via has_permission (cadastro simples), exceto
-- is_primary que só muda via fn_set_primary_party_*.
-- ==================================================================
alter table public.party_addresses enable row level security;
alter table public.party_contacts enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('party_addresses'), ('party_contacts')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.view'
    );
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L) and is_primary = false)',
      t.table_name, t.table_name, t.table_name || '.create'
    );
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.update', t.table_name || '.update'
    );
  end loop;
end;
$$;

comment on policy party_addresses_insert on public.party_addresses is
  'is_primary sempre nasce false via RLS — marcar como principal exige fn_set_primary_party_address (atomicidade ao trocar o primário anterior).';
comment on policy party_contacts_insert on public.party_contacts is
  'is_primary sempre nasce false via RLS — marcar como principal exige fn_set_primary_party_contact.';
