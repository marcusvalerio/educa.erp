// Fluxos de conta com o Neon Auth (AUTH_PROVIDER=neon), sem Next.js:
// dependências por parâmetro, para que cada regra de segurança tenha teste.
//
// Diferenças do Neon Auth real que estes fluxos compensam (medidas no
// serviço, docs/NEON_AUTH_MIGRATION.md §10.3):
//   * a redefinição de senha NÃO confirma o e-mail → o servidor confirma,
//     porque concluir o link de uso único prova a posse da caixa;
//   * a redefinição NÃO revoga sessões antigas → o servidor revoga todas as
//     outras sessões logo em seguida;
//   * o cadastro público é recusado no próprio Neon (disableSignUp); contas
//     só nascem pelo servidor (convite).

import { IdentityBridgeError, type BridgeResult } from "@/lib/auth/neon-bridge";
import { NeonAuthError, type NeonSession, type NeonUser } from "./client";
import type { Delivery } from "@/lib/onboarding/invitations";

// ------------------------------------------------------------ sessão → identidade
export type NeonIdentity = {
  authUserId: string;
  email: string;
  neonUserId: string;
  dbToken: string;
};

export type NeonResolution =
  | { status: "ok"; identity: NeonIdentity; renewedCookie: string | null }
  | { status: "none" }
  | { status: "denied"; reason: IdentityBridgeError["code"] | "SUBJECT_MISMATCH" | "NO_JWT" };

type Deps = {
  getSession: (cookie: string) => Promise<NeonSession | null>;
  bridge: (jwt: string) => Promise<BridgeResult>;
};

/**
 * Sessão do Neon → identidade do EDUCA. Nada do navegador escolhe quem é
 * o usuário: só a sessão viva no Neon e o JWT verificado.
 */
export async function resolveNeonSession(cookie: string | null | undefined, deps: Deps): Promise<NeonResolution> {
  if (!cookie) return { status: "none" };
  const session = await deps.getSession(cookie);
  if (!session) return { status: "none" };
  if (session.user.banned) return { status: "denied", reason: "DISABLED" };
  if (!session.jwt) return { status: "denied", reason: "NO_JWT" };
  let bridged: BridgeResult;
  try {
    bridged = await deps.bridge(session.jwt);
  } catch (error) {
    if (error instanceof IdentityBridgeError) return { status: "denied", reason: error.code };
    throw error;
  }
  // O JWT tem que ser do MESMO usuário da sessão consultada.
  if (bridged.externalUserId !== session.user.id) return { status: "denied", reason: "SUBJECT_MISMATCH" };
  return {
    status: "ok",
    identity: { authUserId: bridged.authUserId, email: bridged.email, neonUserId: session.user.id, dbToken: bridged.dbToken },
    renewedCookie: session.renewedCookie,
  };
}

// ------------------------------------------------------------ origem das rotas de conta

/**
 * As rotas de conta (entrar, redefinir senha, pedir recuperação) não exigem
 * sessão e GRAVAM o cookie de sessão: sem esta checagem, uma página de outro
 * site poderia enviar um formulário (text/plain com corpo em forma de JSON)
 * e deixar o navegador da vítima logado na conta do atacante (login CSRF).
 * Exige JSON (formulários não enviam application/json; fetch de outra origem
 * com JSON sofre preflight de CORS, que o app não libera) e, quando o
 * navegador informa a origem, que seja a do próprio app.
 */
export function isTrustedAccountRequest(
  request: { contentType: string | null; origin: string | null; secFetchSite: string | null },
  allowedOrigins: readonly string[]
): boolean {
  if (!/^application\/json(\s*;|$)/i.test((request.contentType ?? "").trim())) return false;
  if (request.secFetchSite && request.secFetchSite !== "same-origin" && request.secFetchSite !== "none") return false;
  if (request.origin && !allowedOrigins.includes(request.origin)) return false;
  return true;
}

// ------------------------------------------------------------ login

export type SignInDeps = {
  signIn: (email: string, password: string) => Promise<{ cookie: string; user: NeonUser }>;
  resolve: (cookie: string) => Promise<NeonResolution>;
  signOut: (cookie: string) => Promise<void>;
};

export type SignInOutcome =
  | { status: "ok"; cookie: string }
  /** Credenciais certas, mas a identidade não chega ao EDUCA (sem vínculo, e-mail não confirmado, bloqueada). */
  | { status: "not_allowed" };

/** Login: só devolve sessão se a identidade passar pela ponte inteira. */
export async function signInFlow(email: string, password: string, deps: SignInDeps): Promise<SignInOutcome> {
  const { cookie } = await deps.signIn(email, password);
  const resolved = await deps.resolve(cookie);
  if (resolved.status === "ok") return { status: "ok", cookie };
  // Não deixa sessão órfã no Neon.
  await deps.signOut(cookie).catch(() => undefined);
  return { status: "not_allowed" };
}

export type ResetDeps = {
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ cookie: string; user: NeonUser }>;
  markEmailVerified: (userId: string) => Promise<void>;
  revokeOtherSessions: (cookie: string) => Promise<void>;
  signOut: (cookie: string) => Promise<void>;
};

export type ResetOutcome = { status: "ok"; cookie: string | null } | { status: "signin_failed" };

/**
 * Nova senha pelo link (primeiro acesso ou recuperação):
 *   1. o Neon troca a senha (token de uso único, 1 h);
 *   2. o servidor entra com a senha nova — prova que o e-mail do link é
 *      o dono do token (o e-mail da URL é só dica; senha errada = falha);
 *   3. confirma o e-mail no Neon (posse da caixa comprovada pelo link);
 *   4. revoga TODAS as outras sessões da conta;
 *   5. primeiro acesso segue logado; recuperação encerra e volta ao login.
 */
export async function resetPasswordFlow(
  input: { token: string; password: string; email: string; continueSession: boolean },
  deps: ResetDeps
): Promise<ResetOutcome> {
  await deps.resetPassword(input.token, input.password);
  let session: { cookie: string; user: NeonUser };
  try {
    session = await deps.signIn(input.email, input.password);
  } catch {
    // Senha já trocada; só não dá para concluir os passos seguintes com
    // este e-mail. A pessoa entra normalmente pelo login.
    return { status: "signin_failed" };
  }
  if (!session.user.emailVerified) await deps.markEmailVerified(session.user.id);
  await deps.revokeOtherSessions(session.cookie);
  if (input.continueSession) return { status: "ok", cookie: session.cookie };
  await deps.signOut(session.cookie).catch(() => undefined);
  return { status: "ok", cookie: null };
}

// ------------------------------------------------------------ convite (identidade no Neon)
// Ordem e regras explicadas em src/lib/auth/provisioning.ts.

export type ProvisionDeps = {
  ensureShadowLogin: (email: string) => Promise<string>;
  findNeonUser: (email: string) => Promise<NeonUser | null>;
  createNeonUser: (email: string, name: string) => Promise<NeonUser>;
  link: (neonUserId: string, email: string, authUserId: string) => Promise<void>;
  sendFirstAccess: (email: string) => Promise<void>;
};

export async function provisionIdentity(input: { email: string; name: string }, deps: ProvisionDeps): Promise<Delivery & { authUserId?: string | null }> {
  const email = input.email.trim().toLowerCase();
  const authUserId = await deps.ensureShadowLogin(email);
  let neonUser = await deps.findNeonUser(email);
  if (!neonUser) {
    try {
      neonUser = await deps.createNeonUser(email, input.name);
    } catch (error) {
      // Corrida com outro convite simultâneo: reaproveita.
      if (error instanceof NeonAuthError && error.code === "USER_EXISTS") neonUser = await deps.findNeonUser(email);
      if (!neonUser) throw error;
    }
  }
  await deps.link(neonUser.id, email, authUserId);
  if (neonUser.emailVerified) return { delivered: false, reason: "existing_account", authUserId };
  await deps.sendFirstAccess(email);
  return { delivered: true, authUserId };
}
