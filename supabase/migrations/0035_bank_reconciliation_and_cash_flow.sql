-- Fase 7 — Financeiro: conciliação bancária e fluxo de caixa.
--
-- Conciliação (seção 20): preparação estrutural — marcar transações
-- como conciliada/não conciliada/divergente. Nenhuma integração com
-- API bancária nesta etapa; o "extrato" de origem, quando existir,
-- será importado por uma etapa futura e casado contra
-- financial_transactions através desta mesma estrutura.
--
-- Fluxo de caixa (seção 17): NÃO é um campo "saldo projetado" mutável
-- — é sempre calculável a partir de financial_accounts.current_balance
-- + accounts_receivable_installments/accounts_payable_installments
-- ainda abertos. Por isso é modelado como VIEWS (v_cash_flow_summary/
-- v_cash_flow_projection), nunca uma tabela armazenando um número.

create sequence if not exists public.bank_reconciliations_code_seq;

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  financial_account_id uuid not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (financial_account_id, company_id) references public.financial_accounts (id, company_id) on delete restrict,
  check (period_end >= period_start)
);

create trigger set_code before insert on public.bank_reconciliations
  for each row execute procedure public.fn_generate_code('CONC', 'public.bank_reconciliations_code_seq');
create trigger set_updated_at before update on public.bank_reconciliations
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists bank_reconciliations_company_status_idx on public.bank_reconciliations (company_id, status);
create index if not exists bank_reconciliations_account_idx on public.bank_reconciliations (financial_account_id);

comment on table public.bank_reconciliations is
  'Conciliação bancária por período, contra um extrato (ainda não integrado automaticamente — seção 20). Escrita exclusiva via fn_create_bank_reconciliation/fn_set_reconciliation_item_status/fn_complete_bank_reconciliation.';

create table if not exists public.bank_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reconciliation_id uuid not null,
  financial_transaction_id uuid not null,
  status text not null default 'unreconciled' check (status in ('reconciled', 'unreconciled', 'divergent')),
  notes text,
  created_at timestamptz not null default now(),
  unique (reconciliation_id, financial_transaction_id),
  foreign key (reconciliation_id, company_id) references public.bank_reconciliations (id, company_id) on delete cascade,
  foreign key (financial_transaction_id, company_id) references public.financial_transactions (id, company_id) on delete restrict
);

create index if not exists bank_reconciliation_items_reconciliation_idx on public.bank_reconciliation_items (reconciliation_id);
create index if not exists bank_reconciliation_items_transaction_idx on public.bank_reconciliation_items (financial_transaction_id);

comment on table public.bank_reconciliation_items is
  'Um item por financial_transaction dentro do período da conciliação — auto-populado por fn_create_bank_reconciliation, status ajustável individualmente via fn_set_reconciliation_item_status.';

-- ==================================================================
-- fn_create_bank_reconciliation — já popula os itens a partir das
-- financial_transactions existentes da conta no período informado
-- (todas nascem 'unreconciled' — a decisão de casar com o extrato é
-- manual, item a item, nesta etapa).
-- ==================================================================
create or replace function public.fn_create_bank_reconciliation(
  p_company_id uuid,
  p_financial_account_id uuid,
  p_period_start date,
  p_period_end date,
  p_notes text default null
)
returns public.bank_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconciliation public.bank_reconciliations;
begin
  if not public.has_permission(p_company_id, 'bank_reconciliation.create') then
    raise exception 'Permissão negada (bank_reconciliation.create).' using errcode = '42501';
  end if;

  insert into public.bank_reconciliations (company_id, financial_account_id, period_start, period_end, notes, created_by)
  values (p_company_id, p_financial_account_id, p_period_start, p_period_end, p_notes, public.current_app_user_id())
  returning * into v_reconciliation;

  insert into public.bank_reconciliation_items (company_id, reconciliation_id, financial_transaction_id)
  select p_company_id, v_reconciliation.id, ft.id
  from public.financial_transactions ft
  where ft.company_id = p_company_id
    and ft.financial_account_id = p_financial_account_id
    and ft.occurred_at::date between p_period_start and p_period_end;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'bank_reconciliations', v_reconciliation.id, 'CREATE',
    null, jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end));

  return v_reconciliation;
end;
$$;

create or replace function public.fn_set_reconciliation_item_status(
  p_item_id uuid,
  p_status text,
  p_notes text default null
)
returns public.bank_reconciliation_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.bank_reconciliation_items;
  v_reconciliation public.bank_reconciliations;
begin
  if p_status not in ('reconciled', 'unreconciled', 'divergent') then
    raise exception 'Status de conciliação inválido: %.', p_status using errcode = '22023';
  end if;

  select * into v_item from public.bank_reconciliation_items where id = p_item_id;
  if not found then
    raise exception 'Item de conciliação não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_reconciliation from public.bank_reconciliations where id = v_item.reconciliation_id;

  if not public.has_permission(v_reconciliation.company_id, 'bank_reconciliation.update') then
    raise exception 'Permissão negada (bank_reconciliation.update).' using errcode = '42501';
  end if;

  if v_reconciliation.status <> 'in_progress' then
    raise exception 'Só é possível ajustar itens de uma conciliação em andamento (status atual: %).', v_reconciliation.status using errcode = 'P0001';
  end if;

  update public.bank_reconciliation_items
  set status = p_status, notes = coalesce(p_notes, notes)
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;

-- ==================================================================
-- fn_complete_bank_reconciliation — reaproveita bank_reconciliation.update
-- (sem permissão .complete dedicada — mesmo espírito de
-- fn_complete_shipment reaproveitando shipments.update, Logística 0025).
-- Não exige que todo item esteja 'reconciled' — divergências podem
-- ficar registradas e resolvidas depois, fora desta etapa.
-- ==================================================================
create or replace function public.fn_complete_bank_reconciliation(p_reconciliation_id uuid)
returns public.bank_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconciliation public.bank_reconciliations;
begin
  select * into v_reconciliation from public.bank_reconciliations where id = p_reconciliation_id for update;
  if not found then
    raise exception 'Conciliação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_reconciliation.company_id, 'bank_reconciliation.update') then
    raise exception 'Permissão negada (bank_reconciliation.update).' using errcode = '42501';
  end if;

  if v_reconciliation.status <> 'in_progress' then
    raise exception 'Só é possível concluir uma conciliação em andamento (status atual: %).', v_reconciliation.status using errcode = 'P0001';
  end if;

  update public.bank_reconciliations set status = 'completed' where id = p_reconciliation_id
  returning * into v_reconciliation;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_reconciliation.company_id, public.current_app_user_id(), 'system', 'bank_reconciliations', v_reconciliation.id, 'RECONCILE',
    jsonb_build_object('status', 'in_progress'), jsonb_build_object('status', 'completed'));

  return v_reconciliation;
end;
$$;

revoke all on function public.fn_create_bank_reconciliation(uuid, uuid, date, date, text) from public;
revoke all on function public.fn_set_reconciliation_item_status(uuid, text, text) from public;
revoke all on function public.fn_complete_bank_reconciliation(uuid) from public;
grant execute on function public.fn_create_bank_reconciliation(uuid, uuid, date, date, text) to authenticated;
grant execute on function public.fn_set_reconciliation_item_status(uuid, text, text) to authenticated;
grant execute on function public.fn_complete_bank_reconciliation(uuid) to authenticated;

-- ==================================================================
-- FLUXO DE CAIXA — views, nunca um campo mutável (seção 17). Lidas
-- pela API com o cliente admin, igual a qualquer leitura "cadastro" —
-- a permissão é checada na camada de API (financial_transactions.view
-- + accounts_payable.view + accounts_receivable.view), não por RLS na
-- própria view.
-- ==================================================================
create or replace view public.v_cash_flow_summary as
select
  c.id as company_id,
  coalesce((select sum(fa.current_balance) from public.financial_accounts fa where fa.company_id = c.id and fa.status = 'active'), 0) as current_balance_total,
  coalesce((select sum(ari.amount - ari.received_amount) from public.accounts_receivable_installments ari
    where ari.company_id = c.id and ari.status in ('OPEN', 'PARTIALLY_RECEIVED', 'OVERDUE')), 0) as open_receivable_total,
  coalesce((select sum(api.amount - api.paid_amount) from public.accounts_payable_installments api
    where api.company_id = c.id and api.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')), 0) as open_payable_total
from public.companies c;

comment on view public.v_cash_flow_summary is
  'Resumo calculável (seção 17): projected_balance = current_balance_total + open_receivable_total - open_payable_total (calculado pelo chamador, não armazenado). Saldo atual de contas ativas + tudo que ainda está aberto a receber - tudo que ainda está aberto a pagar.';

create or replace view public.v_cash_flow_projection as
select company_id, due_date, 'INFLOW'::text as direction, sum(amount - received_amount) as amount
from public.accounts_receivable_installments
where status in ('OPEN', 'PARTIALLY_RECEIVED', 'OVERDUE')
group by company_id, due_date
union all
select company_id, due_date, 'OUTFLOW'::text as direction, sum(amount - paid_amount) as amount
from public.accounts_payable_installments
where status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
group by company_id, due_date;

comment on view public.v_cash_flow_projection is
  'Série por data de vencimento (seção 17) — entradas (INFLOW, a receber em aberto) e saídas (OUTFLOW, a pagar em aberto) agrupadas por dia. O saldo projetado acumulado é current_balance_total (v_cash_flow_summary) + soma ordenada por due_date — cálculo do chamador, não armazenado aqui.';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('bank_reconciliation.view', 'bank_reconciliation', 'view', 'Consultar conciliações bancárias'),
    ('bank_reconciliation.create', 'bank_reconciliation', 'create', 'Criar conciliação bancária por período'),
    ('bank_reconciliation.update', 'bank_reconciliation', 'update', 'Ajustar itens e concluir uma conciliação bancária')
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
alter table public.bank_reconciliations enable row level security;
alter table public.bank_reconciliation_items enable row level security;

drop policy if exists bank_reconciliations_select on public.bank_reconciliations;
create policy bank_reconciliations_select on public.bank_reconciliations
  for select to authenticated using (public.has_permission(company_id, 'bank_reconciliation.view'));

drop policy if exists bank_reconciliation_items_select on public.bank_reconciliation_items;
create policy bank_reconciliation_items_select on public.bank_reconciliation_items
  for select to authenticated using (public.has_permission(company_id, 'bank_reconciliation.view'));
