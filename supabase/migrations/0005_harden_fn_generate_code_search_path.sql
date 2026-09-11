-- Fase Supabase (ASTRA.ERP) — hardening de segurança
--
-- Corrige o advisory "function_search_path_mutable" do linter de segurança
-- do Supabase: fixa o search_path da função de geração de código para
-- evitar hijacking via schemas anteriores na search_path da sessão/role.
-- Não muda comportamento nenhum, só fecha uma superfície de ataque
-- conhecida em funções trigger/SECURITY DEFINER sem search_path fixo.

alter function public.fn_generate_code() set search_path = public, extensions;
