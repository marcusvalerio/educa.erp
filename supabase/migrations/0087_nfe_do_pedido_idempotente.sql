-- 0087 — Rodada 2 (48 usuários), R2-19: gerar a NF-e do mesmo pedido duas vezes
-- respondia 201 ("criado") para as duas pessoas.
--
-- Encontrado (roteiro fiscal, cenário S7, execução final): Fiscal e Gerente
-- geram a NF-e do mesmo pedido ao mesmo tempo → 201 / 201, 1 documento.
-- O banco já impedia o 2º documento (fiscal_documents_source_unique +
-- fn_create_fiscal_document devolvendo o existente), então NÃO havia
-- duplicidade; mas quando a 2ª chamada chegava logo depois da 1ª gravar, ela
-- recebia o documento existente como se tivesse acabado de criá-lo. Quando as
-- duas chegavam juntas, a 2ª recebia 409. Resposta dependente do relógio.
--
-- Correção (mesmo desenho do título a receber, 0081): função que trava o
-- pedido (FOR UPDATE), confere a permissão na empresa do pedido, procura o
-- documento ativo desta origem e só então cria — e devolve se criou agora ou se
-- já existia. A API responde 201 só quando criou; senão 200 dizendo qual
-- documento já existe.

create or replace function public.fn_generate_fiscal_document_for_sales_order(
  p_sales_order_id uuid,
  p_fiscal_establishment_id uuid,
  p_operation_nature_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.sales_orders;
  v_existing public.fiscal_documents;
  v_document public.fiscal_documents;
begin
  select * into v_order from public.sales_orders where id = p_sales_order_id for update;
  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode = 'P0002';
  end if;
  -- Permissão ANTES de revelar se existe documento (isolamento entre empresas).
  if not public.has_permission(v_order.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  select * into v_existing from public.fiscal_documents
  where company_id = v_order.company_id and source_type = 'sales_order' and source_id = p_sales_order_id
    and status <> 'CANCELLED'
  order by created_at
  limit 1;
  if found then
    return jsonb_build_object('created', false, 'document', to_jsonb(v_existing), 'sales_order_code', v_order.code);
  end if;

  v_document := public.fn_create_fiscal_document_from_sales_order(
    p_sales_order_id, p_fiscal_establishment_id, p_operation_nature_id, p_notes
  );
  return jsonb_build_object('created', true, 'document', to_jsonb(v_document), 'sales_order_code', v_order.code);
end;
$$;

revoke all on function public.fn_generate_fiscal_document_for_sales_order(uuid, uuid, uuid, text) from public;
grant execute on function public.fn_generate_fiscal_document_for_sales_order(uuid, uuid, uuid, text) to authenticated;
