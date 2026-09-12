-- Fase 5 — Logística/Expedição: três ajustes aditivos a migrations
-- anteriores, necessários antes de criar qualquer tabela nova desta
-- etapa (mesmo espírito de 0017 — corrigir incrementalmente, nunca
-- destrutivamente, quando uma migration anterior não previu algo que
-- a etapa atual precisa).
--
-- 1) sales_orders.status (0021) já previa picking/ready_to_ship/
--    shipped/completed, mas não um estado intermediário para "parte do
--    pedido já saiu, parte ainda não" — necessário porque expedição
--    parcial é requisito explícito desta etapa (um pedido pode ter
--    várias expedições; fn_ship_shipment, em 0024, precisa de um status
--    que reflita isso sem forçar o pedido inteiro para 'shipped' antes
--    da hora).
--
-- 2) audit_logs.action (0003, ampliado em 0017 para incluir APPROVE/
--    CANCEL/RECEIVE/CONFIRM/REJECT) ainda não inclui PICK/PACK/SHIP/
--    DELIVER/FAIL/RETURN — vocabulário explicitamente pedido nesta
--    etapa (seção 27) para picking/expedição/entrega.
--
-- 3) purchase_order_items (0016) e sales_order_items (0021) nunca
--    receberam `unique (id, company_id)` — um bug real encontrado
--    nesta etapa: purchase_receipt_items (0018) já referencia
--    purchase_order_items via FK composta (purchase_order_item_id,
--    company_id), que exige exatamente essa constraint no lado
--    referenciado. Sem ela, 0018 falharia ao ser aplicada. pick_lists
--    e shipments (0023/0024, desta etapa) precisam do equivalente em
--    sales_order_items pelo mesmo motivo — corrigidos juntos aqui.
--
-- Mesma técnica não destrutiva já usada em 0017: localiza o nome real
-- de cada constraint dinamicamente (nunca um nome adivinhado
-- hardcoded) e a substitui por uma versão ampliada, aditiva.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.sales_orders'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%draft%';

  if v_conname is not null then
    execute format('alter table public.sales_orders drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.sales_orders
  add constraint sales_orders_status_check
  check (status in (
    'draft', 'pending_approval', 'approved', 'reservation_pending', 'reserved',
    'picking', 'ready_to_ship', 'partially_shipped', 'shipped', 'completed', 'cancelled'
  ));

comment on column public.sales_orders.status is
  'Workflow completo: draft -> pending_approval -> approved -> reservation_pending -> reserved -> picking -> ready_to_ship -> partially_shipped -> shipped -> completed. partially_shipped adicionado em 0022 — ver fn_ship_shipment (0024), que o usa quando soma(shipped_quantity + cancelled_quantity) ainda não cobre soma(ordered_quantity) de todos os itens.';

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.audit_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action%';

  if v_conname is not null then
    execute format('alter table public.audit_logs drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'INACTIVATE',
    'APPROVE', 'CANCEL', 'RECEIVE', 'CONFIRM', 'REJECT',
    'PICK', 'PACK', 'SHIP', 'DELIVER', 'FAIL', 'RETURN'
  ));

comment on column public.audit_logs.action is
  'Vocabulário: CREATE/UPDATE/DELETE/ACTIVATE/INACTIVATE (cadastros e documentos de estoque) + APPROVE/CANCEL/RECEIVE/CONFIRM/REJECT (Compras, 0017) + PICK/PACK/SHIP/DELIVER/FAIL/RETURN (Logística/Expedição, 0022). Ampliar aqui sempre que um novo módulo precisar, nunca criar uma segunda tabela de auditoria.';

-- Corrige o bug descrito no item 3 do cabeçalho: ambas as tabelas já
-- têm (id) como chave primária — isso só adiciona a constraint
-- composta que faltava, sem tocar em nenhuma linha existente.
alter table public.purchase_order_items
  add constraint purchase_order_items_id_company_id_key unique (id, company_id);

alter table public.sales_order_items
  add constraint sales_order_items_id_company_id_key unique (id, company_id);
