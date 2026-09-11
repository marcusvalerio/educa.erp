-- Fase 3 — Compras/Suprimentos: Recebimento.
--
-- Onde Compras finalmente encosta em Estoque/Almoxarifado — e SOMENTE
-- aqui. fn_confirm_purchase_receipt é a única função deste módulo que
-- chama fn_post_stock_movement; nenhuma outra parte de Compras toca em
-- stock_balances/stock_movements, direta ou indiretamente.
--
-- Fluxo: PEDIDO (sent/partially_received) -> RECEBIMENTO (draft,
-- registra o que fisicamente chegou + conferência) -> CONFIRMAÇÃO
-- (transacional: trava o item do pedido, valida recebido <= pendente,
-- gera RECEIPT via fn_post_stock_movement no destino — STOCK ou
-- OPERATIONAL_WAREHOUSE conforme o local escolhido, mesma tabela
-- warehouse_locations de sempre — alimenta product_lots/
-- product_serial_numbers quando aplicável, atualiza received_quantity
-- do item do pedido e o status do pedido).
--
-- Recebimento parcial é o caso normal, não uma exceção: um pedido pode
-- ter vários recebimentos; cada confirmação soma em
-- purchase_order_items.received_quantity (nunca substitui).

create sequence if not exists public.purchase_receipts_code_seq;

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  purchase_order_id uuid not null,
  supplier_id uuid not null,
  received_at timestamptz not null default now(),
  received_by uuid references public.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  notes text,
  -- Preparação fiscal (seção 22) — só referência, nenhum módulo fiscal
  -- acoplado. Todos os campos são opcionais.
  document_type text,
  document_number text,
  document_series text,
  access_key text,
  document_issued_at date,
  document_value numeric(14, 2) check (document_value is null or document_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (purchase_order_id, company_id) references public.purchase_orders (id, company_id) on delete restrict,
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id) on delete restrict
);

create trigger set_code before insert on public.purchase_receipts
  for each row execute procedure public.fn_generate_code('REC', 'public.purchase_receipts_code_seq');
create trigger set_updated_at before update on public.purchase_receipts
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists purchase_receipts_company_status_idx on public.purchase_receipts (company_id, status);
create index if not exists purchase_receipts_order_idx on public.purchase_receipts (purchase_order_id);

comment on table public.purchase_receipts is
  'Recebimento físico contra um Pedido de Compra. Um pedido pode ter vários recebimentos (recebimento parcial). Escrita exclusiva via fn_create_purchase_receipt/fn_confirm_purchase_receipt/fn_reject_purchase_receipt.';

create table if not exists public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_id uuid not null,
  purchase_order_item_id uuid not null,
  product_id uuid not null,
  quantity_received numeric(16, 4) not null check (quantity_received > 0),
  unit text,
  destination_location_id uuid not null,
  lot_id uuid,
  lot_number text,
  expires_at date,
  serial_numbers jsonb,
  accepted_quantity numeric(16, 4) not null default 0 check (accepted_quantity >= 0),
  rejected_quantity numeric(16, 4) not null default 0 check (rejected_quantity >= 0),
  conference_status text not null default 'pending' check (conference_status in ('pending', 'matched', 'divergent')),
  divergence_type text check (divergence_type is null or divergence_type in ('none', 'quantity', 'product', 'lot', 'expiration', 'quality', 'other')),
  divergence_notes text,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (receipt_id, company_id) references public.purchase_receipts (id, company_id) on delete cascade,
  foreign key (purchase_order_item_id, company_id) references public.purchase_order_items (id, company_id) on delete restrict,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (destination_location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict,
  constraint purchase_receipt_items_accepted_rejected_within_received check (accepted_quantity + rejected_quantity <= quantity_received)
);

create index if not exists purchase_receipt_items_receipt_idx on public.purchase_receipt_items (receipt_id);
create index if not exists purchase_receipt_items_order_item_idx on public.purchase_receipt_items (purchase_order_item_id);
create index if not exists purchase_receipt_items_destination_idx on public.purchase_receipt_items (destination_location_id);

comment on column public.purchase_receipt_items.destination_location_id is
  'Qualquer warehouse_locations — o destino ser Estoque ou Almoxarifado Operacional depende só do purpose desse local (0013), não de uma tabela separada.';
comment on column public.purchase_receipt_items.accepted_quantity is
  'Quanto efetivamente entra em stock_balances ao confirmar (via fn_post_stock_movement). Pode ser menor que quantity_received quando há divergência (ex.: parte rejeitada na conferência).';
comment on column public.purchase_receipt_items.serial_numbers is
  'Array JSON de strings — obrigatório e validado contra accepted_quantity na confirmação quando products.serial_controlled = true.';

-- ==================================================================
-- fn_create_purchase_receipt — registra o que fisicamente chegou +
-- conferência automática (compara contra o item do pedido: produto e
-- quantidade pendente). Nada é postado no ledger ainda — só ao
-- confirmar. Permissivo de propósito: registra a realidade (inclusive
-- divergente) para decisão humana antes da confirmação.
-- ==================================================================
create or replace function public.fn_create_purchase_receipt(
  p_company_id uuid,
  p_purchase_order_id uuid,
  p_items jsonb,
  p_received_at timestamptz default now(),
  p_notes text default null,
  p_document_type text default null,
  p_document_number text default null,
  p_document_series text default null,
  p_access_key text default null,
  p_document_issued_at date default null,
  p_document_value numeric default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.purchase_orders;
  v_receipt public.purchase_receipts;
  v_item jsonb;
  v_order_item public.purchase_order_items;
  v_remaining numeric;
  v_quantity_received numeric;
  v_product_id uuid;
  v_divergence_type text;
  v_conference_status text;
  v_accepted numeric;
  v_rejected numeric;
begin
  if not public.has_permission(p_company_id, 'purchase_receipts.create') then
    raise exception 'Permissão negada (purchase_receipts.create).' using errcode = '42501';
  end if;

  select * into v_order from public.purchase_orders where id = p_purchase_order_id and company_id = p_company_id;
  if not found then
    raise exception 'Pedido de compra não encontrado.' using errcode = 'P0002';
  end if;

  if v_order.status not in ('sent', 'partially_received') then
    raise exception 'Só é possível receber um pedido enviado ao fornecedor e ainda não totalmente recebido (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'O recebimento precisa de ao menos um item.' using errcode = '22023';
  end if;

  insert into public.purchase_receipts (
    company_id, purchase_order_id, supplier_id, received_at, received_by, notes,
    document_type, document_number, document_series, access_key, document_issued_at, document_value
  ) values (
    p_company_id, p_purchase_order_id, v_order.supplier_id, coalesce(p_received_at, now()), public.current_app_user_id(), p_notes,
    p_document_type, p_document_number, p_document_series, p_access_key, p_document_issued_at, p_document_value
  )
  returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from public.purchase_order_items
    where id = (v_item->>'purchase_order_item_id')::uuid and order_id = p_purchase_order_id;
    if not found then
      raise exception 'Item do pedido não encontrado (purchase_order_item_id inválido para este pedido).' using errcode = 'P0002';
    end if;

    v_remaining := v_order_item.ordered_quantity - v_order_item.received_quantity - v_order_item.cancelled_quantity;
    v_quantity_received := (v_item->>'quantity_received')::numeric;
    v_product_id := coalesce(nullif(v_item->>'product_id', '')::uuid, v_order_item.product_id);

    if v_product_id is distinct from v_order_item.product_id then
      v_divergence_type := 'product';
    elsif v_quantity_received > v_remaining then
      v_divergence_type := 'quantity';
    else
      v_divergence_type := coalesce(nullif(v_item->>'divergence_type', ''), 'none');
    end if;
    v_conference_status := case when v_divergence_type = 'none' then 'matched' else 'divergent' end;

    v_accepted := coalesce((v_item->>'accepted_quantity')::numeric, least(v_quantity_received, greatest(v_remaining, 0)));
    v_rejected := coalesce((v_item->>'rejected_quantity')::numeric, greatest(v_quantity_received - v_accepted, 0));

    insert into public.purchase_receipt_items (
      company_id, receipt_id, purchase_order_item_id, product_id, quantity_received, unit,
      destination_location_id, lot_id, lot_number, expires_at, serial_numbers,
      accepted_quantity, rejected_quantity, conference_status, divergence_type, divergence_notes, notes
    ) values (
      p_company_id, v_receipt.id, v_order_item.id, v_product_id, v_quantity_received, nullif(v_item->>'unit', ''),
      (v_item->>'destination_location_id')::uuid,
      nullif(v_item->>'lot_id', '')::uuid, nullif(v_item->>'lot_number', ''), nullif(v_item->>'expires_at', '')::date,
      v_item->'serial_numbers',
      v_accepted, v_rejected, v_conference_status, v_divergence_type, nullif(v_item->>'divergence_notes', ''), nullif(v_item->>'notes', '')
    );
  end loop;

  return v_receipt;
end;
$$;

-- ==================================================================
-- fn_update_purchase_receipt_item — ajusta a decisão de conferência
-- (aceito/rejeitado/divergência) antes de confirmar. Só em recebimento
-- ainda em draft.
-- ==================================================================
create or replace function public.fn_update_purchase_receipt_item(
  p_item_id uuid,
  p_accepted_quantity numeric,
  p_rejected_quantity numeric,
  p_divergence_type text default null,
  p_divergence_notes text default null
)
returns public.purchase_receipt_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.purchase_receipt_items;
  v_receipt public.purchase_receipts;
begin
  select * into v_item from public.purchase_receipt_items where id = p_item_id;
  if not found then
    raise exception 'Item de recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_item.company_id, 'purchase_receipts.update') then
    raise exception 'Permissão negada (purchase_receipts.update).' using errcode = '42501';
  end if;

  select * into v_receipt from public.purchase_receipts where id = v_item.receipt_id;
  if v_receipt.status <> 'draft' then
    raise exception 'Só é possível editar a conferência de um recebimento em rascunho (status atual: %).', v_receipt.status using errcode = 'P0001';
  end if;

  update public.purchase_receipt_items
  set accepted_quantity = p_accepted_quantity,
      rejected_quantity = p_rejected_quantity,
      divergence_type = coalesce(p_divergence_type, divergence_type),
      divergence_notes = coalesce(p_divergence_notes, divergence_notes),
      conference_status = case when coalesce(p_divergence_type, divergence_type) = 'none' then 'matched' else 'divergent' end
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.fn_reject_purchase_receipt(p_receipt_id uuid, p_reason text default null)
returns public.purchase_receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
begin
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receipt.company_id, 'purchase_receipts.reject') then
    raise exception 'Permissão negada (purchase_receipts.reject).' using errcode = '42501';
  end if;

  if v_receipt.status <> 'draft' then
    raise exception 'Só é possível rejeitar um recebimento em rascunho (status atual: %).', v_receipt.status using errcode = 'P0001';
  end if;

  update public.purchase_receipts
  set status = 'rejected', notes = coalesce(notes || E'\n', '') || coalesce('Rejeitado: ' || p_reason, 'Rejeitado.')
  where id = p_receipt_id
  returning * into v_receipt;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receipt.company_id, public.current_app_user_id(), 'system', 'purchase_receipts', v_receipt.id, 'REJECT',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'rejected', 'reason', p_reason));

  return v_receipt;
end;
$$;

-- ==================================================================
-- fn_confirm_purchase_receipt — TRANSACIONAL. Único ponto de contato
-- de Compras com o ledger de estoque. Trava cada purchase_order_item
-- envolvido (FOR UPDATE) antes de validar "aceito <= pendente",
-- fechando a mesma janela de corrida que fn_post_stock_movement já
-- fecha para stock_balances — dois recebimentos concorrentes contra o
-- mesmo item do pedido serializam corretamente, nenhum consegue ler um
-- "pendente" desatualizado.
--
-- Idempotência: a guarda de status ('draft' -> 'confirmed') já impede
-- reprocessamento — uma segunda chamada falha imediatamente com "só é
-- possível confirmar em rascunho", nunca gera uma segunda entrada.
-- idempotency_key é repassado a cada fn_post_stock_movement como
-- camada extra contra retry de rede a meio da transação.
-- ==================================================================
create or replace function public.fn_confirm_purchase_receipt(
  p_receipt_id uuid,
  p_idempotency_key text default null
)
returns public.purchase_receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
  v_order public.purchase_orders;
  v_item record;
  v_order_item public.purchase_order_items;
  v_remaining numeric;
  v_product public.products;
  v_lot_id uuid;
  v_serial text;
  v_serial_count integer;
  v_total_ordered numeric;
  v_total_received numeric;
  v_total_cancelled numeric;
  v_new_status text;
begin
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_receipt.company_id, 'purchase_receipts.confirm') then
    raise exception 'Permissão negada (purchase_receipts.confirm).' using errcode = '42501';
  end if;

  if v_receipt.status <> 'draft' then
    raise exception 'Só é possível confirmar um recebimento em rascunho (status atual: %).', v_receipt.status using errcode = 'P0001';
  end if;

  select * into v_order from public.purchase_orders where id = v_receipt.purchase_order_id for update;
  if v_order.status in ('cancelled', 'closed') then
    raise exception 'Pedido no status % não pode mais receber.', v_order.status using errcode = 'P0001';
  end if;

  for v_item in select * from public.purchase_receipt_items where receipt_id = p_receipt_id
  loop
    select * into v_order_item from public.purchase_order_items where id = v_item.purchase_order_item_id for update;

    v_remaining := v_order_item.ordered_quantity - v_order_item.received_quantity - v_order_item.cancelled_quantity;
    if v_item.accepted_quantity > v_remaining then
      raise exception 'Item %: quantidade aceita (%) excede o saldo pendente do pedido (%).', v_item.product_id, v_item.accepted_quantity, v_remaining using errcode = 'P0001';
    end if;

    if v_item.accepted_quantity > 0 then
      select * into v_product from public.products where id = v_item.product_id;

      v_lot_id := v_item.lot_id;
      if v_lot_id is null and v_product.batch_controlled and v_item.lot_number is not null then
        insert into public.product_lots (company_id, product_id, lot_number, expires_at)
        values (v_receipt.company_id, v_item.product_id, v_item.lot_number, v_item.expires_at)
        on conflict (company_id, product_id, lot_number)
        do update set expires_at = coalesce(excluded.expires_at, public.product_lots.expires_at)
        returning id into v_lot_id;
      end if;

      if v_product.serial_controlled then
        v_serial_count := coalesce(jsonb_array_length(v_item.serial_numbers), 0);
        if v_serial_count <> v_item.accepted_quantity::integer then
          raise exception 'Item %: produto controla número de série — informe exatamente % série(s) para a quantidade aceita (recebido %).', v_item.product_id, v_item.accepted_quantity::integer, v_serial_count using errcode = 'P0001';
        end if;
      end if;

      perform public.fn_post_stock_movement(
        p_company_id => v_receipt.company_id,
        p_product_id => v_item.product_id,
        p_location_id => v_item.destination_location_id,
        p_movement_type => 'RECEIPT',
        p_quantity => v_item.accepted_quantity,
        p_lot_id => v_lot_id,
        p_unit_cost => v_order_item.unit_price,
        p_reference_type => 'PURCHASE_RECEIPT',
        p_reference_id => v_receipt.id,
        p_idempotency_key => case when p_idempotency_key is not null then p_idempotency_key || ':' || v_item.id::text else null end,
        p_created_by => public.current_app_user_id()
      );

      if v_product.serial_controlled then
        for v_serial in select value from jsonb_array_elements_text(v_item.serial_numbers) as s(value)
        loop
          insert into public.product_serial_numbers (company_id, product_id, serial_number, status, current_location_id)
          values (v_receipt.company_id, v_item.product_id, v_serial, 'in_stock', v_item.destination_location_id);
        end loop;
      end if;

      update public.purchase_order_items
      set received_quantity = received_quantity + v_item.accepted_quantity
      where id = v_order_item.id;
    end if;
  end loop;

  select coalesce(sum(ordered_quantity), 0), coalesce(sum(received_quantity), 0), coalesce(sum(cancelled_quantity), 0)
  into v_total_ordered, v_total_received, v_total_cancelled
  from public.purchase_order_items where order_id = v_order.id;

  if v_total_received + v_total_cancelled >= v_total_ordered then
    v_new_status := 'received';
  else
    v_new_status := 'partially_received';
  end if;

  update public.purchase_orders set status = v_new_status where id = v_order.id;

  if v_order.purchase_request_id is not null then
    perform public.fn_sync_purchase_request_status(v_order.purchase_request_id);
  end if;

  update public.purchase_receipts set status = 'confirmed' where id = p_receipt_id
  returning * into v_receipt;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_receipt.company_id, public.current_app_user_id(), 'system', 'purchase_receipts', v_receipt.id, 'CONFIRM',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'confirmed', 'purchase_order_status', v_new_status));

  return v_receipt;
end;
$$;

revoke all on function public.fn_create_purchase_receipt(uuid, uuid, jsonb, timestamptz, text, text, text, text, text, date, numeric) from public;
revoke all on function public.fn_update_purchase_receipt_item(uuid, numeric, numeric, text, text) from public;
revoke all on function public.fn_reject_purchase_receipt(uuid, text) from public;
revoke all on function public.fn_confirm_purchase_receipt(uuid, text) from public;
grant execute on function public.fn_create_purchase_receipt(uuid, uuid, jsonb, timestamptz, text, text, text, text, text, date, numeric) to authenticated;
grant execute on function public.fn_update_purchase_receipt_item(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.fn_reject_purchase_receipt(uuid, text) to authenticated;
grant execute on function public.fn_confirm_purchase_receipt(uuid, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('purchase_receipts.view', 'purchase_receipts', 'view', 'Consultar recebimentos'),
    ('purchase_receipts.create', 'purchase_receipts', 'create', 'Registrar recebimentos físicos e sua conferência'),
    ('purchase_receipts.update', 'purchase_receipts', 'update', 'Ajustar a conferência de um recebimento em rascunho'),
    ('purchase_receipts.confirm', 'purchase_receipts', 'confirm', 'Confirmar recebimento — gera entrada real em estoque/almoxarifado'),
    ('purchase_receipts.reject', 'purchase_receipts', 'reject', 'Rejeitar um recebimento em rascunho (sem gerar movimentação)')
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
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

drop policy if exists purchase_receipts_select on public.purchase_receipts;
create policy purchase_receipts_select on public.purchase_receipts
  for select to authenticated
  using (public.has_permission(company_id, 'purchase_receipts.view'));

drop policy if exists purchase_receipt_items_select on public.purchase_receipt_items;
create policy purchase_receipt_items_select on public.purchase_receipt_items
  for select to authenticated
  using (public.has_permission(company_id, 'purchase_receipts.view'));
