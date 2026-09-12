-- Fase 7 — Financeiro: Contas a Receber.
--
-- Espelha 0032 (accounts_payable) para o lado do cliente. Mesmo
-- princípio: um título a receber representa uma OBRIGAÇÃO do cliente,
-- nunca o pedido de venda em si (seção 4).
--
-- Duas formas de nascer, ambas explícitas:
--   1. fn_create_accounts_receivable — título manual
--      (origin_type='manual').
--   2. fn_generate_accounts_receivable_from_sales_order — a partir de
--      um sales_order já APROVADO (não draft/pending_approval/
--      cancelled). Esta etapa NÃO tem módulo de Faturamento ainda —
--      esta função é a ponte provisória explicitamente pedida (seção
--      22: "o ponto de integração deve ser preparado para o futuro
--      módulo Fiscal/Faturamento"); quando Faturamento existir, o
--      evento apropriado passa a ser a confirmação da fatura, não mais
--      a aprovação do pedido — só o gatilho muda, não a estrutura.
--
-- payment_terms/payment_term_installments (0019) são reaproveitados
-- para o parcelamento, com prioridade para o payment_terms_id já
-- gravado no próprio sales_order (0021) quando o chamador não informa
-- um explicitamente — diferente de accounts_payable, onde
-- purchase_orders nunca ganhou essa coluna (não alterado nesta etapa,
-- "não alterar Compras desnecessariamente").

create sequence if not exists public.accounts_receivable_code_seq;

create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  customer_id uuid not null,
  description text not null,
  category_id uuid,
  cost_center_id uuid,
  origin_type text not null default 'manual' check (origin_type in ('manual', 'sales_order')),
  origin_id uuid,
  document_reference text,
  original_amount numeric(16, 4) not null check (original_amount > 0),
  discount numeric(16, 4) not null default 0 check (discount >= 0),
  interest numeric(16, 4) not null default 0 check (interest >= 0),
  penalty numeric(16, 4) not null default 0 check (penalty >= 0),
  updated_amount numeric(16, 4) generated always as (original_amount - discount + interest + penalty) stored,
  status text not null default 'OPEN' check (status in ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'OVERDUE', 'CANCELLED')),
  issue_date date not null default current_date,
  due_date date not null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers (id, company_id) on delete restrict,
  foreign key (category_id, company_id) references public.financial_categories (id, company_id) on delete set null,
  foreign key (cost_center_id, company_id) references public.cost_centers (id, company_id) on delete set null
);

create trigger set_code before insert on public.accounts_receivable
  for each row execute procedure public.fn_generate_code('CR', 'public.accounts_receivable_code_seq');
create trigger set_updated_at before update on public.accounts_receivable
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists accounts_receivable_company_status_idx on public.accounts_receivable (company_id, status);
create index if not exists accounts_receivable_customer_idx on public.accounts_receivable (customer_id);
create index if not exists accounts_receivable_due_date_idx on public.accounts_receivable (company_id, due_date);
create index if not exists accounts_receivable_origin_idx on public.accounts_receivable (origin_type, origin_id);

comment on table public.accounts_receivable is
  'Obrigação financeira de um cliente — nunca confundir com sales_orders (seção 4). due_date = vencimento da 1ª parcela. Escrita exclusiva via fn_create_accounts_receivable/fn_generate_accounts_receivable_from_sales_order/fn_update_accounts_receivable/fn_cancel_accounts_receivable.';

create table if not exists public.accounts_receivable_installments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receivable_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(16, 4) not null check (amount > 0),
  received_amount numeric(16, 4) not null default 0 check (received_amount >= 0),
  status text not null default 'OPEN' check (status in ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'OVERDUE', 'CANCELLED')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (receivable_id, installment_number),
  unique (id, company_id),
  foreign key (receivable_id, company_id) references public.accounts_receivable (id, company_id) on delete cascade,
  constraint accounts_receivable_installments_received_within_amount check (received_amount <= amount)
);

create index if not exists accounts_receivable_installments_receivable_idx on public.accounts_receivable_installments (receivable_id);
create index if not exists accounts_receivable_installments_due_date_idx on public.accounts_receivable_installments (company_id, due_date);

comment on table public.accounts_receivable_installments is
  'Parcelas de um título a receber. received_amount é sempre incremental (nunca sobrescrito).';

create or replace function public.fn_recompute_receivable_status(p_receivable_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_amount numeric;
  v_total_received numeric;
  v_has_overdue boolean;
  v_all_cancelled boolean;
  v_new_status text;
begin
  select coalesce(sum(amount), 0), coalesce(sum(received_amount), 0),
         bool_or(status = 'OVERDUE'),
         bool_and(status = 'CANCELLED')
  into v_total_amount, v_total_received, v_has_overdue, v_all_cancelled
  from public.accounts_receivable_installments
  where receivable_id = p_receivable_id;

  if v_all_cancelled then
    v_new_status := 'CANCELLED';
  elsif v_total_received >= v_total_amount and v_total_amount > 0 then
    v_new_status := 'RECEIVED';
  elsif v_has_overdue then
    v_new_status := 'OVERDUE';
  elsif v_total_received > 0 then
    v_new_status := 'PARTIALLY_RECEIVED';
  else
    v_new_status := 'OPEN';
  end if;

  update public.accounts_receivable set status = v_new_status where id = p_receivable_id;
end;
$$;

revoke all on function public.fn_recompute_receivable_status(uuid) from public;

create or replace function public.fn_create_accounts_receivable(
  p_company_id uuid,
  p_customer_id uuid,
  p_description text,
  p_original_amount numeric,
  p_installments jsonb,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_discount numeric default 0,
  p_interest numeric default 0,
  p_penalty numeric default 0,
  p_issue_date date default current_date,
  p_document_reference text default null,
  p_notes text default null
)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receivable public.accounts_receivable;
  v_updated_amount numeric;
  v_sum_installments numeric := 0;
  v_item jsonb;
  v_index integer := 0;
  v_first_due_date date;
begin
  if not public.has_permission(p_company_id, 'accounts_receivable.create') then
    raise exception 'Permissão negada (accounts_receivable.create).' using errcode = '42501';
  end if;

  if p_installments is null or jsonb_array_length(p_installments) = 0 then
    raise exception 'O título precisa de ao menos uma parcela.' using errcode = '22023';
  end if;

  v_updated_amount := p_original_amount - coalesce(p_discount, 0) + coalesce(p_interest, 0) + coalesce(p_penalty, 0);

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    v_sum_installments := v_sum_installments + (v_item->>'amount')::numeric;
  end loop;

  if abs(v_sum_installments - v_updated_amount) > 0.01 then
    raise exception 'A soma das parcelas (%) não corresponde ao valor atualizado do título (%).', v_sum_installments, v_updated_amount using errcode = 'P0001';
  end if;

  select (p_installments->0->>'due_date')::date into v_first_due_date;

  insert into public.accounts_receivable (
    company_id, customer_id, description, category_id, cost_center_id,
    original_amount, discount, interest, penalty, issue_date, due_date, document_reference, notes, created_by
  ) values (
    p_company_id, p_customer_id, p_description, p_category_id, p_cost_center_id,
    p_original_amount, coalesce(p_discount, 0), coalesce(p_interest, 0), coalesce(p_penalty, 0),
    coalesce(p_issue_date, current_date), v_first_due_date, p_document_reference, p_notes, public.current_app_user_id()
  )
  returning * into v_receivable;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    v_index := v_index + 1;
    insert into public.accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount)
    values (p_company_id, v_receivable.id, v_index, (v_item->>'due_date')::date, (v_item->>'amount')::numeric);
  end loop;

  update public.accounts_receivable set due_date = (
    select min(due_date) from public.accounts_receivable_installments where receivable_id = v_receivable.id
  ) where id = v_receivable.id
  returning * into v_receivable;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'accounts_receivable', v_receivable.id, 'CREATE',
    null, jsonb_build_object('updated_amount', v_updated_amount, 'installments', jsonb_array_length(p_installments)));

  return v_receivable;
end;
$$;

-- ==================================================================
-- fn_generate_accounts_receivable_from_sales_order — ponte provisória
-- até existir Faturamento (ver cabeçalho do arquivo). Idempotente: no
-- máximo um título por pedido. payment_terms_id: se não informado
-- explicitamente, usa o já gravado em sales_orders.payment_terms_id
-- (0021) — diferente de accounts_payable, onde não há equivalente em
-- purchase_orders.
-- ==================================================================
create or replace function public.fn_generate_accounts_receivable_from_sales_order(
  p_sales_order_id uuid,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_payment_terms_id uuid default null,
  p_issue_date date default current_date,
  p_due_date_base date default current_date,
  p_description text default null
)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_existing public.accounts_receivable;
  v_receivable public.accounts_receivable;
  v_payment_terms_id uuid;
  v_installment record;
  v_amount numeric;
  v_due_date date;
  v_sum_so_far numeric := 0;
  v_count integer;
  v_idx integer := 0;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'accounts_receivable.approve') then
    raise exception 'Permissão negada (accounts_receivable.approve).' using errcode = '42501';
  end if;

  if v_order.status in ('draft', 'pending_approval', 'cancelled') then
    raise exception 'Só é possível gerar título a receber a partir de um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  select * into v_existing from public.accounts_receivable
  where company_id = v_order.company_id and origin_type = 'sales_order' and origin_id = p_sales_order_id;
  if found then
    return v_existing;
  end if;

  if v_order.total_amount <= 0 then
    raise exception 'Pedido sem valor total — nada a gerar.' using errcode = 'P0001';
  end if;

  insert into public.accounts_receivable (
    company_id, customer_id, description, category_id, cost_center_id,
    origin_type, origin_id, original_amount, issue_date, due_date, notes
  ) values (
    v_order.company_id, v_order.customer_id, coalesce(p_description, 'Pedido de venda ' || v_order.code),
    p_category_id, p_cost_center_id, 'sales_order', v_order.id,
    v_order.total_amount, coalesce(p_issue_date, current_date), coalesce(p_due_date_base, current_date), null
  )
  returning * into v_receivable;

  v_payment_terms_id := coalesce(p_payment_terms_id, v_order.payment_terms_id);

  if v_payment_terms_id is not null then
    select count(*) into v_count from public.payment_term_installments where payment_term_id = v_payment_terms_id;
    if v_count = 0 then
      raise exception 'Condição de pagamento não encontrada ou sem parcelas.' using errcode = 'P0002';
    end if;

    for v_installment in
      select * from public.payment_term_installments where payment_term_id = v_payment_terms_id order by installment_number
    loop
      v_idx := v_idx + 1;
      v_due_date := coalesce(p_due_date_base, current_date) + v_installment.days_after;
      if v_idx = v_count then
        v_amount := v_order.total_amount - v_sum_so_far;
      else
        v_amount := round(v_order.total_amount * v_installment.percentage / 100, 2);
      end if;
      v_sum_so_far := v_sum_so_far + v_amount;

      insert into public.accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount)
      values (v_order.company_id, v_receivable.id, v_installment.installment_number, v_due_date, v_amount);
    end loop;
  else
    insert into public.accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount)
    values (v_order.company_id, v_receivable.id, 1, coalesce(p_due_date_base, current_date), v_order.total_amount);
  end if;

  update public.accounts_receivable set due_date = (
    select min(due_date) from public.accounts_receivable_installments where receivable_id = v_receivable.id
  ) where id = v_receivable.id
  returning * into v_receivable;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'accounts_receivable', v_receivable.id, 'APPROVE',
    null, jsonb_build_object('origin_type', 'sales_order', 'origin_id', v_order.id, 'original_amount', v_order.total_amount));

  return v_receivable;
end;
$$;

create or replace function public.fn_update_accounts_receivable(
  p_receivable_id uuid,
  p_description text default null,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_notes text default null
)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receivable public.accounts_receivable;
begin
  select * into v_receivable from public.accounts_receivable where id = p_receivable_id;
  if not found then
    raise exception 'Título a receber não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receivable.company_id, 'accounts_receivable.update') then
    raise exception 'Permissão negada (accounts_receivable.update).' using errcode = '42501';
  end if;

  if v_receivable.status in ('RECEIVED', 'CANCELLED') then
    raise exception 'Não é possível editar um título %.', v_receivable.status using errcode = 'P0001';
  end if;

  update public.accounts_receivable
  set description = coalesce(p_description, description),
      category_id = coalesce(p_category_id, category_id),
      cost_center_id = coalesce(p_cost_center_id, cost_center_id),
      notes = coalesce(p_notes, notes)
  where id = p_receivable_id
  returning * into v_receivable;

  return v_receivable;
end;
$$;

create or replace function public.fn_cancel_accounts_receivable(p_receivable_id uuid, p_reason text default null)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receivable public.accounts_receivable;
begin
  select * into v_receivable from public.accounts_receivable where id = p_receivable_id for update;
  if not found then
    raise exception 'Título a receber não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receivable.company_id, 'accounts_receivable.cancel') then
    raise exception 'Permissão negada (accounts_receivable.cancel).' using errcode = '42501';
  end if;

  if v_receivable.status in ('RECEIVED', 'CANCELLED') then
    raise exception 'Título no status % não pode ser cancelado.', v_receivable.status using errcode = 'P0001';
  end if;

  update public.accounts_receivable_installments
  set status = 'CANCELLED'
  where receivable_id = p_receivable_id and status <> 'RECEIVED';

  perform public.fn_recompute_receivable_status(p_receivable_id);

  select * into v_receivable from public.accounts_receivable where id = p_receivable_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receivable.company_id, public.current_app_user_id(), 'system', 'accounts_receivable', v_receivable.id, 'CANCEL',
    null, jsonb_build_object('status', v_receivable.status, 'reason', p_reason));

  return v_receivable;
end;
$$;

create or replace function public.fn_refresh_overdue_receivables(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receivable_id uuid;
begin
  if not public.has_permission(p_company_id, 'accounts_receivable.view') then
    raise exception 'Permissão negada (accounts_receivable.view).' using errcode = '42501';
  end if;

  update public.accounts_receivable_installments
  set status = 'OVERDUE'
  where company_id = p_company_id and status in ('OPEN', 'PARTIALLY_RECEIVED') and due_date < current_date;

  for v_receivable_id in
    select distinct receivable_id from public.accounts_receivable_installments
    where company_id = p_company_id and status = 'OVERDUE'
  loop
    perform public.fn_recompute_receivable_status(v_receivable_id);
  end loop;
end;
$$;

revoke all on function public.fn_create_accounts_receivable(uuid, uuid, text, numeric, jsonb, uuid, uuid, numeric, numeric, numeric, date, text, text) from public;
revoke all on function public.fn_generate_accounts_receivable_from_sales_order(uuid, uuid, uuid, uuid, date, date, text) from public;
revoke all on function public.fn_update_accounts_receivable(uuid, text, uuid, uuid, text) from public;
revoke all on function public.fn_cancel_accounts_receivable(uuid, text) from public;
revoke all on function public.fn_refresh_overdue_receivables(uuid) from public;
grant execute on function public.fn_create_accounts_receivable(uuid, uuid, text, numeric, jsonb, uuid, uuid, numeric, numeric, numeric, date, text, text) to authenticated;
grant execute on function public.fn_generate_accounts_receivable_from_sales_order(uuid, uuid, uuid, uuid, date, date, text) to authenticated;
grant execute on function public.fn_update_accounts_receivable(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.fn_cancel_accounts_receivable(uuid, text) to authenticated;
grant execute on function public.fn_refresh_overdue_receivables(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('accounts_receivable.view', 'accounts_receivable', 'view', 'Consultar títulos e parcelas a receber'),
    ('accounts_receivable.create', 'accounts_receivable', 'create', 'Criar título a receber manual'),
    ('accounts_receivable.update', 'accounts_receivable', 'update', 'Editar dados não financeiros de um título a receber'),
    ('accounts_receivable.approve', 'accounts_receivable', 'approve', 'Gerar título a receber a partir de um pedido de venda aprovado'),
    ('accounts_receivable.cancel', 'accounts_receivable', 'cancel', 'Cancelar título a receber (parcelas ainda não recebidas)')
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
alter table public.accounts_receivable enable row level security;
alter table public.accounts_receivable_installments enable row level security;

drop policy if exists accounts_receivable_select on public.accounts_receivable;
create policy accounts_receivable_select on public.accounts_receivable
  for select to authenticated using (public.has_permission(company_id, 'accounts_receivable.view'));

drop policy if exists accounts_receivable_installments_select on public.accounts_receivable_installments;
create policy accounts_receivable_installments_select on public.accounts_receivable_installments
  for select to authenticated using (public.has_permission(company_id, 'accounts_receivable.view'));
