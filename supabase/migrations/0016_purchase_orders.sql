-- Fase 3 — Compras/Suprimentos: Pedido de Compra.
--
-- Workflow: draft -> pending_approval -> approved -> sent ->
--   partially_received -> received -> closed
-- Também: cancelled (de qualquer estado antes de totalmente recebido).
--
-- ordered_quantity/received_quantity/cancelled_quantity ficam
-- separados por item (nunca só "quantidade restante" — calculada como
-- ordered - received - cancelled). received_quantity só é incrementado
-- pelo recebimento (migration 0017, via fn_confirm_purchase_receipt) —
-- nenhum código aqui grava nela diretamente fora dessa função.

create sequence if not exists public.purchase_orders_code_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  supplier_id uuid not null,
  purchase_request_id uuid,
  purchase_quote_id uuid,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'sent',
    'partially_received', 'received', 'closed', 'cancelled'
  )),
  issued_at date not null default current_date,
  expected_delivery_at date,
  payment_terms text,
  freight_cost numeric(14, 4) not null default 0 check (freight_cost >= 0),
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  total_amount numeric(16, 4) not null default 0,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id) on delete restrict,
  foreign key (purchase_request_id, company_id) references public.purchase_requests (id, company_id) on delete set null,
  foreign key (purchase_quote_id, company_id) references public.purchase_quotes (id, company_id) on delete set null
);

create trigger set_code before insert on public.purchase_orders
  for each row execute procedure public.fn_generate_code('PC', 'public.purchase_orders_code_seq');
create trigger set_updated_at before update on public.purchase_orders
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists purchase_orders_company_status_idx on public.purchase_orders (company_id, status);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_request_idx on public.purchase_orders (purchase_request_id);

comment on column public.purchase_orders.total_amount is
  'Mantido por trigger (fn_recalculate_purchase_order_total) a partir de sum(purchase_order_items.line_total) + freight_cost - discount. Nunca gravado diretamente pela API.';

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  description text not null,
  unit text,
  ordered_quantity numeric(16, 4) not null check (ordered_quantity > 0),
  received_quantity numeric(16, 4) not null default 0 check (received_quantity >= 0),
  cancelled_quantity numeric(16, 4) not null default 0 check (cancelled_quantity >= 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  discount numeric(14, 4) not null default 0 check (discount >= 0),
  line_total numeric(16, 4) generated always as (ordered_quantity * unit_price - discount) stored,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (order_id, company_id) references public.purchase_orders (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  constraint purchase_order_items_received_within_ordered check (received_quantity + cancelled_quantity <= ordered_quantity)
);

create index if not exists purchase_order_items_order_idx on public.purchase_order_items (order_id);
create index if not exists purchase_order_items_product_idx on public.purchase_order_items (product_id);

comment on constraint purchase_order_items_received_within_ordered on public.purchase_order_items is
  'received_quantity + cancelled_quantity nunca pode exceder ordered_quantity — impede "recebido > pedido" no nível de banco, não só na função.';

-- ==================================================================
-- Trigger: total_amount sempre derivado dos itens (nunca escrito à
-- mão). Recomputa o pedido inteiro a cada mudança de item — simples e
-- correto para o volume esperado (poucos itens por pedido).
-- ==================================================================
create or replace function public.fn_recalculate_purchase_order_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := coalesce(NEW.order_id, OLD.order_id);
  v_items_total numeric;
begin
  select coalesce(sum(line_total), 0) into v_items_total
  from public.purchase_order_items where order_id = v_order_id;

  update public.purchase_orders
  set total_amount = v_items_total + freight_cost - discount
  where id = v_order_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists recalculate_total on public.purchase_order_items;
create trigger recalculate_total
  after insert or update or delete on public.purchase_order_items
  for each row execute procedure public.fn_recalculate_purchase_order_total();

-- Também recalcula quando freight_cost/discount do cabeçalho mudam.
create or replace function public.fn_recalculate_purchase_order_total_on_header()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items_total numeric;
begin
  if NEW.freight_cost is distinct from OLD.freight_cost or NEW.discount is distinct from OLD.discount then
    select coalesce(sum(line_total), 0) into v_items_total
    from public.purchase_order_items where order_id = NEW.id;
    NEW.total_amount := v_items_total + NEW.freight_cost - NEW.discount;
  end if;
  return NEW;
end;
$$;

drop trigger if exists recalculate_total_on_header on public.purchase_orders;
create trigger recalculate_total_on_header
  before update on public.purchase_orders
  for each row execute procedure public.fn_recalculate_purchase_order_total_on_header();

-- ==================================================================
-- fn_create_purchase_order
-- ==================================================================
create or replace function public.fn_create_purchase_order(
  p_company_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_purchase_request_id uuid default null,
  p_purchase_quote_id uuid default null,
  p_payment_terms text default null,
  p_freight_cost numeric default 0,
  p_discount numeric default 0,
  p_expected_delivery_at date default null,
  p_notes text default null
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'purchase_orders.create') then
    raise exception 'Permissão negada (purchase_orders.create).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.purchase_orders (
    company_id, supplier_id, purchase_request_id, purchase_quote_id,
    payment_terms, freight_cost, discount, expected_delivery_at, notes, created_by
  ) values (
    p_company_id, p_supplier_id, p_purchase_request_id, p_purchase_quote_id,
    p_payment_terms, coalesce(p_freight_cost, 0), coalesce(p_discount, 0), p_expected_delivery_at, p_notes,
    public.current_app_user_id()
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.purchase_order_items (company_id, order_id, product_id, description, unit, ordered_quantity, unit_price, discount, notes)
    values (
      p_company_id,
      v_order.id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'description',
      nullif(v_item->>'unit', ''),
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'discount')::numeric, 0),
      nullif(v_item->>'notes', '')
    );
  end loop;

  if p_purchase_request_id is not null then
    perform public.fn_sync_purchase_request_status(p_purchase_request_id);
  end if;

  select * into v_order from public.purchase_orders where id = v_order.id;
  return v_order;
end;
$$;

create or replace function public.fn_submit_purchase_order_for_approval(p_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
begin
  select * into v_order from public.purchase_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'purchase_orders.update') then
    raise exception 'Permissão negada (purchase_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'Só é possível enviar para aprovação um pedido em rascunho (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.purchase_orders set status = 'pending_approval' where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.fn_approve_purchase_order(p_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
begin
  select * into v_order from public.purchase_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'purchase_orders.approve') then
    raise exception 'Permissão negada (purchase_orders.approve).' using errcode = '42501';
  end if;

  if v_order.status <> 'pending_approval' then
    raise exception 'Só é possível aprovar um pedido pendente de aprovação (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.purchase_orders
  set status = 'approved', approved_by = public.current_app_user_id(), approved_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'purchase_orders', v_order.id, 'APPROVE',
    jsonb_build_object('status', 'pending_approval'), jsonb_build_object('status', 'approved'));

  return v_order;
end;
$$;

create or replace function public.fn_send_purchase_order(p_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
begin
  select * into v_order from public.purchase_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'purchase_orders.update') then
    raise exception 'Permissão negada (purchase_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'approved' then
    raise exception 'Só é possível enviar ao fornecedor um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.purchase_orders set status = 'sent', sent_at = now() where id = p_order_id
  returning * into v_order;

  if v_order.purchase_request_id is not null then
    perform public.fn_sync_purchase_request_status(v_order.purchase_request_id);
  end if;

  return v_order;
end;
$$;

-- ==================================================================
-- fn_cancel_purchase_order — cancela o que ainda está pendente
-- (ordered - received - cancelled) em cada item. Se nada foi recebido
-- em nenhum item, o pedido inteiro vira 'cancelled'. Se algo já foi
-- recebido, o restante pendente é cancelado e o pedido vira 'closed'
-- (está tudo contabilizado: recebido + cancelado = pedido) — não
-- 'cancelled', que implicaria que nada chegou a ser recebido.
-- ==================================================================
create or replace function public.fn_cancel_purchase_order(p_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
  v_any_received boolean;
begin
  select * into v_order from public.purchase_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'purchase_orders.cancel') then
    raise exception 'Permissão negada (purchase_orders.cancel).' using errcode = '42501';
  end if;

  if v_order.status in ('received', 'closed', 'cancelled') then
    raise exception 'Pedido no status % não pode ser cancelado.', v_order.status using errcode = 'P0001';
  end if;

  select exists (select 1 from public.purchase_order_items where order_id = p_order_id and received_quantity > 0)
  into v_any_received;

  update public.purchase_order_items
  set cancelled_quantity = ordered_quantity - received_quantity
  where order_id = p_order_id and (ordered_quantity - received_quantity - cancelled_quantity) > 0;

  update public.purchase_orders
  set status = case when v_any_received then 'closed' else 'cancelled' end,
      closed_at = case when v_any_received then now() else closed_at end
  where id = p_order_id
  returning * into v_order;

  if v_order.purchase_request_id is not null then
    perform public.fn_sync_purchase_request_status(v_order.purchase_request_id);
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'purchase_orders', v_order.id, 'CANCEL',
    null, jsonb_build_object('status', v_order.status));

  return v_order;
end;
$$;

create or replace function public.fn_close_purchase_order(p_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
begin
  select * into v_order from public.purchase_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'purchase_orders.update') then
    raise exception 'Permissão negada (purchase_orders.update).' using errcode = '42501';
  end if;

  if v_order.status <> 'received' then
    raise exception 'Só é possível encerrar um pedido totalmente recebido (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  update public.purchase_orders set status = 'closed', closed_at = now() where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.fn_create_purchase_order(uuid, uuid, jsonb, uuid, uuid, text, numeric, numeric, date, text) from public;
revoke all on function public.fn_submit_purchase_order_for_approval(uuid) from public;
revoke all on function public.fn_approve_purchase_order(uuid) from public;
revoke all on function public.fn_send_purchase_order(uuid) from public;
revoke all on function public.fn_cancel_purchase_order(uuid) from public;
revoke all on function public.fn_close_purchase_order(uuid) from public;
grant execute on function public.fn_create_purchase_order(uuid, uuid, jsonb, uuid, uuid, text, numeric, numeric, date, text) to authenticated;
grant execute on function public.fn_submit_purchase_order_for_approval(uuid) to authenticated;
grant execute on function public.fn_approve_purchase_order(uuid) to authenticated;
grant execute on function public.fn_send_purchase_order(uuid) to authenticated;
grant execute on function public.fn_cancel_purchase_order(uuid) to authenticated;
grant execute on function public.fn_close_purchase_order(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('purchase_orders.view', 'purchase_orders', 'view', 'Consultar pedidos de compra'),
    ('purchase_orders.create', 'purchase_orders', 'create', 'Criar pedidos de compra'),
    ('purchase_orders.update', 'purchase_orders', 'update', 'Editar, enviar ao fornecedor e encerrar pedidos de compra'),
    ('purchase_orders.approve', 'purchase_orders', 'approve', 'Aprovar pedidos de compra'),
    ('purchase_orders.cancel', 'purchase_orders', 'cancel', 'Cancelar pedidos de compra')
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
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders
  for select to authenticated
  using (public.has_permission(company_id, 'purchase_orders.view'));

drop policy if exists purchase_order_items_select on public.purchase_order_items;
create policy purchase_order_items_select on public.purchase_order_items
  for select to authenticated
  using (public.has_permission(company_id, 'purchase_orders.view'));
