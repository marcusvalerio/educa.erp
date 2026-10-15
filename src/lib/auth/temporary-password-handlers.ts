import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { dbError, requireCompanyUser, type IdRouteContext } from "@/lib/api/governance";
import { ApiError } from "@/lib/database/errors";
import { authProvider } from "./provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureShadowLogin, link } from "./provisioning";
import {
  adminCreateUser,
  adminFindUserByEmail,
  adminMarkEmailVerified,
  adminRevokeUserSessions,
  adminSetUserPassword,
  NeonAuthError,
} from "@/lib/auth/neon/client";
import { neonConfig, withServiceSession } from "@/lib/auth/neon/server";
import { issueTemporaryPasswordFlow, revokeTemporaryPasswordFlow, type IssuedRecord } from "@/lib/auth/neon/temporary-password";

// /api/admin/users/:id/temporary-password — senha provisória (0095).
//
// O banco decide quem pode gerar para quem (cliente DO ADMINISTRADOR: RLS e
// has_permission). O servidor só fala com o Neon Auth. A senha volta UMA vez
// nesta resposta (no-store) e não é gravada nem registrada em lugar nenhum.

const DEFAULT_TTL_HOURS = 72;

function neonOnly() {
  if (authProvider() !== "neon") {
    throw new ApiError("NOT_AVAILABLE", "A senha provisória está disponível só com o login do Neon Auth. Use o convite por e-mail.", 404);
  }
}

function providerError(error: unknown): never {
  if (error instanceof NeonAuthError) {
    throw new ApiError("AUTH_UNAVAILABLE", "O serviço de autenticação não respondeu. Nada foi alterado; tente novamente.", 503);
  }
  throw error;
}

const noStore = (data: unknown, status = 200) =>
  NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

// POST /api/admin/users/:id/temporary-password
export async function issueTemporaryPassword(request: NextRequest, context: IdRouteContext) {
  try {
    neonOnly();
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const config = neonConfig(request.nextUrl.origin);
    const service = createAdminClient();
    const asAdmin = <T>(run: (cookie: string) => Promise<T>) => withServiceSession(config, run);
    const result = await issueTemporaryPasswordFlow({
      issueRecord: async () => {
        const { data, error } = await supabase.rpc("fn_issue_temporary_password", { p_user_id: id, p_ttl_hours: DEFAULT_TTL_HOURS });
        if (error) throw dbError(error);
        const r = data as { id: string; email: string; user_name: string; auth_user_id: string | null; expires_at: string };
        return { id: r.id, email: r.email, userName: r.user_name, authUserId: r.auth_user_id, expiresAt: r.expires_at } satisfies IssuedRecord;
      },
      revokeRecord: async () => {
        const { error } = await supabase.rpc("fn_revoke_temporary_password", { p_user_id: id });
        if (error) throw dbError(error);
      },
      ensureShadowLogin,
      attachLogin: async (recordId, authUserId) => {
        const { error } = await service.rpc("fn_attach_temporary_password_login", { p_id: recordId, p_auth_user_id: authUserId });
        if (error) throw dbError(error);
      },
      findNeonUser: (email) => asAdmin((c) => adminFindUserByEmail(config, c, email)),
      createNeonUser: (email, name) => asAdmin((c) => adminCreateUser(config, c, { email, name })),
      link,
      setPassword: (userId, password) => asAdmin((c) => adminSetUserPassword(config, c, userId, password)),
      markEmailVerified: (userId) => asAdmin((c) => adminMarkEmailVerified(config, c, userId)),
      revokeSessions: (userId) => asAdmin((c) => adminRevokeUserSessions(config, c, userId)),
    }).catch(providerError);
    return noStore(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE /api/admin/users/:id/temporary-password
export async function revokeTemporaryPassword(request: NextRequest, context: IdRouteContext) {
  try {
    neonOnly();
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const config = neonConfig(request.nextUrl.origin);
    const asAdmin = <T>(run: (cookie: string) => Promise<T>) => withServiceSession(config, run);
    const result = await revokeTemporaryPasswordFlow({
      revokeRecord: async () => {
        const { data, error } = await supabase.rpc("fn_revoke_temporary_password", { p_user_id: id });
        if (error) throw dbError(error);
        const r = data as { revoked: boolean; email: string };
        return { revoked: r.revoked, email: r.email };
      },
      findNeonUser: (email) => asAdmin((c) => adminFindUserByEmail(config, c, email)),
      setPassword: (userId, password) => asAdmin((c) => adminSetUserPassword(config, c, userId, password)),
      revokeSessions: (userId) => asAdmin((c) => adminRevokeUserSessions(config, c, userId)),
    }).catch(providerError);
    return noStore(result);
  } catch (error) {
    return jsonError(error);
  }
}
