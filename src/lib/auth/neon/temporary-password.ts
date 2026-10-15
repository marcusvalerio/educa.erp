// Senha provisória com o Neon Auth (AUTH_PROVIDER=neon), sem Next.js:
// dependências por parâmetro, para que cada regra tenha teste.
//
//   Administrador ─▶ banco (0095: quem pode, para quem, auditoria)
//                ─▶ servidor gera a senha ─▶ Neon Auth (só hash)
//                ─▶ a senha aparece UMA vez para o Administrador
//   Pessoa entra com a provisória ─▶ banco bloqueia a identidade (pendente)
//                ─▶ cria a senha nova ─▶ banco consome e liga o login
//
// A senha provisória nunca é gravada no banco do ATLAS.ERP nem em log.

import { randomInt } from "node:crypto";
import { NeonAuthError, type NeonUser } from "./client";
import { signInFlow, type SignInDeps, type SignInOutcome } from "./flows";

// Sem caracteres que se confundem ao ditar ou digitar (0/O/o, 1/l/I).
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPER + LOWER + DIGITS;
export const TEMPORARY_PASSWORD_LENGTH = 10;

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

export class TemporaryPasswordError extends Error {
  constructor(
    readonly code: "NOT_PENDING" | "EXPIRED" | "SAME_PASSWORD",
    message: string
  ) {
    super(message);
    this.name = "TemporaryPasswordError";
  }
}

// ------------------------------------------------------------ gerar (Administrador)

export type IssuedRecord = { id: string; email: string; userName: string; authUserId: string | null; expiresAt: string };

export type IssueDeps = {
  /** fn_issue_temporary_password com o cliente DO ADMINISTRADOR (RLS/has_permission). */
  issueRecord: () => Promise<IssuedRecord>;
  /** fn_revoke_temporary_password (compensação quando o provedor falha). */
  revokeRecord: () => Promise<void>;
  ensureShadowLogin: (email: string) => Promise<string>;
  /** fn_attach_temporary_password_login (service_role): recusa login de outro cadastro/plataforma. */
  attachLogin: (recordId: string, authUserId: string) => Promise<void>;
  findNeonUser: (email: string) => Promise<NeonUser | null>;
  createNeonUser: (email: string, name: string) => Promise<NeonUser>;
  link: (neonUserId: string, email: string, authUserId: string) => Promise<void>;
  setPassword: (neonUserId: string, password: string) => Promise<void>;
  markEmailVerified: (neonUserId: string) => Promise<void>;
  revokeSessions: (neonUserId: string) => Promise<void>;
  generate?: () => string;
};

export type IssueResult = { password: string; email: string; userName: string; expiresAt: string };

export async function issueTemporaryPasswordFlow(deps: IssueDeps): Promise<IssueResult> {
  const record = await deps.issueRecord();
  try {
    const email = record.email.trim().toLowerCase();
    const authUserId = record.authUserId ?? (await deps.ensureShadowLogin(email));
    // O banco confere o login ANTES de qualquer senha ser gravada no provedor.
    await deps.attachLogin(record.id, authUserId);
    let neonUser = await deps.findNeonUser(email);
    if (!neonUser) {
      try {
        neonUser = await deps.createNeonUser(email, record.userName);
      } catch (error) {
        if (error instanceof NeonAuthError && error.code === "USER_EXISTS") neonUser = await deps.findNeonUser(email);
        if (!neonUser) throw error;
      }
    }
    await deps.link(neonUser.id, email, authUserId);
    const password = (deps.generate ?? generateTemporaryPassword)();
    await deps.setPassword(neonUser.id, password);
    // O Administrador responde pelo e-mail do cadastro; até a troca, o banco
    // bloqueia a identidade de qualquer forma (0095).
    if (!neonUser.emailVerified) await deps.markEmailVerified(neonUser.id);
    // Sessões abertas (de quem já tinha acesso) caem na hora.
    await deps.revokeSessions(neonUser.id);
    return { password, email, userName: record.userName, expiresAt: record.expiresAt };
  } catch (error) {
    // Sem senha gravada não pode sobrar pendência: ela bloquearia o acesso.
    await deps.revokeRecord().catch(() => undefined);
    throw error;
  }
}

// ------------------------------------------------------------ revogar (Administrador)

export type RevokeDeps = {
  revokeRecord: () => Promise<{ revoked: boolean; email: string }>;
  findNeonUser: (email: string) => Promise<NeonUser | null>;
  setPassword: (neonUserId: string, password: string) => Promise<void>;
  revokeSessions: (neonUserId: string) => Promise<void>;
  generate?: () => string;
};

/** Revoga a pendente; no provedor, a provisória é trocada por uma senha que ninguém conhece. */
export async function revokeTemporaryPasswordFlow(deps: RevokeDeps): Promise<{ revoked: boolean }> {
  const result = await deps.revokeRecord();
  if (!result.revoked) return { revoked: false };
  const neonUser = await deps.findNeonUser(result.email.trim().toLowerCase());
  if (neonUser) {
    await deps.setPassword(neonUser.id, (deps.generate ?? generateDiscardPassword)());
    await deps.revokeSessions(neonUser.id);
  }
  return { revoked: true };
}

// ------------------------------------------------------------ troca obrigatória (pessoa)

export type PendingState = { id: string; authUserId: string; status: "pending" | "expired" };

export type ChangeDeps = SignInDeps & {
  /** fn_temporary_password_state (service_role) pela identidade do Neon. */
  state: (neonUserId: string) => Promise<PendingState | null>;
  changePassword: (cookie: string, currentPassword: string, newPassword: string) => Promise<void>;
  /** fn_consume_temporary_password (service_role): liga o login ao cadastro. */
  consume: (recordId: string, authUserId: string) => Promise<void>;
};

/**
 * Login com a provisória + senha nova numa única chamada. Nenhum cookie do
 * ATLAS.ERP é gravado antes de a senha nova existir: a troca é obrigatória
 * por construção, não por uma tela que se pode pular.
 */
export async function changeTemporaryPasswordFlow(
  input: { email: string; temporaryPassword: string; newPassword: string },
  deps: ChangeDeps
): Promise<SignInOutcome> {
  if (input.newPassword === input.temporaryPassword) {
    throw new TemporaryPasswordError("SAME_PASSWORD", "A nova senha precisa ser diferente da senha provisória.");
  }
  const { cookie, user } = await deps.signIn(input.email, input.temporaryPassword);
  const pending = await deps.state(user.id).catch(async (error) => {
    await deps.signOut(cookie).catch(() => undefined);
    throw error;
  });
  if (!pending || pending.status !== "pending") {
    await deps.signOut(cookie).catch(() => undefined);
    if (pending?.status === "expired") throw new TemporaryPasswordError("EXPIRED", "A senha provisória expirou. Peça uma nova ao administrador.");
    throw new TemporaryPasswordError("NOT_PENDING", "Não há senha provisória pendente para esta conta. Entre com a sua senha.");
  }
  await deps.changePassword(cookie, input.temporaryPassword, input.newPassword);
  await deps.consume(pending.id, pending.authUserId);
  await deps.signOut(cookie).catch(() => undefined);
  return signInFlow(input.email, input.newPassword, deps);
}

/** Depois de um login recusado: é porque falta trocar a senha provisória? */
export function temporaryPasswordBlock(state: PendingState | null): "change_required" | "expired" | null {
  if (!state) return null;
  return state.status === "pending" ? "change_required" : "expired";
}
