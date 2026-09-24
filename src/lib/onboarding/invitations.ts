import { z } from "zod";

// Convites e entrega por e-mail — lógica pura (sem "server-only", sem
// Supabase importado): as rotas injetam os clientes. Isso permite testar
// as regras sem rede nem segredo.
//
// O que NUNCA vem do cliente: company_id, user_id do convite, role_id,
// códigos de permissão, auth_user_id. Os schemas abaixo são estritos —
// qualquer campo a mais é rejeitado, em vez de silenciosamente ignorado,
// para que uma tentativa de injetar contexto falhe de forma visível.

export const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const MIN_INVITE_TTL_HOURS = 1;
export const MAX_INVITE_TTL_HOURS = 720;
export const DEFAULT_INVITE_TTL_HOURS = 168;

const email = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254);
const name = z.string().trim().min(1, "Informe o nome.").max(160);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Objeto estrito: campo desconhecido (ex.: company_id, role_id) é erro. */
function strict<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape, {
    error: (issue) => (issue.code === "unrecognized_keys" ? `Campo não permitido: ${issue.keys.join(", ")}.` : undefined),
  });
}

export const invitationTokenSchema = z.string().trim().regex(INVITATION_TOKEN_PATTERN, "Convite inválido.");

export const createInvitationSchema = strict({
    ttlHours: z.number().int().min(MIN_INVITE_TTL_HOURS).max(MAX_INVITE_TTL_HOURS).optional(),
  });

export const acceptInvitationSchema = strict({ token: invitationTokenSchema });

export const createCompanySchema = strict({
    name: z.string().trim().min(1, "Informe o nome da empresa.").max(160),
    legalName: optionalText(200),
    document: optionalText(32),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success, "Informe um e-mail válido.")
      .transform((v) => (v ? v : undefined)),
    phone: optionalText(32),
    address: optionalText(240),
    city: optionalText(120),
    state: optionalText(2),
    zipCode: optionalText(16),
    planCode: optionalText(64),
    lifecycleStatus: z.enum(["TRIAL", "ACTIVE"]).optional(),
    branchCode: optionalText(16),
    branchName: optionalText(120),
  })
  .refine((v) => !!v.branchCode === !!v.branchName, { message: "Para criar a unidade inicial, informe código e nome.", path: ["branchName"] });

export const inviteCompanyAdminSchema = strict({ name, email });

export const invitePlatformMemberSchema = strict({ name, email, platformRole: z.enum(["OWNER", "ADMIN"]) });

export const recoverPasswordSchema = strict({ email });

/** Política mínima de senha (o Supabase Auth pode exigir mais). */
export const newPasswordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letras e números na senha.");

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

/** Parâmetros da RPC fn_platform_create_company a partir do corpo validado. */
export function createCompanyRpcArgs(input: CreateCompanyInput) {
  return {
    p_name: input.name,
    p_legal_name: input.legalName ?? null,
    p_document: input.document ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_address: input.address ?? null,
    p_city: input.city ?? null,
    p_state: input.state ?? null,
    p_zip_code: input.zipCode ?? null,
    p_plan_code: input.planCode ?? null,
    p_lifecycle_status: input.lifecycleStatus ?? "TRIAL",
    p_branch_code: input.branchCode ?? null,
    p_branch_name: input.branchName ?? null,
  };
}

// ---------------------------------------------------------------- URLs
/**
 * Origem usada nos links enviados por e-mail. Preferência para a URL
 * configurada no servidor (APP_URL) — o cabeçalho Host da requisição não
 * decide para onde um link com token vai. Sem APP_URL, usa a origem da
 * requisição (o Supabase ainda só aceita destinos da lista de Redirect
 * URLs do projeto).
 */
export function resolveAppOrigin(configured: string | undefined, requestOrigin: string): string {
  const candidate = configured?.trim();
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // valor inválido: cai na origem da requisição
    }
  }
  return new URL(requestOrigin).origin;
}

export function buildInviteUrl(origin: string, token: string): string {
  if (!INVITATION_TOKEN_PATTERN.test(token)) throw new Error("Token de convite inválido.");
  return `${new URL(origin).origin}/convite/${token}`;
}

/** Link de primeiro acesso para quem só tem o login criado (membro da plataforma). */
export function buildFirstAccessUrl(origin: string, next: string): string {
  const url = new URL("/redefinir-senha", new URL(origin).origin);
  url.searchParams.set("primeiro-acesso", "1");
  url.searchParams.set("next", next);
  return url.toString();
}

export function buildRecoveryCallbackUrl(origin: string): string {
  const url = new URL("/auth/callback", new URL(origin).origin);
  url.searchParams.set("next", "/redefinir-senha");
  return url.toString();
}

// ---------------------------------------------------------------- entrega
export type InviteByEmail = (
  email: string,
  options: { redirectTo: string; data?: Record<string, unknown> }
) => Promise<{ data: { user: { id: string } | null } | null; error: { status?: number; code?: string; message?: string } | null }>;

export type Delivery =
  | { delivered: true; authUserId: string | null }
  | { delivered: false; reason: "existing_account" | "email_unavailable" };

function isExistingAccount(error: { status?: number; code?: string; message?: string }): boolean {
  return error.code === "email_exists" || error.code === "user_already_exists" || /already (been )?registered|already exists/i.test(error.message ?? "");
}

/**
 * Envia o convite do Supabase Auth (cria o login e manda o e-mail). Se o
 * e-mail já tem conta, ou se o envio falhar (SMTP, limite), NÃO é erro
 * para quem convidou: o convite do EDUCA já existe e o link pode ser
 * entregue por outro canal. Nunca devolve detalhe técnico do provedor.
 */
export async function deliverAuthInvite(inviteByEmail: InviteByEmail, email: string, redirectTo: string): Promise<Delivery> {
  try {
    const { data, error } = await inviteByEmail(email, { redirectTo, data: { educa_password_pending: true } });
    if (error) return { delivered: false, reason: isExistingAccount(error) ? "existing_account" : "email_unavailable" };
    return { delivered: true, authUserId: data?.user?.id ?? null };
  } catch {
    return { delivered: false, reason: "email_unavailable" };
  }
}

// ---------------------------------------------------------------- situação
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export function invitationStatus(row: { status: string; expires_at: string }, now = new Date()): InvitationStatus {
  if (row.status === "pending" && new Date(row.expires_at).getTime() < now.getTime()) return "expired";
  return row.status as InvitationStatus;
}

/**
 * Situação de acesso de um cadastro na Administração da Empresa:
 * ativo com login, convite pendente/expirado, sem login, inativo.
 */
export type UserAccessStatus = "active" | "invite_pending" | "invite_expired" | "no_login" | "inactive";

export function userAccessStatus(user: { status: string; has_login: boolean }, invitation: { status: string; expires_at: string } | null, now = new Date()): UserAccessStatus {
  if (user.status !== "active") return "inactive";
  if (user.has_login) return "active";
  if (invitation) {
    const s = invitationStatus(invitation, now);
    if (s === "pending") return "invite_pending";
    if (s === "expired") return "invite_expired";
  }
  return "no_login";
}
