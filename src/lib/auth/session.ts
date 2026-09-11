import "server-only";

import { createClient } from "@/lib/supabase/server";
import { forbiddenError, unauthenticatedError } from "@/lib/database/errors";

// Helpers de sessão/autorização baseados no usuário autenticado real
// (Supabase Auth + cookies, via src/lib/supabase/server.ts — o cliente
// que respeita RLS). Não são usados ainda pelas 8 rotas /api/* de
// cadastro (que seguem no cliente admin/service_role — ver
// docs/AUTH_ARCHITECTURE.md para o porquê) — servem hoje a /api/me e
// ficam prontos para qualquer rota nova adotar quando fizer sentido.
//
// A autoridade de verdade é o RLS no banco (has_permission(), policies
// — ver supabase/migrations/0007_rls_real_policies.sql). Estes helpers
// só refletem a mesma decisão no nível da API, para poder responder
// 401/403 com uma mensagem amigável antes de tocar o repositório —
// não são "a" segurança, são a experiência de erro.

export type SessionUser = {
  authUserId: string;
  email: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { authUserId: data.user.id, email: data.user.email ?? null };
}

export type CurrentBusinessUser = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  status: "active" | "inactive";
};

// Uma pessoa pode ter mais de uma linha em `users` (uma por empresa em
// que atua — ver supabase/migrations/0006_rbac_foundation.sql, seção
// "Empresa ↔ usuário"). Por isso isto retorna uma lista, não um único
// registro. RLS (`users_select`) já garante que só vêm linhas cujo
// auth_user_id é o do usuário logado.
export async function getCurrentBusinessUsers(): Promise<CurrentBusinessUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, company_id, name, email, status")
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    email: row.email as string,
    status: row.status as "active" | "inactive",
  }));
}

export async function getPermissionsForCompany(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_user_permissions", { p_company_id: companyId });
  if (error) throw error;
  return (data ?? []).map((row: { code: string }) => row.code);
}

export async function hasPermission(companyId: string, code: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", { p_company_id: companyId, p_code: code });
  if (error) throw error;
  return Boolean(data);
}

// Para uma rota nova que queira exigir sessão + permissão (ver
// docstring acima — nenhuma das 8 rotas de cadastro existentes usa
// isto ainda). Lança ApiError 401/403 prontos para `jsonError()`.
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthenticatedError();
  return user;
}

export async function requirePermission(companyId: string, code: string): Promise<void> {
  const allowed = await hasPermission(companyId, code);
  if (!allowed) throw forbiddenError();
}
