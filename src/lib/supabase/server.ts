import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import { authProvider } from "@/lib/auth/provider";
import { currentNeonDatabaseToken } from "@/lib/auth/neon/request";

/**
 * Cliente Supabase server-side autenticado como o usuário da sessão,
 * respeitando Row Level Security. É o cliente de DADOS das rotas que
 * rodam como o usuário (governança, onboarding, has_permission…) — a RLS
 * do banco é a autoridade.
 *
 * O provedor de identidade decide só COMO o PostgREST reconhece o usuário:
 *   AUTH_PROVIDER=supabase → sessão do Supabase Auth em cookies (@supabase/ssr);
 *   AUTH_PROVIDER=neon     → token curto emitido pela ponte (sub = auth_user_id)
 *                            no cabeçalho Authorization; sem sessão, cliente anônimo.
 * Em ambos, auth.uid() no banco é o mesmo UUID do login no EDUCA.
 */
export async function createClient(): Promise<SupabaseClient> {
  if (authProvider() === "neon") {
    const token = await currentNeonDatabaseToken();
    return createSupabaseJsClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });
  }
  return createSupabaseSessionClient();
}

/** Cliente com a sessão do Supabase Auth em cookies (AUTH_PROVIDER=supabase). */
export async function createSupabaseSessionClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de um Server Component sem permissão de escrita
          // de cookies — o proxy (src/proxy.ts) renova a sessão a cada navegação.
        }
      },
    },
  });
}
