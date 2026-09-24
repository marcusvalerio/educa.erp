import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "./response";
import { dbError, parseJson, requireCompanyUser, requirePlatformMember, requireSession, type IdRouteContext } from "./governance";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, validationError } from "@/lib/database/errors";
import {
  acceptInvitationSchema,
  buildFirstAccessUrl,
  buildInviteUrl,
  createCompanyRpcArgs,
  createCompanySchema,
  createInvitationSchema,
  DEFAULT_INVITE_TTL_HOURS,
  deliverAuthInvite,
  invitationStatus,
  invitationTokenSchema,
  inviteCompanyAdminSchema,
  invitePlatformMemberSchema,
  resolveAppOrigin,
  type Delivery,
} from "@/lib/onboarding/invitations";

// Onboarding & identidade.
//
// Regra de ouro: TODA decisão de acesso é do banco (0071 + funções
// existentes), chamada com o cliente do USUÁRIO — RLS e
// has_permission/has_platform_permission valem. O cliente service_role
// aparece em um único ponto: enviar o e-mail de convite do Supabase Auth
// (auth.admin.inviteUserByEmail), DEPOIS que o banco já aceitou o
// convite. O e-mail enviado é sempre o que o banco devolveu — nunca um
// valor vindo do navegador — e nenhum dado do Auth volta para o cliente.

const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status });

type InvitationRpcResult = {
  invitation_id: string;
  token: string;
  email: string;
  kind: "USER" | "COMPANY_ADMIN";
  expires_at: string;
  user_id: string;
  user_name: string;
};

function appOrigin(request: NextRequest): string {
  return resolveAppOrigin(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL, request.nextUrl.origin);
}

async function sendAuthInvite(email: string, redirectTo: string): Promise<Delivery> {
  // Sem service role configurada, não há envio: o link continua válido
  // para entrega manual.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { delivered: false, reason: "email_unavailable" };
  const admin = createAdminClient();
  return deliverAuthInvite((to, options) => admin.auth.admin.inviteUserByEmail(to, options), email, redirectTo);
}

/** Resposta de convite para quem convidou: sem token cru fora do link, sem ids do Auth. */
function invitationResponse(result: InvitationRpcResult, inviteUrl: string, delivery: Delivery) {
  return {
    invitationId: result.invitation_id,
    email: result.email,
    userName: result.user_name,
    kind: result.kind,
    expiresAt: result.expires_at,
    inviteUrl,
    emailSent: delivery.delivered,
    deliveryNote: delivery.delivered
      ? null
      : delivery.reason === "existing_account"
        ? "Este e-mail já possui uma conta. Envie o link: a pessoa entra com a senha atual e aceita o convite."
        : "O e-mail não pôde ser enviado agora. Copie o link e envie por um canal seguro.",
  };
}

// ------------------------------------------------------------ convidado
// GET /api/onboarding/invitations/:token — prévia do convite (pública:
// quem tem o token é o convidado). Sem ids, e-mail mascarado.
export async function getInvitationPreview(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const parsed = invitationTokenSchema.safeParse(token);
    if (!parsed.success) return ok({ status: "invalid" });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_get_invitation", { p_token: parsed.data });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/onboarding/invitations/accept { token }
// A identidade é a da sessão (auth.uid() no banco); empresa, cadastro e
// papel vêm do convite. O corpo só carrega o token.
export async function acceptInvitation(request: NextRequest) {
  try {
    const { supabase } = await requireSession();
    const body = await parseJson(request, acceptInvitationSchema);
    const { data, error } = await supabase.rpc("fn_accept_user_invitation", { p_token: body.token });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ Company Admin
// GET /api/admin/invitations — convites da empresa (RLS: users.read).
export async function listCompanyInvitations() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { data, error } = await supabase
      .from("user_invitations")
      .select("id, user_id, email, kind, status, expires_at, created_at, accepted_at, revoked_at, created_by_label")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    const now = new Date();
    return ok((data ?? []).map((row) => ({ ...row, status: invitationStatus(row as { status: string; expires_at: string }, now) })));
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/admin/users/:id/invitation { ttlHours? }
// O cadastro vem da URL; a empresa, do próprio cadastro no banco —
// fn_create_user_invitation recusa (42501) se quem chama não tem
// users.update NAQUELA empresa.
export async function createUserInvitation(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    // Corpo opcional (sem corpo = validade padrão), mas se vier, é estrito.
    const raw = await request.json().catch(() => ({}));
    const parsed = createInvitationSchema.safeParse(raw ?? {});
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const { data, error } = await supabase.rpc("fn_create_user_invitation", {
      p_user_id: id,
      p_ttl_hours: parsed.data.ttlHours ?? DEFAULT_INVITE_TTL_HOURS,
    });
    if (error) throw dbError(error);
    const result = data as InvitationRpcResult;
    const inviteUrl = buildInviteUrl(appOrigin(request), result.token);
    const delivery = await sendAuthInvite(result.email, inviteUrl);
    return ok(invitationResponse(result, inviteUrl, delivery), 201);
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE /api/admin/invitations/:id
export async function revokeUserInvitation(_request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const { error } = await supabase.rpc("fn_revoke_user_invitation", { p_invitation_id: id });
    if (error) throw dbError(error);
    return ok({ revoked: true });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ plataforma
// POST /api/platform/companies — cria a empresa (platform.companies.create).
export async function createPlatformCompany(request: NextRequest) {
  try {
    const { supabase } = await requirePlatformMember();
    const body = await parseJson(request, createCompanySchema);
    const { data, error } = await supabase.rpc("fn_platform_create_company", createCompanyRpcArgs(body));
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

// GET /api/platform/companies/:id/onboarding — há admin com acesso? convite pendente?
export async function getPlatformCompanyOnboarding(_request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const { data, error } = await supabase.rpc("fn_platform_company_onboarding", { p_company_id: id });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/platform/companies/:id/admin-invitation { name, email }
// Primeiro administrador da empresa. A plataforma não escolhe papel nem
// permissões: o banco atribui o papel de sistema "admin" DAQUELA empresa.
export async function inviteCompanyAdmin(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const body = await parseJson(request, inviteCompanyAdminSchema);
    const { data, error } = await supabase.rpc("fn_platform_invite_company_admin", {
      p_company_id: id,
      p_name: body.name,
      p_email: body.email,
      p_ttl_hours: DEFAULT_INVITE_TTL_HOURS,
    });
    if (error) throw dbError(error);
    const result = data as InvitationRpcResult;
    const inviteUrl = buildInviteUrl(appOrigin(request), result.token);
    const delivery = await sendAuthInvite(result.email, inviteUrl);
    return ok(invitationResponse(result, inviteUrl, delivery), 201);
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/platform/members/invite { name, email, platformRole }
// Membro da plataforma por e-mail (sem digitar UUID). Ordem:
//   1. o banco confirma que quem chama pode administrar membros — e, para
//      OWNER, que quem chama é OWNER — ANTES de qualquer login ser criado;
//   2. localiza o login existente ou cria por convite do Supabase Auth;
//   3. fn_upsert_platform_member (cliente do usuário) grava, aplica as
//      regras Owner/Admin/último Owner e audita.
export async function invitePlatformMember(request: NextRequest) {
  try {
    const { supabase } = await requirePlatformMember();
    const body = await parseJson(request, invitePlatformMemberSchema);

    const [manage, owner] = await Promise.all([
      supabase.rpc("has_platform_permission", { p_code: "platform.members.manage" }),
      supabase.rpc("is_platform_owner"),
    ]);
    if (manage.error) throw dbError(manage.error);
    if (!manage.data) throw new ApiError("FORBIDDEN", "Permissão negada (platform.members.manage).", 403);
    if (body.platformRole === "OWNER" && !owner.data) {
      throw new ApiError("FORBIDDEN", "Apenas um Platform Owner pode conceder o papel de Owner.", 403);
    }

    const found = await supabase.rpc("fn_platform_auth_user_id", { p_email: body.email });
    if (found.error) throw dbError(found.error);
    let authUserId = (found.data as string | null) ?? null;
    let emailSent = false;
    if (!authUserId) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new ApiError("SERVICE_UNAVAILABLE", "O envio de convites não está configurado neste ambiente.", 503);
      }
      const redirectTo = buildFirstAccessUrl(appOrigin(request), "/admincentral");
      const delivery = await sendAuthInvite(body.email, redirectTo);
      if (!delivery.delivered || !delivery.authUserId) {
        throw new ApiError("SERVICE_UNAVAILABLE", "Não foi possível enviar o convite por e-mail agora. Tente novamente em instantes.", 503);
      }
      authUserId = delivery.authUserId;
      emailSent = true;
    }

    const { data, error } = await supabase.rpc("fn_upsert_platform_member", {
      p_auth_user_id: authUserId,
      p_name: body.name,
      p_email: body.email,
      p_platform_role: body.platformRole,
      p_status: "active",
    });
    if (error) throw dbError(error);
    return ok({ memberId: data, emailSent, existingAccount: !emailSent }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
