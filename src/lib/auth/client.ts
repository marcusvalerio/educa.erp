"use client";

import { createClient } from "@/lib/supabase/client";
import { consumeAuthHash } from "@/lib/onboarding/auth-hash";
import { buildRecoveryCallbackUrl } from "@/lib/onboarding/invitations";
import { authProvider } from "./provider";

// Ações de conta no navegador, independentes do provedor. As telas (login,
// recuperar/redefinir senha, convite) chamam só estas funções.
//
//   supabase → SDK do Supabase Auth no navegador (exatamente o fluxo de antes);
//   neon     → rotas /api/auth/* do próprio EDUCA; o navegador nunca fala
//              com o Neon Auth nem vê o cookie de sessão dele.

const neon = () => authProvider() === "neon";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown; message: string | null }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: { message?: string } } | null;
  return { ok: res.ok && !!json?.success, status: res.status, data: json?.data ?? null, message: json?.error?.message ?? null };
}

// ------------------------------------------------------------ login

export type SignInResult = { ok: true } | { ok: false; message: string };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  if (neon()) {
    const res = await postJson("/api/auth/sign-in", { email, password });
    return res.ok ? { ok: true } : { ok: false, message: res.message ?? "E-mail ou senha inválidos. Confira os dados e tente novamente." };
  }
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { ok: true };
  return {
    ok: false,
    message:
      error.code === "email_not_confirmed"
        ? "Confirme o seu e-mail pelo link recebido antes de entrar."
        : "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  };
}

// ------------------------------------------------------------ esqueci minha senha

/** Sempre "enviado": a tela não serve para descobrir quem tem acesso. */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    if (neon()) {
      await postJson("/api/auth/password/recover", { email });
      return;
    }
    await createClient().auth.resetPasswordForEmail(email, { redirectTo: buildRecoveryCallbackUrl(window.location.origin) });
  } catch {
    // Falha de rede/limite: mesma resposta (sem enumeração de contas).
  }
}

// ------------------------------------------------------------ link de senha (primeiro acesso / recuperação)

export type PasswordLink = { status: "ready"; email: string | null; pendingPassword: boolean } | { status: "invalid"; message: string | null };

let neonLinkToken: string | null = null;
let neonLinkEmail: string | null = null;

/**
 * Abre o link de senha recebido por e-mail.
 *   supabase: sessão do fragmento (#access_token) ou da troca em /auth/callback;
 *   neon: ?token= de uso único que o Neon Auth anexou ao redirecionar. O
 *   token sai da barra de endereço na hora (histórico, capturas de tela).
 */
export async function openPasswordLink(): Promise<PasswordLink> {
  if (neon()) {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    const error = url.searchParams.get("error");
    const email = url.searchParams.get("e");
    if (token || error) {
      url.searchParams.delete("token");
      url.searchParams.delete("error");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    if (token) {
      neonLinkToken = token;
      neonLinkEmail = email;
    }
    if (error || !neonLinkToken || !neonLinkEmail) return { status: "invalid", message: null };
    return { status: "ready", email: neonLinkEmail, pendingPassword: false };
  }
  const supabase = createClient();
  const fromHash = await consumeAuthHash(supabase);
  const { data } = await supabase.auth.getUser();
  if (fromHash.error || !data.user) return { status: "invalid", message: fromHash.error };
  return { status: "ready", email: data.user.email ?? null, pendingPassword: data.user.user_metadata?.educa_password_pending === true };
}

export type SavePasswordResult = { ok: true; signedIn: boolean } | { ok: false; message: string };

/**
 * Grava a nova senha do link. Primeiro acesso segue com a sessão; na
 * recuperação a sessão é encerrada (e, no Neon, todas as outras também).
 */
export async function savePasswordFromLink(password: string, firstAccess: boolean): Promise<SavePasswordResult> {
  if (neon()) {
    if (!neonLinkToken || !neonLinkEmail) return { ok: false, message: "O link expirou ou já foi usado. Solicite um novo." };
    const res = await postJson("/api/auth/password/reset", { token: neonLinkToken, email: neonLinkEmail, password, continueSession: firstAccess });
    if (!res.ok) return { ok: false, message: res.message ?? "Não foi possível salvar a senha. O link pode ter expirado — solicite um novo." };
    neonLinkToken = null;
    return { ok: true, signedIn: (res.data as { signedIn?: boolean } | null)?.signedIn === true };
  }
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { educa_password_pending: false } });
  if (error) {
    return {
      ok: false,
      message: /different from the old|same_password/i.test(error.message + (error.code ?? ""))
        ? "A nova senha precisa ser diferente da anterior."
        : /weak|pwned/i.test(error.message + (error.code ?? ""))
          ? "Esta senha é fraca ou conhecida em vazamentos. Escolha outra."
          : "Não foi possível salvar a senha. O link pode ter expirado — solicite um novo.",
    };
  }
  if (firstAccess) return { ok: true, signedIn: true };
  // Recuperação: encerra a sessão de recuperação.
  await supabase.auth.signOut();
  return { ok: true, signedIn: false };
}

// ------------------------------------------------------------ convite

export type CurrentAccount = { email: string; passwordPending: boolean } | null;

/** Conta logada neste navegador (convite), e se ela ainda precisa criar a senha. */
export async function currentAccount(): Promise<{ account: CurrentAccount; linkError: string | null }> {
  if (neon()) {
    // No Neon a senha é criada ANTES, pelo link de primeiro acesso; o
    // convite só recebe quem já está logado.
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { data?: { authenticated?: boolean; email?: string | null } } | null;
    const email = json?.data?.authenticated ? (json.data.email ?? "") : null;
    return { account: email !== null ? { email, passwordPending: false } : null, linkError: null };
  }
  const supabase = createClient();
  const fromHash = await consumeAuthHash(supabase);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { account: null, linkError: fromHash.error };
  return {
    account: { email: data.user.email ?? "", passwordPending: fromHash.type === "invite" || data.user.user_metadata?.educa_password_pending === true },
    linkError: null,
  };
}

/** Cria a senha da conta logada (convite do Supabase Auth). */
export async function setPasswordForCurrentAccount(password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (neon()) return { ok: false, message: "Crie a senha pelo link de primeiro acesso enviado para o seu e-mail." };
  const { error } = await createClient().auth.updateUser({ password, data: { educa_password_pending: false } });
  if (!error) return { ok: true };
  return { ok: false, message: /weak|pwned/i.test(error.message + (error.code ?? "")) ? "Esta senha é fraca ou conhecida em vazamentos. Escolha outra." : "Não foi possível salvar a senha. Tente novamente." };
}
