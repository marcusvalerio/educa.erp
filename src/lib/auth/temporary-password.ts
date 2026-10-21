// Senha provisória com o Supabase Auth (AUTH_PROVIDER=supabase), sem Next.js:
// dependências por parâmetro, para que cada regra tenha teste.
//
//   Administrador ─▶ banco: fn_create_user_invitation (quem pode, para quem,
//                    papéis, auditoria — as mesmas regras do convite por e-mail)
//                ─▶ servidor gera a senha ─▶ Supabase Auth (só hash), login
//                   marcado em app_metadata (só a service_role escreve)
//                ─▶ a senha aparece UMA vez para o Administrador
//   Pessoa entra com a provisória ─▶ sem vínculo em users, não acessa nada
//                ─▶ cria a senha nova ─▶ servidor aceita o convite como ELA
//                   (fn_accept_user_invitation: mesmo e-mail, login único)
//
// Nenhuma migration: a autorização é o convite que já existe no banco. A
// senha provisória nunca é gravada no banco do ATLAS.ERP nem em log.

import { randomInt } from "node:crypto";

// Sem caracteres que se confundem ao ditar ou digitar (0/O/o, 1/l/I).
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPER + LOWER + DIGITS;
export const TEMPORARY_PASSWORD_LENGTH = 10;
export const TEMPORARY_PASSWORD_TTL_HOURS = 72;
/** Marca no app_metadata do login (o usuário não consegue alterar app_metadata). */
export const TEMPORARY_PASSWORD_META = "educa_temp_password";

/** 10 caracteres de 56 possíveis (≈ 3·10¹⁷ combinações), com maiúscula, minúscula e número. */
export function generateTemporaryPassword(pick: (max: number) => number = (max) => randomInt(max)): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) out += ALPHABET[pick(ALPHABET.length)];
    if (/[A-Z]/.test(out) && /[a-z]/.test(out) && /\d/.test(out)) return out;
  }
}

/** Senha aleatória longa que ninguém conhece (revogação: a provisória deixa de entrar). */
export function generateDiscardPassword(pick: (max: number) => number = (max) => randomInt(max)): string {
  let out = "";
  for (let i = 0; i < 40; i++) out += ALPHABET[pick(ALPHABET.length)];
  return `${out}9a`;
}

export type TemporaryPasswordCode = "NOT_PENDING" | "EXPIRED" | "SAME_PASSWORD" | "ACCOUNT_IN_USE" | "INVALID_CREDENTIALS";

export class TemporaryPasswordError extends Error {
  constructor(
    readonly code: TemporaryPasswordCode,
    message: string
  ) {
    super(message);
    this.name = "TemporaryPasswordError";
  }
}

/**
 * O que fica no app_metadata do login enquanto a troca não acontece:
 * primeiro acesso (convite) ou nova senha de quem já tinha acesso (reset).
 */
export type TemporaryMeta =
  | { mode?: "invite"; invitation_id: string; invitation_token: string; user_id: string; expires_at: string }
  | { mode: "reset"; user_id: string; expires_at: string };

export function readTemporaryMeta(appMetadata: Record<string, unknown> | null | undefined): TemporaryMeta | null {
  const raw = appMetadata?.[TEMPORARY_PASSWORD_META];
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.mode === "reset") return typeof m.user_id === "string" && typeof m.expires_at === "string" ? (m as TemporaryMeta) : null;
  return m.invitation_token && m.user_id && m.expires_at && m.invitation_id ? (m as TemporaryMeta) : null;
}

export function withoutTemporaryMeta(appMetadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const { [TEMPORARY_PASSWORD_META]: _drop, ...rest } = appMetadata ?? {};
  void _drop;
  return rest;
}

export type AuthLogin = { id: string; appMetadata: Record<string, unknown>; lastSignInAt: string | null };

// ------------------------------------------------------------ gerar (Administrador)

export type IssuedInvitation = { invitationId: string; token: string; email: string; userId: string; userName: string; expiresAt: string };

export type IssueDeps = {
  /** fn_create_user_invitation com o cliente DO ADMINISTRADOR (has_permission no banco). */
  createInvitation: () => Promise<IssuedInvitation>;
  /** fn_revoke_user_invitation (compensação quando o Auth falha). */
  revokeInvitation: (invitationId: string) => Promise<void>;
  findLogin: (email: string) => Promise<AuthLogin | null>;
  /** O login já está ligado a algum cadastro (qualquer empresa) ou à plataforma? */
  loginInUse: (authUserId: string) => Promise<boolean>;
  createLogin: (email: string, password: string, appMetadata: Record<string, unknown>) => Promise<void>;
  updateLogin: (authUserId: string, change: { password: string; appMetadata: Record<string, unknown> }) => Promise<void>;
  generate?: () => string;
};

export type IssueResult = { password: string; email: string; userName: string; expiresAt: string };

export async function issueTemporaryPasswordFlow(deps: IssueDeps): Promise<IssueResult> {
  const invitation = await deps.createInvitation();
  try {
    const email = invitation.email.trim().toLowerCase();
    const meta: TemporaryMeta = { invitation_id: invitation.invitationId, invitation_token: invitation.token, user_id: invitation.userId, expires_at: invitation.expiresAt };
    const password = (deps.generate ?? generateTemporaryPassword)();
    const existing = await deps.findLogin(email);
    if (!existing) {
      await deps.createLogin(email, password, { [TEMPORARY_PASSWORD_META]: meta });
    } else {
      // Nunca trocar a senha de uma conta que é de alguém: ligada a um
      // cadastro (desta ou de outra empresa), à plataforma, ou que já entrou
      // com senha própria. Só login sem uso ou criado por uma provisória.
      if (await deps.loginInUse(existing.id)) {
        throw new TemporaryPasswordError("ACCOUNT_IN_USE", "Este e-mail já tem acesso ao sistema. A pessoa entra com a senha dela (ou usa \"Esqueci minha senha\").");
      }
      if (!readTemporaryMeta(existing.appMetadata) && existing.lastSignInAt) {
        throw new TemporaryPasswordError("ACCOUNT_IN_USE", "Este e-mail já tem uma conta com senha própria. Envie o convite por link: a pessoa entra com a senha dela e aceita.");
      }
      await deps.updateLogin(existing.id, { password, appMetadata: { ...withoutTemporaryMeta(existing.appMetadata), [TEMPORARY_PASSWORD_META]: meta } });
    }
    return { password, email, userName: invitation.userName, expiresAt: invitation.expiresAt };
  } catch (error) {
    // Sem senha gravada não pode sobrar convite pendente desta tentativa.
    await deps.revokeInvitation(invitation.invitationId).catch(() => undefined);
    throw error;
  }
}

// ------------------------------------------------------------ revogar (Administrador)

export type RevokeDeps = {
  /** Convite pendente do cadastro, lido com o cliente DO ADMINISTRADOR (RLS). */
  pendingInvitation: () => Promise<{ id: string; email: string; userId: string } | null>;
  /** fn_revoke_user_invitation com o cliente do Administrador (o banco autoriza). */
  revokeInvitation: (invitationId: string) => Promise<void>;
  findLogin: (email: string) => Promise<AuthLogin | null>;
  updateLogin: (authUserId: string, change: { password: string; appMetadata: Record<string, unknown> }) => Promise<void>;
  generate?: () => string;
};

/** Revoga o convite pendente; no Auth, a provisória vira uma senha que ninguém conhece. */
export async function revokeTemporaryPasswordFlow(deps: RevokeDeps): Promise<{ revoked: boolean }> {
  const pending = await deps.pendingInvitation();
  if (!pending) return { revoked: false };
  await deps.revokeInvitation(pending.id);
  const login = await deps.findLogin(pending.email.trim().toLowerCase());
  const meta = login ? readTemporaryMeta(login.appMetadata) : null;
  if (login && meta && meta.user_id === pending.userId) {
    await deps.updateLogin(login.id, { password: (deps.generate ?? generateDiscardPassword)(), appMetadata: withoutTemporaryMeta(login.appMetadata) });
  }
  return { revoked: true };
}

// ------------------------------------------------------------ nova senha (quem já tem acesso)

export type ResetDeps = {
  /** fn_authorize_password_reset / fn_study_authorize_member_password_reset com o cliente de quem pede. */
  authorize: () => Promise<{ userId: string; authUserId: string; email: string; name: string }>;
  getLogin: (authUserId: string) => Promise<AuthLogin | null>;
  updateLogin: (authUserId: string, change: { password: string; appMetadata: Record<string, unknown> }) => Promise<void>;
  generate?: () => string;
  now?: () => Date;
  ttlHours?: number;
};

/**
 * Esqueceu a senha: o banco autoriza (quem administra a pessoa) e o login
 * recebe uma provisória com troca obrigatória no próximo acesso. A senha
 * antiga deixa de valer na hora.
 */
export async function resetPasswordFlow(deps: ResetDeps): Promise<IssueResult> {
  const target = await deps.authorize();
  const login = await deps.getLogin(target.authUserId);
  if (!login) throw new TemporaryPasswordError("NOT_PENDING", "Login desta pessoa não encontrado.");
  const expiresAt = new Date((deps.now ?? (() => new Date()))().getTime() + (deps.ttlHours ?? TEMPORARY_PASSWORD_TTL_HOURS) * 3600_000).toISOString();
  const password = (deps.generate ?? generateTemporaryPassword)();
  const meta: TemporaryMeta = { mode: "reset", user_id: target.userId, expires_at: expiresAt };
  await deps.updateLogin(login.id, { password, appMetadata: { ...withoutTemporaryMeta(login.appMetadata), [TEMPORARY_PASSWORD_META]: meta } });
  return { password, email: target.email, userName: target.name, expiresAt };
}

// ------------------------------------------------------------ troca obrigatória (pessoa)

export type ChangeDeps = {
  /** Login com a provisória num cliente sem cookies (nada fica no navegador). */
  signIn: (email: string, password: string) => Promise<{ accessToken: string; login: AuthLogin }>;
  signOut: (accessToken: string) => Promise<void>;
  /** fn_get_invitation: pending | expired | revoked | accepted | invalid. */
  invitationStatus: (token: string) => Promise<string>;
  setPassword: (authUserId: string, password: string) => Promise<void>;
  /** fn_accept_user_invitation COMO a pessoa (auth.uid() = o login). */
  accept: (accessToken: string, token: string) => Promise<void>;
  /** O cadastro já está ligado a este login? (retomada de uma troca interrompida) */
  linkedTo: (authUserId: string, userId: string) => Promise<boolean>;
  clearMeta: (authUserId: string, appMetadata: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
};

/**
 * Login com a provisória + senha nova numa única chamada. O navegador só
 * cria a sessão depois, com a senha nova: a troca é obrigatória por
 * construção (sem o aceite, o login não está ligado a nenhum cadastro).
 */
export async function changeTemporaryPasswordFlow(input: { email: string; temporaryPassword: string; newPassword: string }, deps: ChangeDeps): Promise<void> {
  if (input.newPassword === input.temporaryPassword) {
    throw new TemporaryPasswordError("SAME_PASSWORD", "A nova senha precisa ser diferente da senha provisória.");
  }
  const session = await deps.signIn(input.email.trim().toLowerCase(), input.temporaryPassword).catch(() => {
    throw new TemporaryPasswordError("INVALID_CREDENTIALS", "E-mail ou senha provisória inválidos. Confira os dados e tente novamente.");
  });
  try {
    const meta = readTemporaryMeta(session.login.appMetadata);
    if (!meta) throw new TemporaryPasswordError("NOT_PENDING", "Não há senha provisória pendente para esta conta. Entre com a sua senha.");
    const already = await deps.linkedTo(session.login.id, meta.user_id);
    if (meta.mode === "reset") {
      // Nova senha de quem já tinha acesso: o login continua ligado ao cadastro.
      if (!already) throw new TemporaryPasswordError("NOT_PENDING", "Esta senha provisória não vale mais para esta conta. Peça uma nova ao administrador.");
      if (new Date(meta.expires_at) < (deps.now ?? (() => new Date()))()) {
        throw new TemporaryPasswordError("EXPIRED", "A senha provisória expirou. Peça uma nova ao administrador.");
      }
      await deps.setPassword(session.login.id, input.newPassword);
      await deps.clearMeta(session.login.id, withoutTemporaryMeta(session.login.appMetadata));
      return;
    }
    if (!already) {
      const status = await deps.invitationStatus(meta.invitation_token);
      if (status !== "pending" || new Date(meta.expires_at) < (deps.now ?? (() => new Date()))()) {
        throw new TemporaryPasswordError("EXPIRED", "A senha provisória expirou ou foi revogada. Peça uma nova ao administrador.");
      }
    }
    // A provisória deixa de valer antes do aceite: se algo falhar daqui em
    // diante, quem tem a provisória não entra mais.
    await deps.setPassword(session.login.id, input.newPassword);
    if (!already) {
      try {
        await deps.accept(session.accessToken, meta.invitation_token);
      } catch (error) {
        if (!(await deps.linkedTo(session.login.id, meta.user_id))) throw error;
      }
    }
    await deps.clearMeta(session.login.id, withoutTemporaryMeta(session.login.appMetadata));
  } finally {
    await deps.signOut(session.accessToken).catch(() => undefined);
  }
}

/** Depois de um login no navegador: é uma provisória? (a tela pede a senha nova) */
export function temporaryPasswordBlock(appMetadata: Record<string, unknown> | null | undefined, now = new Date()): "change_required" | "expired" | null {
  const meta = readTemporaryMeta(appMetadata);
  if (!meta) return null;
  return new Date(meta.expires_at) < now ? "expired" : "change_required";
}
