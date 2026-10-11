-- 0086 — Rodada 2 (48 usuários), R2-18: a criação de documentos comerciais e de
-- compras não aparecia na trilha de auditoria.
--
-- Encontrado: pedido de venda, orçamento, solicitação de compra e pedido de
-- compra gravavam o autor em created_by/requested_by, mas a trilha só começava
-- na aprovação (APPROVE). O envio do pedido para aprovação (rascunho →
-- pendente) também não deixava registro. Quem criou só era descoberto lendo a
-- tabela, e o filtro "autor" da tela de auditoria não encontrava a criação.
--
-- Correção: gatilho AFTER INSERT em cada tabela grava uma linha CREATE com o
-- autor real (o usuário da sessão; na falta dele, o autor gravado no próprio
-- documento) e o código/total. O pedido de venda ganha também SUBMIT na
-- transição draft → pending_approval. O nome do autor é resolvido pelo gatilho
-- já existente em audit_logs (fn_audit_logs_resolve_actor). Nada muda nas
-- funções de negócio; não há ajuste de dados antigos (a trilha não é reescrita).

-- Ação nova na trilha: SUBMIT (enviado para aprovação). A lista de ações
-- permitidas é recriada com todas as anteriores + SUBMIT.
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action = any (array[
  'CREATE','UPDATE','DELETE','ACTIVATE','INACTIVATE','APPROVE','CANCEL','RECEIVE','CONFIRM','REJECT',
  'PICK','PACK','SHIP','DELIVER','FAIL','RETURN','RELEASE','START','CONSUME','COMPLETE','SCRAP','PAY',
  'REVERSE','RECONCILE','AUTHORIZE','EVENT','CONFIGURE','EXPORT','GRANT','REVOKE','ENABLE','DISABLE',
  'ASSIGN','UNASSIGN','SUSPEND','RESUME','RESERVE','SUBMIT'
]::text[]));

create or replace function public.fn_audit_document_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_author uuid;
  v_json jsonb := to_jsonb(NEW);
begin
  v_author := coalesce(
    public.current_app_user_id(),
    nullif(v_json->>'created_by', '')::uuid,
    nullif(v_json->>'requested_by', '')::uuid
  );
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    NEW.company_id, v_author, 'system', TG_TABLE_NAME, NEW.id, 'CREATE', null,
    jsonb_strip_nulls(jsonb_build_object(
      'code', v_json->>'code',
      'status', v_json->>'status',
      'total_amount', v_json->'total_amount',
      'customer_id', v_json->'customer_id',
      'supplier_id', v_json->'supplier_id'
    ))
  );
  return NEW;
end;
$$;

create or replace function public.fn_audit_sales_order_submitted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (
    NEW.company_id, public.current_app_user_id(), 'system', 'sales_orders', NEW.id, 'SUBMIT',
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status, 'code', NEW.code, 'total_amount', NEW.total_amount)
  );
  return NEW;
end;
$$;

revoke all on function public.fn_audit_document_created() from public;
revoke all on function public.fn_audit_sales_order_submitted() from public;

drop trigger if exists audit_created on public.sales_orders;
create trigger audit_created after insert on public.sales_orders
  for each row execute function public.fn_audit_document_created();

drop trigger if exists audit_created on public.sales_quotes;
create trigger audit_created after insert on public.sales_quotes
  for each row execute function public.fn_audit_document_created();

drop trigger if exists audit_created on public.purchase_requests;
create trigger audit_created after insert on public.purchase_requests
  for each row execute function public.fn_audit_document_created();

drop trigger if exists audit_created on public.purchase_orders;
create trigger audit_created after insert on public.purchase_orders
  for each row execute function public.fn_audit_document_created();

drop trigger if exists audit_submitted on public.sales_orders;
create trigger audit_submitted after update of status on public.sales_orders
  for each row
  when (OLD.status = 'draft' and NEW.status = 'pending_approval')
  execute function public.fn_audit_sales_order_submitted();
