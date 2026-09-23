import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "./response";
import { dbError, parseJson, requirePlatformMember, type IdRouteContext } from "./governance";
import { companyLifecycleStatusSchema, upsertPlatformMemberSchema } from "@/lib/validations/platform";

// /api/platform/* — Administração Central (Platform Owner / Platform Admin).
//
// Estas rotas administram a PLATAFORMA. Nenhuma delas lê dados
// operacionais de empresas (pedidos, estoque, financeiro...) — e nem
// conseguiria: has_permission não tem bypass de plataforma. Não existe
// aqui impersonation, "entrar como empresa" nem acesso de suporte.
//
// Limite da arquitetura atual (registrado, não contornado): a policy de
// public.companies só expõe a linha da empresa aos seus próprios membros.
// A plataforma enxerga cada empresa pelo seu perfil SaaS
// (company_platform_profiles) e pelos módulos contratados, identificada
// pelo id — não pelo nome/razão social.

const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status });

export async function getPlatformOverview() {
  try {
    const { supabase, platformRole } = await requirePlatformMember();
    const [profiles, modules, members, contracted] = await Promise.all([
      supabase.from("company_platform_profiles").select("lifecycle_status"),
      supabase.from("platform_modules").select("code, is_core, status"),
      supabase.from("platform_members").select("platform_role, status"),
      supabase.from("company_modules").select("module_code, contracted, enabled_by_company"),
    ]);
    const lifecycle: Record<string, number> = {};
    for (const row of profiles.data ?? []) {
      const key = row.lifecycle_status as string;
      lifecycle[key] = (lifecycle[key] ?? 0) + 1;
    }
    const moduleAdoption: Record<string, { contracted: number; enabled: number }> = {};
    for (const row of contracted.data ?? []) {
      const entry = moduleAdoption[row.module_code as string] ?? { contracted: 0, enabled: 0 };
      if (row.contracted) entry.contracted += 1;
      if (row.contracted && row.enabled_by_company) entry.enabled += 1;
      moduleAdoption[row.module_code as string] = entry;
    }
    return ok({
      role: platformRole,
      companies: { total: profiles.data?.length ?? 0, byLifecycle: lifecycle, visible: !profiles.error },
      modules: { total: modules.data?.length ?? 0, core: (modules.data ?? []).filter((m) => m.is_core).length, adoption: moduleAdoption },
      members: members.error
        ? null
        : {
            total: members.data?.length ?? 0,
            owners: (members.data ?? []).filter((m) => m.platform_role === "OWNER" && m.status === "active").length,
            admins: (members.data ?? []).filter((m) => m.platform_role === "ADMIN" && m.status === "active").length,
          },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listPlatformCompanies() {
  try {
    const { supabase } = await requirePlatformMember();
    const [profiles, companyModules] = await Promise.all([
      supabase
        .from("company_platform_profiles")
        .select("company_id, lifecycle_status, plan_code, contracted_at, suspended_at, cancelled_at, notes, created_at, updated_at")
        .order("created_at", { ascending: true }),
      supabase.from("company_modules").select("company_id, contracted, enabled_by_company"),
    ]);
    if (profiles.error) throw dbError(profiles.error);
    const counts = new Map<string, { contracted: number; enabled: number }>();
    for (const row of companyModules.data ?? []) {
      const entry = counts.get(row.company_id as string) ?? { contracted: 0, enabled: 0 };
      if (row.contracted) entry.contracted += 1;
      if (row.contracted && row.enabled_by_company) entry.enabled += 1;
      counts.set(row.company_id as string, entry);
    }
    return ok(
      (profiles.data ?? []).map((row) => ({
        ...row,
        modules_contracted: counts.get(row.company_id as string)?.contracted ?? 0,
        modules_enabled: counts.get(row.company_id as string)?.enabled ?? 0,
      }))
    );
  } catch (error) {
    return jsonError(error);
  }
}

const lifecycleBody = z.object({ lifecycleStatus: companyLifecycleStatusSchema, notes: z.string().trim().optional() });

export async function setPlatformCompanyLifecycle(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const body = await parseJson(request, lifecycleBody);
    const { data, error } = await supabase.rpc("fn_platform_set_company_lifecycle", {
      p_company_id: id,
      p_lifecycle_status: body.lifecycleStatus,
      p_notes: body.notes || null,
    });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function listPlatformCompanyModules(_request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const [modules, rows] = await Promise.all([
      supabase.from("platform_modules").select("code, name, category, is_core, sort_order, status").order("sort_order"),
      supabase.from("company_modules").select("module_code, contracted, enabled_by_company, contracted_at, disabled_at, notes").eq("company_id", id),
    ]);
    if (modules.error) throw dbError(modules.error);
    if (rows.error) throw dbError(rows.error);
    const byCode = new Map((rows.data ?? []).map((row) => [row.module_code as string, row]));
    return ok(
      (modules.data ?? []).map((mod) => {
        const row = byCode.get(mod.code as string);
        return {
          ...mod,
          contracted: row ? (row.contracted as boolean) : null,
          enabled_by_company: row ? (row.enabled_by_company as boolean) : null,
          contracted_at: row?.contracted_at ?? null,
          notes: row?.notes ?? null,
        };
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

const contractBody = z.object({
  moduleCode: z.string().trim().min(1, "Informe o módulo."),
  contracted: z.boolean(),
  notes: z.string().trim().optional(),
});

export async function setPlatformCompanyModule(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const body = await parseJson(request, contractBody);
    const { data, error } = await supabase.rpc("fn_platform_set_company_module", {
      p_company_id: id,
      p_module_code: body.moduleCode,
      p_contracted: body.contracted,
      p_notes: body.notes || null,
    });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function listPlatformModules() {
  try {
    const { supabase } = await requirePlatformMember();
    const [modules, map, rows] = await Promise.all([
      supabase.from("platform_modules").select("code, name, description, category, is_core, sort_order, status").order("sort_order"),
      supabase.from("platform_module_permission_map").select("permission_module, module_code"),
      supabase.from("company_modules").select("module_code, contracted, enabled_by_company"),
    ]);
    if (modules.error) throw dbError(modules.error);
    const permissionModules = new Map<string, string[]>();
    for (const row of map.data ?? []) {
      const list = permissionModules.get(row.module_code as string) ?? [];
      list.push(row.permission_module as string);
      permissionModules.set(row.module_code as string, list);
    }
    const adoption = new Map<string, { contracted: number; enabled: number }>();
    for (const row of rows.data ?? []) {
      const entry = adoption.get(row.module_code as string) ?? { contracted: 0, enabled: 0 };
      if (row.contracted) entry.contracted += 1;
      if (row.contracted && row.enabled_by_company) entry.enabled += 1;
      adoption.set(row.module_code as string, entry);
    }
    return ok(
      (modules.data ?? []).map((mod) => ({
        ...mod,
        permission_modules: (permissionModules.get(mod.code as string) ?? []).sort(),
        companies_contracted: adoption.get(mod.code as string)?.contracted ?? 0,
        companies_enabled: adoption.get(mod.code as string)?.enabled ?? 0,
      }))
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function listPlatformMembers() {
  try {
    const { supabase } = await requirePlatformMember();
    const { data, error } = await supabase
      .from("platform_members")
      .select("id, auth_user_id, name, email, platform_role, status, created_at, updated_at")
      .order("platform_role", { ascending: false })
      .order("name");
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

// Cadastro/alteração de membro: quem decide o que é permitido (ADMIN só
// gerencia ADMIN; só OWNER mexe em OWNER; último OWNER protegido) é
// fn_upsert_platform_member + o trigger guard_last_platform_owner.
export async function upsertPlatformMember(request: NextRequest) {
  try {
    const { supabase } = await requirePlatformMember();
    const body = await parseJson(request, upsertPlatformMemberSchema);
    const { data, error } = await supabase.rpc("fn_upsert_platform_member", {
      p_auth_user_id: body.authUserId,
      p_name: body.name,
      p_email: body.email,
      p_platform_role: body.platformRole,
      p_status: body.status ?? "active",
    });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function listPlatformPermissions() {
  try {
    const { supabase } = await requirePlatformMember();
    const [perms, roleMap] = await Promise.all([
      supabase.from("platform_permissions").select("code, area, action, description, owner_only").order("area").order("code"),
      supabase.from("platform_role_permissions").select("platform_role, permission_code"),
    ]);
    if (perms.error) throw dbError(perms.error);
    const roles = new Map<string, string[]>();
    for (const row of roleMap.data ?? []) {
      const list = roles.get(row.permission_code as string) ?? [];
      list.push(row.platform_role as string);
      roles.set(row.permission_code as string, list);
    }
    return ok((perms.data ?? []).map((p) => ({ ...p, roles: (roles.get(p.code as string) ?? []).sort() })));
  } catch (error) {
    return jsonError(error);
  }
}

// Somente eventos DA PLATAFORMA (company_id nulo) — policy
// audit_logs_select_platform. Eventos de tenant não aparecem aqui.
export async function listPlatformAudit(request: NextRequest) {
  try {
    const { supabase } = await requirePlatformMember();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") ?? 25) || 25));
    let query = supabase
      .from("audit_logs")
      .select("id, actor_label, entity, entity_id, action, old_data, new_data, created_at", { count: "exact" })
      .is("company_id", null)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    const entity = params.get("entity");
    const action = params.get("action");
    if (entity) query = query.eq("entity", entity);
    if (action) query = query.eq("action", action);
    const { data, error, count } = await query;
    if (error) throw dbError(error);
    return NextResponse.json({ success: true, data: data ?? [], meta: { total: count ?? 0, page, pageSize } });
  } catch (error) {
    return jsonError(error);
  }
}
