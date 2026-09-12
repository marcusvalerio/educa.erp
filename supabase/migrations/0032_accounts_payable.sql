-- Fase 7 — Financeiro: Contas a Pagar.
--
-- Um título a pagar representa uma OBRIGAÇÃO efetiva, nunca um pedido
-- (seção 4). Duas formas de nascer, ambas explícitas — nunca automática
-- só por existir um purchase_order:
--   1. fn_create_accounts_payable — título manual (origin_type='manual'),
--      o chamador informa o valor e as parcelas diretamente.
--   2. fn_generate_accounts_payable_from_purchase_receipt — a partir de
--      um purchase_receipt já CONFIRMADO (não um pedido, não um
--      recebimento em rascunho) — o evento apropriado é a confirmação,
--      que já gerou entrada real em estoque (0018). Gera por
--      idempotência no máximo um título por recebimento.
--
-- payment_terms/payment_term_installments (0019) são reaproveitados
-- para o parcelamento quando informados — nenhuma estrutura paralela
-- de "condição de pagamento" é criada aqui.

create sequence if not exists public.accounts_payable_code_seq;

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  supplier_id uuid not null,
  description text not null,
  category_id uuid,
  cost_center_id uuid,
  origin_type text not null default 'manual' check (origin_type in ('manual', 'purchase_receipt')),
  origin_id uuid,
  document_reference text,
  original_amount numeric(16, 4) not null check (original_amount > 0),
  discount numeric(16, 4) not null default 0 check (discount >= 0),
  interest numeric(16, 4) not null default 0 check (interest >= 0),
  penalty numeric(16, 4) not null default 0 check (penalty >= 0),
  updated_amount numeric(16, 4) generated always as (original_amount - discount + interest + penalty) stored,
  status text not null default 'OPEN' check (status in ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')),
  issue_date date not null default current_date,
  due_date date not null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id) on delete restrict,
  foreign key (category_id, company_id) references public.financial_categories (id, company_id) on delete set null,
  foreign key (cost_center_id, company_id) references public.cost_centers (id, company_id) on delete set null
);

create trigger set_code before insert on public.accounts_payable
  for each row execute procedure public.fn_generate_code('CP', 'public.accounts_payable_code_seq');
create trigger set_updated_at before update on public.accounts_payable
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists accounts_payable_company_status_idx on public.accounts_payable (company_id, status);
create index if not exists accounts_payable_supplier_idx on public.accounts_payable (supplier_id);
create index if not exists accounts_payable_due_date_idx on public.accounts_payable (company_id, due_date);
create index if not exists accounts_payable_origin_idx on public.accounts_payable (origin_type, origin_id);

comment on table public.accounts_payable is
  'Obrigação financeira com um fornecedor — nunca confundir com purchase_orders (seção 4). due_date = vencimento da 1ª parcela (exibição/ordenação; a fonte real de vencimento é accounts_payable_installments). Escrita exclusiva via fn_create_accounts_payable/fn_generate_accounts_payable_from_purchase_receipt/fn_update_accounts_payable/fn_cancel_accounts_payable.';
comment on column public.accounts_payable.updated_amount is
  'original_amount - discount + interest + penalty. Coluna gerada — sempre consistente, nunca gravada diretamente.';
comment on column public.accounts_payable.origin_id is
  'Referência polimórfica (sem FK, mesmo padrão de stock_movements.reference_id) — id do purchase_receipt quando origin_type = purchase_receipt.';

create table if not exists public.accounts_payable_installments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payable_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(16, 4) not null check (amount > 0),
  paid_amount numeric(16, 4) not null default 0 check (paid_amount >= 0),
  status text not null default 'OPEN' check (status in ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payable_id, installment_number),
  unique (id, company_id),
  foreign key (payable_id, company_id) references public.accounts_payable (id, company_id) on delete cascade,
  constraint accounts_payable_installments_paid_within_amount check (paid_amount <= amount)
);

create index if not exists accounts_payable_installments_payable_idx on public.accounts_payable_installments (payable_id);
create index if not exists accounts_payable_installments_due_date_idx on public.accounts_payable_installments (company_id, due_date);

comment on table public.accounts_payable_installments is
  'Parcelas de um título a pagar. Uma obrigação à vista tem exatamente 1 parcela — nunca um título duplicado por parcela (seção 9). paid_amount é sempre incremental (nunca sobrescrito, mesmo padrão de production_order_materials).';

-- ==================================================================
-- fn_recompute_payable_status — interna (nunca exposta diretamente).
-- Prioridade: PAID (tudo pago) > CANCELLED (nada pago, cancelado por
-- fn_cancel_accounts_payable) > OVERDUE (alguma parcela não-paga
-- vencida) > PARTIALLY_PAID (algo já foi pago) > OPEN.
-- ==================================================================
create or replace function public.fn_recompute_payable_status(p_payable_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_amount numeric;
  v_total_paid numeric;
  v_has_overdue boolean;
  v_all_cancelled boolean;
  v_new_status text;
begin
  select coalesce(sum(amount), 0), coalesce(sum(paid_amount), 0),
         bool_or(status = 'OVERDUE'),
         bool_and(status = 'CANCELLED')
  into v_total_amount, v_total_paid, v_has_overdue, v_all_cancelled
  from public.accounts_payable_installments
  where payable_id = p_payable_id;

  if v_all_cancelled then
    v_new_status := 'CANCELLED';
  elsif v_total_paid >= v_total_amount and v_total_amount > 0 then
    v_new_status := 'PAID';
  elsif v_has_overdue then
    v_new_status := 'OVERDUE';
  elsif v_total_paid > 0 then
    v_new_status := 'PARTIALLY_PAID';
  else
    v_new_status := 'OPEN';
  end if;

  update public.accounts_payable set status = v_new_status where id = p_payable_id;
end;
$$;

revoke all on function public.fn_recompute_payable_status(uuid) from public;

-- ==================================================================
-- fn_create_accounts_payable — título manual. p_installments: array
-- [{due_date, amount}], em ordem (installment_number atribuído pela
-- posição). A soma precisa fechar em updated_amount (original - desconto
-- + juros + multa) — mesma técnica de validação de soma já usada em
-- fn_create_payment_term (0019), só que em valor, não percentual.
-- ==================================================================
create or replace function public.fn_create_accounts_payable(
  p_company_id uuid,
  p_supplier_id uuid,
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
returns public.accounts_payable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payable public.accounts_payable;
  v_updated_amount numeric;
  v_sum_installments numeric := 0;
  v_item jsonb;
  v_index integer := 0;
  v_first_due_date date;
begin
  if not public.has_permission(p_company_id, 'accounts_payable.create') then
    raise exception 'Permissão negada (accounts_payable.create).' using errcode = '42501';
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

  insert into public.accounts_payable (
    company_id, supplier_id, description, category_id, cost_center_id,
    original_amount, discount, interest, penalty, issue_date, due_date, document_reference, notes, created_by
  ) values (
    p_company_id, p_supplier_id, p_description, p_category_id, p_cost_center_id,
    p_original_amount, coalesce(p_discount, 0), coalesce(p_interest, 0), coalesce(p_penalty, 0),
    coalesce(p_issue_date, current_date), v_first_due_date, p_document_reference, p_notes, public.current_app_user_id()
  )
  returning * into v_payable;

  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    v_index := v_index + 1;
    insert into public.accounts_payable_installments (company_id, payable_id, installment_number, due_date, amount)
    values (p_company_id, v_payable.id, v_index, (v_item->>'due_date')::date, (v_item->>'amount')::numeric);
  end loop;

  update public.accounts_payable set due_date = (
    select min(due_date) from public.accounts_payable_installments where payable_id = v_payable.id
  ) where id = v_payable.id
  returning * into v_payable;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'accounts_payable', v_payable.id, 'CREATE',
    null, jsonb_build_object('updated_amount', v_updated_amount, 'installments', jsonb_array_length(p_installments)));

  return v_payable;
end;
$$;

-- ==================================================================
-- fn_generate_accounts_payable_from_purchase_receipt — o "evento
-- apropriado" (seção 21): só a partir de um recebimento já CONFIRMADO
-- (gerado estoque real, 0018), nunca de um pedido ou de um recebimento
-- em rascunho. Idempotente: no máximo um título por recebimento — uma
-- segunda chamada retorna o título já existente em vez de duplicar.
-- Valor = o que de fato foi aceito no recebimento (accepted_quantity *
-- preço do item do pedido), não o total do pedido — recebimento
-- parcial gera obrigação parcial.
-- ==================================================================
create or replace function public.fn_generate_accounts_payable_from_purchase_receipt(
  p_purchase_receipt_id uuid,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_payment_terms_id uuid default null,
  p_issue_date date default current_date,
  p_due_date_base date default current_date,
  p_description text default null
)
returns public.accounts_payable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
  v_existing public.accounts_payable;
  v_payable public.accounts_payable;
  v_original_amount numeric;
  v_installment record;
  v_amount numeric;
  v_due_date date;
  v_sum_so_far numeric := 0;
  v_count integer;
  v_idx integer := 0;
begin
  select * into v_receipt from public.purchase_receipts where id = p_purchase_receipt_id;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receipt.company_id, 'accounts_payable.approve') then
    raise exception 'Permissão negada (accounts_payable.approve).' using errcode = '42501';
  end if;

  if v_receipt.status <> 'confirmed' then
    raise exception 'Só é possível gerar título a pagar a partir de um recebimento confirmado (status atual: %).', v_receipt.status using errcode = 'P0001';
  end if;

  select * into v_existing from public.accounts_payable
  where company_id = v_receipt.company_id and origin_type = 'purchase_receipt' and origin_id = p_purchase_receipt_id;
  if found then
    return v_existing;
  end if;

  select coalesce(sum(ri.accepted_quantity * poi.unit_price), 0) into v_original_amount
  from public.purchase_receipt_items ri
  join public.purchase_order_items poi on poi.id = ri.purchase_order_item_id
  where ri.receipt_id = p_purchase_receipt_id and ri.accepted_quantity > 0;

  if v_original_amount <= 0 then
    raise exception 'Recebimento sem quantidade aceita — nada a gerar.' using errcode = 'P0001';
  end if;

  insert into public.accounts_payable (
    company_id, supplier_id, description, category_id, cost_center_id,
    origin_type, origin_id, document_reference,
    original_amount, issue_date, due_date, notes
  ) values (
    v_receipt.company_id, v_receipt.supplier_id, coalesce(p_description, 'Recebimento ' || v_receipt.code),
    p_category_id, p_cost_center_id, 'purchase_receipt', v_receipt.id, v_receipt.document_number,
    v_original_amount, coalesce(p_issue_date, current_date), coalesce(p_due_date_base, current_date), null
  )
  returning * into v_payable;

  if p_payment_terms_id is not null then
    select count(*) into v_count from public.payment_term_installments where payment_term_id = p_payment_terms_id;
    if v_count = 0 then
      raise exception 'Condição de pagamento não encontrada ou sem parcelas.' using errcode = 'P0002';
    end if;

    for v_installment in
      select * from public.payment_term_installments where payment_term_id = p_payment_terms_id order by installment_number
    loop
      v_idx := v_idx + 1;
      v_due_date := coalesce(p_due_date_base, current_date) + v_installment.days_after;
      if v_idx = v_count then
        v_amount := v_original_amount - v_sum_so_far;
      else
        v_amount := round(v_original_amount * v_installment.percentage / 100, 2);
      end if;
      v_sum_so_far := v_sum_so_far + v_amount;

      insert into public.accounts_payable_installments (company_id, payable_id, installment_number, due_date, amount)
      values (v_receipt.company_id, v_payable.id, v_installment.installment_number, v_due_date, v_amount);
    end loop;
  else
    insert into public.accounts_payable_installments (company_id, payable_id, installment_number, due_date, amount)
    values (v_receipt.company_id, v_payable.id, 1, coalesce(p_due_date_base, current_date), v_original_amount);
  end if;

  update public.accounts_payable set due_date = (
    select min(due_date) from public.accounts_payable_installments where payable_id = v_payable.id
  ) where id = v_payable.id
  returning * into v_payable;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receipt.company_id, public.current_app_user_id(), 'system', 'accounts_payable', v_payable.id, 'APPROVE',
    null, jsonb_build_object('origin_type', 'purchase_receipt', 'origin_id', v_receipt.id, 'original_amount', v_original_amount));

  return v_payable;
end;
$$;

create or replace function public.fn_update_accounts_payable(
  p_payable_id uuid,
  p_description text default null,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_notes text default null
)
returns public.accounts_payable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payable public.accounts_payable;
begin
  select * into v_payable from public.accounts_payable where id = p_payable_id;
  if not found then
    raise exception 'Título a pagar não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_payable.company_id, 'accounts_payable.update') then
    raise exception 'Permissão negada (accounts_payable.update).' using errcode = '42501';
  end if;

  if v_payable.status in ('PAID', 'CANCELLED') then
    raise exception 'Não é possível editar um título %.', v_payable.status using errcode = 'P0001';
  end if;

  update public.accounts_payable
  set description = coalesce(p_description, description),
      category_id = coalesce(p_category_id, category_id),
      cost_center_id = coalesce(p_cost_center_id, cost_center_id),
      notes = coalesce(p_notes, notes)
  where id = p_payable_id
  returning * into v_payable;

  return v_payable;
end;
$$;

-- ==================================================================
-- fn_cancel_accounts_payable — nunca apaga (seção 26). Cancela o
-- header e toda parcela ainda não paga; parcelas já pagas permanecem
-- PAID (histórico preservado). Impede novos pagamentos a partir daqui
-- (fn_pay_installment, 0034, guarda o status da parcela).
-- ==================================================================
create or replace function public.fn_cancel_accounts_payable(p_payable_id uuid, p_reason text default null)
returns public.accounts_payable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payable public.accounts_payable;
begin
  select * into v_payable from public.accounts_payable where id = p_payable_id for update;
  if not found then
    raise exception 'Título a pagar não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_payable.company_id, 'accounts_payable.cancel') then
    raise exception 'Permissão negada (accounts_payable.cancel).' using errcode = '42501';
  end if;

  if v_payable.status in ('PAID', 'CANCELLED') then
    raise exception 'Título no status % não pode ser cancelado.', v_payable.status using errcode = 'P0001';
  end if;

  update public.accounts_payable_installments
  set status = 'CANCELLED'
  where payable_id = p_payable_id and status <> 'PAID';

  perform public.fn_recompute_payable_status(p_payable_id);

  select * into v_payable from public.accounts_payable where id = p_payable_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_payable.company_id, public.current_app_user_id(), 'system', 'accounts_payable', v_payable.id, 'CANCEL',
    null, jsonb_build_object('status', v_payable.status, 'reason', p_reason));

  return v_payable;
end;
$$;

-- ==================================================================
-- fn_refresh_overdue_payables — seção 16: OPEN/PARTIALLY_PAID ->
-- OVERDUE quando a parcela já venceu. Só avança (nunca reverte
-- OVERDUE -> OPEN) — não há função de edição de vencimento nesta
-- etapa, então a transição é sempre consistente, nunca contraditória.
-- ==================================================================
create or replace function public.fn_refresh_overdue_payables(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payable_id uuid;
begin
  if not public.has_permission(p_company_id, 'accounts_payable.view') then
    raise exception 'Permissão negada (accounts_payable.view).' using errcode = '42501';
  end if;

  update public.accounts_payable_installments
  set status = 'OVERDUE'
  where company_id = p_company_id and status in ('OPEN', 'PARTIALLY_PAID') and due_date < current_date;

  for v_payable_id in
    select distinct payable_id from public.accounts_payable_installments
    where company_id = p_company_id and status = 'OVERDUE'
  loop
    perform public.fn_recompute_payable_status(v_payable_id);
  end loop;
end;
$$;

revoke all on function public.fn_create_accounts_payable(uuid, uuid, text, numeric, jsonb, uuid, uuid, numeric, numeric, numeric, date, text, text) from public;
revoke all on function public.fn_generate_accounts_payable_from_purchase_receipt(uuid, uuid, uuid, uuid, date, date, text) from public;
revoke all on function public.fn_update_accounts_payable(uuid, text, uuid, uuid, text) from public;
revoke all on function public.fn_cancel_accounts_payable(uuid, text) from public;
revoke all on function public.fn_refresh_overdue_payables(uuid) from public;
grant execute on function public.fn_create_accounts_payable(uuid, uuid, text, numeric, jsonb, uuid, uuid, numeric, numeric, numeric, date, text, text) to authenticated;
grant execute on function public.fn_generate_accounts_payable_from_purchase_receipt(uuid, uuid, uuid, uuid, date, date, text) to authenticated;
grant execute on function public.fn_update_accounts_payable(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.fn_cancel_accounts_payable(uuid, text) to authenticated;
grant execute on function public.fn_refresh_overdue_payables(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('accounts_payable.view', 'accounts_payable', 'view', 'Consultar títulos e parcelas a pagar'),
    ('accounts_payable.create', 'accounts_payable', 'create', 'Criar título a pagar manual'),
    ('accounts_payable.update', 'accounts_payable', 'update', 'Editar dados não financeiros de um título a pagar'),
    ('accounts_payable.approve', 'accounts_payable', 'approve', 'Gerar título a pagar a partir de um recebimento confirmado'),
    ('accounts_payable.cancel', 'accounts_payable', 'cancel', 'Cancelar título a pagar (parcelas ainda não pagas)')
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
alter table public.accounts_payable enable row level security;
alter table public.accounts_payable_installments enable row level security;

drop policy if exists accounts_payable_select on public.accounts_payable;
create policy accounts_payable_select on public.accounts_payable
  for select to authenticated using (public.has_permission(company_id, 'accounts_payable.view'));

drop policy if exists accounts_payable_installments_select on public.accounts_payable_installments;
create policy accounts_payable_installments_select on public.accounts_payable_installments
  for select to authenticated using (public.has_permission(company_id, 'accounts_payable.view'));
