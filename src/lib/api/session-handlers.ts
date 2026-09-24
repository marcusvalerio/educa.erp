import "server-only";

import { NextResponse } from "next/server";
import { jsonError } from "./response";
import { dbError, requireSession } from "./governance";
import type { FocusArea, PlatformContext, SessionContext, TenantContext } from "@/lib/session/types";
import { resolveAccessState } from "@/lib/onboarding/access";

// GET /api/session/context
//
// Consolida, numa única chamada, o contexto que o App Shell precisa:
//   - tenant: fn_user_context (empresa, unidades acessíveis, setor, cargo,
//     papéis, permissões efetivas, módulos habilitados) — null quando o
//     usuário não tem vínculo ativo com empresa (ex.: membro só da
//     plataforma);
//   - focus: fn_dashboard_context (prioridades de dashboard, já filtradas
//     por módulo habilitado + permissão);
//   - platform: papel e permissões de plataforma — null para quem não é
//     membro da plataforma;
//   - access: situação do login (active / inactive / unlinked /
//     no_company), para a UI explicar por que não há contexto — sem ids,
//     sem detalhe técnico.
// Os dois contextos são independentes de propósito: ser Platform Owner
// não produz tenant, e ser Company Admin não produz platform.
export async function getSessionContext() {
  try {
    const { supabase, authUserId, email } = await requireSession();

    const { data: appUser, error: userError } = await supabase
      .from("users")
      .select("company_id, status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (userError) throw dbError(userError);

    let tenant: TenantContext | null = null;
    let focus: FocusArea[] = [];
    if (appUser && appUser.status === "active") {
      const companyId = appUser.company_id as string;
      const [ctxResult, focusResult] = await Promise.all([
        supabase.rpc("fn_user_context", { p_company_id: companyId }),
        supabase.rpc("fn_dashboard_context", { p_company_id: companyId }),
      ]);
      if (ctxResult.error) throw dbError(ctxResult.error);
      tenant = (ctxResult.data as TenantContext | null) ?? null;
      // Foco de dashboard é enriquecimento: falha aqui não derruba a sessão.
      focus = focusResult.error ? [] : ((focusResult.data as FocusArea[] | null) ?? []);
    }

    let platform: PlatformContext | null = null;
    const { data: role, error: roleError } = await supabase.rpc("current_platform_role");
    if (roleError) throw dbError(roleError);
    if (role === "OWNER" || role === "ADMIN") {
      const [memberResult, permsResult] = await Promise.all([
        supabase.from("platform_members").select("name, email").eq("auth_user_id", authUserId).maybeSingle(),
        supabase.from("platform_role_permissions").select("permission_code").eq("platform_role", role),
      ]);
      if (permsResult.error) throw dbError(permsResult.error);
      platform = {
        role,
        name: (memberResult.data?.name as string | undefined) ?? null,
        email: (memberResult.data?.email as string | undefined) ?? null,
        permissions: (permsResult.data ?? []).map((row) => row.permission_code as string).sort(),
      };
    }

    const access = resolveAccessState(appUser ? { status: appUser.status as string } : null, !!tenant);
    const body: SessionContext = { authUser: { id: authUserId, email }, access, tenant, focus, platform };
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return jsonError(error);
  }
}
