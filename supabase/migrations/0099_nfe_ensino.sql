-- 0099 — NF-e em modo ensino: emissão fiel ao layout oficial, sem valor fiscal.
--
-- 1) Total da nota: ICMS, PIS e COFINS são "por dentro" (já estão no preço)
--    e não somam ao total. Só IPI e ICMS-ST são "por fora". Até aqui o
--    cálculo somava todos os impostos ao total — errado para NF-e.
--    taxes_amount passa a guardar só os impostos que somam ao total, e a
--    conferência (fn_mark_fiscal_document_ready) continua coerente.
-- 2) Nota gerada do pedido de venda herda o frete do pedido; item sem perfil
--    fiscal usa o NCM do cadastro do produto.
-- 3) fn_issue_fiscal_document_education: numera (se preciso), registra a
--    tentativa, guarda o XML gerado e autoriza em ambiente de homologação
--    (tpAmb=2), tudo numa transação. Atualiza os dados fiscais do pedido.
--
-- Pode rodar de novo: create or replace / if not exists.

alter table public.fiscal_document_files add column if not exists content text;
comment on column public.fiscal_document_files.content is
  'Conteúdo do arquivo quando guardado no próprio banco (XML da NF-e de ensino).';

-- ------------------------------------------------------------------ 1
create or replace function public.fn_calculate_fiscal_document(p_fiscal_document_id uuid)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
  v_all_taxes numeric := 0;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.calculate') then
    raise exception 'Permissão negada (fiscal_documents.calculate).' using errcode = '42501';
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
      v_all_taxes := v_all_taxes + v_amount;
      -- Só os impostos "por fora" somam ao total da nota.
      if v_tax.tax_type in ('IPI', 'ICMS_ST') then
        v_taxes_amount := v_taxes_amount + v_amount;
      end if;

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
    format('Total: %s (produtos %s; impostos destacados %s, dos quais %s somam ao total)', v_document.total_amount, v_products_amount, v_all_taxes, v_taxes_amount),
    public.current_app_user_id());

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_document.company_id, public.current_app_user_id(), 'system', 'fiscal_documents', v_document.id, 'UPDATE',
    null, jsonb_build_object('status', 'CALCULATED', 'total_amount', v_document.total_amount));

  return v_document;
end;
$function$;

-- ------------------------------------------------------------------ 2
create or replace function public.fn_create_fiscal_document_from_sales_order(p_sales_order_id uuid, p_fiscal_establishment_id uuid, p_operation_nature_id uuid, p_notes text default null)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order public.sales_orders;
  v_document public.fiscal_documents;
  v_item record;
  v_qty numeric;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  if v_order.status in ('draft', 'pending_approval', 'cancelled') then
    raise exception 'Só é possível gerar documento fiscal a partir de um pedido aprovado (status atual: %).', v_order.status using errcode = 'P0001';
  end if;

  v_document := public.fn_create_fiscal_document(
    p_company_id => v_order.company_id,
    p_fiscal_establishment_id => p_fiscal_establishment_id,
    p_type => 'NFE',
    p_direction => 'SAIDA',
    p_operation_nature_id => p_operation_nature_id,
    p_customer_id => v_order.customer_id,
    p_carrier_id => v_order.carrier_id,
    p_source_type => 'sales_order',
    p_source_id => v_order.id,
    p_notes => p_notes
  );

  if v_document.status = 'DRAFT' and not exists (select 1 from public.fiscal_document_items where fiscal_document_id = v_document.id) then
    for v_item in select * from public.sales_order_items where order_id = p_sales_order_id
    loop
      v_qty := case when v_item.shipped_quantity > 0 then v_item.shipped_quantity else v_item.ordered_quantity - v_item.cancelled_quantity end;
      if v_qty > 0 then
        perform public.fn_add_fiscal_document_item(
          p_fiscal_document_id => v_document.id,
          p_product_id => v_item.product_id,
          p_quantity => v_qty,
          p_unit_price => v_item.unit_price,
          p_unit => v_item.unit,
          p_discount => coalesce(v_item.discount, 0),
          p_source_reference_type => 'sales_order_item',
          p_source_reference_id => v_item.id
        );
      end if;
    end loop;

    update public.fiscal_documents
       set freight_amount = coalesce(v_order.freight_cost, 0),
           freight_mode = case when coalesce(v_order.freight_cost, 0) > 0 then 'EMITENTE' else coalesce(freight_mode, 'SEM_FRETE') end
     where id = v_document.id
    returning * into v_document;
  end if;

  return v_document;
end;
$function$;

-- ------------------------------------------------------------------ 2b
-- Item sem perfil fiscal usa o NCM do cadastro do produto.
create or replace function public.fn_add_fiscal_document_item(p_fiscal_document_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_ncm_code text DEFAULT NULL::text, p_ncm_description text DEFAULT NULL::text, p_cfop_code text DEFAULT NULL::text, p_origin_code text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_discount numeric DEFAULT 0, p_freight_amount numeric DEFAULT 0, p_insurance_amount numeric DEFAULT 0, p_other_expenses numeric DEFAULT 0, p_source_reference_type text DEFAULT NULL::text, p_source_reference_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS fiscal_document_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Sem perfil fiscal: usa o NCM do cadastro do produto (8 dígitos).
  if v_ncm_code is null and length(regexp_replace(coalesce(v_product.ncm, ''), '\D', '', 'g')) = 8 then
    v_ncm_code := regexp_replace(v_product.ncm, '\D', '', 'g');
    select * into v_ncm from public.fiscal_ncms where company_id = v_document.company_id and code = v_ncm_code and status = 'active' limit 1;
    if found then
      v_ncm_id := v_ncm.id;
      v_ncm_description := coalesce(v_ncm_description, v_ncm.description);
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
    raise exception 'Produto % sem NCM: informe o NCM no cadastro do produto (8 dígitos) ou no perfil fiscal.', v_product.name using errcode = 'P0001';
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
$function$;

-- ------------------------------------------------------------------ 3
create or replace function public.fn_issue_fiscal_document_education(
  p_fiscal_document_id uuid,
  p_access_key text,
  p_protocol text,
  p_xml text
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_document public.fiscal_documents;
  v_attempt public.fiscal_authorization_attempts;
  v_version integer;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id for update;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_documents.authorize')
     or not public.has_permission(v_document.company_id, 'fiscal_documents.submit_authorization') then
    raise exception 'Permissão negada (emitir documento fiscal).' using errcode = '42501';
  end if;

  if v_document.status <> 'READY' then
    raise exception 'Só é possível emitir uma nota com a conferência concluída (status atual: %).', v_document.status using errcode = 'P0001';
  end if;
  if v_document.number is null then
    raise exception 'A nota ainda não tem número.' using errcode = 'P0001';
  end if;
  if p_access_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso inválida (precisa ter 44 dígitos).' using errcode = '22023';
  end if;
  if coalesce(p_xml, '') = '' then
    raise exception 'XML da nota não informado.' using errcode = '22023';
  end if;

  update public.fiscal_documents
     set environment = 'HOMOLOGATION', issue_date = current_date, model = coalesce(model, '55')
   where id = p_fiscal_document_id;

  v_attempt := public.fn_begin_fiscal_document_authorization(p_fiscal_document_id, 'ENSINO', p_access_key);

  select coalesce(max(version), 0) + 1 into v_version
    from public.fiscal_document_files
   where fiscal_document_id = p_fiscal_document_id and file_type = 'XML_AUTHORIZED';

  insert into public.fiscal_document_files (company_id, fiscal_document_id, file_type, version, storage_reference, content_hash, content, created_by)
  values (v_document.company_id, p_fiscal_document_id, 'XML_AUTHORIZED', v_version,
          'db:fiscal_document_files.content', encode(sha256(convert_to(p_xml, 'UTF8')), 'hex'), p_xml, public.current_app_user_id());

  perform public.fn_process_fiscal_authorization_response(
    v_attempt.id, 'AUTHORIZED', p_access_key, p_protocol, null, '100', 'Autorizado o uso da NF-e (ambiente de homologação — ensino).', 'db:fiscal_document_files.content'
  );

  update public.fiscal_documents set return_code = '100', return_message = 'Autorizado o uso da NF-e'
   where id = p_fiscal_document_id
  returning * into v_document;

  if v_document.source_type = 'sales_order' and v_document.source_id is not null then
    update public.sales_orders
       set fiscal_document_type = 'NFE', fiscal_document_number = v_document.number::text,
           fiscal_document_series = v_document.series, fiscal_access_key = p_access_key, fiscal_status = 'authorized'
     where id = v_document.source_id and company_id = v_document.company_id;
  end if;

  return v_document;
end;
$function$;

revoke execute on function public.fn_issue_fiscal_document_education(uuid, text, text, text) from public, anon;
grant execute on function public.fn_issue_fiscal_document_education(uuid, text, text, text) to authenticated, service_role;
revoke execute on function public.fn_calculate_fiscal_document(uuid) from public, anon;
grant execute on function public.fn_calculate_fiscal_document(uuid) to authenticated, service_role;
revoke execute on function public.fn_create_fiscal_document_from_sales_order(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.fn_create_fiscal_document_from_sales_order(uuid, uuid, uuid, text) to authenticated, service_role;
revoke execute on function public.fn_add_fiscal_document_item(uuid, uuid, numeric, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric, text, uuid, text) from public, anon;
grant execute on function public.fn_add_fiscal_document_item(uuid, uuid, numeric, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric, text, uuid, text) to authenticated, service_role;
