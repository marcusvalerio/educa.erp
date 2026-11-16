-- ==================================================================
-- 0126 — Integração ATLAS.ERP ↔ ORION.WMS (fases 1 e 2 do contrato,
-- docs/INTEGRACAO-ATLAS-ORION.md §3.1, §2, §4).
--
--   * módulo contratável `orion` (fora da contratação automática);
--   * orion_integrations (configuração por empresa, segredo HMAC cifrado
--     pelo app com AES-256-GCM — o banco nunca vê o segredo em claro);
--   * orion_user_access (funcionário ↔ perfil ORION + depósitos,
--     access_version), orion_warehouse_map (depósito ↔ código ORION +
--     local de integração ORION-<depósito>);
--   * integration_outbox / integration_inbox / integration_aggregate_seq;
--   * wms_status nos pedidos de venda/compra e ordens de produção;
--   * permissões orion.* e RLS no padrão has_permission;
--   * fn_orion_enqueue + gatilhos (cadastros, status de documentos, itens
--     do pedido de venda, NF-e autorizada, acesso de usuário) — a
--     mensagem nasce na MESMA transação do documento;
--   * funções de acesso (SSO/checagem periódica) e do processador.
-- ==================================================================

-- ------------------------------------------------------------ módulo
insert into public.platform_modules (code, name, description, category, is_core, sort_order)
values ('orion', 'ORION.WMS', 'Armazém (WMS) integrado: endereçamento, separação, inventário e expedição física', 'OPERATIONAL', false, 65)
on conflict (code) do nothing;

-- O ORION é contratado empresa a empresa pela plataforma: a linha existe
-- (senão fn_permission_module_enabled liberaria as permissões orion.* por
-- ausência de linha), mas nasce não contratada.
insert into public.company_modules (company_id, module_code, contracted, enabled_by_company)
select c.id, 'orion', false, false from public.companies c
on conflict (company_id, module_code) do nothing;

create or replace function public.fn_seed_company_platform_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_platform_profiles (company_id, lifecycle_status, display_name)
  values (NEW.id, 'ACTIVE', NEW.name)
  on conflict (company_id) do nothing;

  insert into public.company_modules (company_id, module_code, contracted, enabled_by_company)
  select NEW.id, m.code, m.code <> 'orion', m.code <> 'orion' from public.platform_modules m
  on conflict (company_id, module_code) do nothing;

  return NEW;
end;
$$;

insert into public.platform_module_permission_map (permission_module, module_code)
values ('orion', 'orion')
on conflict do nothing;

insert into public.permissions (code, module, action, description)
values
  ('orion.integration.view', 'orion', 'view', 'Consultar a integração com o ORION.WMS (status, eventos, reconciliação)'),
  ('orion.integration.manage', 'orion', 'manage', 'Configurar a integração com o ORION.WMS, reprocessar e descartar eventos'),
  ('orion.access.manage', 'orion', 'manage', 'Liberar e revogar o acesso de funcionários ao ORION.WMS'),
  ('orion.documents.send', 'orion', 'send', 'Enviar e reenviar documentos ao armazém (ORION.WMS)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code like 'orion.%'
where r.code = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.code in ('orion.integration.view', 'orion.documents.send')
where r.code = 'gerente'
on conflict do nothing;

-- ------------------------------------------------------------ tabelas
create table if not exists public.orion_integrations (
  company_id                 uuid primary key references public.companies(id) on delete cascade,
  status                     text not null default 'pending'
                             check (status in ('pending','activating','active','suspended','disabled')),
  orion_url                  text not null,
  orion_company_id           uuid,
  key_id                     text not null unique,
  secret_ciphertext          bytea not null,
  previous_secret_ciphertext bytea,
  previous_secret_expires_at timestamptz,
  stock_owner                text not null default 'atlas' check (stock_owner in ('atlas','orion')),
  sales_release_status       text not null default 'approved' check (sales_release_status in ('approved','reserved')),
  purchase_release_status    text not null default 'sent'     check (purchase_release_status in ('approved','sent')),
  production_release_status  text not null default 'released' check (production_release_status in ('planned','released')),
  auto_send                  boolean not null default true,
  require_invoice_before_ship boolean not null default true,
  cutover_at                 timestamptz,
  last_outbound_success_at   timestamptz,
  last_inbound_success_at    timestamptz,
  activated_at timestamptz, activated_by uuid references public.users(id) on delete set null,
  disabled_at  timestamptz, disabled_by  uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.orion_user_access (
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  orion_role  text not null check (orion_role in ('admin','supervisor','operator','auditor')),
  warehouses  text[] not null default '{}',
  status      text not null default 'active' check (status in ('active','revoked')),
  version     integer not null default 1,
  granted_by  uuid references public.users(id) on delete set null, granted_at timestamptz not null default now(),
  revoked_by  uuid references public.users(id) on delete set null, revoked_at timestamptz,
  revoke_reason text,
  primary key (company_id, user_id)
);

-- O contrato (§3.1) referencia public.user_companies, que não existe no
-- esquema de produção: o vínculo empresa ↔ cadastro é users.company_id.
create or replace function public.fn_orion_user_access_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.users u where u.id = NEW.user_id and u.company_id = NEW.company_id) then
    raise exception 'O funcionário não pertence a esta empresa.' using errcode = '23503';
  end if;
  return NEW;
end;
$$;
drop trigger if exists orion_user_access_guard on public.orion_user_access;
create trigger orion_user_access_guard before insert or update of user_id, company_id on public.orion_user_access
  for each row execute function public.fn_orion_user_access_guard();

alter table public.warehouse_locations add column if not exists managed_by text
  check (managed_by is null or managed_by in ('orion'));

create table if not exists public.orion_warehouse_map (
  company_id uuid not null references public.companies(id) on delete cascade,
  warehouse_id uuid not null,
  orion_warehouse_code text not null check (orion_warehouse_code ~ '^[A-Za-z0-9_.-]{1,40}$'),
  integration_location_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, warehouse_id),
  unique (company_id, orion_warehouse_code),
  foreign key (warehouse_id, company_id) references public.warehouses(id, company_id) on delete cascade,
  foreign key (integration_location_id, company_id) references public.warehouse_locations(id, company_id)
);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  target text not null default 'orion' check (target in ('orion')),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_seq bigint not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','discarded')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text, last_http_status integer, last_response jsonb,
  created_at timestamptz not null default now(), sent_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  discarded_by uuid references public.users(id) on delete set null, discard_reason text,
  unique (company_id, aggregate_type, aggregate_id, aggregate_seq)
);
create index if not exists integration_outbox_due_idx on public.integration_outbox (status, next_attempt_at);
create index if not exists integration_outbox_company_idx on public.integration_outbox (company_id, created_at desc);

create table if not exists public.integration_inbox (
  event_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null, aggregate_id uuid not null, aggregate_seq bigint,
  payload jsonb not null,
  envelope_hash text,
  status text not null default 'received' check (status in ('received','applied','failed','ignored')),
  attempts integer not null default 0, last_error text,
  received_at timestamptz not null default now(), applied_at timestamptz
);
create index if not exists integration_inbox_company_idx on public.integration_inbox (company_id, received_at desc);
create index if not exists integration_inbox_aggregate_idx on public.integration_inbox (company_id, aggregate_type, aggregate_id, aggregate_seq);

create table if not exists public.integration_aggregate_seq (
  company_id uuid not null references public.companies(id) on delete cascade,
  aggregate_type text not null, aggregate_id uuid not null,
  last_seq bigint not null default 0,
  primary key (company_id, aggregate_type, aggregate_id)
);

do $$
declare t text;
begin
  foreach t in array array['sales_orders','purchase_orders','production_orders'] loop
    execute format('alter table public.%I add column if not exists wms_status text not null default %L', t, 'not_sent');
    execute format('alter table public.%I add column if not exists wms_sent_at timestamptz', t);
    execute format('alter table public.%I add column if not exists wms_last_error text', t);
    execute format('alter table public.%I add column if not exists wms_details jsonb not null default %L::jsonb', t, '{}');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_wms_status_check');
    execute format('alter table public.%I add constraint %I check (wms_status in (%s))', t, t || '_wms_status_check',
      '''not_sent'',''queued'',''sent'',''accepted'',''rejected'',''failed'',''picking'',''ready_to_invoice'',''shipped'',''cancelled'',''received'',''in_progress'',''completed''');
  end loop;
end $$;

-- ------------------------------------------------------------ RLS
alter table public.orion_integrations enable row level security;
alter table public.orion_user_access enable row level security;
alter table public.orion_warehouse_map enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.integration_inbox enable row level security;
alter table public.integration_aggregate_seq enable row level security;

drop policy if exists orion_integrations_select on public.orion_integrations;
create policy orion_integrations_select on public.orion_integrations for select to authenticated
  using (public.has_permission(company_id, 'orion.integration.view') or public.has_permission(company_id, 'orion.access.manage'));
drop policy if exists orion_user_access_select on public.orion_user_access;
create policy orion_user_access_select on public.orion_user_access for select to authenticated
  using (public.has_permission(company_id, 'orion.access.manage') or public.has_permission(company_id, 'orion.integration.view'));
drop policy if exists orion_warehouse_map_select on public.orion_warehouse_map;
create policy orion_warehouse_map_select on public.orion_warehouse_map for select to authenticated
  using (public.has_permission(company_id, 'orion.integration.view') or public.has_permission(company_id, 'orion.access.manage'));
drop policy if exists integration_outbox_select on public.integration_outbox;
create policy integration_outbox_select on public.integration_outbox for select to authenticated
  using (public.has_permission(company_id, 'orion.integration.view'));
drop policy if exists integration_inbox_select on public.integration_inbox;
create policy integration_inbox_select on public.integration_inbox for select to authenticated
  using (public.has_permission(company_id, 'orion.integration.view'));

-- Escrita só pelas funções (security definer). Segredos nunca legíveis por
-- authenticated: privilégio de coluna sem os *_ciphertext.
revoke all on public.orion_integrations, public.orion_user_access, public.orion_warehouse_map,
  public.integration_outbox, public.integration_inbox, public.integration_aggregate_seq from anon, authenticated;
grant select (company_id, status, orion_url, orion_company_id, key_id, stock_owner, sales_release_status,
  purchase_release_status, production_release_status, auto_send, require_invoice_before_ship, cutover_at,
  last_outbound_success_at, last_inbound_success_at, activated_at, activated_by, disabled_at, disabled_by,
  previous_secret_expires_at, created_at, updated_at) on public.orion_integrations to authenticated;
grant select on public.orion_user_access, public.orion_warehouse_map, public.integration_outbox, public.integration_inbox to authenticated;
grant all on public.orion_integrations, public.orion_user_access, public.orion_warehouse_map,
  public.integration_outbox, public.integration_inbox, public.integration_aggregate_seq to service_role;

-- ------------------------------------------------------------ utilitários
create or replace function public.fn_orion_integration_status(p_company_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select status from public.orion_integrations where company_id = p_company_id;
$$;

-- Estoque físico da empresa pertence ao ORION (guarda de §5.2).
create or replace function public.fn_stock_managed_by_orion(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select oi.stock_owner = 'orion' and oi.status in ('activating','active','suspended')
    from public.orion_integrations oi where oi.company_id = p_company_id
  ), false);
$$;
grant execute on function public.fn_stock_managed_by_orion(uuid) to authenticated, service_role;
grant execute on function public.fn_orion_integration_status(uuid) to authenticated, service_role;

create or replace function public.fn_orion_applying()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.orion_apply', true), '') = 'on';
$$;

-- Insere o evento na outbox com a próxima sequência do agregado.
-- p_force: grava mesmo fora de 'activating'/'active' (suspensão, §6.2).
create or replace function public.fn_orion_enqueue(
  p_company_id uuid, p_event_type text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_seq bigint;
  v_id uuid;
begin
  select status into v_status from public.orion_integrations where company_id = p_company_id;
  if v_status is null or (not p_force and v_status not in ('activating','active')) then
    return null;
  end if;
  insert into public.integration_aggregate_seq as s (company_id, aggregate_type, aggregate_id, last_seq)
  values (p_company_id, p_aggregate_type, p_aggregate_id, 1)
  on conflict (company_id, aggregate_type, aggregate_id) do update set last_seq = s.last_seq + 1
  returning last_seq into v_seq;
  insert into public.integration_outbox (company_id, event_type, aggregate_type, aggregate_id, aggregate_seq, payload, created_by)
  values (p_company_id, p_event_type, p_aggregate_type, p_aggregate_id, v_seq, p_payload, public.current_app_user_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fn_orion_enqueue(uuid, text, text, uuid, jsonb, boolean) from public, anon, authenticated;

create or replace function public.fn_orion_default_warehouse(p_company_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select warehouse_id from public.orion_warehouse_map where company_id = p_company_id order by created_at, orion_warehouse_code limit 1;
$$;

-- ------------------------------------------------------------ payloads (estado completo)
create or replace function public.fn_orion_iso(p timestamptz)
returns text language sql immutable as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

create or replace function public.fn_orion_payload_company(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('company', jsonb_build_object(
    'atlas_company_id', c.id, 'name', c.name, 'legal_name', c.legal_name, 'document', c.document,
    'email', c.email, 'phone', c.phone, 'address', c.address, 'city', c.city, 'state', c.state,
    'zip_code', c.zip_code, 'status', c.status, 'updated_at', public.fn_orion_iso(c.updated_at)))
  from public.companies c where c.id = p_company_id;
$$;

create or replace function public.fn_orion_payload_product(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('product', jsonb_build_object(
    'atlas_product_id', p.id, 'code', p.code, 'sku', p.sku, 'barcode', p.barcode, 'name', p.name,
    'description', p.description, 'category', p.category, 'unit', p.unit, 'ncm', p.ncm,
    'weight_kg', p.weight, 'height_cm', p.height_cm, 'width_cm', p.width_cm, 'length_cm', p.length_cm,
    'batch_controlled', p.batch_controlled, 'expiration_controlled', p.expiration_controlled,
    'serial_controlled', p.serial_controlled, 'status', p.status, 'updated_at', public.fn_orion_iso(p.updated_at),
    'packagings', coalesce((
      select jsonb_agg(jsonb_build_object('unit', pu.unit_code, 'quantity', pu.conversion_factor, 'barcode', pu.barcode) order by pu.unit_code)
      from public.product_units pu where pu.product_id = p.id and pu.status = 'active'
    ), '[]'::jsonb)))
  from public.products p where p.id = p_product_id;
$$;

create or replace function public.fn_orion_payload_customer(p_customer_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('customer', jsonb_build_object(
    'atlas_customer_id', c.id, 'code', c.code, 'type', c.type, 'name', c.name, 'trade_name', c.trade_name,
    'document', c.document, 'email', c.email, 'phone', c.phone,
    'address', jsonb_build_object('street', c.address, 'number', c.address_number, 'district', c.neighborhood,
      'city', c.city, 'state', c.state, 'zip_code', c.zip_code),
    'status', c.status, 'updated_at', public.fn_orion_iso(c.updated_at)))
  from public.customers c where c.id = p_customer_id;
$$;

create or replace function public.fn_orion_payload_supplier(p_supplier_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('supplier', jsonb_build_object(
    'atlas_supplier_id', s.id, 'code', s.code, 'name', s.legal_name, 'document', s.document,
    'email', s.email, 'status', s.status, 'updated_at', public.fn_orion_iso(s.updated_at)))
  from public.suppliers s where s.id = p_supplier_id;
$$;

create or replace function public.fn_orion_payload_unit(p_unit_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'atlas_unit_id', u.id, 'code', u.code, 'name', u.name, 'base_unit_code', b.code,
    'factor_to_base', coalesce((
      select uc.factor from public.unit_conversions uc
      where uc.from_unit_id = u.id and uc.to_unit_id = u.base_unit_id and uc.product_id is null and uc.status = 'active'
      order by uc.created_at desc limit 1), 1),
    'status', u.status)
  from public.units u left join public.units b on b.id = u.base_unit_id where u.id = p_unit_id;
$$;

create or replace function public.fn_orion_sales_order_lines(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'atlas_line_id', l.id, 'line_no', l.line_no, 'atlas_product_id', l.product_id, 'product_code', l.code,
    'unit', l.unit, 'quantity', l.qty, 'lot_code', null) order by l.line_no), '[]'::jsonb)
  from (
    select i.id, i.product_id, p.code, coalesce(i.unit, p.unit) as unit,
      i.ordered_quantity - i.cancelled_quantity as qty,
      row_number() over (order by i.created_at, i.id) as line_no
    from public.sales_order_items i join public.products p on p.id = i.product_id
    where i.order_id = p_order_id
  ) l;
$$;

create or replace function public.fn_orion_payload_sales_order(p_order_id uuid, p_status text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('sales_order', jsonb_build_object(
    'atlas_sales_order_id', so.id, 'number', so.code, 'status', coalesce(p_status, so.status),
    'atlas_customer_id', so.customer_id, 'customer_code', c.code,
    'issue_date', so.order_date, 'requested_ship_date', so.expected_delivery_at, 'priority', 'normal',
    'atlas_warehouse_id', public.fn_orion_default_warehouse(so.company_id),
    'shipping', jsonb_build_object('carrier_code', ca.code, 'freight_mode', null,
      'address', jsonb_build_object('street', so.delivery_address, 'number', so.delivery_address_number,
        'city', so.delivery_city, 'state', so.delivery_state, 'zip_code', so.delivery_zip_code)),
    'export', so.wms_details -> 'export_request',
    'notes', so.notes,
    'lines', public.fn_orion_sales_order_lines(so.id)))
  from public.sales_orders so
  join public.customers c on c.id = so.customer_id
  left join public.carriers ca on ca.id = so.carrier_id
  where so.id = p_order_id;
$$;

create or replace function public.fn_orion_payload_purchase_order(p_order_id uuid, p_status text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('purchase_order', jsonb_build_object(
    'atlas_purchase_order_id', po.id, 'number', po.code, 'status', coalesce(p_status, po.status),
    'atlas_supplier_id', po.supplier_id, 'supplier_code', s.code,
    'issue_date', po.issued_at, 'expected_date', po.expected_delivery_at,
    'atlas_warehouse_id', public.fn_orion_default_warehouse(po.company_id),
    'import', po.wms_details -> 'import_request',
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('atlas_line_id', l.id, 'line_no', l.line_no, 'atlas_product_id', l.product_id,
        'product_code', l.code, 'unit', l.unit, 'quantity', l.qty, 'unit_price', l.unit_price) order by l.line_no)
      from (
        select i.id, i.product_id, p.code, coalesce(i.unit, p.unit) as unit,
          i.ordered_quantity - i.cancelled_quantity as qty, i.unit_price,
          row_number() over (order by i.created_at, i.id) as line_no
        from public.purchase_order_items i join public.products p on p.id = i.product_id
        where i.order_id = po.id
      ) l), '[]'::jsonb)))
  from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
  where po.id = p_order_id;
$$;

create or replace function public.fn_orion_payload_production_order(p_order_id uuid, p_status text default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('production_order', jsonb_build_object(
    'atlas_production_order_id', op.id, 'number', op.code, 'status', coalesce(p_status, op.status),
    'atlas_product_id', op.product_id, 'product_code', p.code, 'quantity', op.planned_quantity, 'unit', u.code,
    'planned_date', op.planned_date, 'output_lot_code', op.wms_details ->> 'output_lot_code',
    'atlas_warehouse_id', coalesce(
      (select m.warehouse_id from public.orion_warehouse_map m where m.company_id = op.company_id and m.warehouse_id = op.source_warehouse_id),
      public.fn_orion_default_warehouse(op.company_id)),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object('atlas_material_id', l.id, 'line_no', l.line_no, 'atlas_product_id', l.component_product_id,
        'product_code', l.code, 'unit', l.unit, 'quantity', l.planned_quantity) order by l.line_no)
      from (
        select m.id, m.component_product_id, cp.code, cu.code as unit, m.planned_quantity,
          row_number() over (order by m.created_at, m.id) as line_no
        from public.production_order_materials m
        join public.products cp on cp.id = m.component_product_id
        join public.units cu on cu.id = m.unit_id
        where m.production_order_id = op.id and m.status <> 'cancelled'
      ) l), '[]'::jsonb)))
  from public.production_orders op
  join public.products p on p.id = op.product_id
  join public.units u on u.id = op.unit_id
  where op.id = p_order_id;
$$;

create or replace function public.fn_orion_payload_integration(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'stock_owner', oi.stock_owner, 'sales_release_status', oi.sales_release_status,
    'purchase_release_status', oi.purchase_release_status, 'production_release_status', oi.production_release_status,
    'require_invoice_before_ship', oi.require_invoice_before_ship,
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object('atlas_warehouse_id', w.id, 'code', w.code, 'name', w.name,
        'orion_warehouse_code', m.orion_warehouse_code) order by m.orion_warehouse_code)
      from public.orion_warehouse_map m join public.warehouses w on w.id = m.warehouse_id
      where m.company_id = oi.company_id), '[]'::jsonb))
  from public.orion_integrations oi where oi.company_id = p_company_id;
$$;

-- Garante que o cadastro referenciado foi enviado alguma vez (§3.5: o
-- emissor enfileira o upsert ANTES do documento quando nunca foi enviado).
create or replace function public.fn_orion_ensure_master(p_company_id uuid, p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_id is null then return; end if;
  if exists (select 1 from public.integration_aggregate_seq where company_id = p_company_id and aggregate_type = p_type and aggregate_id = p_id) then
    return;
  end if;
  perform public.fn_orion_enqueue(p_company_id, p_type || '.upserted', p_type, p_id,
    case p_type
      when 'product' then public.fn_orion_payload_product(p_id)
      when 'customer' then public.fn_orion_payload_customer(p_id)
      when 'supplier' then public.fn_orion_payload_supplier(p_id)
    end);
end;
$$;

-- Enfileira *.released de um documento (gatilho, botão Enviar/Reenviar).
create or replace function public.fn_orion_enqueue_document(p_type text, p_id uuid, p_status text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_payload jsonb;
  v_ref record;
begin
  if p_type = 'sales_order' then
    select company_id into v_company from public.sales_orders where id = p_id;
    perform public.fn_orion_ensure_master(v_company, 'customer', (select customer_id from public.sales_orders where id = p_id));
    for v_ref in select distinct product_id from public.sales_order_items where order_id = p_id and product_id is not null loop
      perform public.fn_orion_ensure_master(v_company, 'product', v_ref.product_id);
    end loop;
    v_payload := public.fn_orion_payload_sales_order(p_id, p_status);
  elsif p_type = 'purchase_order' then
    select company_id into v_company from public.purchase_orders where id = p_id;
    perform public.fn_orion_ensure_master(v_company, 'supplier', (select supplier_id from public.purchase_orders where id = p_id));
    for v_ref in select distinct product_id from public.purchase_order_items where order_id = p_id and product_id is not null loop
      perform public.fn_orion_ensure_master(v_company, 'product', v_ref.product_id);
    end loop;
    v_payload := public.fn_orion_payload_purchase_order(p_id, p_status);
  elsif p_type = 'production_order' then
    select company_id into v_company from public.production_orders where id = p_id;
    perform public.fn_orion_ensure_master(v_company, 'product', (select product_id from public.production_orders where id = p_id));
    for v_ref in select distinct component_product_id as product_id from public.production_order_materials where production_order_id = p_id loop
      perform public.fn_orion_ensure_master(v_company, 'product', v_ref.product_id);
    end loop;
    v_payload := public.fn_orion_payload_production_order(p_id, p_status);
  else
    raise exception 'Tipo de documento inválido: %', p_type using errcode = '22023';
  end if;
  if v_company is null then
    raise exception 'Documento não encontrado.' using errcode = 'P0002';
  end if;
  return public.fn_orion_enqueue(v_company, p_type || '.released', p_type, p_id, v_payload);
end;
$$;
revoke all on function public.fn_orion_enqueue_document(text, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------ gatilhos de cadastros
create or replace function public.fn_trg_orion_master_data()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_type text := TG_ARGV[0];
begin
  v_company := case when v_type = 'company' then NEW.id else NEW.company_id end;
  if public.fn_orion_integration_status(v_company) is distinct from 'active'
     and public.fn_orion_integration_status(v_company) is distinct from 'activating' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') then
    return NEW;
  end if;
  if v_type = 'product' and TG_OP = 'UPDATE' and OLD.status = 'active' and NEW.status <> 'active' then
    perform public.fn_orion_enqueue(v_company, 'product.deactivated', 'product', NEW.id,
      jsonb_build_object('atlas_product_id', NEW.id, 'code', NEW.code));
    return NEW;
  end if;
  perform public.fn_orion_enqueue(v_company, v_type || '.upserted', v_type, NEW.id,
    case v_type
      when 'company' then public.fn_orion_payload_company(NEW.id)
      when 'product' then public.fn_orion_payload_product(NEW.id)
      when 'customer' then public.fn_orion_payload_customer(NEW.id)
      when 'supplier' then public.fn_orion_payload_supplier(NEW.id)
      when 'unit' then public.fn_orion_payload_unit(NEW.id)
    end);
  return NEW;
end;
$$;

drop trigger if exists orion_outbox_company on public.companies;
create trigger orion_outbox_company after update on public.companies
  for each row execute function public.fn_trg_orion_master_data('company');
drop trigger if exists orion_outbox_product on public.products;
create trigger orion_outbox_product after insert or update on public.products
  for each row execute function public.fn_trg_orion_master_data('product');
drop trigger if exists orion_outbox_customer on public.customers;
create trigger orion_outbox_customer after insert or update on public.customers
  for each row execute function public.fn_trg_orion_master_data('customer');
drop trigger if exists orion_outbox_supplier on public.suppliers;
create trigger orion_outbox_supplier after insert or update on public.suppliers
  for each row execute function public.fn_trg_orion_master_data('supplier');
drop trigger if exists orion_outbox_unit on public.units;
create trigger orion_outbox_unit after insert or update on public.units
  for each row execute function public.fn_trg_orion_master_data('unit');

-- ------------------------------------------------------------ gatilhos de documentos
create or replace function public.fn_orion_status_rank(p_type text, p_status text)
returns integer language sql immutable as $$
  select case p_type
    when 'sales_order' then array_position(array['draft','pending_approval','approved','reservation_pending','reserved','picking','ready_to_ship','partially_shipped','shipped','completed'], p_status)
    when 'purchase_order' then array_position(array['draft','pending_approval','approved','sent','partially_received','received','closed'], p_status)
    when 'production_order' then array_position(array['draft','planned','released','materials_reserved','in_progress','completed'], p_status)
  end;
$$;

-- BEFORE UPDATE: decide o envio pela transição de status e marca wms_status
-- na própria linha (sem recursão de gatilho).
create or replace function public.fn_trg_orion_document_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text := TG_ARGV[0];
  v_cfg public.orion_integrations;
  v_release text;
  v_sent boolean;
begin
  if NEW.status is not distinct from OLD.status then
    -- Alterações de cabeçalho do pedido de venda depois de enviado.
    if v_type = 'sales_order' and not public.fn_orion_applying()
       and OLD.wms_status in ('queued','sent','accepted','rejected','failed')
       and (NEW.expected_delivery_at is distinct from OLD.expected_delivery_at
         or NEW.notes is distinct from OLD.notes
         or NEW.delivery_address is distinct from OLD.delivery_address
         or NEW.delivery_city is distinct from OLD.delivery_city
         or NEW.delivery_zip_code is distinct from OLD.delivery_zip_code
         or NEW.carrier_id is distinct from OLD.carrier_id) then
      perform public.fn_orion_enqueue(NEW.company_id, 'sales_order.updated', 'sales_order', NEW.id,
        jsonb_build_object('sales_order', jsonb_build_object(
          'atlas_sales_order_id', NEW.id, 'number', NEW.code, 'requested_ship_date', NEW.expected_delivery_at,
          'lines', public.fn_orion_sales_order_lines(NEW.id)),
          'changed_fields', to_jsonb(array_remove(array[
            case when NEW.expected_delivery_at is distinct from OLD.expected_delivery_at then 'requested_ship_date' end,
            case when NEW.notes is distinct from OLD.notes then 'notes' end,
            case when NEW.delivery_address is distinct from OLD.delivery_address or NEW.delivery_city is distinct from OLD.delivery_city
                   or NEW.delivery_zip_code is distinct from OLD.delivery_zip_code then 'shipping.address' end,
            case when NEW.carrier_id is distinct from OLD.carrier_id then 'shipping.carrier_code' end], null))));
    end if;
    return NEW;
  end if;
  if public.fn_orion_applying() then
    return NEW;
  end if;
  select * into v_cfg from public.orion_integrations where company_id = NEW.company_id;
  if not found or v_cfg.status <> 'active' then
    return NEW;
  end if;
  v_sent := OLD.wms_status not in ('not_sent', 'cancelled');

  if NEW.status = 'cancelled' then
    if v_sent then
      perform public.fn_orion_enqueue(NEW.company_id, v_type || '.cancelled', v_type, NEW.id,
        case v_type
          when 'sales_order' then jsonb_build_object('atlas_sales_order_id', NEW.id, 'number', NEW.code,
            'reason', coalesce(nullif(current_setting('app.orion_cancel_reason', true), ''), 'Cancelado no ATLAS'), 'lines', null)
          when 'purchase_order' then jsonb_build_object('atlas_purchase_order_id', NEW.id, 'number', NEW.code,
            'reason', coalesce(nullif(current_setting('app.orion_cancel_reason', true), ''), 'Cancelado no ATLAS'))
          else jsonb_build_object('atlas_production_order_id', NEW.id, 'number', NEW.code,
            'reason', coalesce(nullif(current_setting('app.orion_cancel_reason', true), ''), 'Cancelado no ATLAS'))
        end);
    end if;
    return NEW;
  end if;

  v_release := case v_type when 'sales_order' then v_cfg.sales_release_status
    when 'purchase_order' then v_cfg.purchase_release_status else v_cfg.production_release_status end;
  if v_cfg.auto_send and NEW.status = v_release and OLD.wms_status = 'not_sent'
     and coalesce(public.fn_orion_status_rank(v_type, OLD.status), 0) < public.fn_orion_status_rank(v_type, NEW.status) then
    perform public.fn_orion_enqueue_document(v_type, NEW.id, NEW.status);
    NEW.wms_status := 'queued';
    NEW.wms_last_error := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists orion_outbox_status on public.sales_orders;
create trigger orion_outbox_status before update on public.sales_orders
  for each row execute function public.fn_trg_orion_document_status('sales_order');
drop trigger if exists orion_outbox_status on public.purchase_orders;
create trigger orion_outbox_status before update on public.purchase_orders
  for each row execute function public.fn_trg_orion_document_status('purchase_order');
drop trigger if exists orion_outbox_status on public.production_orders;
create trigger orion_outbox_status before update on public.production_orders
  for each row execute function public.fn_trg_orion_document_status('production_order');

-- Itens do pedido de venda alterados depois do envio.
create or replace function public.fn_trg_orion_sales_order_items()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
  v_row public.sales_order_items := coalesce(NEW, OLD);
begin
  if public.fn_orion_applying() or coalesce(current_setting('app.orion_cancelling', true), '') = v_row.order_id::text then
    return null;
  end if;
  select * into v_order from public.sales_orders where id = v_row.order_id;
  if not found or v_order.wms_status not in ('queued','sent','accepted','rejected','failed','picking')
     or v_order.status = 'cancelled' or public.fn_orion_integration_status(v_order.company_id) is distinct from 'active' then
    return null;
  end if;
  if TG_OP = 'UPDATE' and NEW.cancelled_quantity > OLD.cancelled_quantity and NEW.ordered_quantity = OLD.ordered_quantity then
    perform public.fn_orion_enqueue(v_order.company_id, 'sales_order.line_cancelled', 'sales_order', v_order.id,
      jsonb_build_object('atlas_sales_order_id', v_order.id, 'number', v_order.code, 'atlas_line_id', NEW.id,
        'cancelled_quantity', NEW.cancelled_quantity - OLD.cancelled_quantity,
        'reason', coalesce(nullif(current_setting('app.orion_cancel_reason', true), ''), 'Linha cancelada no ATLAS')));
    return null;
  end if;
  if TG_OP = 'UPDATE' and NEW.ordered_quantity = OLD.ordered_quantity and NEW.product_id is not distinct from OLD.product_id then
    return null; -- reservado/separado/expedido: fatos, não alteração do pedido
  end if;
  perform public.fn_orion_enqueue(v_order.company_id, 'sales_order.updated', 'sales_order', v_order.id,
    jsonb_build_object('sales_order', jsonb_build_object(
      'atlas_sales_order_id', v_order.id, 'number', v_order.code, 'requested_ship_date', v_order.expected_delivery_at,
      'lines', public.fn_orion_sales_order_lines(v_order.id)),
      'changed_fields', jsonb_build_array('lines')));
  return null;
end;
$$;
drop trigger if exists orion_outbox_items on public.sales_order_items;
create trigger orion_outbox_items after insert or update or delete on public.sales_order_items
  for each row execute function public.fn_trg_orion_sales_order_items();

-- O cancelamento do pedido zera as linhas antes de mudar o status: sem esta
-- marca, cada linha viraria um sales_order.line_cancelled antes do
-- sales_order.cancelled.
create or replace function public.fn_cancel_sales_order(p_order_id uuid)
returns public.sales_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
begin
  select * into v_order from public.sales_orders where id = p_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'sales_orders.cancel') then
    raise exception 'Permissão negada (sales_orders.cancel).' using errcode = '42501';
  end if;

  if v_order.status in ('shipped', 'completed', 'cancelled') then
    raise exception 'Pedido no status % não pode ser cancelado.', v_order.status using errcode = 'P0001';
  end if;

  perform set_config('app.orion_cancelling', p_order_id::text, true);

  if v_order.status in ('reservation_pending', 'reserved') then
    perform public.fn_release_sales_order_reservations_internal(p_order_id);
  end if;

  update public.sales_order_items
  set cancelled_quantity = ordered_quantity - shipped_quantity
  where order_id = p_order_id and (ordered_quantity - shipped_quantity - cancelled_quantity) > 0;

  update public.sales_orders set status = 'cancelled' where id = p_order_id
  returning * into v_order;

  perform set_config('app.orion_cancelling', '', true);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_order.company_id, public.current_app_user_id(), 'system', 'sales_orders', v_order.id, 'CANCEL',
    null, jsonb_build_object('status', 'cancelled'));

  return v_order;
end;
$$;

-- NF-e de venda autorizada para pedido que está no armazém.
create or replace function public.fn_trg_orion_invoice_authorized()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
begin
  if NEW.status <> 'AUTHORIZED' or OLD.status = 'AUTHORIZED' or NEW.source_type is distinct from 'sales_order' or NEW.source_id is null then
    return null;
  end if;
  select * into v_order from public.sales_orders where id = NEW.source_id and company_id = NEW.company_id;
  if not found or v_order.wms_status in ('not_sent','cancelled') then
    return null;
  end if;
  perform public.fn_orion_enqueue(NEW.company_id, 'sales_invoice.authorized', 'sales_order', v_order.id,
    jsonb_build_object(
      'atlas_sales_order_id', v_order.id, 'number', v_order.code, 'atlas_fiscal_document_id', NEW.id,
      'nfe_number', lpad(coalesce(NEW.number, 0)::text, 9, '0'), 'nfe_series', NEW.series, 'access_key', NEW.access_key,
      'authorized_at', public.fn_orion_iso(coalesce(NEW.authorized_at, now())),
      'orion_outbound_id', v_order.wms_details ->> 'orion_outbound_id',
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object('atlas_line_id', soi.id, 'quantity', fi.quantity,
          'lot_code', (select l.value ->> 'lot_code'
                       from jsonb_array_elements(coalesce(v_order.wms_details #> '{ready_to_invoice,lines}', '[]'::jsonb)) r(value),
                            jsonb_array_elements(coalesce(r.value -> 'lots', '[]'::jsonb)) l(value)
                       where r.value ->> 'atlas_line_id' = soi.id::text limit 1)) order by soi.created_at)
        from public.fiscal_document_items fi
        join lateral (
          select s.* from public.sales_order_items s
          where s.order_id = v_order.id
            and (s.id = fi.source_reference_id or (fi.source_reference_id is distinct from s.id and s.product_id = fi.product_id))
          order by (s.id = fi.source_reference_id) desc, s.created_at limit 1
        ) soi on true
        where fi.fiscal_document_id = NEW.id), '[]'::jsonb)));
  return null;
end;
$$;
drop trigger if exists orion_outbox_invoice on public.fiscal_documents;
create trigger orion_outbox_invoice after update of status on public.fiscal_documents
  for each row execute function public.fn_trg_orion_invoice_authorized();

-- ------------------------------------------------------------ acesso de funcionários
create or replace function public.fn_orion_grant_access(p_user_id uuid, p_orion_role text, p_warehouses text[] default '{}')
returns public.orion_user_access
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user public.users;
  v_row public.orion_user_access;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_user.company_id, 'orion.access.manage') then
    raise exception 'Permissão negada (orion.access.manage).' using errcode = '42501';
  end if;
  if p_orion_role not in ('admin','supervisor','operator','auditor') then
    raise exception 'Perfil ORION inválido.' using errcode = '22023';
  end if;
  if v_user.status <> 'active' then
    raise exception 'Funcionário inativo não pode receber acesso ao ORION.' using errcode = 'P0001';
  end if;
  if public.fn_orion_integration_status(v_user.company_id) not in ('activating','active') or public.fn_orion_integration_status(v_user.company_id) is null then
    raise exception 'A empresa não está vinculada ao ORION.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_warehouses, '{}')) w
             where not exists (select 1 from public.orion_warehouse_map m where m.company_id = v_user.company_id and m.orion_warehouse_code = w)) then
    raise exception 'Depósito ORION desconhecido na lista informada.' using errcode = '22023';
  end if;

  insert into public.orion_user_access as a (company_id, user_id, orion_role, warehouses, status, version, granted_by, granted_at)
  values (v_user.company_id, v_user.id, p_orion_role, coalesce(p_warehouses, '{}'), 'active', 1, public.current_app_user_id(), now())
  on conflict (company_id, user_id) do update set
    orion_role = excluded.orion_role, warehouses = excluded.warehouses, status = 'active',
    version = a.version + 1, granted_by = excluded.granted_by, granted_at = now(),
    revoked_by = null, revoked_at = null, revoke_reason = null
  returning * into v_row;

  perform public.fn_orion_enqueue(v_user.company_id, 'user_access.granted', 'user_access', v_user.id,
    jsonb_build_object('atlas_user_id', v_user.id, 'email', v_user.email, 'name', v_user.name,
      'orion_role', v_row.orion_role, 'access_version', v_row.version, 'warehouses', to_jsonb(v_row.warehouses)));

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'orion.access_granted', 'orion_user_access', v_user.id, 'GRANT', null,
    jsonb_build_object('orion_role', v_row.orion_role, 'warehouses', v_row.warehouses, 'access_version', v_row.version));
  return v_row;
end;
$$;

create or replace function public.fn_orion_revoke_access_internal(p_company_id uuid, p_user_id uuid, p_reason text, p_by uuid)
returns public.orion_user_access
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.orion_user_access;
begin
  update public.orion_user_access
  set status = 'revoked', version = version + 1, revoked_by = p_by, revoked_at = now(), revoke_reason = p_reason
  where company_id = p_company_id and user_id = p_user_id and status = 'active'
  returning * into v_row;
  if not found then
    return null;
  end if;
  perform public.fn_orion_enqueue(p_company_id, 'user_access.revoked', 'user_access', p_user_id,
    jsonb_build_object('atlas_user_id', p_user_id, 'access_version', v_row.version, 'reason', p_reason), true);
  return v_row;
end;
$$;
revoke all on function public.fn_orion_revoke_access_internal(uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.fn_orion_revoke_access(p_user_id uuid)
returns public.orion_user_access
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user public.users;
  v_row public.orion_user_access;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_user.company_id, 'orion.access.manage') then
    raise exception 'Permissão negada (orion.access.manage).' using errcode = '42501';
  end if;
  v_row := public.fn_orion_revoke_access_internal(v_user.company_id, v_user.id, 'revoked_by_company_admin', public.current_app_user_id());
  if v_row.user_id is null then
    raise exception 'O funcionário não tem acesso ativo ao ORION.' using errcode = 'P0001';
  end if;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'orion.access_revoked', 'orion_user_access', v_user.id, 'REVOKE', null,
    jsonb_build_object('access_version', v_row.version));
  return v_row;
end;
$$;

grant execute on function public.fn_orion_grant_access(uuid, text, text[]) to authenticated, service_role;
grant execute on function public.fn_orion_revoke_access(uuid) to authenticated, service_role;

-- Funcionário inativado no ATLAS perde o acesso ao ORION (§2.7).
create or replace function public.fn_trg_orion_user_inactivated()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if NEW.status <> 'active' and OLD.status = 'active' then
    perform public.fn_orion_revoke_access_internal(NEW.company_id, NEW.id, 'user_inactive', public.current_app_user_id());
  end if;
  return null;
end;
$$;
drop trigger if exists orion_user_inactivated on public.users;
create trigger orion_user_inactivated after update of status on public.users
  for each row execute function public.fn_trg_orion_user_inactivated();

-- Situação do acesso (SSO e checagem periódica, §2.3 e §2.7). Ordem:
-- módulo contratado e habilitado, empresa TRIAL/ACTIVE, integração ativa,
-- usuário ativo, acesso ativo.
create or replace function public.fn_orion_access_status(p_company_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user public.users;
  v_access public.orion_user_access;
  v_int public.orion_integrations;
  v_reason text;
begin
  select * into v_user from public.users where id = p_user_id and company_id = p_company_id;
  select * into v_access from public.orion_user_access where company_id = p_company_id and user_id = p_user_id;
  select * into v_int from public.orion_integrations where company_id = p_company_id;

  if not coalesce((select cm.contracted and cm.enabled_by_company from public.company_modules cm
                   where cm.company_id = p_company_id and cm.module_code = 'orion'), false) then
    v_reason := 'module_disabled';
  elsif not public.fn_company_operational(p_company_id) then
    v_reason := 'company_suspended';
  elsif v_int.company_id is null or v_int.status <> 'active' then
    v_reason := case when v_int.status = 'suspended' then 'company_suspended' else 'module_disabled' end;
  elsif v_user.id is null or v_user.status <> 'active' then
    v_reason := 'user_inactive';
  elsif v_access.user_id is null or v_access.status <> 'active' then
    v_reason := 'access_revoked';
  end if;

  if v_reason is not null then
    return jsonb_build_object('atlas_user_id', p_user_id, 'atlas_company_id', p_company_id, 'active', false,
      'reason', v_reason, 'access_version', coalesce(v_access.version, 0), 'checked_at', public.fn_orion_iso(now()));
  end if;
  return jsonb_build_object('atlas_user_id', p_user_id, 'atlas_company_id', p_company_id, 'active', true,
    'orion_role', v_access.orion_role, 'access_version', v_access.version, 'email', v_user.email, 'name', v_user.name,
    'warehouses', to_jsonb(v_access.warehouses), 'checked_at', public.fn_orion_iso(now()),
    'orion_company_id', v_int.orion_company_id, 'orion_url', v_int.orion_url);
end;
$$;
revoke all on function public.fn_orion_access_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_orion_access_status(uuid, uuid) to service_role;

-- O próprio usuário pode ver se tem acesso (botão "Abrir ORION").
create or replace function public.fn_orion_my_access()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user public.users;
  v_status jsonb;
begin
  select * into v_user from public.users where id = public.current_app_user_id();
  if not found then
    return jsonb_build_object('active', false, 'reason', 'user_inactive');
  end if;
  v_status := public.fn_orion_access_status(v_user.company_id, v_user.id);
  return jsonb_build_object('active', v_status -> 'active', 'reason', v_status -> 'reason', 'orion_role', v_status -> 'orion_role',
    'stock_managed_by_orion', public.fn_stock_managed_by_orion(v_user.company_id),
    'integration_status', public.fn_orion_integration_status(v_user.company_id));
end;
$$;
grant execute on function public.fn_orion_my_access() to authenticated;

-- ------------------------------------------------------------ vínculo e configuração
-- Chamado pelo servidor (service_role) depois de POST {ORION}/api/atlas/v1/links.
create or replace function public.fn_orion_link_company(
  p_company_id uuid, p_orion_url text, p_key_id text, p_secret_ciphertext_b64 text, p_orion_company_id uuid, p_by uuid default null
) returns public.orion_integrations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.orion_integrations;
  v_first boolean;
  r record;
begin
  if p_orion_url !~ '^https?://[^\s/]+' then
    raise exception 'URL do ORION inválida.' using errcode = '22023';
  end if;
  if not coalesce((select contracted from public.company_modules where company_id = p_company_id and module_code = 'orion'), false) then
    raise exception 'O módulo ORION não está contratado para esta empresa.' using errcode = 'P0001';
  end if;
  v_first := not exists (select 1 from public.orion_integrations where company_id = p_company_id and status in ('activating','active'));
  insert into public.orion_integrations as oi (company_id, status, orion_url, orion_company_id, key_id, secret_ciphertext, stock_owner, activated_at, activated_by)
  values (p_company_id, 'activating', rtrim(p_orion_url, '/'), p_orion_company_id, p_key_id, decode(p_secret_ciphertext_b64, 'base64'), 'orion', now(), p_by)
  on conflict (company_id) do update set
    orion_url = excluded.orion_url, orion_company_id = excluded.orion_company_id,
    previous_secret_ciphertext = case when oi.key_id = excluded.key_id then oi.secret_ciphertext else null end,
    previous_secret_expires_at = case when oi.key_id = excluded.key_id then now() + interval '24 hours' else null end,
    key_id = excluded.key_id, secret_ciphertext = excluded.secret_ciphertext,
    status = case when oi.status in ('active') then oi.status else 'activating' end,
    stock_owner = 'orion', disabled_at = null, disabled_by = null, updated_at = now()
  returning * into v_row;

  if v_first then
    perform public.fn_orion_enqueue(p_company_id, 'company.upserted', 'company', p_company_id, public.fn_orion_payload_company(p_company_id));
    perform public.fn_orion_enqueue(p_company_id, 'integration.activated', 'integration', p_company_id, public.fn_orion_payload_integration(p_company_id));
    for r in select id from public.units where company_id = p_company_id and status = 'active' order by base_unit_id nulls first, code loop
      perform public.fn_orion_enqueue(p_company_id, 'unit.upserted', 'unit', r.id, public.fn_orion_payload_unit(r.id));
    end loop;
    for r in select id from public.products where company_id = p_company_id and status = 'active' order by code loop
      perform public.fn_orion_enqueue(p_company_id, 'product.upserted', 'product', r.id, public.fn_orion_payload_product(r.id));
    end loop;
    for r in select id from public.customers where company_id = p_company_id and status = 'active' order by code loop
      perform public.fn_orion_enqueue(p_company_id, 'customer.upserted', 'customer', r.id, public.fn_orion_payload_customer(r.id));
    end loop;
    for r in select id from public.suppliers where company_id = p_company_id and status = 'active' order by code loop
      perform public.fn_orion_enqueue(p_company_id, 'supplier.upserted', 'supplier', r.id, public.fn_orion_payload_supplier(r.id));
    end loop;
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, p_by, 'orion.linked', 'orion_integrations', p_company_id, 'CONFIGURE', null,
    jsonb_build_object('orion_url', v_row.orion_url, 'orion_company_id', v_row.orion_company_id, 'key_id', v_row.key_id, 'status', v_row.status));
  return v_row;
end;
$$;
revoke all on function public.fn_orion_link_company(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_orion_link_company(uuid, text, text, text, uuid, uuid) to service_role;

-- Segredos para o servidor (somente service_role).
create or replace function public.fn_orion_integration_secrets(p_company_id uuid default null, p_key_id text default null)
returns table (company_id uuid, status text, orion_url text, orion_company_id uuid, key_id text,
               secret_ciphertext_b64 text, previous_secret_ciphertext_b64 text)
language sql stable security definer set search_path = public, pg_temp as $$
  select oi.company_id, oi.status, oi.orion_url, oi.orion_company_id, oi.key_id,
    encode(oi.secret_ciphertext, 'base64'),
    case when oi.previous_secret_expires_at > now() then encode(oi.previous_secret_ciphertext, 'base64') end
  from public.orion_integrations oi
  where (p_company_id is not null and oi.company_id = p_company_id) or (p_key_id is not null and oi.key_id = p_key_id);
$$;
revoke all on function public.fn_orion_integration_secrets(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_orion_integration_secrets(uuid, text) to service_role;

create or replace function public.fn_orion_update_config(
  p_company_id uuid, p_sales_release_status text, p_purchase_release_status text, p_production_release_status text,
  p_auto_send boolean, p_require_invoice_before_ship boolean
) returns public.orion_integrations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.orion_integrations;
begin
  if not public.has_permission(p_company_id, 'orion.integration.manage') then
    raise exception 'Permissão negada (orion.integration.manage).' using errcode = '42501';
  end if;
  update public.orion_integrations set
    sales_release_status = p_sales_release_status, purchase_release_status = p_purchase_release_status,
    production_release_status = p_production_release_status, auto_send = p_auto_send,
    require_invoice_before_ship = p_require_invoice_before_ship, updated_at = now()
  where company_id = p_company_id
  returning * into v_row;
  if not found then
    raise exception 'A empresa ainda não foi vinculada ao ORION pela plataforma.' using errcode = 'P0002';
  end if;
  perform public.fn_orion_enqueue(p_company_id, 'integration.activated', 'integration', p_company_id, public.fn_orion_payload_integration(p_company_id));
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'orion.configured', 'orion_integrations', p_company_id, 'CONFIGURE', null,
    jsonb_build_object('sales_release_status', p_sales_release_status, 'purchase_release_status', p_purchase_release_status,
      'production_release_status', p_production_release_status, 'auto_send', p_auto_send, 'require_invoice_before_ship', p_require_invoice_before_ship));
  -- Desfaz o retorno sem os segredos.
  v_row.secret_ciphertext := null; v_row.previous_secret_ciphertext := null;
  return v_row;
end;
$$;
grant execute on function public.fn_orion_update_config(uuid, text, text, text, boolean, boolean) to authenticated, service_role;

-- Mapa de depósitos: cria o local de integração ORION-<depósito>.
create or replace function public.fn_orion_map_warehouse(p_company_id uuid, p_warehouse_id uuid, p_orion_code text)
returns public.orion_warehouse_map
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wh public.warehouses;
  v_loc uuid;
  v_row public.orion_warehouse_map;
begin
  if not public.has_permission(p_company_id, 'orion.integration.manage') then
    raise exception 'Permissão negada (orion.integration.manage).' using errcode = '42501';
  end if;
  select * into v_wh from public.warehouses where id = p_warehouse_id and company_id = p_company_id;
  if not found then
    raise exception 'Depósito não encontrado.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.orion_integrations where company_id = p_company_id) then
    raise exception 'A empresa ainda não foi vinculada ao ORION pela plataforma.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orion_warehouse_map where company_id = p_company_id and warehouse_id = p_warehouse_id)
     and exists (select 1 from public.orion_integrations where company_id = p_company_id and cutover_at is not null) then
    raise exception 'O mapa de depósitos não pode mudar depois da carga inicial.' using errcode = 'P0001';
  end if;
  select id into v_loc from public.warehouse_locations where company_id = p_company_id and code = 'ORION-' || v_wh.code;
  if v_loc is null then
    insert into public.warehouse_locations (company_id, code, name, warehouse, warehouse_id, location_type, purpose, managed_by)
    values (p_company_id, 'ORION-' || v_wh.code, 'Saldo fiscal — físico no ORION (' || v_wh.name || ')', v_wh.code, v_wh.id, 'Integração', 'STOCK', 'orion')
    returning id into v_loc;
  else
    update public.warehouse_locations set managed_by = 'orion' where id = v_loc;
  end if;
  insert into public.orion_warehouse_map (company_id, warehouse_id, orion_warehouse_code, integration_location_id)
  values (p_company_id, p_warehouse_id, p_orion_code, v_loc)
  on conflict (company_id, warehouse_id) do update set orion_warehouse_code = excluded.orion_warehouse_code
  returning * into v_row;
  perform public.fn_orion_enqueue(p_company_id, 'integration.activated', 'integration', p_company_id, public.fn_orion_payload_integration(p_company_id));
  return v_row;
end;
$$;
grant execute on function public.fn_orion_map_warehouse(uuid, uuid, text) to authenticated, service_role;

-- Botão "Enviar ao armazém / Reenviar" (§4.3): novo id, nova sequência.
create or replace function public.fn_orion_send_document(p_type text, p_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_status text;
  v_wms text;
  v_id uuid;
begin
  if p_type = 'sales_order' then
    select company_id, status, wms_status into v_company, v_status, v_wms from public.sales_orders where id = p_id;
  elsif p_type = 'purchase_order' then
    select company_id, status, wms_status into v_company, v_status, v_wms from public.purchase_orders where id = p_id;
  elsif p_type = 'production_order' then
    select company_id, status, wms_status into v_company, v_status, v_wms from public.production_orders where id = p_id;
  else
    raise exception 'Tipo de documento inválido.' using errcode = '22023';
  end if;
  if v_company is null then
    raise exception 'Documento não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_company, 'orion.documents.send') then
    raise exception 'Permissão negada (orion.documents.send).' using errcode = '42501';
  end if;
  if public.fn_orion_integration_status(v_company) is distinct from 'active' then
    raise exception 'A integração com o ORION não está ativa.' using errcode = 'P0001';
  end if;
  if v_wms not in ('not_sent','rejected','failed') and not public.has_permission(v_company, 'orion.integration.manage') then
    raise exception 'O documento já está no armazém (situação: %).', v_wms using errcode = 'P0001';
  end if;
  if v_status in ('draft','pending_approval','cancelled','shipped','completed','received','closed') then
    raise exception 'Documento no status % não pode ser enviado ao armazém.', v_status using errcode = 'P0001';
  end if;
  v_id := public.fn_orion_enqueue_document(p_type, p_id);
  execute format('update public.%I set wms_status = %L, wms_last_error = null where id = $1',
    case p_type when 'sales_order' then 'sales_orders' when 'purchase_order' then 'purchase_orders' else 'production_orders' end,
    'queued') using p_id;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_company, public.current_app_user_id(), case when v_wms = 'not_sent' then 'orion.document_sent' else 'orion.document_resent' end,
    p_type || 's', p_id, 'EVENT', jsonb_build_object('wms_status', v_wms), jsonb_build_object('outbox_id', v_id));
  return v_id;
end;
$$;
grant execute on function public.fn_orion_send_document(text, uuid) to authenticated, service_role;

-- ------------------------------------------------------------ processador da outbox
-- Seleciona eventos devidos, respeitando a ordem por agregado: seq N só
-- sai depois que N-1 estiver 'sent' ou 'discarded'.
create or replace function public.fn_orion_outbox_claim(p_limit integer default 100)
returns table (id uuid, company_id uuid, event_type text, aggregate_type text, aggregate_id uuid, aggregate_seq bigint,
               payload jsonb, created_at timestamptz, attempts integer, orion_url text, orion_company_id uuid, key_id text,
               secret_ciphertext_b64 text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select o.id from public.integration_outbox o
    join public.orion_integrations oi on oi.company_id = o.company_id
    where o.status = 'pending' and o.next_attempt_at <= now()
      and (o.locked_at is null or o.locked_at < now() - interval '2 minutes')
      and oi.status in ('activating','active','suspended')
      and not exists (
        select 1 from public.integration_outbox p
        where p.company_id = o.company_id and p.aggregate_type = o.aggregate_type and p.aggregate_id = o.aggregate_id
          and p.aggregate_seq < o.aggregate_seq and p.status in ('pending','failed'))
    order by o.company_id, o.aggregate_type, o.aggregate_id, o.aggregate_seq
    for update of o skip locked
    limit p_limit
  ), locked as (
    update public.integration_outbox o set locked_at = now() from due where o.id = due.id returning o.*
  )
  select l.id, l.company_id, l.event_type, l.aggregate_type, l.aggregate_id, l.aggregate_seq, l.payload, l.created_at, l.attempts,
    oi.orion_url, oi.orion_company_id, oi.key_id, encode(oi.secret_ciphertext, 'base64')
  from locked l join public.orion_integrations oi on oi.company_id = l.company_id
  order by l.company_id, l.aggregate_type, l.aggregate_id, l.aggregate_seq;
end;
$$;
revoke all on function public.fn_orion_outbox_claim(integer) from public, anon, authenticated;
grant execute on function public.fn_orion_outbox_claim(integer) to service_role;

-- Resultado do envio. Backoff exponencial com jitter (2 s, 4 s … teto 30
-- min), 20 tentativas para erro retentável; depois 'failed'.
create or replace function public.fn_orion_outbox_result(
  p_id uuid, p_ok boolean, p_http_status integer, p_error text, p_retryable boolean, p_response jsonb default null
) returns public.integration_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.integration_outbox;
  v_attempts integer;
  v_table text;
begin
  select * into v_row from public.integration_outbox where id = p_id for update;
  if not found then
    raise exception 'Evento da outbox não encontrado.' using errcode = 'P0002';
  end if;
  v_attempts := v_row.attempts + 1;
  v_table := case v_row.aggregate_type when 'sales_order' then 'sales_orders' when 'purchase_order' then 'purchase_orders'
    when 'production_order' then 'production_orders' end;
  if p_ok then
    update public.integration_outbox set status = 'sent', sent_at = now(), attempts = v_attempts, locked_at = null,
      last_http_status = p_http_status, last_error = null, last_response = p_response
    where id = p_id returning * into v_row;
    update public.orion_integrations set last_outbound_success_at = now() where company_id = v_row.company_id;
    if v_table is not null and v_row.event_type like '%.released' then
      execute format('update public.%I set wms_status = case when wms_status in (''queued'',''not_sent'',''failed'',''rejected'') then ''sent'' else wms_status end, wms_sent_at = now(), wms_last_error = null where id = $1', v_table)
        using v_row.aggregate_id;
    end if;
  elsif p_retryable and v_attempts < 20 then
    update public.integration_outbox set attempts = v_attempts, locked_at = null, last_http_status = p_http_status,
      last_error = left(p_error, 2000), last_response = p_response,
      next_attempt_at = now() + make_interval(secs => least(power(2, v_attempts)::numeric, 1800) * (0.8 + random() * 0.4))
    where id = p_id returning * into v_row;
  else
    update public.integration_outbox set status = 'failed', attempts = v_attempts, locked_at = null,
      last_http_status = p_http_status, last_error = left(p_error, 2000), last_response = p_response
    where id = p_id returning * into v_row;
    if v_table is not null then
      execute format('update public.%I set wms_status = case when %L like ''%%.released'' then ''failed'' else wms_status end, wms_last_error = $2 where id = $1', v_table, v_row.event_type)
        using v_row.aggregate_id, left(p_error, 500);
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function public.fn_orion_outbox_result(uuid, boolean, integer, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.fn_orion_outbox_result(uuid, boolean, integer, text, boolean, jsonb) to service_role;

-- Painel: reprocessar / descartar.
create or replace function public.fn_orion_outbox_retry(p_id uuid)
returns public.integration_outbox language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.integration_outbox;
begin
  select * into v_row from public.integration_outbox where id = p_id;
  if not found then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_row.company_id, 'orion.integration.manage') then
    raise exception 'Permissão negada (orion.integration.manage).' using errcode = '42501';
  end if;
  if v_row.status not in ('failed','pending') then
    raise exception 'Só eventos falhos ou pendentes podem ser reprocessados.' using errcode = 'P0001';
  end if;
  update public.integration_outbox set status = 'pending', attempts = 0, next_attempt_at = now(), locked_at = null
  where id = p_id returning * into v_row;
  return v_row;
end;
$$;
create or replace function public.fn_orion_outbox_discard(p_id uuid, p_reason text)
returns public.integration_outbox language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.integration_outbox;
begin
  select * into v_row from public.integration_outbox where id = p_id;
  if not found then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_row.company_id, 'orion.integration.manage') then
    raise exception 'Permissão negada (orion.integration.manage).' using errcode = '42501';
  end if;
  if v_row.status not in ('failed','pending') then
    raise exception 'Só eventos falhos ou pendentes podem ser descartados.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo do descarte.' using errcode = '22023';
  end if;
  update public.integration_outbox set status = 'discarded', discarded_by = public.current_app_user_id(), discard_reason = p_reason, locked_at = null
  where id = p_id returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.fn_orion_outbox_retry(uuid) to authenticated, service_role;
grant execute on function public.fn_orion_outbox_discard(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------ suspensão (§6.2)
create or replace function public.fn_orion_sync_suspension(p_company_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_int public.orion_integrations;
  v_ok boolean;
  v_reason text;
  r record;
begin
  select * into v_int from public.orion_integrations where company_id = p_company_id;
  if not found or v_int.status in ('pending','disabled') then return; end if;
  v_ok := public.fn_company_operational(p_company_id)
    and coalesce((select contracted and enabled_by_company from public.company_modules where company_id = p_company_id and module_code = 'orion'), false);
  if not v_ok and v_int.status in ('activating','active') then
    v_reason := case when public.fn_company_operational(p_company_id) then 'module_disabled' else 'company_suspended' end;
    perform public.fn_orion_enqueue(p_company_id, 'company.deactivated', 'company', p_company_id,
      jsonb_build_object('atlas_company_id', p_company_id, 'reason', v_reason, 'mode', 'read_only', 'effective_at', public.fn_orion_iso(now())), true);
    for r in select user_id from public.orion_user_access where company_id = p_company_id and status = 'active' loop
      perform public.fn_orion_revoke_access_internal(p_company_id, r.user_id, v_reason, public.current_app_user_id());
    end loop;
    update public.orion_integrations set status = 'suspended', updated_at = now() where company_id = p_company_id;
  elsif v_ok and v_int.status = 'suspended' then
    update public.orion_integrations set status = case when cutover_at is null then 'activating' else 'active' end, updated_at = now()
    where company_id = p_company_id;
    perform public.fn_orion_enqueue(p_company_id, 'company.upserted', 'company', p_company_id, public.fn_orion_payload_company(p_company_id));
  end if;
end;
$$;
revoke all on function public.fn_orion_sync_suspension(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_orion_suspension()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fn_orion_sync_suspension(NEW.company_id);
  return null;
end;
$$;
drop trigger if exists orion_suspension on public.company_modules;
create trigger orion_suspension after update of contracted, enabled_by_company on public.company_modules
  for each row when (NEW.module_code = 'orion') execute function public.fn_trg_orion_suspension();
drop trigger if exists orion_suspension on public.company_platform_profiles;
create trigger orion_suspension after update of lifecycle_status on public.company_platform_profiles
  for each row execute function public.fn_trg_orion_suspension();
