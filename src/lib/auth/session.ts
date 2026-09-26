import "server-only";

import { cookies } from "next/headers";
import { authProvider } from "./provider";
import { forgetNeonSession, neonConfig, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./neon/server";
import { signOut as neonSignOut } from "./neon/client";
import { requestHints, resolveCurrentNeonSession } from "./neon/request";
import { createSupabaseSessionClient } from "@/lib/supabase/server";

// Sessão do usuário, independente do provedor de identidade.
//
// Todo o servidor pergunta "quem é?" por aqui (governance.requireSession,
// auth/context.getAuthContext) e obtém o cliente de dados do usuário por
// createClient() (src/lib/supabase/server.ts), que também decide pelo
// provedor. Fora da camada src/lib/auth, ninguém consulta AUTH_PROVIDER.
//
//   supabase → getUser() do Supabase Auth (cookies @supabase/ssr), como antes;
//   neon     → sessão do Neon Auth + ponte (src/lib/auth/neon/server.ts).

export type SessionIdentity = {
  /** UUID do login no EDUCA (auth.users.id) — o mesmo que auth.uid() vê no banco. */
  authUserId: string;
  email: string | null;
};

/** Quem está chamando, ou null. Nunca vem do corpo/URL da requisição. */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  if (authProvider() === "neon") {
    const resolved = await resolveCurrentNeonSession();
    return resolved.status === "ok" ? { authUserId: resolved.identity.authUserId, email: resolved.identity.email } : null;
  }
  const supabase = await createSupabaseSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { authUserId: data.user.id, email: data.user.email ?? null };
}

// ------------------------------------------------------------ cookie de sessão (neon)

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function setNeonSessionCookie(value: string) {
  (await cookies()).set(SESSION_COOKIE, value, sessionCookieOptions());
}

/** Encerra a sessão no provedor e apaga a sessão local. */
export async function endSession(): Promise<void> {
  if (authProvider() === "neon") {
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE)?.value ?? null;
    forgetNeonSession(cookie);
    store.delete(SESSION_COOKIE);
    if (cookie) {
      const { hints, origin } = await requestHints();
      // Revoga no Neon; falha de rede não impede apagar a sessão local.
      await neonSignOut(neonConfig(origin), cookie, hints).catch(() => undefined);
    }
    return;
  }
  const supabase = await createSupabaseSessionClient();
  await supabase.auth.signOut();
}
