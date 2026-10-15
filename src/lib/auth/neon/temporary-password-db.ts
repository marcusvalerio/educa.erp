import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/database/errors";
import type { PendingState } from "./temporary-password";

// Leituras/gravações da senha provisória (0095) que só o servidor faz
// (service_role). A identidade vem da sessão do Neon já verificada — nunca do
// corpo da requisição.

/** Senha provisória pendente desta identidade do Neon. */
export async function temporaryPasswordState(neonUserId: string): Promise<PendingState | null> {
  const { data, error } = await createAdminClient().rpc("fn_temporary_password_state", { p_provider: "neon", p_external_user_id: neonUserId });
  if (error) throw new ApiError("AUTH_UNAVAILABLE", "O serviço de autenticação não respondeu. Tente novamente.", 503);
  if (!data) return null;
  const r = data as { id: string; auth_user_id: string; status: "pending" | "expired" };
  return { id: r.id, authUserId: r.auth_user_id, status: r.status };
}

/** Troca concluída: consome a provisória e liga o login ao cadastro. */
export async function consumeTemporaryPassword(recordId: string, authUserId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("fn_consume_temporary_password", { p_id: recordId, p_auth_user_id: authUserId });
  if (error) throw new ApiError("TEMPORARY_PASSWORD_FAILED", error.message, 409);
}
