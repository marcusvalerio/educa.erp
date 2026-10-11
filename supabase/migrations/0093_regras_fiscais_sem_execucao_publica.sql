-- 0093 — fn_resolve_applicable_tax_rules executável por anon/authenticated.
--
-- A função é SECURITY DEFINER e não confere permissão: devolve as regras
-- fiscais (tipo de imposto, CST/CSOSN, alíquota, redução) de QUALQUER empresa
-- cujo id seja informado. A 0038 fez `revoke ... from public`, mas no Supabase
-- os papéis anon e authenticated recebem EXECUTE diretamente (privilégios
-- padrão do schema), então o revoke não os alcançava. Reproduzido localmente:
-- anon leu a regra sintética de uma empresa. Em produção, o catálogo mostra o
-- mesmo grant (consulta só de metadados, 11/10/2026).
--
-- Quem usa a função: fn_create_fiscal_document_from_sales_order (0039) e o
-- recálculo de impostos (0041), ambos SECURITY DEFINER — rodam como dono e
-- continuam podendo chamá-la. O app não a chama por RPC.
-- Idempotente; independente das demais migrations desta sequência.
revoke all on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  from public, anon, authenticated;
