"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Cliente Supabase para uso no browser. Usa apenas a anon key (pública)
 * e só para AUTENTICAÇÃO (entrar, recuperar/definir senha, sessão de
 * convite). Dados passam sempre pelas rotas /api/*.
 *
 * detectSessionInUrl desligado: nenhum token da URL vira sessão sem uma
 * página que o espere. Códigos PKCE (?code=) são trocados no servidor
 * (/auth/callback); sessões no fragmento (#access_token, links de
 * convite do Auth) são lidas explicitamente — src/lib/onboarding/auth-hash.ts.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      detectSessionInUrl: false,
      // O id do fluxo PKCE viaja no redirect (sb_flow_id) e /auth/callback
      // escolhe o verificador certo: dois pedidos de "esqueci minha senha"
      // seguidos não invalidam o primeiro link. Exige Redirect URLs com
      // curinga (ex.: https://app/auth/callback**) — ver docs/ONBOARDING.md.
      experimental: { appendPkceFlowIdToRedirects: true },
    },
  });
}
