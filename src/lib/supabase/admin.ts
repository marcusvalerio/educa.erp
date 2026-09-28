import "server-only";

import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";
import { dataBackend } from "@/lib/database/backend";
import { createPgDataClient } from "@/lib/database/pg/client";

let cached: SupabaseClient | null = null;

/** Há acesso administrativo (service_role) configurado neste ambiente? */
export function adminAccessConfigured(): boolean {
  return dataBackend() === "postgres" ? !!process.env.DATABASE_URL : !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Cliente administrativo (service role key) — acesso total, ignora Row
 * Level Security. Uso exclusivo em código server-only (rotas de API),
 * nunca em um componente "use client" ou em qualquer módulo importado
 * pelo bundle do navegador (o `import "server-only"` acima garante um
 * erro de build caso isso aconteça).
 *
 * Enquanto a Fase 3 (Supabase Auth) não existir, as rotas de API usam
 * este cliente para todas as operações de cadastro — não há usuário
 * autenticado ainda para respeitar RLS por linha. Ver docs/SUPABASE.md
 * para as políticas de RLS aplicadas nesta fase.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  if (dataBackend() === "postgres") {
    // PostgreSQL direto: papel service_role (BYPASSRLS), como a service key.
    cached = createPgDataClient({ role: "service_role" }) as unknown as SupabaseClient;
    return cached;
  }
  cached = createSupabaseJsClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
