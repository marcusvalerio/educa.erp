-- 0094 — Privilégio mínimo nas 4 views de relatório e na função de regras
-- fiscais (revisão da contenção de segurança, 12/10/2026).
--
-- A 0091 tornou as views security_invoker e tirou o acesso de anon; a 0093
-- tirou a execução de anon/authenticated da função de regras fiscais. A
-- revisão dos privilégios EFETIVOS em produção (metadados, 12/10) mostrou:
--   * authenticated tem TODOS os privilégios nas 4 views (arwdDxtm: inclusive
--     INSERT/UPDATE/DELETE/TRUNCATE), e nenhum consumidor legítimo usa a view
--     com o papel do usuário: o app lê v_cash_flow_summary,
--     v_cash_flow_projection e inventory_valuation com o cliente
--     administrativo (service_role) e v_sales_order_item_margin só é lida por
--     funções SECURITY DEFINER (fn_margin_by_*, fn_report_*), que rodam como
--     dono e conferem has_permission(p_company_id, …);
--   * service_role tem EXECUTE em fn_resolve_applicable_tax_rules, mas o app
--     não a chama por RPC; a única chamadora é fn_calculate_fiscal_document
--     (SECURITY DEFINER, roda como dono, confere fiscal_documents.calculate).
--
-- Fica: views só para o dono e service_role (que já tinham); função só para o
-- dono. security_invoker (0091) continua como segunda barreira: se alguém
-- voltar a conceder SELECT a authenticated, o RLS das tabelas limita à empresa.
-- Não altera dados, policies nem funções. Idempotente; independe das demais
-- migrations além das views/função existirem.

revoke all on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin
  from public, anon, authenticated;

revoke all on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  from public, anon, authenticated, service_role;
