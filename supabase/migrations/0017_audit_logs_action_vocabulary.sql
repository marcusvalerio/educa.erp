-- Fase 3 — Compras/Suprimentos: amplia o vocabulário de
-- audit_logs.action.
--
-- audit_logs (migration 0003) só aceitava CREATE/UPDATE/DELETE/
-- ACTIVATE/INACTIVATE. As migrations 0014 (Solicitação de Compra) e
-- 0016 (Pedido de Compra), já escritas nesta etapa, registram eventos
-- com action = APPROVE/CANCEL — e 0018 (Recebimento) precisará de
-- RECEIVE/CONFIRM/REJECT (pedido explícito: "Registrar eventos
-- importantes: CREATE, UPDATE, APPROVE, CANCEL, RECEIVE, CONFIRM,
-- REJECT. Não criar outro sistema de auditoria."). Sem esta migration,
-- qualquer chamada a fn_approve_purchase_request/fn_cancel_purchase_order/
-- fn_select_purchase_quote_supplier falharia em runtime contra a
-- constraint original.
--
-- Reutiliza a MESMA tabela audit_logs (nenhum sistema paralelo) — só
-- amplia o CHECK, de forma aditiva e não destrutiva, exatamente como
-- pedido. O nome da constraint original é localizado dinamicamente
-- (não fica hardcoded um nome adivinhado) para não arriscar um "DROP
-- CONSTRAINT does not exist" caso a convenção de nome do Postgres
-- para esta coluna seja diferente do esperado.
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
    'APPROVE', 'CANCEL', 'RECEIVE', 'CONFIRM', 'REJECT'
  ));

comment on column public.audit_logs.action is
  'Vocabulário: CREATE/UPDATE/DELETE/ACTIVATE/INACTIVATE (cadastros e documentos de estoque) + APPROVE/CANCEL/RECEIVE/CONFIRM/REJECT (workflow de Compras/Suprimentos, desde 0014/0016/0018). Ampliar aqui, nunca criar uma segunda tabela de auditoria.';
