-- Fase 8 — Fiscal: classificação fiscal (NCM, CFOP, natureza da
-- operação, CST/CSOSN).
--
-- Todas "cadastro": CRUD direto via RLS (sem função dedicada), mesmo
-- padrão de product_categories/work_centers/financial_categories.
-- Nenhuma delas assume texto livre onde a etapa pede estrutura (seção
-- 7: "não depender apenas de texto livre") — products.ncm (0002)
-- continua existindo como está, deprecated em favor da referência
-- estruturada que product_fiscal_profiles (0038) vai usar.
--
-- Origem da mercadoria (seção 10) NÃO ganha tabela própria: é uma
-- lista fixa oficial (códigos 0-8, nunca criada/editada pelo usuário)
-- — modelada como CHECK direto em product_fiscal_profiles/
-- fiscal_document_items (0038/0039), igual a como "status" já é
-- modelado em toda tabela deste sistema.

create table if not exists public.fiscal_ncms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  description text not null,
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (valid_until is null or valid_until >= valid_from)
);

create trigger set_updated_at before update on public.fiscal_ncms
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_ncms_company_status_idx on public.fiscal_ncms (company_id, status);

comment on table public.fiscal_ncms is
  'Nomenclatura Comum do Mercosul — classificação fiscal de produto. products.ncm (0002, texto livre) permanece inalterado; a referência estruturada usada por documentos fiscais é product_fiscal_profiles.ncm_id (0038), nunca texto livre.';

create table if not exists public.fiscal_cfops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  description text not null,
  direction text not null check (direction in ('ENTRADA', 'SAIDA')),
  scope text not null check (scope in ('INTERNAL', 'INTERSTATE', 'FOREIGN')),
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (valid_until is null or valid_until >= valid_from)
);

create trigger set_updated_at before update on public.fiscal_cfops
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_cfops_company_status_idx on public.fiscal_cfops (company_id, status);
create index if not exists fiscal_cfops_direction_idx on public.fiscal_cfops (company_id, direction);

comment on table public.fiscal_cfops is
  'Código Fiscal de Operações e Prestações. direction/scope juntos já expressam a classificação 1.xxx/2.xxx/3.xxx/5.xxx/6.xxx/7.xxx — nenhum campo "tipo" redundante adicional.';

create table if not exists public.fiscal_operation_natures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  direction text not null check (direction in ('ENTRADA', 'SAIDA')),
  default_cfop_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (default_cfop_id, company_id) references public.fiscal_cfops (id, company_id) on delete set null
);

create trigger set_updated_at before update on public.fiscal_operation_natures
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_operation_natures_company_status_idx on public.fiscal_operation_natures (company_id, status);

comment on table public.fiscal_operation_natures is
  'Natureza da operação (Venda de mercadoria, Compra para revenda, Transferência, Devolução, Remessa, Retorno...). default_cfop_id é só sugestão/atalho (seção 12) — o CFOP efetivo de um documento pode ser outro, definido no item.';

create table if not exists public.fiscal_cst_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_type text not null check (tax_type in ('ICMS', 'IPI', 'PIS', 'COFINS')),
  code text not null,
  description text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tax_type, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.fiscal_cst_codes
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_cst_codes_company_type_idx on public.fiscal_cst_codes (company_id, tax_type, status);

comment on table public.fiscal_cst_codes is
  'CST por imposto — tax_type distingue porque ICMS/IPI/PIS/COFINS têm tabelas de código distintas (seção 9: "não assumir que um único CST serve para todos os tributos").';

create table if not exists public.fiscal_csosn_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  description text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.fiscal_csosn_codes
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_csosn_codes_company_status_idx on public.fiscal_csosn_codes (company_id, status);

comment on table public.fiscal_csosn_codes is
  'Código de Situação da Operação no Simples Nacional — substitui o CST de ICMS para estabelecimentos no Simples (fiscal_establishments.tax_regime = SIMPLES_NACIONAL).';

-- ==================================================================
-- PERMISSIONS — fiscal_cst_codes/fiscal_csosn_codes compartilham
-- fiscal_tax_codes.* (seção 38 pede "não criar granularidade
-- exagerada"; ambas são cadastros de referência da mesma natureza —
-- códigos de situação tributária — sem regra de negócio própria que
-- justifique dois módulos de permissão separados).
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('fiscal_ncms.view', 'fiscal_ncms', 'view', 'Consultar códigos NCM'),
    ('fiscal_ncms.create', 'fiscal_ncms', 'create', 'Criar códigos NCM'),
    ('fiscal_ncms.update', 'fiscal_ncms', 'update', 'Editar códigos NCM'),
    ('fiscal_cfops.view', 'fiscal_cfops', 'view', 'Consultar CFOPs'),
    ('fiscal_cfops.create', 'fiscal_cfops', 'create', 'Criar CFOPs'),
    ('fiscal_cfops.update', 'fiscal_cfops', 'update', 'Editar CFOPs'),
    ('fiscal_operation_natures.view', 'fiscal_operation_natures', 'view', 'Consultar naturezas de operação'),
    ('fiscal_operation_natures.create', 'fiscal_operation_natures', 'create', 'Criar naturezas de operação'),
    ('fiscal_operation_natures.update', 'fiscal_operation_natures', 'update', 'Editar naturezas de operação'),
    ('fiscal_tax_codes.view', 'fiscal_tax_codes', 'view', 'Consultar códigos CST/CSOSN'),
    ('fiscal_tax_codes.create', 'fiscal_tax_codes', 'create', 'Criar códigos CST/CSOSN'),
    ('fiscal_tax_codes.update', 'fiscal_tax_codes', 'update', 'Editar códigos CST/CSOSN')
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
-- RLS — CRUD completo via has_permission direto (padrão "cadastro").
-- ==================================================================
alter table public.fiscal_ncms enable row level security;
alter table public.fiscal_cfops enable row level security;
alter table public.fiscal_operation_natures enable row level security;
alter table public.fiscal_cst_codes enable row level security;
alter table public.fiscal_csosn_codes enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('fiscal_ncms', 'fiscal_ncms'),
      ('fiscal_cfops', 'fiscal_cfops'),
      ('fiscal_operation_natures', 'fiscal_operation_natures'),
      ('fiscal_cst_codes', 'fiscal_tax_codes'),
      ('fiscal_csosn_codes', 'fiscal_tax_codes')
    ) as x(table_name, permission_module)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.permission_module || '.view'
    );
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.permission_module || '.create'
    );
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.permission_module || '.update', t.permission_module || '.update'
    );
  end loop;
end;
$$;
