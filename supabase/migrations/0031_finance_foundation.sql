-- Fase 7 — Financeiro: fundação.
--
-- Financeiro operacional, não contabilidade. Sem razão contábil, sem
-- partidas dobradas, sem plano de contas contábil completo, sem SPED —
-- isso fica para uma etapa futura (seção 24). Esta migration agrupa,
-- como 0022/0026 fizeram para as etapas anteriores, o ajuste aditivo
-- que as migrations seguintes (0032-0035) vão precisar, mais a
-- infraestrutura "cadastro" simples (categorias/centros de custo/
-- contas financeiras).
--
-- Princípio central do módulo inteiro (seção 4): o Financeiro registra
-- OBRIGAÇÕES, não pedidos. Nenhuma função desta fase gera um título
-- automaticamente só porque existe um purchase_order/sales_order — a
-- origem é sempre um evento explícito (recebimento confirmado, pedido
-- aprovado) através de uma função dedicada, chamada deliberadamente
-- (0032/0033).

-- ==================================================================
-- audit_logs.action — amplia para o vocabulário desta etapa (PAY/
-- RECEIVE/REVERSE/RECONCILE). CREATE/UPDATE/APPROVE/CANCEL já existem.
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
    'PAY', 'REVERSE', 'RECONCILE'
  ));

comment on column public.audit_logs.action is
  'Vocabulário: CREATE/UPDATE/DELETE/ACTIVATE/INACTIVATE + APPROVE/CANCEL/RECEIVE/CONFIRM/REJECT (Compras, 0017) + PICK/PACK/SHIP/DELIVER/FAIL/RETURN (Logística, 0022) + RELEASE/START/CONSUME/COMPLETE/SCRAP (Produção, 0026) + PAY/REVERSE/RECONCILE (Financeiro, 0031 — RECEIVE já existia desde 0017, reaproveitado para recebimento financeiro). Ampliar aqui sempre que um novo módulo precisar, nunca criar uma segunda tabela de auditoria.';

-- ==================================================================
-- FINANCIAL_CATEGORIES — classificação financeira operacional.
-- Hierárquica (parent_id), mesmo padrão de product_categories (0007).
-- NÃO é plano de contas contábil — é só a categoria usada para
-- relatório/filtro de receitas e despesas operacionais.
-- ==================================================================
create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.financial_categories(id) on delete restrict,
  code text not null,
  name text not null,
  type text not null check (type in ('INCOME', 'EXPENSE')),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (parent_id is null or parent_id <> id)
);

create trigger set_updated_at before update on public.financial_categories
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists financial_categories_company_status_idx on public.financial_categories (company_id, status);
create index if not exists financial_categories_parent_idx on public.financial_categories (parent_id);
create index if not exists financial_categories_type_idx on public.financial_categories (company_id, type);

comment on table public.financial_categories is
  'Classificação financeira operacional (INCOME/EXPENSE), hierárquica via parent_id — ex.: Receitas > Vendas, Despesas > Fretes. Não confundir com plano de contas contábil (fora do escopo desta etapa, seção 24).';

-- ==================================================================
-- COST_CENTERS — onde uma receita/despesa ocorreu. Sem rateio
-- complexo nesta etapa (seção 6) — só classificação hierárquica.
-- ==================================================================
create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.cost_centers(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (parent_id is null or parent_id <> id)
);

create trigger set_updated_at before update on public.cost_centers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists cost_centers_company_status_idx on public.cost_centers (company_id, status);
create index if not exists cost_centers_parent_idx on public.cost_centers (parent_id);

comment on table public.cost_centers is
  'Centro de custo (Comercial, Produção, Almoxarifado, Logística, Administrativo, TI...), hierárquico via parent_id. Sem motor de rateio — classificação simples por lançamento.';

-- ==================================================================
-- FINANCIAL_ACCOUNTS — caixa/conta bancária/carteira/conta digital.
-- current_balance é um saldo MATERIALIZADO (cache), igual a
-- stock_balances (0009): nunca escrito diretamente — só por
-- fn_post_financial_transaction (0034), a única função autorizada a
-- alterá-lo. opening_balance/current_balance ficam de fora do schema
-- de atualização da API (ver src/lib/validations/finance.ts) — uma vez
-- criada a conta, o saldo só se move via movimentação registrada,
-- nunca por edição direta do cadastro.
--
-- Segurança de dado bancário (seção 7): nenhum campo de senha, token
-- ou credencial. bank_account_masked é texto livre para o número já
-- mascarado (ex.: "****1234") — a aplicação nunca deve gravar o número
-- completo aqui.
-- ==================================================================
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('CASH', 'BANK', 'DIGITAL', 'OTHER')),
  bank_name text,
  bank_agency text,
  bank_account_masked text,
  opening_balance numeric(16, 4) not null default 0,
  current_balance numeric(16, 4) not null default 0,
  currency_code text not null default 'BRL',
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.financial_accounts
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists financial_accounts_company_status_idx on public.financial_accounts (company_id, status);

comment on table public.financial_accounts is
  'Caixa/conta bancária/carteira/conta digital. current_balance = opening_balance + créditos - débitos de financial_transactions (0034), mantido transacionalmente por fn_post_financial_transaction — nunca editado diretamente (seção 19). Nenhum dado bancário sensível (senha/token/credencial) é armazenado.';
comment on column public.financial_accounts.bank_account_masked is
  'Número de conta já mascarado (ex.: "****1234"), nunca o número completo. Não é um campo de autenticação.';
comment on column public.financial_accounts.currency_code is
  'ISO 4217, padrão BRL. Preparação para múltipla moeda (seção 30) — nenhum câmbio implementado nesta etapa.';

-- fn_create_financial_account — única forma de criar: garante que
-- current_balance nasce igual a opening_balance (nunca indefinido ou
-- dessincronizado desde a primeira linha).
create or replace function public.fn_create_financial_account(
  p_company_id uuid,
  p_code text,
  p_name text,
  p_type text,
  p_opening_balance numeric default 0,
  p_bank_name text default null,
  p_bank_agency text default null,
  p_bank_account_masked text default null,
  p_currency_code text default 'BRL',
  p_notes text default null
)
returns public.financial_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.financial_accounts;
begin
  if not public.has_permission(p_company_id, 'financial_accounts.create') then
    raise exception 'Permissão negada (financial_accounts.create).' using errcode = '42501';
  end if;

  insert into public.financial_accounts (
    company_id, code, name, type, bank_name, bank_agency, bank_account_masked,
    opening_balance, current_balance, currency_code, notes
  ) values (
    p_company_id, p_code, p_name, p_type, p_bank_name, p_bank_agency, p_bank_account_masked,
    coalesce(p_opening_balance, 0), coalesce(p_opening_balance, 0), coalesce(p_currency_code, 'BRL'), p_notes
  )
  returning * into v_account;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'financial_accounts', v_account.id, 'CREATE',
    null, jsonb_build_object('opening_balance', v_account.opening_balance));

  return v_account;
end;
$$;

revoke all on function public.fn_create_financial_account(uuid, text, text, text, numeric, text, text, text, text, text) from public;
grant execute on function public.fn_create_financial_account(uuid, text, text, text, numeric, text, text, text, text, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('financial_categories.view', 'financial_categories', 'view', 'Consultar categorias financeiras'),
    ('financial_categories.create', 'financial_categories', 'create', 'Criar categorias financeiras'),
    ('financial_categories.update', 'financial_categories', 'update', 'Editar categorias financeiras'),
    ('cost_centers.view', 'cost_centers', 'view', 'Consultar centros de custo'),
    ('cost_centers.create', 'cost_centers', 'create', 'Criar centros de custo'),
    ('cost_centers.update', 'cost_centers', 'update', 'Editar centros de custo'),
    ('financial_accounts.view', 'financial_accounts', 'view', 'Consultar contas financeiras'),
    ('financial_accounts.create', 'financial_accounts', 'create', 'Criar contas financeiras'),
    ('financial_accounts.update', 'financial_accounts', 'update', 'Editar dados cadastrais de contas financeiras (nunca o saldo)')
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
-- RLS — financial_categories/cost_centers: CRUD completo via
-- has_permission direto (padrão "cadastro", sem função dedicada —
-- mesmo de product_categories/work_centers). financial_accounts: só
-- select + update direto (dados cadastrais); insert é exclusivo de
-- fn_create_financial_account (garante current_balance correto desde a
-- criação) — sem policy de insert para authenticated.
-- ==================================================================
alter table public.financial_categories enable row level security;
alter table public.cost_centers enable row level security;
alter table public.financial_accounts enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('financial_categories'), ('cost_centers')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.view'
    );
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
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

drop policy if exists financial_accounts_select on public.financial_accounts;
create policy financial_accounts_select on public.financial_accounts
  for select to authenticated using (public.has_permission(company_id, 'financial_accounts.view'));

drop policy if exists financial_accounts_update on public.financial_accounts;
create policy financial_accounts_update on public.financial_accounts
  for update to authenticated
  using (public.has_permission(company_id, 'financial_accounts.update'))
  with check (public.has_permission(company_id, 'financial_accounts.update'));
