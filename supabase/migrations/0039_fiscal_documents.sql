-- Fase 8 — Fiscal: documento fiscal, itens, impostos por item e
-- eventos.
--
-- Requisito crítico desta etapa (seção 4): o documento preserva seu
-- PRÓPRIO snapshot. fiscal_document_items nunca lê product_fiscal_profiles/
-- fiscal_ncms/fiscal_cfops de novo depois de criado — copia
-- código/descrição como TEXTO no momento da criação do item
-- (fn_add_fiscal_document_item). Os campos *_id (ncm_id/cfop_id)
-- guardados junto são só para rastreabilidade/resolução de regra no
-- cálculo — a fonte de verdade exibida e armazenada é sempre
-- ncm_code/ncm_description/cfop_code (texto), nunca uma releitura via
-- join. Se o NCM mudar de descrição amanhã, ou a regra tributária for
-- substituída, este documento permanece exatamente como foi calculado.

create sequence if not exists public.fiscal_documents_code_seq;

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_establishment_id uuid not null,
  code text not null,
  number integer,
  series text,
  model text,
  type text not null check (type in ('NFE', 'NFCE', 'NFSE', 'CTE', 'MDFE', 'OTHER')),
  direction text not null check (direction in ('ENTRADA', 'SAIDA')),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'CALCULATED', 'AUTHORIZED', 'CANCELLED', 'DENIED', 'REJECTED', 'CONTINGENCY'
  )),
  issue_date date not null default current_date,
  operation_date date,
  customer_id uuid,
  supplier_id uuid,
  operation_nature_id uuid not null,
  access_key text,
  protocol text,
  receipt_number text,
  rejection_reason text,
  return_code text,
  xml_storage_reference text,
  source_type text check (source_type is null or source_type in ('purchase_receipt', 'sales_order', 'shipment', 'manual', 'return')),
  source_id uuid,
  carrier_id uuid,
  vehicle_id uuid,
  freight_amount numeric(16, 4) not null default 0 check (freight_amount >= 0),
  insurance_amount numeric(16, 4) not null default 0 check (insurance_amount >= 0),
  other_expenses_amount numeric(16, 4) not null default 0 check (other_expenses_amount >= 0),
  discount_amount numeric(16, 4) not null default 0 check (discount_amount >= 0),
  products_amount numeric(16, 4) not null default 0 check (products_amount >= 0),
  taxes_amount numeric(16, 4) not null default 0 check (taxes_amount >= 0),
  total_amount numeric(16, 4) not null default 0 check (total_amount >= 0),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (fiscal_establishment_id, company_id) references public.fiscal_establishments (id, company_id) on delete restrict,
  foreign key (customer_id, company_id) references public.customers (id, company_id) on delete restrict,
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id) on delete restrict,
  foreign key (operation_nature_id, company_id) references public.fiscal_operation_natures (id, company_id) on delete restrict,
  foreign key (carrier_id, company_id) references public.carriers (id, company_id) on delete set null,
  foreign key (vehicle_id, company_id) references public.vehicles (id, company_id) on delete set null
);

-- Idempotência por origem (seção 42): uma mesma origem operacional não
-- gera dois documentos fiscais ativos — só é possível criar um novo
-- para a mesma origem depois que o anterior for cancelado (correção).
create unique index if not exists fiscal_documents_source_unique
  on public.fiscal_documents (company_id, source_type, source_id)
  where source_type is not null and source_id is not null and status <> 'CANCELLED';

create trigger set_code before insert on public.fiscal_documents
  for each row execute procedure public.fn_generate_code('DF', 'public.fiscal_documents_code_seq');
create trigger set_updated_at before update on public.fiscal_documents
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists fiscal_documents_company_status_idx on public.fiscal_documents (company_id, status);
create index if not exists fiscal_documents_establishment_idx on public.fiscal_documents (fiscal_establishment_id);
create index if not exists fiscal_documents_source_idx on public.fiscal_documents (source_type, source_id);
create index if not exists fiscal_documents_customer_idx on public.fiscal_documents (customer_id);
create index if not exists fiscal_documents_supplier_idx on public.fiscal_documents (supplier_id);

comment on table public.fiscal_documents is
  'Documento fiscal genérico (NFE/NFCE/NFSE/CTE/MDFE/OTHER) — não implementa emissão eletrônica real (seção 28): access_key/protocol/receipt_number/return_code são campos preparados, preenchidos manualmente por fn_authorize_fiscal_document/fn_reject_fiscal_document nesta etapa. code é o identificador interno (fn_generate_code); number/series/model são os identificadores fiscais oficiais, settáveis pelo chamador. Escrita exclusiva via fn_create_fiscal_document e as demais fn_* desta migration.';
comment on column public.fiscal_documents.xml_storage_reference is
  'Ponteiro para um XML futuro (entrada/autorizado/cancelado) — nenhum armazenamento de arquivo implementado nesta etapa (seção 29), mesmo padrão de pod_reference (Logística) e document reference de Financeiro.';
comment on column public.fiscal_documents.source_id is
  'Referência polimórfica (sem FK, mesmo padrão de stock_movements.reference_id) — id do purchase_receipt/sales_order/shipment de origem, conforme source_type.';

create table if not exists public.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_id uuid not null,
  product_id uuid not null,
  description text not null,
  ncm_id uuid,
  ncm_code text not null,
  ncm_description text,
  cfop_id uuid,
  cfop_code text not null,
  origin_code text not null check (origin_code in ('0', '1', '2', '3', '4', '5', '6', '7', '8')),
  quantity numeric(16, 4) not null check (quantity > 0),
  unit text,
  unit_price numeric(16, 4) not null check (unit_price >= 0),
  discount numeric(16, 4) not null default 0 check (discount >= 0),
  freight_amount numeric(16, 4) not null default 0 check (freight_amount >= 0),
  insurance_amount numeric(16, 4) not null default 0 check (insurance_amount >= 0),
  other_expenses numeric(16, 4) not null default 0 check (other_expenses >= 0),
  gross_amount numeric(16, 4) generated always as (quantity * unit_price) stored,
  total_amount numeric(16, 4) generated always as (quantity * unit_price - discount + freight_amount + insurance_amount + other_expenses) stored,
  source_reference_type text,
  source_reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (fiscal_document_id, company_id) references public.fiscal_documents (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (ncm_id, company_id) references public.fiscal_ncms (id, company_id) on delete set null,
  foreign key (cfop_id, company_id) references public.fiscal_cfops (id, company_id) on delete set null
);

create index if not exists fiscal_document_items_document_idx on public.fiscal_document_items (fiscal_document_id);
create index if not exists fiscal_document_items_product_idx on public.fiscal_document_items (product_id);

comment on table public.fiscal_document_items is
  'Item do documento fiscal — snapshot completo no momento da criação (fn_add_fiscal_document_item). ncm_code/ncm_description/cfop_code são a fonte de verdade exibida (texto); ncm_id/cfop_id são só referência de rastreabilidade/resolução de regra tributária no cálculo, nunca relidos para exibição.';

create table if not exists public.fiscal_document_item_taxes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_item_id uuid not null,
  tax_type text not null check (tax_type in ('ICMS', 'ICMS_ST', 'IPI', 'PIS', 'COFINS', 'ISS', 'FCP', 'DIFAL', 'OTHER')),
  cst text,
  csosn text,
  calculation_basis numeric(16, 4) not null default 0 check (calculation_basis >= 0),
  rate numeric(7, 4) not null default 0 check (rate >= 0),
  reduction_percentage numeric(5, 2) not null default 0 check (reduction_percentage >= 0 and reduction_percentage <= 100),
  amount numeric(16, 4) not null default 0 check (amount >= 0),
  withheld boolean not null default false,
  modality text,
  source_tax_rule_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (fiscal_document_item_id, tax_type),
  foreign key (fiscal_document_item_id, company_id) references public.fiscal_document_items (id, company_id) on delete cascade,
  foreign key (source_tax_rule_id, company_id) references public.tax_rules (id, company_id) on delete set null
);

create index if not exists fiscal_document_item_taxes_item_idx on public.fiscal_document_item_taxes (fiscal_document_item_id);

comment on table public.fiscal_document_item_taxes is
  'Snapshot do imposto calculado para um item — rate/cst/reduction_percentage/amount são cópias do que a tax_rule produziu NO MOMENTO do cálculo (fn_calculate_fiscal_document). source_tax_rule_id é só rastreabilidade (seção 32): se a regra mudar depois, esta linha não muda. Não assume que todo imposto existe em todo documento — uma linha por tax_type realmente aplicável, nunca todas preenchidas com zero.';

-- ==================================================================
-- FISCAL_DOCUMENT_EVENTS — ledger append-only (seção 31). Criado aqui
-- (não em 0040) porque as próprias funções de ciclo de vida deste
-- arquivo (autorizar/rejeitar/cancelar) já precisam gravar eventos.
-- ==================================================================
create table if not exists public.fiscal_document_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_id uuid not null,
  event_type text not null check (event_type in (
    'CREATED', 'CALCULATED', 'AUTHORIZED', 'CANCELLED', 'REJECTED', 'DENIED', 'CONTINGENCY', 'CORRECTION_LETTER', 'OTHER'
  )),
  occurred_at timestamptz not null default now(),
  protocol text,
  status_code text,
  message text,
  payload_reference text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (fiscal_document_id, company_id) references public.fiscal_documents (id, company_id) on delete cascade
);

create index if not exists fiscal_document_events_document_idx on public.fiscal_document_events (fiscal_document_id, occurred_at desc);

comment on table public.fiscal_document_events is
  'Ledger de eventos de um documento fiscal — insert-only, nunca atualizado ou apagado (seção 30/31). payload_reference é um ponteiro (ex.: referência de um XML/payload futuro), nenhum armazenamento de arquivo aqui.';

-- ==================================================================
-- fn_create_fiscal_document — idempotente por origem: se source_type/
-- source_id já apontam para um documento não-cancelado existente,
-- devolve o existente em vez de duplicar (seção 42).
-- ==================================================================
create or replace function public.fn_create_fiscal_document(
  p_company_id uuid,
  p_fiscal_establishment_id uuid,
  p_type text,
  p_direction text,
  p_operation_nature_id uuid,
  p_customer_id uuid default null,
  p_supplier_id uuid default null,
  p_issue_date date default current_date,
  p_operation_date date default null,
  p_series text default null,
  p_model text default null,
  p_number integer default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_carrier_id uuid default null,
  p_vehicle_id uuid default null,
  p_notes text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_existing public.fiscal_documents;
begin
  if not public.has_permission(p_company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  if p_source_type is not null and p_source_id is not null then
    select * into v_existing from public.fiscal_documents
    where company_id = p_company_id and source_type = p_source_type and source_id = p_source_id and status <> 'CANCELLED';
    if found then
      return v_existing;
    end if;
  end if;

  insert into public.fiscal_documents (
    company_id, fiscal_establishment_id, type, direction, operation_nature_id, customer_id, supplier_id,
    issue_date, operation_date, series, model, number, source_type, source_id, carrier_id, vehicle_id, notes, created_by
  ) values (
    p_company_id, p_fiscal_establishment_id, p_type, p_direction, p_operation_nature_id, p_customer_id, p_supplier_id,
    coalesce(p_issue_date, current_date), p_operation_date, p_series, p_model, p_number, p_source_type, p_source_id,
    p_carrier_id, p_vehicle_id, p_notes, public.current_app_user_id()
  )
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, message, created_by)
  values (p_company_id, v_document.id, 'CREATED', 'Documento criado em rascunho.', public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'CREATE',
    null, jsonb_build_object('type', p_type, 'direction', p_direction, 'source_type', p_source_type));

  return v_document;
end;
$$;

-- ==================================================================
-- fn_add_fiscal_document_item — o momento do SNAPSHOT (seção 4/20).
-- Quando ncm/cfop/origem não são informados explicitamente, resolve a
-- partir do product_fiscal_profiles ativo do produto (e do
-- default_cfop_id da natureza de operação do documento) e copia os
-- VALORES — nunca guarda só a referência.
-- ==================================================================
create or replace function public.fn_add_fiscal_document_item(
  p_fiscal_document_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_ncm_code text default null,
  p_ncm_description text default null,
  p_cfop_code text default null,
  p_origin_code text default null,
  p_unit text default null,
  p_discount numeric default 0,
  p_freight_amount numeric default 0,
  p_insurance_amount numeric default 0,
  p_other_expenses numeric default 0,
  p_source_reference_type text default null,
  p_source_reference_id uuid default null,
  p_notes text default null
)
returns public.fiscal_document_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_product public.products;
  v_profile public.product_fiscal_profiles;
  v_ncm public.fiscal_ncms;
  v_nature public.fiscal_operation_natures;
  v_cfop public.fiscal_cfops;
  v_ncm_id uuid;
  v_ncm_code text;
  v_ncm_description text;
  v_cfop_id uuid;
  v_cfop_code text;
  v_origin_code text;
  v_item public.fiscal_document_items;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  if v_document.status <> 'DRAFT' then
    raise exception 'Só é possível adicionar itens a um documento em rascunho (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  select * into v_product from public.products where id = p_product_id and company_id = v_document.company_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;

  v_ncm_code := p_ncm_code;
  v_ncm_description := p_ncm_description;
  v_cfop_code := p_cfop_code;
  v_origin_code := p_origin_code;

  if v_ncm_code is null or v_cfop_code is null or v_origin_code is null then
    select * into v_profile from public.product_fiscal_profiles
    where company_id = v_document.company_id and product_id = p_product_id and status = 'active';

    if found then
      if v_ncm_code is null and v_profile.ncm_id is not null then
        select * into v_ncm from public.fiscal_ncms where id = v_profile.ncm_id;
        if found then
          v_ncm_id := v_ncm.id;
          v_ncm_code := v_ncm.code;
          v_ncm_description := coalesce(v_ncm_description, v_ncm.description);
        end if;
      end if;
      if v_origin_code is null then
        v_origin_code := v_profile.origin_code;
      end if;
    end if;
  end if;

  if v_cfop_code is null then
    select * into v_nature from public.fiscal_operation_natures where id = v_document.operation_nature_id;
    if found and v_nature.default_cfop_id is not null then
      select * into v_cfop from public.fiscal_cfops where id = v_nature.default_cfop_id;
      if found then
        v_cfop_id := v_cfop.id;
        v_cfop_code := v_cfop.code;
      end if;
    end if;
  end if;

  if v_ncm_code is null then
    raise exception 'NCM não informado e produto % não possui perfil fiscal ativo com NCM configurado.', v_product.name using errcode = 'P0001';
  end if;
  if v_cfop_code is null then
    raise exception 'CFOP não informado e a natureza da operação do documento não possui CFOP padrão configurado.' using errcode = 'P0001';
  end if;

  insert into public.fiscal_document_items (
    company_id, fiscal_document_id, product_id, description, ncm_id, ncm_code, ncm_description,
    cfop_id, cfop_code, origin_code, quantity, unit, unit_price, discount, freight_amount, insurance_amount, other_expenses,
    source_reference_type, source_reference_id, notes
  ) values (
    v_document.company_id, p_fiscal_document_id, p_product_id, v_product.name, v_ncm_id, v_ncm_code, v_ncm_description,
    v_cfop_id, v_cfop_code, coalesce(v_origin_code, '0'), p_quantity, coalesce(p_unit, v_product.unit), p_unit_price,
    coalesce(p_discount, 0), coalesce(p_freight_amount, 0), coalesce(p_insurance_amount, 0), coalesce(p_other_expenses, 0),
    p_source_reference_type, p_source_reference_id, p_notes
  )
  returning * into v_item;

  return v_item;
end;
$$;

-- ==================================================================
-- fn_calculate_fiscal_document — TRANSACIONAL (seção 41). Recalcula
-- sempre do zero (delete+reinsert das linhas de imposto — idempotente,
-- nunca duplica), resolvendo a regra tributária aplicável a cada item
-- via fn_resolve_applicable_tax_rules (0038) e consolidando os totais
-- do cabeçalho. Permitida em DRAFT ou CALCULATED (recalcular antes de
-- autorizar é normal); nunca em AUTHORIZED/CANCELLED/etc.
-- ==================================================================
create or replace function public.fn_calculate_fiscal_document(p_fiscal_document_id uuid)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_establishment public.fiscal_establishments;
  v_customer public.customers;
  v_supplier public.suppliers;
  v_origin_uf text;
  v_destination_uf text;
  v_item record;
  v_tax record;
  v_basis numeric;
  v_amount numeric;
  v_products_amount numeric := 0;
  v_taxes_amount numeric := 0;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.update') then
    raise exception 'Permissão negada (fiscal_documents.update).' using errcode = '42501';
  end if;

  if v_document.status not in ('DRAFT', 'CALCULATED') then
    raise exception 'Só é possível calcular um documento em rascunho ou já calculado (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id) then
    raise exception 'O documento precisa de ao menos um item para ser calculado.' using errcode = 'P0001';
  end if;

  select * into v_establishment from public.fiscal_establishments where id = v_document.fiscal_establishment_id;
  if v_document.customer_id is not null then
    select * into v_customer from public.customers where id = v_document.customer_id;
  end if;
  if v_document.supplier_id is not null then
    select * into v_supplier from public.suppliers where id = v_document.supplier_id;
  end if;

  if v_document.direction = 'SAIDA' then
    v_origin_uf := v_establishment.state;
    v_destination_uf := v_customer.state;
  else
    v_origin_uf := v_supplier.state;
    v_destination_uf := v_establishment.state;
  end if;

  delete from public.fiscal_document_item_taxes
  where fiscal_document_item_id in (select id from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id);

  for v_item in select * from public.fiscal_document_items where fiscal_document_id = p_fiscal_document_id
  loop
    v_products_amount := v_products_amount + v_item.total_amount;

    for v_tax in
      select * from public.fn_resolve_applicable_tax_rules(
        v_document.company_id, v_item.product_id, v_item.ncm_id, v_item.origin_code, v_item.cfop_id,
        v_document.operation_nature_id, v_origin_uf, v_destination_uf, v_establishment.tax_regime,
        v_document.customer_id, v_document.supplier_id, v_document.issue_date
      )
    loop
      v_basis := round(v_item.total_amount * (1 - v_tax.reduction_percentage / 100), 4);
      v_amount := round(v_basis * v_tax.rate / 100, 4);
      v_taxes_amount := v_taxes_amount + v_amount;

      insert into public.fiscal_document_item_taxes (
        company_id, fiscal_document_item_id, tax_type, cst, csosn, calculation_basis, rate, reduction_percentage, amount, source_tax_rule_id
      ) values (
        v_document.company_id, v_item.id, v_tax.tax_type, v_tax.cst, v_tax.csosn, v_basis, v_tax.rate, v_tax.reduction_percentage, v_amount, v_tax.tax_rule_id
      );
    end loop;
  end loop;

  update public.fiscal_documents
  set products_amount = v_products_amount,
      taxes_amount = v_taxes_amount,
      total_amount = v_products_amount - discount_amount + freight_amount + insurance_amount + other_expenses_amount + v_taxes_amount,
      status = 'CALCULATED'
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, message, created_by)
  values (v_document.company_id, v_document.id, 'CALCULATED',
    format('Total: %s (produtos %s + impostos %s)', v_document.total_amount, v_products_amount, v_taxes_amount), public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'UPDATE',
    null, jsonb_build_object('status', 'CALCULATED', 'total_amount', v_document.total_amount));

  return v_document;
end;
$$;

create or replace function public.fn_authorize_fiscal_document(
  p_fiscal_document_id uuid,
  p_access_key text,
  p_protocol text default null,
  p_receipt_number text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.update') then
    raise exception 'Permissão negada (fiscal_documents.update).' using errcode = '42501';
  end if;

  if v_document.status <> 'CALCULATED' then
    raise exception 'Só é possível autorizar um documento calculado (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  update public.fiscal_documents
  set status = 'AUTHORIZED', access_key = p_access_key, protocol = p_protocol, receipt_number = p_receipt_number
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, protocol, message, created_by)
  values (v_document.company_id, v_document.id, 'AUTHORIZED', p_protocol, 'Documento autorizado.', public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'AUTHORIZE',
    jsonb_build_object('status', 'CALCULATED'), jsonb_build_object('status', 'AUTHORIZED', 'access_key', p_access_key));

  return v_document;
end;
$$;

create or replace function public.fn_reject_fiscal_document(
  p_fiscal_document_id uuid,
  p_return_code text default null,
  p_rejection_reason text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.update') then
    raise exception 'Permissão negada (fiscal_documents.update).' using errcode = '42501';
  end if;

  if v_document.status <> 'CALCULATED' then
    raise exception 'Só é possível rejeitar um documento calculado (status atual: %).', v_document.status using errcode = 'P0001';
  end if;

  update public.fiscal_documents
  set status = 'REJECTED', return_code = p_return_code, rejection_reason = p_rejection_reason
  where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, status_code, message, created_by)
  values (v_document.company_id, v_document.id, 'REJECTED', p_return_code, p_rejection_reason, public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'REJECT',
    jsonb_build_object('status', 'CALCULATED'), jsonb_build_object('status', 'REJECTED', 'return_code', p_return_code));

  return v_document;
end;
$$;

-- ==================================================================
-- fn_cancel_fiscal_document — nunca apaga (seção 30). Bloqueada só a
-- partir de CANCELLED (idempotência por guarda de status — uma
-- segunda chamada falha claramente, nunca cancela duas vezes).
-- ==================================================================
create or replace function public.fn_cancel_fiscal_document(p_fiscal_document_id uuid, p_reason text default null)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.cancel') then
    raise exception 'Permissão negada (fiscal_documents.cancel).' using errcode = '42501';
  end if;

  if v_document.status = 'CANCELLED' then
    raise exception 'Documento já cancelado.' using errcode = 'P0001';
  end if;

  update public.fiscal_documents set status = 'CANCELLED' where id = p_fiscal_document_id
  returning * into v_document;

  insert into public.fiscal_document_events (company_id, fiscal_document_id, event_type, message, created_by)
  values (v_document.company_id, v_document.id, 'CANCELLED', coalesce(p_reason, 'Documento cancelado.'), public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'CANCEL',
    null, jsonb_build_object('status', 'CANCELLED', 'reason', p_reason));

  return v_document;
end;
$$;

revoke all on function public.fn_create_fiscal_document(uuid, uuid, text, text, uuid, uuid, uuid, date, date, text, text, integer, text, uuid, uuid, uuid, text) from public;
revoke all on function public.fn_add_fiscal_document_item(uuid, uuid, numeric, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric, text, uuid, text) from public;
revoke all on function public.fn_calculate_fiscal_document(uuid) from public;
revoke all on function public.fn_authorize_fiscal_document(uuid, text, text, text) from public;
revoke all on function public.fn_reject_fiscal_document(uuid, text, text) from public;
revoke all on function public.fn_cancel_fiscal_document(uuid, text) from public;
grant execute on function public.fn_create_fiscal_document(uuid, uuid, text, text, uuid, uuid, uuid, date, date, text, text, integer, text, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.fn_add_fiscal_document_item(uuid, uuid, numeric, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric, text, uuid, text) to authenticated;
grant execute on function public.fn_calculate_fiscal_document(uuid) to authenticated;
grant execute on function public.fn_authorize_fiscal_document(uuid, text, text, text) to authenticated;
grant execute on function public.fn_reject_fiscal_document(uuid, text, text) to authenticated;
grant execute on function public.fn_cancel_fiscal_document(uuid, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('fiscal_documents.view', 'fiscal_documents', 'view', 'Consultar documentos fiscais'),
    ('fiscal_documents.create', 'fiscal_documents', 'create', 'Criar documentos fiscais e adicionar itens'),
    ('fiscal_documents.update', 'fiscal_documents', 'update', 'Calcular, autorizar e rejeitar documentos fiscais'),
    ('fiscal_documents.cancel', 'fiscal_documents', 'cancel', 'Cancelar documentos fiscais'),
    ('fiscal_document_events.view', 'fiscal_document_events', 'view', 'Consultar eventos de documentos fiscais'),
    ('fiscal_document_events.create', 'fiscal_document_events', 'create', 'Registrar eventos manuais de documentos fiscais')
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
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_document_items enable row level security;
alter table public.fiscal_document_item_taxes enable row level security;
alter table public.fiscal_document_events enable row level security;

drop policy if exists fiscal_documents_select on public.fiscal_documents;
create policy fiscal_documents_select on public.fiscal_documents
  for select to authenticated using (public.has_permission(company_id, 'fiscal_documents.view'));

drop policy if exists fiscal_document_items_select on public.fiscal_document_items;
create policy fiscal_document_items_select on public.fiscal_document_items
  for select to authenticated using (public.has_permission(company_id, 'fiscal_documents.view'));

drop policy if exists fiscal_document_item_taxes_select on public.fiscal_document_item_taxes;
create policy fiscal_document_item_taxes_select on public.fiscal_document_item_taxes
  for select to authenticated using (public.has_permission(company_id, 'fiscal_documents.view'));

drop policy if exists fiscal_document_events_select on public.fiscal_document_events;
create policy fiscal_document_events_select on public.fiscal_document_events
  for select to authenticated using (public.has_permission(company_id, 'fiscal_document_events.view'));
