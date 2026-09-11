-- Fase 3 — Compras/Suprimentos: Cotação (RFQ).
--
-- Permite solicitar propostas de vários fornecedores para a mesma
-- necessidade e compará-las. Modelo em 3 níveis:
--   purchase_quotes            a cotação em si (pode originar de uma
--                               purchase_request)
--   purchase_quote_suppliers   uma proposta por fornecedor participante
--                               (frete/prazo/condição de pagamento/
--                               validade são por proposta, não por item)
--   purchase_quote_items       preço por produto DENTRO de uma proposta
--                               de um fornecedor específico — é isso que
--                               permite comparar fornecedor A vs B para
--                               o mesmo produto.

create sequence if not exists public.purchase_quotes_code_seq;

create table if not exists public.purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  purchase_request_id uuid,
  status text not null default 'draft' check (status in ('draft', 'sent', 'closed', 'cancelled')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (purchase_request_id, company_id) references public.purchase_requests (id, company_id) on delete set null
);

create trigger set_code before insert on public.purchase_quotes
  for each row execute procedure public.fn_generate_code('CO', 'public.purchase_quotes_code_seq');
create trigger set_updated_at before update on public.purchase_quotes
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists purchase_quotes_company_status_idx on public.purchase_quotes (company_id, status);
create index if not exists purchase_quotes_request_idx on public.purchase_quotes (purchase_request_id);

comment on table public.purchase_quotes is
  'Cotação/RFQ — solicita e compara propostas de fornecedores para uma necessidade. Escrita exclusiva via fn_create_purchase_quote/fn_add_quote_supplier_response/fn_select_purchase_quote_supplier/fn_cancel_purchase_quote.';

create table if not exists public.purchase_quote_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null,
  supplier_id uuid not null,
  status text not null default 'invited' check (status in ('invited', 'responded', 'selected', 'rejected')),
  payment_terms text,
  freight_cost numeric(14, 4) check (freight_cost is null or freight_cost >= 0),
  delivery_days integer check (delivery_days is null or delivery_days >= 0),
  valid_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, supplier_id),
  unique (id, company_id),
  foreign key (quote_id, company_id) references public.purchase_quotes (id, company_id) on delete cascade,
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id) on delete restrict
);

create trigger set_updated_at before update on public.purchase_quote_suppliers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists purchase_quote_suppliers_quote_idx on public.purchase_quote_suppliers (quote_id);
create index if not exists purchase_quote_suppliers_supplier_idx on public.purchase_quote_suppliers (supplier_id);

comment on table public.purchase_quote_suppliers is
  'Uma proposta por fornecedor convidado a uma cotação. Campos de proposta (frete/prazo/condição de pagamento/validade) vivem aqui, não em purchase_quotes — cada fornecedor propõe os seus.';

create table if not exists public.purchase_quote_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_supplier_id uuid not null,
  product_id uuid,
  description text not null,
  quantity numeric(16, 4) not null check (quantity > 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  line_total numeric(16, 4) generated always as (quantity * unit_price - discount) stored,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (quote_supplier_id, company_id) references public.purchase_quote_suppliers (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict
);

create index if not exists purchase_quote_items_quote_supplier_idx on public.purchase_quote_items (quote_supplier_id);
create index if not exists purchase_quote_items_product_idx on public.purchase_quote_items (product_id);

-- ==================================================================
-- fn_create_purchase_quote — cria o RFQ e convida fornecedores (sem
-- itens/preços ainda — cada fornecedor responde depois via
-- fn_add_quote_supplier_response).
-- ==================================================================
create or replace function public.fn_create_purchase_quote(
  p_company_id uuid,
  p_supplier_ids uuid[],
  p_purchase_request_id uuid default null,
  p_notes text default null
)
returns public.purchase_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.purchase_quotes;
  v_supplier_id uuid;
begin
  if not public.has_permission(p_company_id, 'purchase_quotes.create') then
    raise exception 'Permissão negada (purchase_quotes.create).' using errcode = '42501';
  end if;

  if p_supplier_ids is null or array_length(p_supplier_ids, 1) is null then
    raise exception 'Convide ao menos um fornecedor para a cotação.' using errcode = '22023';
  end if;

  insert into public.purchase_quotes (company_id, purchase_request_id, notes, created_by)
  values (p_company_id, p_purchase_request_id, p_notes, public.current_app_user_id())
  returning * into v_quote;

  foreach v_supplier_id in array p_supplier_ids
  loop
    insert into public.purchase_quote_suppliers (company_id, quote_id, supplier_id)
    values (p_company_id, v_quote.id, v_supplier_id)
    on conflict (quote_id, supplier_id) do nothing;
  end loop;

  return v_quote;
end;
$$;

-- ==================================================================
-- fn_add_quote_supplier_response — registra a proposta de UM
-- fornecedor (substitui os itens anteriores dessa proposta, se houver
-- — permite reenviar uma proposta revisada).
-- ==================================================================
create or replace function public.fn_add_quote_supplier_response(
  p_quote_supplier_id uuid,
  p_payment_terms text,
  p_freight_cost numeric,
  p_delivery_days integer,
  p_valid_until date,
  p_items jsonb
)
returns public.purchase_quote_suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qs public.purchase_quote_suppliers;
  v_quote public.purchase_quotes;
  v_item jsonb;
begin
  select * into v_qs from public.purchase_quote_suppliers where id = p_quote_supplier_id;
  if not found then
    raise exception 'Proposta de fornecedor não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_qs.company_id, 'purchase_quotes.update') then
    raise exception 'Permissão negada (purchase_quotes.update).' using errcode = '42501';
  end if;

  select * into v_quote from public.purchase_quotes where id = v_qs.quote_id;
  if v_quote.status not in ('draft', 'sent') then
    raise exception 'Só é possível registrar proposta em uma cotação aberta (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  delete from public.purchase_quote_items where quote_supplier_id = p_quote_supplier_id;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.purchase_quote_items (company_id, quote_supplier_id, product_id, description, quantity, unit_price, discount, notes)
      values (
        v_qs.company_id,
        p_quote_supplier_id,
        nullif(v_item->>'product_id', '')::uuid,
        v_item->>'description',
        (v_item->>'quantity')::numeric,
        (v_item->>'unit_price')::numeric,
        coalesce((v_item->>'discount')::numeric, 0),
        nullif(v_item->>'notes', '')
      );
    end loop;
  end if;

  update public.purchase_quote_suppliers
  set status = 'responded', payment_terms = p_payment_terms, freight_cost = p_freight_cost,
      delivery_days = p_delivery_days, valid_until = p_valid_until
  where id = p_quote_supplier_id
  returning * into v_qs;

  update public.purchase_quotes set status = 'sent' where id = v_qs.quote_id and status = 'draft';

  return v_qs;
end;
$$;

-- ==================================================================
-- fn_select_purchase_quote_supplier — encerra a cotação escolhendo o
-- vencedor (demais propostas respondidas viram rejected).
-- ==================================================================
create or replace function public.fn_select_purchase_quote_supplier(p_quote_supplier_id uuid)
returns public.purchase_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qs public.purchase_quote_suppliers;
  v_quote public.purchase_quotes;
begin
  select * into v_qs from public.purchase_quote_suppliers where id = p_quote_supplier_id;
  if not found then
    raise exception 'Proposta de fornecedor não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_qs.company_id, 'purchase_quotes.approve') then
    raise exception 'Permissão negada (purchase_quotes.approve).' using errcode = '42501';
  end if;

  select * into v_quote from public.purchase_quotes where id = v_qs.quote_id;
  if v_quote.status <> 'sent' then
    raise exception 'Só é possível selecionar vencedor em uma cotação com propostas em aberto (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  update public.purchase_quote_suppliers set status = 'selected' where id = p_quote_supplier_id;
  update public.purchase_quote_suppliers
  set status = 'rejected'
  where quote_id = v_qs.quote_id and id <> p_quote_supplier_id and status = 'responded';

  update public.purchase_quotes set status = 'closed', closed_at = now() where id = v_qs.quote_id
  returning * into v_quote;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_quote.company_id, public.current_app_user_id(), 'system', 'purchase_quotes', v_quote.id, 'APPROVE',
    jsonb_build_object('status', 'sent'), jsonb_build_object('status', 'closed', 'selected_supplier_id', v_qs.supplier_id));

  return v_quote;
end;
$$;

create or replace function public.fn_cancel_purchase_quote(p_quote_id uuid)
returns public.purchase_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.purchase_quotes;
begin
  select * into v_quote from public.purchase_quotes where id = p_quote_id;
  if not found then
    raise exception 'Cotação não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'purchase_quotes.update') then
    raise exception 'Permissão negada (purchase_quotes.update).' using errcode = '42501';
  end if;

  if v_quote.status = 'closed' then
    raise exception 'Cotação já encerrada com fornecedor selecionado não pode ser cancelada.' using errcode = 'P0001';
  end if;

  update public.purchase_quotes set status = 'cancelled' where id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

revoke all on function public.fn_create_purchase_quote(uuid, uuid[], uuid, text) from public;
revoke all on function public.fn_add_quote_supplier_response(uuid, text, numeric, integer, date, jsonb) from public;
revoke all on function public.fn_select_purchase_quote_supplier(uuid) from public;
revoke all on function public.fn_cancel_purchase_quote(uuid) from public;
grant execute on function public.fn_create_purchase_quote(uuid, uuid[], uuid, text) to authenticated;
grant execute on function public.fn_add_quote_supplier_response(uuid, text, numeric, integer, date, jsonb) to authenticated;
grant execute on function public.fn_select_purchase_quote_supplier(uuid) to authenticated;
grant execute on function public.fn_cancel_purchase_quote(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('purchase_quotes.view', 'purchase_quotes', 'view', 'Consultar cotações'),
    ('purchase_quotes.create', 'purchase_quotes', 'create', 'Criar cotações e convidar fornecedores'),
    ('purchase_quotes.update', 'purchase_quotes', 'update', 'Registrar propostas de fornecedores e cancelar cotações'),
    ('purchase_quotes.approve', 'purchase_quotes', 'approve', 'Selecionar o fornecedor vencedor de uma cotação')
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
-- RLS
-- ==================================================================
alter table public.purchase_quotes enable row level security;
alter table public.purchase_quote_suppliers enable row level security;
alter table public.purchase_quote_items enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('purchase_quotes'), ('purchase_quote_suppliers'), ('purchase_quote_items')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'purchase_quotes.view'
    );
  end loop;
end;
$$;
