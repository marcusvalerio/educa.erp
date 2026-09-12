-- Fase 8 — Fiscal/Núcleo Tributário: fundação.
--
-- NÃO implementa SEFAZ, certificado digital ou emissão eletrônica em
-- produção nesta etapa (seção 1/28). O objetivo é o núcleo de dados
-- fiscais: classificação, regras tributárias, documento fiscal com
-- snapshot imutável. Esta migration agrupa o ajuste aditivo que as
-- migrations seguintes (0037-0040) vão precisar, mais o primeiro
-- conceito novo: estabelecimento fiscal.
--
-- Princípio central do módulo inteiro (seção 3): Fiscal NÃO duplica
-- produtos/clientes/fornecedores/pedidos/recebimentos/estoque/
-- financeiro — adiciona o CONTEXTO fiscal. Nenhuma tabela deste módulo
-- é uma "segunda tabela de produtos/clientes/fornecedores".

-- ==================================================================
-- audit_logs.action — amplia para o vocabulário desta etapa
-- (AUTHORIZE/REJECT/EVENT). CREATE/UPDATE/APPROVE/CANCEL já existem.
-- ==================================================================
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.audit_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action%';

  if v_conname is not null then
    execute format('alter table public.audit_logs drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'INACTIVATE',
    'APPROVE', 'CANCEL', 'RECEIVE', 'CONFIRM', 'REJECT',
    'PICK', 'PACK', 'SHIP', 'DELIVER', 'FAIL', 'RETURN',
    'RELEASE', 'START', 'CONSUME', 'COMPLETE', 'SCRAP',
    'PAY', 'REVERSE', 'RECONCILE',
    'AUTHORIZE', 'EVENT'
  ));

comment on column public.audit_logs.action is
  'Vocabulário: CREATE/UPDATE/DELETE/ACTIVATE/INACTIVATE + APPROVE/CANCEL/RECEIVE/CONFIRM/REJECT (Compras, 0017) + PICK/PACK/SHIP/DELIVER/FAIL/RETURN (Logística, 0022) + RELEASE/START/CONSUME/COMPLETE/SCRAP (Produção, 0026) + PAY/REVERSE/RECONCILE (Financeiro, 0031) + AUTHORIZE/EVENT (Fiscal, 0036 — REJECT já existia desde 0017, reaproveitado para rejeição de documento fiscal). Ampliar aqui sempre que um novo módulo precisar, nunca criar uma segunda tabela de auditoria.';

-- ==================================================================
-- FISCAL_ESTABLISHMENTS — seção 5. companies (0001) não possui CNPJ/
-- inscrição estadual/municipal/regime tributário próprios, e "1
-- company = 1 estabelecimento fiscal" não pode ser assumido (uma
-- empresa pode ter múltiplas filiais fiscais). Não existe hoje
-- nenhuma tabela de filiais (0005 só comentava "preparado para filial
-- no futuro", nunca implementado) — esta é a primeira. company_id
-- continua sendo a empresa (cadastro geral, nunca duplicado); este
-- estabelecimento é o "CNPJ emissor" fiscal dentro dela.
-- ==================================================================
create table if not exists public.fiscal_establishments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  cnpj text not null,
  state_registration text,
  municipal_registration text,
  tax_regime text not null check (tax_regime in ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI')),
  address text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  zip_code text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, cnpj),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.fiscal_establishments
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_establishments_company_status_idx on public.fiscal_establishments (company_id, status);

comment on table public.fiscal_establishments is
  'Estabelecimento fiscal (matriz/filial) de uma empresa — CNPJ, inscrições e regime tributário próprios. Não duplica companies: é o detalhamento fiscal de "onde/com qual CNPJ" a empresa emite documentos. Uma company pode ter N fiscal_establishments.';
comment on column public.fiscal_establishments.tax_regime is
  'SIMPLES_NACIONAL/LUCRO_PRESUMIDO/LUCRO_REAL/MEI (seção 6). Nenhum cálculo específico de regime implementado nesta etapa — só classificação, usada como dimensão de tax_rules (0038).';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('fiscal_establishments.view', 'fiscal_establishments', 'view', 'Consultar estabelecimentos fiscais'),
    ('fiscal_establishments.create', 'fiscal_establishments', 'create', 'Criar estabelecimentos fiscais'),
    ('fiscal_establishments.update', 'fiscal_establishments', 'update', 'Editar estabelecimentos fiscais')
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
-- RLS — CRUD completo via has_permission direto (padrão "cadastro",
-- sem função dedicada — mesmo de warehouses/work_centers). Sem policy
-- de delete — mesmo padrão de sales_representatives/work_centers.
-- ==================================================================
alter table public.fiscal_establishments enable row level security;

drop policy if exists fiscal_establishments_select on public.fiscal_establishments;
create policy fiscal_establishments_select on public.fiscal_establishments
  for select to authenticated using (public.has_permission(company_id, 'fiscal_establishments.view'));

drop policy if exists fiscal_establishments_insert on public.fiscal_establishments;
create policy fiscal_establishments_insert on public.fiscal_establishments
  for insert to authenticated with check (public.has_permission(company_id, 'fiscal_establishments.create'));

drop policy if exists fiscal_establishments_update on public.fiscal_establishments;
create policy fiscal_establishments_update on public.fiscal_establishments
  for update to authenticated
  using (public.has_permission(company_id, 'fiscal_establishments.update'))
  with check (public.has_permission(company_id, 'fiscal_establishments.update'));
