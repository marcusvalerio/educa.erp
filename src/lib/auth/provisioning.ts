import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authProvider } from "./provider";
import type { Delivery } from "@/lib/onboarding/invitations";
import { adminCreateUser, adminFindUserByEmail, requestPasswordReset, type NeonAuthConfig } from "./neon/client";
import { provisionIdentity, type ProvisionDeps } from "./neon/flows";
import { buildNeonPasswordLinkUrl, firstAccessNextFrom } from "./neon/links";
import { neonConfig, withServiceSession } from "./neon/server";

// Identidade de quem foi convidado, com AUTH_PROVIDER=neon (Fase 6).
//
// O banco do EDUCA continua reconhecendo pessoas pelo UUID de auth.users:
// users.auth_user_id, platform_members.auth_user_id e o aceite de convite
// (0071, que exige e-mail confirmado em auth.users) dependem dele. Para cada
// convidado, o SERVIDOR (nunca o navegador) garante, nesta ordem:
//
//   1. login "sombra" em auth.users: criado pela API administrativa do
//      Supabase Auth, SEM senha, e-mail confirmado — só guarda o UUID;
//   2. identidade no Neon Auth: criada pela conta de serviço, SEM senha;
//   3. vínculo Neon → auth_user_id (fn_link_identity, 0073: mesmo e-mail,
//      login confirmado, nunca religa uma identidade a outro login);
//   4. link de primeiro acesso do Neon Auth para o e-mail (criar a senha).
//
// Tudo idempotente: repetir o convite reaproveita login, identidade e
// vínculo. Quem já concluiu o primeiro acesso (e-mail confirmado no Neon)
// não recebe novo link — entra com a senha que já tem.

// ------------------------------------------------------------ dependências reais

async function findAuthUserId(email: string): Promise<string | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Falha ao consultar logins.");
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureShadowLogin(email: string): Promise<string> {
  const existing = await findAuthUserId(email);
  if (existing) return existing;
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { provider: "neon" },
    user_metadata: {},
  });
  if (error || !data.user) {
    const again = await findAuthUserId(email);
    if (again) return again;
    throw new Error("Não foi possível registrar o login do convidado.");
  }
  return data.user.id;
}

async function link(neonUserId: string, email: string, authUserId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("fn_link_identity", {
    p_provider: "neon",
    p_external_user_id: neonUserId,
    p_email: email,
    p_auth_user_id: authUserId,
  });
  if (error) throw new Error("Não foi possível vincular a identidade do convidado.");
}

function realDeps(config: NeonAuthConfig, redirectTo: string): ProvisionDeps {
  return {
    ensureShadowLogin,
    findNeonUser: (email) => withServiceSession(config, (admin) => adminFindUserByEmail(config, admin, email)),
    createNeonUser: (email, name) => withServiceSession(config, (admin) => adminCreateUser(config, admin, { email, name })),
    link,
    sendFirstAccess: (email) =>
      requestPasswordReset(config, email, buildNeonPasswordLinkUrl(config.origin, email, { firstAccess: true, next: firstAccessNextFrom(redirectTo) })),
  };
}

/**
 * Convite com AUTH_PROVIDER=neon. `redirectTo` é o destino que o convite
 * pediria ao Supabase Auth (ex.: /convite/<token>); vira o destino depois
 * de criar a senha. Falhas do provedor não vazam detalhe: o convite do
 * EDUCA já existe e o link pode ser entregue manualmente.
 */
export async function inviteWithNeon(input: { email: string; name: string; redirectTo: string }): Promise<Delivery> {
  try {
    const config = neonConfig(new URL(input.redirectTo).origin);
    const result = await provisionIdentity(input, realDeps(config, input.redirectTo));
    return result.delivered ? { delivered: true, authUserId: result.authUserId ?? null } : { delivered: false, reason: result.reason };
  } catch (error) {
    console.error("[auth] provisionamento Neon falhou:", error instanceof Error ? error.message : "erro");
    return { delivered: false, reason: "email_unavailable" };
  }
}

/**
 * Convite de identidade, qualquer que seja o provedor: com o Supabase Auth
 * roda `supabaseInvite` (convite do próprio Supabase, como sempre); com o
 * Neon Auth, o provisionamento acima.
 */
export function inviteIdentity(input: { email: string; name: string; redirectTo: string }, supabaseInvite: () => Promise<Delivery>): Promise<Delivery> {
  return authProvider() === "neon" ? inviteWithNeon(input) : supabaseInvite();
}

/**
 * Um login que já existe em auth.users também precisa de identidade no
 * provedor? Supabase: não (o login É a identidade). Neon: sim — garante
 * identidade + vínculo (idempotente) antes de registrar o membro.
 */
export const existingLoginNeedsIdentity = () => authProvider() === "neon";
