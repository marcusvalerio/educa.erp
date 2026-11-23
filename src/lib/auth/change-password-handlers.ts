import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/api/response";
import { ApiError, validationError } from "@/lib/database/errors";
import { createSupabaseSessionClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { authProvider } from "./provider";
import { getSessionIdentity, setNeonSessionCookie } from "./session";
import { changePasswordFlow, changePasswordSchema, type ChangePasswordDeps, type ChangePasswordInput } from "./change-password";
import { changePassword as neonChangePassword, NeonAuthError } from "./neon/client";
import { hintsOf, sameAppOnly } from "./neon/handlers";
import { neonConfig } from "./neon/server";
import { currentNeonCookie } from "./neon/request";

// POST /api/auth/password/change { currentPassword, newPassword }
// Troca a senha do próprio usuário logado (ver change-password.ts).

const WRONG = () => new ApiError("WRONG_PASSWORD", "A senha atual está incorreta.", 400);

function supabaseDeps(): ChangePasswordDeps {
  return {
    currentEmail: async () => (await getSessionIdentity())?.email ?? null,
    verifyCurrent: async (email, password) => {
      // Cliente avulso, sem cookies: a sessão aberta aqui só confere a senha.
      const probe = createSupabaseJsClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await probe.auth.signInWithPassword({ email, password });
      if (error || !data.session) return false;
      await probe.auth.signOut({ scope: "local" }).catch(() => undefined);
      return true;
    },
    apply: async ({ newPassword }) => {
      const supabase = await createSupabaseSessionClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (/weak|password/i.test(error.code ?? "")) throw validationError("A senha não atende à política de senhas.");
        throw new ApiError("AUTH_UNAVAILABLE", "Não foi possível trocar a senha agora. Tente novamente.", 503);
      }
      await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
    },
  };
}

function neonDeps(request: NextRequest): ChangePasswordDeps {
  const config = neonConfig(request.nextUrl.origin);
  return {
    currentEmail: async () => (await getSessionIdentity())?.email ?? null,
    // O Neon Auth confere a senha atual na própria troca (INVALID_PASSWORD).
    verifyCurrent: async () => true,
    apply: async ({ currentPassword, newPassword }) => {
      const cookie = await currentNeonCookie();
      if (!cookie) throw new ApiError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.", 401);
      try {
        const renewed = await neonChangePassword(config, cookie, currentPassword, newPassword, hintsOf(request));
        if (renewed) await setNeonSessionCookie(renewed);
      } catch (error) {
        if (error instanceof NeonAuthError) {
          if (error.code === "INVALID_PASSWORD" || error.code === "INVALID_CREDENTIALS") throw WRONG();
          if (error.code === "WEAK_PASSWORD") throw validationError("A senha não atende à política de senhas.");
          if (error.code === "RATE_LIMITED") throw new ApiError("RATE_LIMITED", "Muitas tentativas. Aguarde alguns segundos e tente novamente.", 429);
          if (error.code === "UNAUTHORIZED") throw new ApiError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.", 401);
          throw new ApiError("AUTH_UNAVAILABLE", "O serviço de autenticação não respondeu. Tente novamente.", 503);
        }
        throw error;
      }
    },
  };
}

export async function changeOwnPassword(request: NextRequest) {
  try {
    sameAppOnly(request);
    const raw = await request.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const input: ChangePasswordInput = parsed.data;
    const deps = authProvider() === "neon" ? neonDeps(request) : supabaseDeps();
    const outcome = await changePasswordFlow(input, deps);
    if (outcome === "no_session") throw new ApiError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.", 401);
    if (outcome === "wrong_password") throw WRONG();
    return NextResponse.json({ success: true, data: { changed: true } });
  } catch (error) {
    return jsonError(error);
  }
}
