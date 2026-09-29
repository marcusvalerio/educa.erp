-- 0078 — NF-e numa empresa recém-criada: o que falta, dito de uma vez
-- (E2E NOVA ORBITA, P8 e P9).
--
-- P8. Gerar a NF-e de um pedido cujo produto não tinha NCM, ou cuja natureza
--     de operação não tinha CFOP padrão, parava no primeiro item e a regra
--     chegava ao usuário como HTTP 500 genérico. A API passa a devolver as
--     regras do banco como 422 (src/lib/database/errors.ts) e, aqui, a geração
--     confere TODOS os pré-requisitos antes de criar o rascunho e responde com
--     a lista: cada produto sem NCM e/ou sem CFOP, e onde corrigir. Nada é
--     gravado quando falta algo (antes, o rascunho vazio podia ficar criado).
--
-- P9. fn_fiscal_setup_status: situação dos pré-requisitos da primeira NF-e da
--     empresa (estabelecimento emitente, natureza de saída com CFOP padrão,
--     CFOP e NCM cadastrados, produtos ativos com NCM), para a orientação no
--     módulo Fiscal. Só leitura; exige fiscal_documents.view.

create or replace function public.fn_create_fiscal_document_from_sales_order(
  p_sales_order_id uuid,
  p_fiscal_establishment_id uuid,
  p_operation_nature_id uuid,
  p_notes text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_document public.fiscal_documents;
  v_nature public.fiscal_operation_natures;
  v_item record;
  v_qty numeric;
  v_missing text;
  v_fixes text[] := array[]::text[];
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

  -- Pré-requisitos (P8): por produto, NCM (perfil fiscal ativo) e CFOP (vem
  -- do CFOP padrão da natureza de operação escolhida).
  select * into v_nature from public.fiscal_operation_natures
  where id = p_operation_nature_id and company_id = v_order.company_id;

  select string_agg(
           format('o produto %s precisa de %s', p.code || ' — ' || p.name,
                  array_to_string(array_remove(array[
                    case when not x.has_ncm then 'NCM' end,
                    case when x.needs_cfop then 'CFOP' end
                  ], null), ' e ')),
           '; ' order by p.code)
    into v_missing
  from (
    select distinct i.product_id,
      exists (
        select 1 from public.product_fiscal_profiles pf
        where pf.company_id = v_order.company_id and pf.product_id = i.product_id
          and pf.status = 'active' and pf.ncm_id is not null
      ) as has_ncm,
      (v_nature.id is not null and v_nature.default_cfop_id is null) as needs_cfop
    from public.sales_order_items i
    where i.order_id = p_sales_order_id
      and (case when i.shipped_quantity > 0 then i.shipped_quantity else i.ordered_quantity - i.cancelled_quantity end) > 0
  ) x
  join public.products p on p.id = x.product_id
  where not x.has_ncm or x.needs_cfop;

  if v_missing is not null then
    if v_missing like '%NCM%' then
      v_fixes := v_fixes || 'cadastre o NCM no perfil fiscal do produto (Fiscal → NCM e perfil fiscal)'::text;
    end if;
    if v_missing like '%CFOP%' then
      v_fixes := v_fixes || format('configure o CFOP padrão da natureza de operação «%s» (Fiscal → CFOP)', v_nature.name);
    end if;
    raise exception 'Não é possível gerar a NF-e do pedido %: %. Para corrigir: %.',
      v_order.code, v_missing, array_to_string(v_fixes, '; ') using errcode = 'P0001';
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
  end if;

  return v_document;
end;
$$;

-- ------------------------------------------------------------------ P9
create or replace function public.fn_fiscal_setup_status(p_company_id uuid)
returns table(
  establishments integer,
  outbound_natures integer,
  outbound_natures_with_cfop integer,
  cfops integer,
  ncms integer,
  active_products integer,
  products_with_ncm integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'fiscal_documents.view') then
    raise exception 'Permissão negada (fiscal_documents.view).' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.fiscal_establishments fe where fe.company_id = p_company_id and fe.status = 'active'),
    (select count(*)::integer from public.fiscal_operation_natures n where n.company_id = p_company_id and n.status = 'active' and n.direction = 'SAIDA'),
    (select count(*)::integer from public.fiscal_operation_natures n where n.company_id = p_company_id and n.status = 'active' and n.direction = 'SAIDA' and n.default_cfop_id is not null),
    (select count(*)::integer from public.fiscal_cfops c where c.company_id = p_company_id and c.status = 'active'),
    (select count(*)::integer from public.fiscal_ncms n where n.company_id = p_company_id and n.status = 'active'),
    (select count(*)::integer from public.products p where p.company_id = p_company_id and p.status = 'active'),
    (select count(distinct pf.product_id)::integer from public.product_fiscal_profiles pf
      join public.products p on p.id = pf.product_id and p.status = 'active'
      where pf.company_id = p_company_id and pf.status = 'active' and pf.ncm_id is not null);
end;
$$;

comment on function public.fn_fiscal_setup_status(uuid) is
  'Pré-requisitos da primeira NF-e da empresa (orientação do módulo Fiscal, 0078).';

revoke all on function public.fn_fiscal_setup_status(uuid) from public, anon;
grant execute on function public.fn_fiscal_setup_status(uuid) to authenticated;
