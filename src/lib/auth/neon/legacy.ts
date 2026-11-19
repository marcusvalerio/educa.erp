import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { readTemporaryMeta } from "@/lib/auth/temporary-password";
import { adminCreateUser, adminFindUserByEmail, adminMarkEmailVerified, adminSetUserPassword, type NeonAuthConfig } from "./client";
import type { LegacyDeps } from "./flows";
import { withServiceSession } from "./server";

// Migração do login antigo (Supabase Auth → Neon Auth), ligada por
// LEGACY_SUPABASE_LOGIN=1 enquanto houver contas sem migrar. Usa só a chave
// pública (anon) do Supabase para conferir e-mail e senha; nada é gravado lá.

export function legacyLoginEnabled(): boolean {
  return process.env.LEGACY_SUPABASE_LOGIN === "1" && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyLegacy(email: string, password: string): Promise<{ authUserId: string; name: string } | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) return null;
  if (!res.ok) throw new Error(`Supabase Auth respondeu ${res.status}.`);
  const body = (await res.json()) as { access_token?: string; user?: { id?: string; email?: string; email_confirmed_at?: string | null; app_metadata?: unknown; user_metadata?: { name?: string } } };
  const user = body.user;
  // A sessão aberta no Supabase só serviu para conferir a senha: encerra.
  if (body.access_token) {
    await fetch(`${base}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${body.access_token}` } }).catch(() => undefined);
  }
  if (!user?.id || !UUID.test(user.id) || (user.email ?? "").toLowerCase() !== email) return null;
  if (!user.email_confirmed_at) return null;
  // Senha provisória ainda não trocada não vale como login (mesma regra de antes).
  if (readTemporaryMeta(user.app_metadata as Record<string, unknown> | undefined)) return null;
  const { data } = await createAdminClient().from("users").select("name").eq("auth_user_id", user.id).limit(1).maybeSingle();
  const name = (data as { name?: string } | null)?.name || user.user_metadata?.name || email;
  return { authUserId: user.id, name };
}

async function isMigrated(authUserId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("auth_identity_links").select("id").eq("auth_user_id", authUserId).eq("provider", "neon").limit(1);
  if (error) throw new Error("Falha ao consultar o vínculo de identidade.");
  return (data ?? []).length > 0;
}

async function link(neonUserId: string, email: string, authUserId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("fn_link_identity", { p_provider: "neon", p_external_user_id: neonUserId, p_email: email, p_auth_user_id: authUserId });
  if (error) throw new Error("Não foi possível vincular a identidade.");
}

export function legacyDeps(config: NeonAuthConfig): LegacyDeps {
  return {
    verifyLegacy,
    isMigrated,
    findNeonUser: (email) => withServiceSession(config, (admin) => adminFindUserByEmail(config, admin, email)),
    createNeonUser: (email, name, password) => withServiceSession(config, (admin) => adminCreateUser(config, admin, { email, name, password })),
    setPassword: (userId, password) => withServiceSession(config, (admin) => adminSetUserPassword(config, admin, userId, password)),
    markEmailVerified: (userId) => withServiceSession(config, (admin) => adminMarkEmailVerified(config, admin, userId)),
    link,
  };
}
