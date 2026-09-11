import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEV_ACTOR_LABEL } from "@/lib/database/constants";

// Resolve o usuário autenticado (Supabase Auth) para o cadastro
// correspondente em public.users e sua empresa. Esta é a ÚNICA fonte de
// verdade para "quem está fazendo a chamada" e "de qual empresa" — as
// rotas de API nunca devem confiar em um company_id vindo do cliente.
//
// A busca em public.users usa o cliente admin (service_role) por ser uma
// resolução de identidade interna (o próprio usuário lendo seu vínculo),
// não uma leitura de dados de negócio — a autorização real por recurso
// acontece em hasPermission(), que roda como o usuário autenticado de
// fato (RLS/has_permission no banco), não como service_role.
export type AuthContext = {
  authUserId: string;
  appUserId: string;
  companyId: string;
  actorLabel: string;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const admin = createAdminClient();
  const { data: appUser, error: userError } = await admin
    .from("users")
    .select("id, company_id, name, email, status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (userError || !appUser || appUser.status !== "active") return null;

  return {
    authUserId: data.user.id,
    appUserId: appUser.id as string,
    companyId: appUser.company_id as string,
    actorLabel: (appUser.name as string | null) ?? (appUser.email as string | null) ?? DEV_ACTOR_LABEL,
  };
}

// Verifica a permissão chamando a função has_permission diretamente no
// Postgres, no contexto do usuário autenticado (mesma sessão/cookies —
// respeita RLS). Evita duplicar em TypeScript a lógica de junção
// users/user_roles/roles/role_permissions/permissions que já vive, uma
// única vez, no banco (supabase/migrations/0006_rls_functions_and_policies.sql).
export async function hasPermission(companyId: string, permissionCode: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    p_company_id: companyId,
    p_permission_code: permissionCode,
  });
  if (error) {
    console.error("[auth] has_permission RPC falhou:", error.message);
    return false;
  }
  return data === true;
}
