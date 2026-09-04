import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Cliente Supabase server-side com contexto de cookies (SSR), autenticado
 * como o usuário da sessão (anon key + cookies), respeitando Row Level
 * Security. Não é usado pelas rotas de API dos cadastros nesta fase
 * (que ainda não têm usuário autenticado) — está aqui pronto para a
 * Fase 3, quando o Supabase Auth substituir o acesso via admin client.
 */
export async function createClient() {
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
          // de cookies — inofensivo enquanto o middleware de sessão (Fase 3)
          // não estiver em vigor para renovar o cookie.
        }
      },
    },
  });
}
