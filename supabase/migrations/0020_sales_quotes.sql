-- Fase 4 — Comercial: Orçamento/Cotação de venda.
--
-- Workflow: draft -> sent -> approved | rejected | expired, e
-- cancelled a partir de qualquer estado anterior a approved. Não gera
-- nenhum efeito de estoque (isso só acontece no Pedido de Venda,
-- migration 0021) — orçamento é só compromisso comercial preliminar.

create sequence if not exists public.sales_quotes_code_seq;

create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  customer_id uuid not null,
  sales_representative_id uuid,
  price_list_id uuid,
  payment_terms_id uuid,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected', 'expired', 'cancelled')),
  issued_at date not null default current_date,
  valid_until date,
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  freight_cost numeric(14, 4) not null default 0 check (freight_cost >= 0),
  total_amount numeric(16, 4) not null default 0,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers (id, company_id) on delete restrict,
  foreign key (sales_representative_id, company_id) references public.sales_representatives (id, company_id) on delete set null,
  foreign key (price_list_id, company_id) references public.price_lists (id, company_id) on delete set null,
  foreign key (payment_terms_id, company_id) references public.payment_terms (id, company_id) on delete set null
);

create trigger set_code before insert on public.sales_quotes
  for each row execute procedure public.fn_generate_code('ORC', 'public.sales_quotes_code_seq');
create trigger set_updated_at before update on public.sales_quotes
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists sales_quotes_company_status_idx on public.sales_quotes (company_id, status);
create index if not exists sales_quotes_customer_idx on public.sales_quotes (customer_id);

comment on table public.sales_quotes is
  'Orçamento/cotação de venda. Escrita exclusiva via fn_create_sales_quote/fn_send_sales_quote/fn_approve_sales_quote/fn_reject_sales_quote/fn_expire_sales_quote/fn_cancel_sales_quote.';

create table if not exists public.sales_quote_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null,
  product_id uuid,
  description text not null,
  unit text,
  quantity numeric(16, 4) not null check (quantity > 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  line_total numeric(16, 4) generated always as (quantity * unit_price - discount) stored,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (quote_id, company_id) references public.sales_quotes (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict
);

create index if not exists sales_quote_items_quote_idx on public.sales_quote_items (quote_id);
create index if not exists sales_quote_items_product_idx on public.sales_quote_items (product_id);

-- ==================================================================
-- total_amount sempre derivado — mesmo padrão de purchase_orders (0016).
-- ==================================================================
create or replace function public.fn_recalculate_sales_quote_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id uuid := coalesce(NEW.quote_id, OLD.quote_id);
  v_items_total numeric;
begin
  select coalesce(sum(line_total), 0) into v_items_total from public.sales_quote_items where quote_id = v_quote_id;
  update public.sales_quotes set total_amount = v_items_total + freight_cost - discount where id = v_quote_id;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists recalculate_total on public.sales_quote_items;
create trigger recalculate_total
  after insert or update or delete on public.sales_quote_items
  for each row execute procedure public.fn_recalculate_sales_quote_total();

create or replace function public.fn_recalculate_sales_quote_total_on_header()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items_total numeric;
begin
  if NEW.freight_cost is distinct from OLD.freight_cost or NEW.discount is distinct from OLD.discount then
    select coalesce(sum(line_total), 0) into v_items_total from public.sales_quote_items where quote_id = NEW.id;
    NEW.total_amount := v_items_total + NEW.freight_cost - NEW.discount;
  end if;
  return NEW;
end;
$$;

drop trigger if exists recalculate_total_on_header on public.sales_quotes;
create trigger recalculate_total_on_header
  before update on public.sales_quotes
  for each row execute procedure public.fn_recalculate_sales_quote_total_on_header();

-- ==================================================================
-- fn_create_sales_quote
-- ==================================================================
create or replace function public.fn_create_sales_quote(
  p_company_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_sales_representative_id uuid default null,
  p_price_list_id uuid default null,
  p_payment_terms_id uuid default null,
  p_valid_until date default null,
  p_discount numeric default 0,
  p_freight_cost numeric default 0,
  p_notes text default null
)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'sales_quotes.create') then
    raise exception 'Permissão negada (sales_quotes.create).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O orçamento precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.sales_quotes (
    company_id, customer_id, sales_representative_id, price_list_id, payment_terms_id,
    valid_until, discount, freight_cost, notes, created_by
  ) values (
    p_company_id, p_customer_id, p_sales_representative_id, p_price_list_id, p_payment_terms_id,
    p_valid_until, coalesce(p_discount, 0), coalesce(p_freight_cost, 0), p_notes, public.current_app_user_id()
  )
  returning * into v_quote;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.sales_quote_items (company_id, quote_id, product_id, description, unit, quantity, unit_price, discount, notes)
    values (
      p_company_id, v_quote.id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'description',
      nullif(v_item->>'unit', ''),
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'discount')::numeric, 0),
      nullif(v_item->>'notes', '')
    );
  end loop;

  select * into v_quote from public.sales_quotes where id = v_quote.id;
  return v_quote;
end;
$$;

create or replace function public.fn_send_sales_quote(p_quote_id uuid)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes;
begin
  select * into v_quote from public.sales_quotes where id = p_quote_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'sales_quotes.update') then
    raise exception 'Permissão negada (sales_quotes.update).' using errcode = '42501';
  end if;

  if v_quote.status <> 'draft' then
    raise exception 'Só é possível enviar um orçamento em rascunho (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  update public.sales_quotes set status = 'sent' where id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

create or replace function public.fn_approve_sales_quote(p_quote_id uuid)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes;
begin
  select * into v_quote from public.sales_quotes where id = p_quote_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'sales_quotes.approve') then
    raise exception 'Permissão negada (sales_quotes.approve).' using errcode = '42501';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'Só é possível aprovar um orçamento enviado (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  update public.sales_quotes
  set status = 'approved', approved_by = public.current_app_user_id(), approved_at = now()
  where id = p_quote_id
  returning * into v_quote;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_quote.company_id, public.current_app_user_id(), 'system', 'sales_quotes', v_quote.id, 'APPROVE',
    jsonb_build_object('status', 'sent'), jsonb_build_object('status', 'approved'));

  return v_quote;
end;
$$;

create or replace function public.fn_reject_sales_quote(p_quote_id uuid, p_reason text default null)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes;
begin
  select * into v_quote from public.sales_quotes where id = p_quote_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'sales_quotes.approve') then
    raise exception 'Permissão negada (sales_quotes.approve).' using errcode = '42501';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'Só é possível rejeitar um orçamento enviado (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  update public.sales_quotes
  set status = 'rejected', notes = coalesce(notes || E'\n', '') || coalesce('Rejeitado: ' || p_reason, 'Rejeitado.')
  where id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

-- fn_expire_sales_quote — manual nesta etapa (sem scheduler/cron
-- configurado). Uma futura rotina periódica poderia chamar isto
-- automaticamente para orçamentos 'sent' com valid_until no passado —
-- não implementada aqui, ver docs/COMMERCIAL.md.
create or replace function public.fn_expire_sales_quote(p_quote_id uuid)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes;
begin
  select * into v_quote from public.sales_quotes where id = p_quote_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'sales_quotes.update') then
    raise exception 'Permissão negada (sales_quotes.update).' using errcode = '42501';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'Só é possível expirar um orçamento enviado (status atual: %).', v_quote.status using errcode = 'P0001';
  end if;

  update public.sales_quotes set status = 'expired' where id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

create or replace function public.fn_cancel_sales_quote(p_quote_id uuid)
returns public.sales_quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes;
begin
  select * into v_quote from public.sales_quotes where id = p_quote_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_quote.company_id, 'sales_quotes.cancel') then
    raise exception 'Permissão negada (sales_quotes.cancel).' using errcode = '42501';
  end if;

  if v_quote.status = 'approved' then
    raise exception 'Orçamento já aprovado não pode ser cancelado — cancele o pedido de venda gerado a partir dele, se aplicável.' using errcode = 'P0001';
  end if;

  update public.sales_quotes set status = 'cancelled' where id = p_quote_id
  returning * into v_quote;

  return v_quote;
end;
$$;

revoke all on function public.fn_create_sales_quote(uuid, uuid, jsonb, uuid, uuid, uuid, date, numeric, numeric, text) from public;
revoke all on function public.fn_send_sales_quote(uuid) from public;
revoke all on function public.fn_approve_sales_quote(uuid) from public;
revoke all on function public.fn_reject_sales_quote(uuid, text) from public;
revoke all on function public.fn_expire_sales_quote(uuid) from public;
revoke all on function public.fn_cancel_sales_quote(uuid) from public;
grant execute on function public.fn_create_sales_quote(uuid, uuid, jsonb, uuid, uuid, uuid, date, numeric, numeric, text) to authenticated;
grant execute on function public.fn_send_sales_quote(uuid) to authenticated;
grant execute on function public.fn_approve_sales_quote(uuid) to authenticated;
grant execute on function public.fn_reject_sales_quote(uuid, text) to authenticated;
grant execute on function public.fn_expire_sales_quote(uuid) to authenticated;
grant execute on function public.fn_cancel_sales_quote(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('sales_quotes.view', 'sales_quotes', 'view', 'Consultar orçamentos de venda'),
    ('sales_quotes.create', 'sales_quotes', 'create', 'Criar orçamentos de venda'),
    ('sales_quotes.update', 'sales_quotes', 'update', 'Editar, enviar e expirar orçamentos de venda'),
    ('sales_quotes.approve', 'sales_quotes', 'approve', 'Aprovar ou rejeitar orçamentos de venda'),
    ('sales_quotes.cancel', 'sales_quotes', 'cancel', 'Cancelar orçamentos de venda')
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
alter table public.sales_quotes enable row level security;
alter table public.sales_quote_items enable row level security;

drop policy if exists sales_quotes_select on public.sales_quotes;
create policy sales_quotes_select on public.sales_quotes
  for select to authenticated using (public.has_permission(company_id, 'sales_quotes.view'));

drop policy if exists sales_quote_items_select on public.sales_quote_items;
create policy sales_quote_items_select on public.sales_quote_items
  for select to authenticated using (public.has_permission(company_id, 'sales_quotes.view'));
