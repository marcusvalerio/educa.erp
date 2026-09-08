"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Cliente Supabase para uso no browser. Usa apenas a anon key (pública).
 * Nesta fase a UI não fala diretamente com o Supabase — todo acesso a
 * dados passa pelas rotas /api/*. Este cliente existe para a Fase 3,
 * quando o Supabase Auth passará a gerenciar a sessão no navegador.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
