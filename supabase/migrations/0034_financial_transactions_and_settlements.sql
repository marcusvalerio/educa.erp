-- Fase 7 — Financeiro: movimentações, pagamentos e recebimentos.
--
-- Onde Financeiro finalmente move dinheiro de verdade — e SOMENTE
-- aqui. fn_post_financial_transaction é a ÚNICA função deste módulo
-- que escreve financial_accounts.current_balance; nenhuma outra parte
-- do Financeiro faz `update financial_accounts` direto. Mesma
-- arquitetura ledger-imutável + saldo-derivado de stock_movements/
-- stock_balances (0009) — mesmo primitivo estrutural, domínio
-- diferente.

-- ==================================================================
-- FINANCIAL_TRANSACTIONS — ledger imutável (insert-only, nenhuma
-- policy de update/delete). Vocabulário de type: CREDIT (entra na
-- conta) / DEBIT (sai da conta).
-- ==================================================================
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_account_id uuid not null,
  type text not null check (type in ('CREDIT', 'DEBIT')),
  amount numeric(16, 4) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  reference_type text,
  reference_id uuid,
  category_id uuid,
  cost_center_id uuid,
  description text,
  idempotency_key text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (financial_account_id, company_id) references public.financial_accounts (id, company_id) on delete restrict,
  foreign key (category_id, company_id) references public.financial_categories (id, company_id) on delete set null,
  foreign key (cost_center_id, company_id) references public.cost_centers (id, company_id) on delete set null
);

create unique index if not exists financial_transactions_idempotency_key
  on public.financial_transactions (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists financial_transactions_account_idx on public.financial_transactions (financial_account_id, occurred_at desc);
create index if not exists financial_transactions_reference_idx on public.financial_transactions (reference_type, reference_id);

comment on table public.financial_transactions is
  'Ledger imutável de movimentações financeiras — fonte de verdade do saldo de financial_accounts. Insert-only; nenhuma policy de update/delete existe para authenticated. Escrita exclusiva via fn_post_financial_transaction (interna) através de fn_pay_installment/fn_receive_installment/fn_reverse_payment/fn_reverse_receipt/fn_create_manual_financial_transaction.';

-- ==================================================================
-- fn_post_financial_transaction — ÚNICO ponto de escrita de
-- financial_accounts.current_balance. Não exposta diretamente (revoke
-- de public/authenticated, sem grant) — só chamável por outras funções
-- SECURITY DEFINER do mesmo owner, que decidem qual permissão RBAC
-- exigir. Mesma técnica de concorrência e idempotência de
-- fn_post_stock_movement (0009): trava a linha de financial_accounts
-- (for update) antes de aplicar o delta; idempotency_key com
-- tratamento de unique_violation para a corrida entre "verificar" e
-- "inserir".
-- ==================================================================
create or replace function public.fn_post_financial_transaction(
  p_company_id uuid,
  p_financial_account_id uuid,
  p_type text,
  p_amount numeric,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_description text default null,
  p_idempotency_key text default null,
  p_created_by uuid default null
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.financial_transactions;
  v_transaction public.financial_transactions;
  v_delta numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor da movimentação deve ser maior que zero.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.financial_transactions
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  case p_type
    when 'CREDIT' then v_delta := p_amount;
    when 'DEBIT' then v_delta := -p_amount;
    else raise exception 'Tipo de movimentação inválido: %', p_type using errcode = '22023';
  end case;

  perform 1 from public.financial_accounts where id = p_financial_account_id and company_id = p_company_id for update;
  if not found then
    raise exception 'Conta financeira não encontrada.' using errcode = 'P0002';
  end if;

  update public.financial_accounts
  set current_balance = current_balance + v_delta
  where id = p_financial_account_id and company_id = p_company_id;

  begin
    insert into public.financial_transactions (
      company_id, financial_account_id, type, amount, reference_type, reference_id,
      category_id, cost_center_id, description, idempotency_key, created_by
    ) values (
      p_company_id, p_financial_account_id, p_type, p_amount, p_reference_type, p_reference_id,
      p_category_id, p_cost_center_id, p_description, p_idempotency_key, p_created_by
    )
    returning * into v_transaction;
  exception
    when unique_violation then
      -- Corrida de idempotência: outra transação concorrente já usou
      -- esta chave entre a checagem inicial e este insert. O saldo já
      -- foi ajustado acima nesta transação — desfaz revertendo o delta
      -- e devolve a movimentação existente (nenhum efeito duplicado).
      update public.financial_accounts
      set current_balance = current_balance - v_delta
      where id = p_financial_account_id and company_id = p_company_id;

      select * into v_existing from public.financial_transactions
      where company_id = p_company_id and idempotency_key = p_idempotency_key;
      if found then
        return v_existing;
      end if;
      raise;
  end;

  return v_transaction;
end;
$$;

revoke all on function public.fn_post_financial_transaction(uuid, uuid, text, numeric, uuid, uuid, text, uuid, text, text, uuid) from public;

-- ==================================================================
-- fn_create_manual_financial_transaction — movimentação manual de
-- conta (ex.: taxa bancária, depósito/retirada de caixa) não ligada a
-- um título a pagar/receber. Único uso direto de
-- financial_transactions.create fora do fluxo de pagamento/recebimento.
-- ==================================================================
create or replace function public.fn_create_manual_financial_transaction(
  p_company_id uuid,
  p_financial_account_id uuid,
  p_type text,
  p_amount numeric,
  p_category_id uuid default null,
  p_cost_center_id uuid default null,
  p_description text default null,
  p_idempotency_key text default null
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.financial_transactions;
begin
  if not public.has_permission(p_company_id, 'financial_transactions.create') then
    raise exception 'Permissão negada (financial_transactions.create).' using errcode = '42501';
  end if;

  v_transaction := public.fn_post_financial_transaction(
    p_company_id => p_company_id,
    p_financial_account_id => p_financial_account_id,
    p_type => p_type,
    p_amount => p_amount,
    p_category_id => p_category_id,
    p_cost_center_id => p_cost_center_id,
    p_reference_type => 'MANUAL',
    p_description => p_description,
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'financial_transactions', v_transaction.id, 'CREATE',
    null, jsonb_build_object('type', p_type, 'amount', p_amount));

  return v_transaction;
end;
$$;

revoke all on function public.fn_create_manual_financial_transaction(uuid, uuid, text, numeric, uuid, uuid, text, text) from public;
grant execute on function public.fn_create_manual_financial_transaction(uuid, uuid, text, numeric, uuid, uuid, text, text) to authenticated;

-- ==================================================================
-- PAYMENTS — dinheiro saindo (contra accounts_payable_installments).
-- ==================================================================
create sequence if not exists public.payments_code_seq;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  installment_id uuid not null,
  financial_account_id uuid not null,
  amount numeric(16, 4) not null check (amount > 0),
  paid_at date not null default current_date,
  method text not null check (method in ('CASH', 'BANK_TRANSFER', 'PIX', 'CARD', 'BOLETO', 'OTHER')),
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'REVERSED')),
  reference text,
  notes text,
  idempotency_key text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (installment_id, company_id) references public.accounts_payable_installments (id, company_id) on delete restrict,
  foreign key (financial_account_id, company_id) references public.financial_accounts (id, company_id) on delete restrict
);

create trigger set_code before insert on public.payments
  for each row execute procedure public.fn_generate_code('PAG', 'public.payments_code_seq');
create unique index if not exists payments_idempotency_key
  on public.payments (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists payments_installment_idx on public.payments (installment_id);
create index if not exists payments_account_idx on public.payments (financial_account_id);

comment on table public.payments is
  'Pagamento real contra uma parcela a pagar. payable_id nunca é armazenado aqui — é sempre derivável via installment_id -> accounts_payable_installments.payable_id (evita duplicar a referência). Nunca apagado — estorno via fn_reverse_payment (status=REVERSED), movimentação original preservada (seção 25).';
comment on column public.payments.reference is
  'Referência/ponteiro do comprovante (texto livre) — nenhum armazenamento de arquivo, mesmo padrão de delivery_events.pod_reference (Logística, 0025).';

-- ==================================================================
-- RECEIPTS — dinheiro entrando (contra accounts_receivable_installments).
-- ==================================================================
create sequence if not exists public.receipts_code_seq;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  installment_id uuid not null,
  financial_account_id uuid not null,
  amount numeric(16, 4) not null check (amount > 0),
  received_at date not null default current_date,
  method text not null check (method in ('CASH', 'BANK_TRANSFER', 'PIX', 'CARD', 'BOLETO', 'OTHER')),
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'REVERSED')),
  reference text,
  notes text,
  idempotency_key text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (installment_id, company_id) references public.accounts_receivable_installments (id, company_id) on delete restrict,
  foreign key (financial_account_id, company_id) references public.financial_accounts (id, company_id) on delete restrict
);

create trigger set_code before insert on public.receipts
  for each row execute procedure public.fn_generate_code('REB', 'public.receipts_code_seq');
create unique index if not exists receipts_idempotency_key
  on public.receipts (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists receipts_installment_idx on public.receipts (installment_id);
create index if not exists receipts_account_idx on public.receipts (financial_account_id);

comment on table public.receipts is
  'Recebimento real contra uma parcela a receber. Prefixo de código REB (Recebimento) para não colidir visualmente com purchase_receipts (prefixo REC, recebimento de mercadoria) — tabelas diferentes, sem relação entre si.';

-- ==================================================================
-- fn_pay_installment — TRANSACIONAL. Trava a parcela e o título antes
-- de validar "valor <= saldo da parcela" (seção 14/28), fechando a
-- mesma janela de corrida que fn_post_stock_movement já fecha para
-- stock_balances — dois pagamentos concorrentes contra a mesma parcela
-- serializam corretamente, nunca registram R$ 1.400 contra um saldo de
-- R$ 1.000 (exemplo da seção 28).
-- ==================================================================
create or replace function public.fn_pay_installment(
  p_installment_id uuid,
  p_financial_account_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at date default current_date,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_installment public.accounts_payable_installments;
  v_payable public.accounts_payable;
  v_existing public.payments;
  v_remaining numeric;
  v_payment public.payments;
begin
  select * into v_installment from public.accounts_payable_installments where id = p_installment_id for update;
  if not found then
    raise exception 'Parcela a pagar não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_payable from public.accounts_payable where id = v_installment.payable_id for update;

  if not public.has_permission(v_payable.company_id, 'payments.create') then
    raise exception 'Permissão negada (payments.create).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.payments
    where company_id = v_payable.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  if v_payable.status = 'CANCELLED' then
    raise exception 'Título cancelado não pode receber pagamentos.' using errcode = 'P0001';
  end if;

  if v_installment.status in ('PAID', 'CANCELLED') then
    raise exception 'Parcela no status % não pode receber pagamentos.', v_installment.status using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do pagamento deve ser maior que zero.' using errcode = '22023';
  end if;

  v_remaining := v_installment.amount - v_installment.paid_amount;
  if p_amount > v_remaining then
    raise exception 'Pagamento (%) excede o saldo da parcela (%).', p_amount, v_remaining using errcode = 'P0001';
  end if;

  insert into public.payments (
    company_id, installment_id, financial_account_id, amount, paid_at, method, reference, notes, idempotency_key, created_by
  ) values (
    v_payable.company_id, p_installment_id, p_financial_account_id, p_amount, coalesce(p_paid_at, current_date), p_method,
    p_reference, p_notes, p_idempotency_key, public.current_app_user_id()
  )
  returning * into v_payment;

  perform public.fn_post_financial_transaction(
    p_company_id => v_payable.company_id,
    p_financial_account_id => p_financial_account_id,
    p_type => 'DEBIT',
    p_amount => p_amount,
    p_category_id => v_payable.category_id,
    p_cost_center_id => v_payable.cost_center_id,
    p_reference_type => 'ACCOUNTS_PAYABLE_INSTALLMENT',
    p_reference_id => v_installment.id,
    p_description => 'Pagamento ' || v_payment.code || ' — ' || v_payable.code || ' parcela ' || v_installment.installment_number,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':txn' else null end,
    p_created_by => public.current_app_user_id()
  );

  update public.accounts_payable_installments
  set paid_amount = paid_amount + p_amount,
      status = case when paid_amount + p_amount >= amount then 'PAID' else 'PARTIALLY_PAID' end,
      settled_at = case when paid_amount + p_amount >= amount then now() else settled_at end
  where id = p_installment_id;

  perform public.fn_recompute_payable_status(v_payable.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_payable.company_id, public.current_app_user_id(), 'system', 'payments', v_payment.id, 'PAY',
    null, jsonb_build_object('installment_id', p_installment_id, 'amount', p_amount));

  return v_payment;
end;
$$;

-- ==================================================================
-- fn_receive_installment — espelho de fn_pay_installment para o lado
-- do cliente.
-- ==================================================================
create or replace function public.fn_receive_installment(
  p_installment_id uuid,
  p_financial_account_id uuid,
  p_amount numeric,
  p_method text,
  p_received_at date default current_date,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_installment public.accounts_receivable_installments;
  v_receivable public.accounts_receivable;
  v_existing public.receipts;
  v_remaining numeric;
  v_receipt public.receipts;
begin
  select * into v_installment from public.accounts_receivable_installments where id = p_installment_id for update;
  if not found then
    raise exception 'Parcela a receber não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_receivable from public.accounts_receivable where id = v_installment.receivable_id for update;

  if not public.has_permission(v_receivable.company_id, 'receipts.create') then
    raise exception 'Permissão negada (receipts.create).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.receipts
    where company_id = v_receivable.company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  if v_receivable.status = 'CANCELLED' then
    raise exception 'Título cancelado não pode receber recebimentos.' using errcode = 'P0001';
  end if;

  if v_installment.status in ('RECEIVED', 'CANCELLED') then
    raise exception 'Parcela no status % não pode receber recebimentos.', v_installment.status using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do recebimento deve ser maior que zero.' using errcode = '22023';
  end if;

  v_remaining := v_installment.amount - v_installment.received_amount;
  if p_amount > v_remaining then
    raise exception 'Recebimento (%) excede o saldo da parcela (%).', p_amount, v_remaining using errcode = 'P0001';
  end if;

  insert into public.receipts (
    company_id, installment_id, financial_account_id, amount, received_at, method, reference, notes, idempotency_key, created_by
  ) values (
    v_receivable.company_id, p_installment_id, p_financial_account_id, p_amount, coalesce(p_received_at, current_date), p_method,
    p_reference, p_notes, p_idempotency_key, public.current_app_user_id()
  )
  returning * into v_receipt;

  perform public.fn_post_financial_transaction(
    p_company_id => v_receivable.company_id,
    p_financial_account_id => p_financial_account_id,
    p_type => 'CREDIT',
    p_amount => p_amount,
    p_category_id => v_receivable.category_id,
    p_cost_center_id => v_receivable.cost_center_id,
    p_reference_type => 'ACCOUNTS_RECEIVABLE_INSTALLMENT',
    p_reference_id => v_installment.id,
    p_description => 'Recebimento ' || v_receipt.code || ' — ' || v_receivable.code || ' parcela ' || v_installment.installment_number,
    p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':txn' else null end,
    p_created_by => public.current_app_user_id()
  );

  update public.accounts_receivable_installments
  set received_amount = received_amount + p_amount,
      status = case when received_amount + p_amount >= amount then 'RECEIVED' else 'PARTIALLY_RECEIVED' end,
      settled_at = case when received_amount + p_amount >= amount then now() else settled_at end
  where id = p_installment_id;

  perform public.fn_recompute_receivable_status(v_receivable.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receivable.company_id, public.current_app_user_id(), 'system', 'receipts', v_receipt.id, 'RECEIVE',
    null, jsonb_build_object('installment_id', p_installment_id, 'amount', p_amount));

  return v_receipt;
end;
$$;

-- ==================================================================
-- fn_reverse_payment — estorno (seção 25). A movimentação original
-- NUNCA é apagada ou alterada — grava um CREDIT inverso (devolve o
-- valor à conta) e marca o pagamento como REVERSED. Idempotente: uma
-- segunda chamada com a mesma idempotency_key retorna o resultado já
-- aplicado; sem chave, uma segunda tentativa falha claramente (pagamento
-- já estornado), nunca duplica o estorno.
-- ==================================================================
create or replace function public.fn_reverse_payment(
  p_payment_id uuid,
  p_reason text default null,
  p_idempotency_key text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
  v_installment public.accounts_payable_installments;
  v_payable public.accounts_payable;
  v_existing public.financial_transactions;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pagamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_payment.company_id, 'payments.reverse') then
    raise exception 'Permissão negada (payments.reverse).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.financial_transactions
    where company_id = v_payment.company_id and idempotency_key = p_idempotency_key;
    if found then
      select * into v_payment from public.payments where id = p_payment_id;
      return v_payment;
    end if;
  end if;

  if v_payment.status = 'REVERSED' then
    raise exception 'Pagamento já estornado.' using errcode = 'P0001';
  end if;

  select * into v_installment from public.accounts_payable_installments where id = v_payment.installment_id for update;
  select * into v_payable from public.accounts_payable where id = v_installment.payable_id for update;

  perform public.fn_post_financial_transaction(
    p_company_id => v_payment.company_id,
    p_financial_account_id => v_payment.financial_account_id,
    p_type => 'CREDIT',
    p_amount => v_payment.amount,
    p_category_id => v_payable.category_id,
    p_cost_center_id => v_payable.cost_center_id,
    p_reference_type => 'PAYMENT_REVERSAL',
    p_reference_id => v_payment.id,
    p_description => 'Estorno do pagamento ' || v_payment.code || coalesce(' — ' || p_reason, ''),
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );

  update public.payments set status = 'REVERSED' where id = p_payment_id
  returning * into v_payment;

  update public.accounts_payable_installments
  set paid_amount = greatest(paid_amount - v_payment.amount, 0),
      status = case
        when status = 'CANCELLED' then status
        when paid_amount - v_payment.amount <= 0 then 'OPEN'
        else 'PARTIALLY_PAID'
      end,
      settled_at = case when paid_amount - v_payment.amount <= 0 then null else settled_at end
  where id = v_installment.id;

  perform public.fn_recompute_payable_status(v_payable.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_payment.company_id, public.current_app_user_id(), 'system', 'payments', v_payment.id, 'REVERSE',
    jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'REVERSED', 'reason', p_reason));

  return v_payment;
end;
$$;

create or replace function public.fn_reverse_receipt(
  p_receipt_id uuid,
  p_reason text default null,
  p_idempotency_key text default null
)
returns public.receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.receipts;
  v_installment public.accounts_receivable_installments;
  v_receivable public.accounts_receivable;
  v_existing public.financial_transactions;
begin
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receipt.company_id, 'receipts.reverse') then
    raise exception 'Permissão negada (receipts.reverse).' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.financial_transactions
    where company_id = v_receipt.company_id and idempotency_key = p_idempotency_key;
    if found then
      select * into v_receipt from public.receipts where id = p_receipt_id;
      return v_receipt;
    end if;
  end if;

  if v_receipt.status = 'REVERSED' then
    raise exception 'Recebimento já estornado.' using errcode = 'P0001';
  end if;

  select * into v_installment from public.accounts_receivable_installments where id = v_receipt.installment_id for update;
  select * into v_receivable from public.accounts_receivable where id = v_installment.receivable_id for update;

  perform public.fn_post_financial_transaction(
    p_company_id => v_receipt.company_id,
    p_financial_account_id => v_receipt.financial_account_id,
    p_type => 'DEBIT',
    p_amount => v_receipt.amount,
    p_category_id => v_receivable.category_id,
    p_cost_center_id => v_receivable.cost_center_id,
    p_reference_type => 'RECEIPT_REVERSAL',
    p_reference_id => v_receipt.id,
    p_description => 'Estorno do recebimento ' || v_receipt.code || coalesce(' — ' || p_reason, ''),
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );

  update public.receipts set status = 'REVERSED' where id = p_receipt_id
  returning * into v_receipt;

  update public.accounts_receivable_installments
  set received_amount = greatest(received_amount - v_receipt.amount, 0),
      status = case
        when status = 'CANCELLED' then status
        when received_amount - v_receipt.amount <= 0 then 'OPEN'
        else 'PARTIALLY_RECEIVED'
      end,
      settled_at = case when received_amount - v_receipt.amount <= 0 then null else settled_at end
  where id = v_installment.id;

  perform public.fn_recompute_receivable_status(v_receivable.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receipt.company_id, public.current_app_user_id(), 'system', 'receipts', v_receipt.id, 'REVERSE',
    jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'REVERSED', 'reason', p_reason));

  return v_receipt;
end;
$$;

revoke all on function public.fn_pay_installment(uuid, uuid, numeric, text, date, text, text, text) from public;
revoke all on function public.fn_receive_installment(uuid, uuid, numeric, text, date, text, text, text) from public;
revoke all on function public.fn_reverse_payment(uuid, text, text) from public;
revoke all on function public.fn_reverse_receipt(uuid, text, text) from public;
grant execute on function public.fn_pay_installment(uuid, uuid, numeric, text, date, text, text, text) to authenticated;
grant execute on function public.fn_receive_installment(uuid, uuid, numeric, text, date, text, text, text) to authenticated;
grant execute on function public.fn_reverse_payment(uuid, text, text) to authenticated;
grant execute on function public.fn_reverse_receipt(uuid, text, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('payments.view', 'payments', 'view', 'Consultar pagamentos'),
    ('payments.create', 'payments', 'create', 'Registrar pagamentos contra parcelas a pagar'),
    -- payments.cancel é seedada (pedido explícito desta etapa) mas
    -- nenhuma função a usa nesta fase: todo pagamento registrado aqui
    -- já nasce CONFIRMED (não há estado pendente a "cancelar" antes de
    -- efetivar) — a única mutação pós-registro é o estorno
    -- (payments.reverse), que é quem de fato reverte um pagamento já
    -- histórico (seção 25). Mesmo precedente de deliveries.update
    -- (Logística, 0025) — permissão seedada, sem função associada
    -- ainda, documentado explicitamente em vez de inventar um workflow
    -- só para preenchê-la.
    ('payments.cancel', 'payments', 'cancel', 'Reservado — nenhum pagamento nasce pendente nesta etapa; ver payments.reverse'),
    ('payments.reverse', 'payments', 'reverse', 'Estornar um pagamento confirmado'),
    ('receipts.view', 'receipts', 'view', 'Consultar recebimentos'),
    ('receipts.create', 'receipts', 'create', 'Registrar recebimentos contra parcelas a receber'),
    ('receipts.cancel', 'receipts', 'cancel', 'Reservado — nenhum recebimento nasce pendente nesta etapa; ver receipts.reverse'),
    ('receipts.reverse', 'receipts', 'reverse', 'Estornar um recebimento confirmado'),
    ('financial_transactions.view', 'financial_transactions', 'view', 'Consultar movimentações financeiras'),
    ('financial_transactions.create', 'financial_transactions', 'create', 'Registrar movimentação financeira manual (não ligada a título)')
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
-- RLS — select-only em todas; toda escrita via função.
-- ==================================================================
alter table public.financial_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;

drop policy if exists financial_transactions_select on public.financial_transactions;
create policy financial_transactions_select on public.financial_transactions
  for select to authenticated using (public.has_permission(company_id, 'financial_transactions.view'));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (public.has_permission(company_id, 'payments.view'));

drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts
  for select to authenticated using (public.has_permission(company_id, 'receipts.view'));
