-- Fase 3 — Compras/Suprimentos: Solicitação de Compra.
--
-- Início do ciclo: NECESSIDADE -> SOLICITAÇÃO DE COMPRA -> COTAÇÃO ->
-- PEDIDO DE COMPRA -> RECEBIMENTO -> CONFERÊNCIA -> ESTOQUE/ALMOXARIFADO
-- (ver docs/PURCHASING.md). Compras não tem estoque próprio — nenhuma
-- linha deste arquivo toca em stock_balances/stock_movements; isso só
-- acontece no recebimento (migration 0017), sempre via
-- fn_post_stock_movement.
--
-- Workflow: draft -> requested -> approved -> rejected | cancelled
--   approved -> partially_ordered -> ordered -> completed (avançado
--   pelas migrations 0016/0017 quando pedidos são criados/recebidos
--   referenciando esta solicitação — fn_sync_purchase_request_status).

create sequence if not exists public.purchase_requests_code_seq;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  requested_by uuid references public.users(id) on delete set null,
  department text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'draft' check (status in (
    'draft', 'requested', 'approved', 'rejected', 'cancelled',
    'partially_ordered', 'ordered', 'completed'
  )),
  justification text,
  requested_at date not null default current_date,
  needed_by date,
  notes text,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_code before insert on public.purchase_requests
  for each row execute procedure public.fn_generate_code('SC', 'public.purchase_requests_code_seq');
create trigger set_updated_at before update on public.purchase_requests
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists purchase_requests_company_status_idx on public.purchase_requests (company_id, status);

comment on table public.purchase_requests is
  'Solicitação de Compra — necessidade interna de aquisição (matéria-prima, componente, insumo, produto para revenda, material operacional, reposição de estoque). Escrita exclusiva via fn_create/submit/approve/reject/cancel_purchase_request.';

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  product_id uuid,
  description text not null,
  unit text,
  quantity_requested numeric(16, 4) not null check (quantity_requested > 0),
  quantity_approved numeric(16, 4) check (quantity_approved is null or quantity_approved >= 0),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (request_id, company_id) references public.purchase_requests (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict
);

create index if not exists purchase_request_items_request_idx on public.purchase_request_items (request_id);
create index if not exists purchase_request_items_product_idx on public.purchase_request_items (product_id);

comment on column public.purchase_request_items.product_id is
  'Opcional — um item pode representar algo ainda fora do catálogo (description cobre esse caso). Quando presente, referencia o catálogo real de products.';

-- ==================================================================
-- fn_create_purchase_request — cria em draft (editável) com itens.
-- ==================================================================
create or replace function public.fn_create_purchase_request(
  p_company_id uuid,
  p_department text,
  p_priority text,
  p_justification text,
  p_needed_by date,
  p_items jsonb,
  p_notes text default null
)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.purchase_requests;
  v_item jsonb;
begin
  if not public.has_permission(p_company_id, 'purchase_requests.create') then
    raise exception 'Permissão negada (purchase_requests.create).' using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A solicitação precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.purchase_requests (company_id, requested_by, department, priority, justification, needed_by, notes)
  values (p_company_id, public.current_app_user_id(), p_department, coalesce(p_priority, 'medium'), p_justification, p_needed_by, p_notes)
  returning * into v_request;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.purchase_request_items (company_id, request_id, product_id, description, unit, quantity_requested, notes)
    values (
      p_company_id,
      v_request.id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'description',
      nullif(v_item->>'unit', ''),
      (v_item->>'quantity')::numeric,
      nullif(v_item->>'notes', '')
    );
  end loop;

  return v_request;
end;
$$;

create or replace function public.fn_submit_purchase_request(p_request_id uuid)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.purchase_requests;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_request.company_id, 'purchase_requests.update') then
    raise exception 'Permissão negada (purchase_requests.update).' using errcode = '42501';
  end if;

  if v_request.status <> 'draft' then
    raise exception 'Só é possível enviar uma solicitação em rascunho (status atual: %).', v_request.status using errcode = 'P0001';
  end if;

  update public.purchase_requests set status = 'requested' where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_request.company_id, public.current_app_user_id(), 'system', 'purchase_requests', v_request.id, 'UPDATE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'requested'));

  return v_request;
end;
$$;

-- ==================================================================
-- fn_approve_purchase_request — aprova (opcionalmente com quantidades
-- diferentes das solicitadas por item — aprovação parcial).
-- p_approved_items: jsonb array [{"item_id": uuid, "quantity_approved": number}]
-- opcional; itens não listados são aprovados na quantidade solicitada.
-- ==================================================================
create or replace function public.fn_approve_purchase_request(
  p_request_id uuid,
  p_approved_items jsonb default null
)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.purchase_requests;
  v_override jsonb;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_request.company_id, 'purchase_requests.approve') then
    raise exception 'Permissão negada (purchase_requests.approve).' using errcode = '42501';
  end if;

  if v_request.status <> 'requested' then
    raise exception 'Só é possível aprovar uma solicitação enviada (status atual: %).', v_request.status using errcode = 'P0001';
  end if;

  update public.purchase_request_items
  set quantity_approved = quantity_requested
  where request_id = p_request_id;

  if p_approved_items is not null then
    for v_override in select * from jsonb_array_elements(p_approved_items)
    loop
      update public.purchase_request_items
      set quantity_approved = (v_override->>'quantity_approved')::numeric
      where id = (v_override->>'item_id')::uuid and request_id = p_request_id;
    end loop;
  end if;

  update public.purchase_requests
  set status = 'approved', approved_by = public.current_app_user_id(), approved_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_request.company_id, public.current_app_user_id(), 'system', 'purchase_requests', v_request.id, 'APPROVE',
    jsonb_build_object('status', 'requested'), jsonb_build_object('status', 'approved'));

  return v_request;
end;
$$;

create or replace function public.fn_reject_purchase_request(p_request_id uuid, p_reason text default null)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.purchase_requests;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_request.company_id, 'purchase_requests.approve') then
    raise exception 'Permissão negada (purchase_requests.approve).' using errcode = '42501';
  end if;

  if v_request.status <> 'requested' then
    raise exception 'Só é possível rejeitar uma solicitação enviada (status atual: %).', v_request.status using errcode = 'P0001';
  end if;

  update public.purchase_requests
  set status = 'rejected', notes = coalesce(notes || E'\n', '') || coalesce('Rejeitada: ' || p_reason, 'Rejeitada.')
  where id = p_request_id
  returning * into v_request;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_request.company_id, public.current_app_user_id(), 'system', 'purchase_requests', v_request.id, 'UPDATE',
    jsonb_build_object('status', 'requested'), jsonb_build_object('status', 'rejected', 'reason', p_reason));

  return v_request;
end;
$$;

create or replace function public.fn_cancel_purchase_request(p_request_id uuid)
returns public.purchase_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.purchase_requests;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if not found then
    raise exception 'Solicitação de compra não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_request.company_id, 'purchase_requests.update') then
    raise exception 'Permissão negada (purchase_requests.update).' using errcode = '42501';
  end if;

  if v_request.status not in ('draft', 'requested', 'approved') then
    raise exception 'Só é possível cancelar uma solicitação em rascunho, enviada ou aprovada (status atual: %).', v_request.status using errcode = 'P0001';
  end if;

  update public.purchase_requests set status = 'cancelled' where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

-- ==================================================================
-- fn_sync_purchase_request_status — chamada pelas migrations 0016/0017
-- (criação de pedido / recebimento) para avançar approved ->
-- partially_ordered -> ordered -> completed conforme o quanto do
-- aprovado já foi pedido/recebido. Compara quantity_approved (por
-- item) contra o agregado de purchase_order_items.ordered_quantity/
-- received_quantity dos pedidos que referenciam esta solicitação.
-- Definida aqui (sem referenciar purchase_orders ainda) e só populada
-- de fato a partir de 0016 — no-op enquanto não há pedidos.
-- ==================================================================
create or replace function public.fn_sync_purchase_request_status(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_total_approved numeric;
  v_total_ordered numeric;
  v_total_received numeric;
begin
  select status into v_status from public.purchase_requests where id = p_request_id;
  if v_status not in ('approved', 'partially_ordered', 'ordered') then
    return;
  end if;

  select coalesce(sum(quantity_approved), 0) into v_total_approved
  from public.purchase_request_items where request_id = p_request_id;

  if v_total_approved = 0 then
    return;
  end if;

  if to_regclass('public.purchase_order_items') is null then
    return;
  end if;

  execute
    'select coalesce(sum(oi.ordered_quantity), 0), coalesce(sum(oi.received_quantity), 0)
     from public.purchase_order_items oi
     join public.purchase_orders o on o.id = oi.order_id
     where o.purchase_request_id = $1 and o.status <> ''cancelled'''
    into v_total_ordered, v_total_received
    using p_request_id;

  if v_total_received >= v_total_approved then
    update public.purchase_requests set status = 'completed' where id = p_request_id;
  elsif v_total_ordered >= v_total_approved then
    update public.purchase_requests set status = 'ordered' where id = p_request_id;
  elsif v_total_ordered > 0 then
    update public.purchase_requests set status = 'partially_ordered' where id = p_request_id;
  end if;
end;
$$;

revoke all on function public.fn_create_purchase_request(uuid, text, text, text, date, jsonb, text) from public;
revoke all on function public.fn_submit_purchase_request(uuid) from public;
revoke all on function public.fn_approve_purchase_request(uuid, jsonb) from public;
revoke all on function public.fn_reject_purchase_request(uuid, text) from public;
revoke all on function public.fn_cancel_purchase_request(uuid) from public;
revoke all on function public.fn_sync_purchase_request_status(uuid) from public;
grant execute on function public.fn_create_purchase_request(uuid, text, text, text, date, jsonb, text) to authenticated;
grant execute on function public.fn_submit_purchase_request(uuid) to authenticated;
grant execute on function public.fn_approve_purchase_request(uuid, jsonb) to authenticated;
grant execute on function public.fn_reject_purchase_request(uuid, text) to authenticated;
grant execute on function public.fn_cancel_purchase_request(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('purchase_requests.view', 'purchase_requests', 'view', 'Consultar solicitações de compra'),
    ('purchase_requests.create', 'purchase_requests', 'create', 'Criar e enviar solicitações de compra'),
    ('purchase_requests.update', 'purchase_requests', 'update', 'Editar/cancelar solicitações de compra'),
    ('purchase_requests.approve', 'purchase_requests', 'approve', 'Aprovar ou rejeitar solicitações de compra')
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
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;

drop policy if exists purchase_requests_select on public.purchase_requests;
create policy purchase_requests_select on public.purchase_requests
  for select to authenticated
  using (public.has_permission(company_id, 'purchase_requests.view'));

drop policy if exists purchase_request_items_select on public.purchase_request_items;
create policy purchase_request_items_select on public.purchase_request_items
  for select to authenticated
  using (public.has_permission(company_id, 'purchase_requests.view'));
