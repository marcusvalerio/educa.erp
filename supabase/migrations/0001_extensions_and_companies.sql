-- Fase 2 — Banco de dados definitivo
-- Extensões utilitárias + tabela raiz `companies`.
--
-- Todas as demais tabelas de cadastro pertencem a uma empresa
-- (company_id). O ERP opera hoje em modo mono-empresa: existe uma
-- única linha em `companies`, cujo id é referenciado por
-- `DEFAULT_COMPANY_ID` em src/lib/database/constants.ts. A estrutura já
-- está pronta para multi-empresa quando a Fase 3 resolver a empresa a
-- partir do usuário autenticado.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists moddatetime with schema extensions;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  document text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip_code text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.companies
  for each row execute procedure extensions.moddatetime(updated_at);

comment on table public.companies is 'Empresas do ERP. Modo mono-empresa na Fase 2 (uma única linha semente).';
