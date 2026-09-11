-- Fase "RLS / RBAC / Catálogo — rodada 1" — correção crítica.
--
-- A migration 0006 criou branches/permissions/roles/role_permissions/
-- user_roles SEM `enable row level security` (só as 10 tabelas
-- originais, da migration 0004, tinham isso). A 0007 criou policies em
-- cima dessas 5 tabelas sem RLS habilitado — Postgres ignora policy
-- sem RLS habilitado na tabela, ou seja, essas 5 tabelas ficaram
-- **sem proteção nenhuma** entre a 0006 e agora (confirmado via
-- get_advisors: "policy_exists_rls_disabled" e "rls_disabled_in_public",
-- nível ERROR). Corrigido aqui antes de qualquer outro avanço.
alter table public.branches enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

-- As funções de seed de papéis (fn_seed_default_roles /
-- fn_seed_default_roles_for_company) só deveriam rodar via o trigger
-- em `companies` (após insert) ou via migration/backfill — nunca
-- chamadas diretamente por um usuário via RPC
-- (`/rest/v1/rpc/fn_seed_default_roles_for_company`), o que deixaria
-- qualquer usuário autenticado (ou até anônimo) criar papéis 'admin'
-- extras para qualquer empresa. `has_permission`/
-- `current_user_company_ids` continuam executáveis por
-- anon/authenticated de propósito — são chamadas implicitamente pelas
-- próprias policies de RLS durante toda query, e precisam desse grant
-- para funcionar (get_advisors sinaliza as 4 juntas como INFO/WARN;
-- só as duas de seed precisavam ser revogadas).
revoke execute on function public.fn_seed_default_roles() from public, anon, authenticated;
revoke execute on function public.fn_seed_default_roles_for_company(uuid) from public, anon, authenticated;
