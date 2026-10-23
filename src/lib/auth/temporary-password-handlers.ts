import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { jsonError } from "@/lib/api/response";
import { dbError, parseJson, requireCompanyUser, requirePlatformMember, type IdRouteContext } from "@/lib/api/governance";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { ApiError } from "@/lib/database/errors";
import { newPasswordSchema } from "@/lib/onboarding/invitations";
import { authProvider } from "./provider";
import {
  changeTemporaryPasswordFlow,
  issueTemporaryPasswordFlow,
  resetPasswordFlow,
  revokeTemporaryPasswordFlow,
  TEMPORARY_PASSWORD_META,
  TEMPORARY_PASSWORD_TTL_HOURS,
  TemporaryPasswordError,
  type AuthLogin,
} from "./temporary-password";

// Rotas da senha provisória (AUTH_PROVIDER=supabase). Toda decisão de
// acesso é do banco, chamado com o cliente do ADMINISTRADOR
// (fn_create_user_invitation / fn_revoke_user_invitation) ou da PRÓPRIA
// pessoa (fn_accept_user_invitation). A service_role só mexe no login do
// Supabase Auth, depois de o banco autorizar.

const noStore = { "Cache-Control": "no-store" };
const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status, headers: noStore });

const STATUS: Record<TemporaryPasswordError["code"], [string, number]> = {
  NOT_PENDING: ["NOT_PENDING", 409],
  EXPIRED: ["TEMPORARY_PASSWORD_EXPIRED", 403],
  SAME_PASSWORD: ["VALIDATION_ERROR", 422],
  ACCOUNT_IN_USE: ["BUSINESS_RULE", 422],
  INVALID_CREDENTIALS: ["INVALID_CREDENTIALS", 401],
};

function toApiError(error: unknown): unknown {
  if (error instanceof TemporaryPasswordError) {
    const [code, status] = STATUS[error.code];
    return new ApiError(code, error.message, status);
  }
  if (error && typeof error === "object" && "code" in error && "message" in error && !(error instanceof Error)) {
    return dbError(error as { code?: string; message?: string });
  }
  return error;
}

function requireSupabaseAuth() {
  if (authProvider() !== "supabase") throw new ApiError("NOT_AVAILABLE", "Senha provisória indisponível neste ambiente.", 501);
}

// ------------------------------------------------------------ Supabase Auth (service_role)

function toLogin(user: { id: string; app_metadata?: Record<string, unknown>; last_sign_in_at?: string | null }): AuthLogin {
  return { id: user.id, appMetadata: user.app_metadata ?? {}, lastSignInAt: user.last_sign_in_at ?? null };
}

async function findLogin(email: string): Promise<AuthLogin | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Falha ao consultar logins.");
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return toLogin(found);
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function loginInUse(authUserId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [users, platform] = await Promise.all([
    admin.from("users").select("id").eq("auth_user_id", authUserId).limit(1),
    admin.from("platform_members").select("id").eq("auth_user_id", authUserId).limit(1),
  ]);
  if (users.error || platform.error) throw new Error("Falha ao conferir o login.");
  return (users.data?.length ?? 0) > 0 || (platform.data?.length ?? 0) > 0;
}

/** O Auth mescla app_metadata: chave ausente não apaga, então a marca vai como null. */
function appMetadataUpdate(appMetadata: Record<string, unknown>) {
  return TEMPORARY_PASSWORD_META in appMetadata ? appMetadata : { ...appMetadata, [TEMPORARY_PASSWORD_META]: null };
}

async function updateLogin(authUserId: string, change: { password?: string; appMetadata?: Record<string, unknown> }) {
  const { error } = await createAdminClient().auth.admin.updateUserById(authUserId, {
    ...(change.password ? { password: change.password } : {}),
    ...(change.appMetadata ? { app_metadata: appMetadataUpdate(change.appMetadata) } : {}),
  });
  if (error) {
    if (/weak|pwned|password/i.test(`${error.code ?? ""} ${error.message}`) && change.password) {
      throw new ApiError("VALIDATION_ERROR", "Esta senha é fraca ou conhecida em vazamentos. Escolha outra.", 422);
    }
    throw new Error("Não foi possível atualizar o login.");
  }
}

/** Cliente anônimo sem cookies: nada do login provisório chega ao navegador. */
function anonClient(accessToken?: string) {
  return createSupabaseJsClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

// ------------------------------------------------------------ Administrador

const issueSchema = z.object({ ttlHours: z.number().int().min(1).max(168).optional() }).strict();

// POST /api/admin/users/:id/temporary-password { ttlHours? }
export async function issueTemporaryPassword(request: NextRequest, context: IdRouteContext) {
  try {
    requireSupabaseAuth();
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const raw = await request.json().catch(() => ({}));
    const parsed = issueSchema.safeParse(raw ?? {});
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Dados inválidos.", 422);
    const result = await issueTemporaryPasswordFlow({
      createInvitation: async () => {
        const { data, error } = await supabase.rpc("fn_create_user_invitation", { p_user_id: id, p_ttl_hours: parsed.data.ttlHours ?? TEMPORARY_PASSWORD_TTL_HOURS });
        if (error) throw dbError(error);
        const r = data as { invitation_id: string; token: string; email: string; user_id: string; user_name: string; expires_at: string };
        return { invitationId: r.invitation_id, token: r.token, email: r.email, userId: r.user_id, userName: r.user_name, expiresAt: r.expires_at };
      },
      revokeInvitation: async (invitationId) => {
        await supabase.rpc("fn_revoke_user_invitation", { p_invitation_id: invitationId });
      },
      findLogin,
      loginInUse,
      createLogin: async (email, password, appMetadata) => {
        const { error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true, app_metadata: appMetadata, user_metadata: {} });
        if (error) throw new Error("Não foi possível criar o login.");
      },
      updateLogin: (authUserId, change) => updateLogin(authUserId, change),
    });
    return ok(result, 201);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// DELETE /api/admin/users/:id/temporary-password
export async function revokeTemporaryPassword(_request: NextRequest, context: IdRouteContext) {
  try {
    requireSupabaseAuth();
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const result = await revokeTemporaryPasswordFlow({
      pendingInvitation: async () => {
        const { data, error } = await supabase.from("user_invitations").select("id, email, user_id").eq("user_id", id).eq("status", "pending").limit(1).maybeSingle();
        if (error) throw dbError(error);
        return data ? { id: data.id as string, email: data.email as string, userId: data.user_id as string } : null;
      },
      revokeInvitation: async (invitationId) => {
        const { error } = await supabase.rpc("fn_revoke_user_invitation", { p_invitation_id: invitationId });
        if (error) throw dbError(error);
      },
      findLogin,
      updateLogin: (authUserId, change) => updateLogin(authUserId, change),
    });
    return ok(result);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// ------------------------------------------------------------ professor (Modo Estudo, 0096)
// Mesmo fluxo, com o convite emitido pelas funções da turma: o banco confere
// que o aluno é de um grupo da turma de quem chama.

type StudyInvitation = { invitation_id: string; token: string; email: string; user_id: string; user_name: string; expires_at: string };

// POST /api/admin/study/members/:id/temporary-password
export async function issueStudyMemberTemporaryPassword(_request: NextRequest, context: IdRouteContext) {
  try {
    requireSupabaseAuth();
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const result = await issueTemporaryPasswordFlow({
      createInvitation: async () => {
        const { data, error } = await supabase.rpc("fn_study_create_member_invitation", { p_user_id: id, p_ttl_hours: TEMPORARY_PASSWORD_TTL_HOURS });
        if (error) throw dbError(error);
        const r = data as StudyInvitation;
        return { invitationId: r.invitation_id, token: r.token, email: r.email, userId: r.user_id, userName: r.user_name, expiresAt: r.expires_at };
      },
      revokeInvitation: async (invitationId) => {
        await supabase.rpc("fn_study_revoke_member_invitation", { p_invitation_id: invitationId });
      },
      findLogin,
      loginInUse,
      createLogin: async (email, password, appMetadata) => {
        const { error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true, app_metadata: appMetadata, user_metadata: {} });
        if (error) throw new Error("Não foi possível criar o login.");
      },
      updateLogin: (authUserId, change) => updateLogin(authUserId, change),
    });
    return ok(result, 201);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// DELETE /api/admin/study/members/:id/temporary-password
export async function revokeStudyMemberTemporaryPassword(_request: NextRequest, context: IdRouteContext) {
  try {
    requireSupabaseAuth();
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const result = await revokeTemporaryPasswordFlow({
      pendingInvitation: async () => {
        const { data, error } = await supabase.rpc("fn_study_member_pending_invitation", { p_user_id: id });
        if (error) throw dbError(error);
        const r = data as { id: string; email: string; user_id: string } | null;
        return r ? { id: r.id, email: r.email, userId: r.user_id } : null;
      },
      revokeInvitation: async (invitationId) => {
        const { error } = await supabase.rpc("fn_study_revoke_member_invitation", { p_invitation_id: invitationId });
        if (error) throw dbError(error);
      },
      findLogin,
      updateLogin: (authUserId, change) => updateLogin(authUserId, change),
    });
    return ok(result);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// ------------------------------------------------------------ nova senha (quem já tem acesso)

async function getLogin(authUserId: string): Promise<AuthLogin | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(authUserId);
  if (error || !data.user) return null;
  return toLogin(data.user);
}

type ResetTarget = { user_id: string; auth_user_id: string; email: string; name: string };

async function resetWith(rpc: string, id: string) {
  requireSupabaseAuth();
  const { supabase } = await requireCompanyUser();
  return resetPasswordFlow({
    authorize: async () => {
      const { data, error } = await supabase.rpc(rpc, { p_user_id: id });
      if (error) throw dbError(error);
      const r = data as ResetTarget;
      return { userId: r.user_id, authUserId: r.auth_user_id, email: r.email, name: r.name };
    },
    getLogin,
    updateLogin: (authUserId, change) => updateLogin(authUserId, change),
  });
}

// POST /api/admin/users/:id/password-reset — Administrador da empresa.
export async function resetUserPassword(_request: NextRequest, context: IdRouteContext) {
  try {
    const { id } = await context.params;
    return ok(await resetWith("fn_authorize_password_reset", id), 201);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// POST /api/admin/study/members/:id/password-reset — professor da turma.
export async function resetStudyMemberPassword(_request: NextRequest, context: IdRouteContext) {
  try {
    const { id } = await context.params;
    return ok(await resetWith("fn_study_authorize_member_password_reset", id), 201);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// POST /api/platform/companies/:id/admin-password-reset — Administração
// Central: nova senha provisória do administrador da empresa (0122).
export async function resetCompanyAdminPassword(_request: NextRequest, context: IdRouteContext) {
  try {
    requireSupabaseAuth();
    const { id } = await context.params;
    const { supabase } = await requirePlatformMember();
    const result = await resetPasswordFlow({
      authorize: async () => {
        const { data, error } = await supabase.rpc("fn_platform_authorize_company_admin_password_reset", { p_company_id: id });
        if (error) throw dbError(error);
        const r = data as ResetTarget;
        return { userId: r.user_id, authUserId: r.auth_user_id, email: r.email, name: r.name };
      },
      getLogin,
      updateLogin: (authUserId, change) => updateLogin(authUserId, change),
    });
    return ok(result, 201);
  } catch (error) {
    return jsonError(toApiError(error));
  }
}

// ------------------------------------------------------------ pessoa (primeiro acesso)

const changeSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  temporaryPassword: z.string().min(1).max(72),
  newPassword: newPasswordSchema,
});

// POST /api/auth/password/temporary { email, temporaryPassword, newPassword }
// Público (quem tem a provisória é a pessoa). Não cria sessão: o navegador
// entra depois, com a senha nova.
export async function changeTemporaryPassword(request: NextRequest) {
  try {
    requireSupabaseAuth();
    const body = await parseJson(request, changeSchema);
    const admin = createAdminClient();
    await changeTemporaryPasswordFlow(body, {
      signIn: async (email, password) => {
        const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
        if (error || !data.session || !data.user) throw new Error("credenciais");
        return { accessToken: data.session.access_token, login: toLogin(data.user) };
      },
      signOut: async (accessToken) => {
        await admin.auth.admin.signOut(accessToken);
      },
      invitationStatus: async (token) => {
        const { data, error } = await anonClient().rpc("fn_get_invitation", { p_token: token });
        if (error) throw dbError(error);
        return String((data as { status?: string } | null)?.status ?? "invalid");
      },
      setPassword: (authUserId, password) => updateLogin(authUserId, { password }),
      accept: async (accessToken, token) => {
        const { error } = await anonClient(accessToken).rpc("fn_accept_user_invitation", { p_token: token });
        if (error) throw dbError(error);
      },
      linkedTo: async (authUserId, userId) => {
        const { data, error } = await admin.from("users").select("id").eq("id", userId).eq("auth_user_id", authUserId).maybeSingle();
        if (error) throw new Error("Falha ao conferir o cadastro.");
        return !!data;
      },
      clearMeta: (authUserId, appMetadata) => updateLogin(authUserId, { appMetadata }),
    });
    return ok({ changed: true });
  } catch (error) {
    return jsonError(toApiError(error));
  }
}
