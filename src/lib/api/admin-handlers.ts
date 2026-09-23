import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "./response";
import { dbError, parseJson, requireCompanyUser, type IdRouteContext } from "./governance";
import { notFoundError, validationError } from "@/lib/database/errors";
import {
  createCompanyRoleSchema,
  departmentSchema,
  positionSchema,
  setCompanyFocusRuleSchema,
  setRolePermissionsSchema,
  updateCompanyRoleSchema,
  updateDepartmentSchema,
  updatePositionSchema,
} from "@/lib/validations/organization";
import { setCompanyModuleEnabledSchema } from "@/lib/validations/platform";

// /api/admin/* — Administração da Empresa (Company Admin).
//
// Escopo: SEMPRE a empresa do próprio usuário (requireCompanyUser). Não
// existe parâmetro de empresa nestas rotas — um Company Admin não tem
// como sequer endereçar outra empresa. Leitura via RLS; escrita via as
// funções de 0066/0067/0068 (que checam permissão e auditam) ou via DML
// direto onde a própria policy decide (setores, cargos, unidades).

const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status });

// ------------------------------------------------------------------ usuários
export async function listAdminUsers() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const [users, userRoles, access] = await Promise.all([
      supabase
        .from("users")
        .select("id, code, name, email, login, status, branch_id, department_id, position_id, auth_user_id, created_at")
        .eq("company_id", companyId)
        .order("name"),
      supabase.from("user_roles").select("user_id, role_id"),
      supabase.from("user_branch_access").select("user_id, branch_id, is_primary").eq("company_id", companyId),
    ]);
    if (users.error) throw dbError(users.error);
    // user_roles/user_branch_access dependem de roles.read/org.view: sem
    // essas permissões a lista de usuários ainda aparece, sem os vínculos.
    const rolesByUser = new Map<string, string[]>();
    for (const row of userRoles.data ?? []) {
      const list = rolesByUser.get(row.user_id as string) ?? [];
      list.push(row.role_id as string);
      rolesByUser.set(row.user_id as string, list);
    }
    const accessByUser = new Map<string, Array<{ branchId: string; isPrimary: boolean }>>();
    for (const row of access.data ?? []) {
      const list = accessByUser.get(row.user_id as string) ?? [];
      list.push({ branchId: row.branch_id as string, isPrimary: row.is_primary as boolean });
      accessByUser.set(row.user_id as string, list);
    }
    const data = (users.data ?? []).map(({ auth_user_id, ...user }) => ({
      ...user,
      has_login: auth_user_id !== null,
      role_ids: rolesByUser.get(user.id as string) ?? [],
      branch_access: accessByUser.get(user.id as string) ?? [],
      links_visible: !userRoles.error && !access.error,
    }));
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

const orgContextBody = z.object({
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  positionId: z.string().uuid().nullable().optional(),
});

export async function setAdminUserOrgContext(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, orgContextBody);
    const { data, error } = await supabase.rpc("fn_set_user_org_context", {
      p_user_id: id,
      p_branch_id: body.branchId ?? null,
      p_department_id: body.departmentId ?? null,
      p_position_id: body.positionId ?? null,
    });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

const roleRefBody = z.object({ roleId: z.string().uuid("Papel inválido.") });

export async function assignAdminUserRole(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, roleRefBody);
    const { error } = await supabase.rpc("fn_assign_user_role", { p_user_id: id, p_role_id: body.roleId });
    if (error) throw dbError(error);
    return ok({ userId: id, roleId: body.roleId }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function revokeAdminUserRole(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const roleId = new URL(request.url).searchParams.get("roleId");
    if (!roleId) throw validationError("Informe o papel (roleId).");
    const { error } = await supabase.rpc("fn_revoke_user_role", { p_user_id: id, p_role_id: roleId });
    if (error) throw dbError(error);
    return ok({ userId: id, roleId });
  } catch (error) {
    return jsonError(error);
  }
}

const branchRefBody = z.object({ branchId: z.string().uuid("Unidade inválida."), isPrimary: z.boolean().optional() });

export async function grantAdminUserBranch(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, branchRefBody);
    const { data, error } = await supabase.rpc("fn_grant_user_branch_access", {
      p_user_id: id,
      p_branch_id: body.branchId,
      p_is_primary: body.isPrimary ?? false,
    });
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function revokeAdminUserBranch(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const branchId = new URL(request.url).searchParams.get("branchId");
    if (!branchId) throw validationError("Informe a unidade (branchId).");
    const { error } = await supabase.rpc("fn_revoke_user_branch_access", { p_user_id: id, p_branch_id: branchId });
    if (error) throw dbError(error);
    return ok({ userId: id, branchId });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ papéis
export async function listAdminRoles() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const [roles, rolePerms, userRoles] = await Promise.all([
      supabase
        .from("roles")
        .select("id, code, name, description, is_system, status, department_id, created_at, updated_at")
        .eq("company_id", companyId)
        .order("is_system", { ascending: false })
        .order("name"),
      supabase.from("role_permissions").select("role_id, permissions(code)"),
      supabase.from("user_roles").select("role_id"),
    ]);
    if (roles.error) throw dbError(roles.error);
    const permsByRole = new Map<string, string[]>();
    for (const row of (rolePerms.data ?? []) as Array<{ role_id: string; permissions: { code: string } | { code: string }[] | null }>) {
      const perm = Array.isArray(row.permissions) ? row.permissions[0] : row.permissions;
      if (!perm) continue;
      const list = permsByRole.get(row.role_id) ?? [];
      list.push(perm.code);
      permsByRole.set(row.role_id, list);
    }
    const usersByRole = new Map<string, number>();
    for (const row of userRoles.data ?? []) {
      usersByRole.set(row.role_id as string, (usersByRole.get(row.role_id as string) ?? 0) + 1);
    }
    return ok(
      (roles.data ?? []).map((role) => ({
        ...role,
        permission_codes: (permsByRole.get(role.id as string) ?? []).sort(),
        user_count: usersByRole.get(role.id as string) ?? 0,
      }))
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAdminRole(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const body = await parseJson(request, createCompanyRoleSchema);
    const { data, error } = await supabase.rpc("fn_create_company_role", {
      p_company_id: companyId,
      p_code: body.code,
      p_name: body.name,
      p_description: body.description ?? null,
      p_department_id: body.departmentId ?? null,
    });
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAdminRole(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, updateCompanyRoleSchema);
    const { data, error } = await supabase.rpc("fn_update_company_role", {
      p_role_id: id,
      p_name: body.name ?? null,
      p_description: body.description ?? null,
      p_status: body.status ?? null,
      p_department_id: body.departmentId ?? null,
    });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function setAdminRolePermissions(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, setRolePermissionsSchema);
    const { data, error } = await supabase.rpc("fn_set_role_permissions", {
      p_role_id: id,
      p_permission_codes: body.permissionCodes,
    });
    if (error) throw dbError(error);
    return ok({ roleId: id, count: data });
  } catch (error) {
    return jsonError(error);
  }
}

// Catálogo de permissões com o módulo da plataforma a que cada uma
// pertence (para a matriz módulo -> recurso -> ação da tela de papéis).
export async function listAdminPermissionCatalog() {
  try {
    const { supabase } = await requireCompanyUser();
    const [perms, map, modules, actions] = await Promise.all([
      supabase.from("permissions").select("code, module, resource, action, description").order("code"),
      supabase.from("platform_module_permission_map").select("permission_module, module_code"),
      supabase.from("platform_modules").select("code, name, sort_order, is_core").order("sort_order"),
      supabase.from("permission_actions").select("*"),
    ]);
    if (perms.error) throw dbError(perms.error);
    const moduleOf = new Map((map.data ?? []).map((row) => [row.permission_module as string, row.module_code as string]));
    return ok({
      permissions: (perms.data ?? []).map((p) => ({ ...p, module_code: moduleOf.get(p.module as string) ?? null })),
      modules: modules.data ?? [],
      actions: actions.data ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ setores
export async function listAdminDepartments() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { data, error } = await supabase
      .from("departments")
      .select("id, code, name, description, parent_id, status, created_at, updated_at")
      .eq("company_id", companyId)
      .order("name");
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAdminDepartment(request: NextRequest) {
  try {
    const { supabase, companyId, appUserId } = await requireCompanyUser();
    const body = await parseJson(request, departmentSchema);
    const { data, error } = await supabase
      .from("departments")
      .insert({
        company_id: companyId,
        code: body.code.toUpperCase(),
        name: body.name,
        description: body.description || null,
        parent_id: body.parentId ?? null,
        created_by: appUserId,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAdminDepartment(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, updateDepartmentSchema);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description || null;
    if ("parentId" in body) patch.parent_id = body.parentId ?? null;
    if (body.status !== undefined) patch.status = body.status;
    const { data, error } = await supabase
      .from("departments")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw notFoundError("Setor");
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ cargos
export async function listAdminPositions() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { data, error } = await supabase
      .from("positions")
      .select("id, code, name, description, department_id, seniority_level, status, created_at, updated_at")
      .eq("company_id", companyId)
      .order("name");
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAdminPosition(request: NextRequest) {
  try {
    const { supabase, companyId, appUserId } = await requireCompanyUser();
    const body = await parseJson(request, positionSchema);
    const { data, error } = await supabase
      .from("positions")
      .insert({
        company_id: companyId,
        code: body.code.toUpperCase(),
        name: body.name,
        description: body.description || null,
        department_id: body.departmentId ?? null,
        seniority_level: body.seniorityLevel ?? null,
        created_by: appUserId,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAdminPosition(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, updatePositionSchema);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description || null;
    if ("departmentId" in body) patch.department_id = body.departmentId ?? null;
    if (body.seniorityLevel !== undefined) patch.seniority_level = body.seniorityLevel;
    if (body.status !== undefined) patch.status = body.status;
    const { data, error } = await supabase
      .from("positions")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw notFoundError("Cargo");
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ unidades
const branchBody = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Informe o código.")
    .max(32, "Código muito longo.")
    .regex(/^[A-Za-z0-9_.-]+$/, "Use apenas letras, números, ponto, hífen ou underscore."),
  name: z.string().trim().min(1, "Informe o nome da unidade."),
});

const branchPatchBody = z.object({
  name: z.string().trim().min(1, "Informe o nome da unidade.").optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function listAdminBranches() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { data, error } = await supabase
      .from("branches")
      .select("id, code, name, status, created_at, updated_at")
      .eq("company_id", companyId)
      .order("code");
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAdminBranch(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const body = await parseJson(request, branchBody);
    const { data, error } = await supabase
      .from("branches")
      .insert({ company_id: companyId, code: body.code.toUpperCase(), name: body.name, status: "active" })
      .select()
      .single();
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAdminBranch(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, branchPatchBody);
    const { data, error } = await supabase
      .from("branches")
      .update(body)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw notFoundError("Unidade");
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ módulos
export async function listAdminModules() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const [modules, companyModules] = await Promise.all([
      supabase.from("platform_modules").select("code, name, description, category, is_core, sort_order, status").order("sort_order"),
      supabase
        .from("company_modules")
        .select("module_code, contracted, enabled_by_company, contracted_at, disabled_at")
        .eq("company_id", companyId),
    ]);
    if (modules.error) throw dbError(modules.error);
    if (companyModules.error) throw dbError(companyModules.error);
    const byCode = new Map((companyModules.data ?? []).map((row) => [row.module_code as string, row]));
    return ok(
      (modules.data ?? []).map((mod) => {
        const row = byCode.get(mod.code as string);
        return {
          ...mod,
          contracted: row ? (row.contracted as boolean) : null,
          enabled_by_company: row ? (row.enabled_by_company as boolean) : null,
          contracted_at: row?.contracted_at ?? null,
          disabled_at: row?.disabled_at ?? null,
        };
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

type CodeRouteContext = { params: Promise<{ code: string }> };

export async function setAdminModuleEnabled(request: NextRequest, context: CodeRouteContext) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { code } = await context.params;
    const body = await parseJson(request, setCompanyModuleEnabledSchema.pick({ enabled: true }));
    const { data, error } = await supabase.rpc("fn_company_set_module_enabled", {
      p_company_id: companyId,
      p_module_code: code,
      p_enabled: body.enabled,
    });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ auditoria
// Leitura crua de audit_logs via RLS (audit_logs.read): inclui as ações
// administrativas novas (GRANT, ASSIGN, ENABLE...) que a rota legada
// /api/audit-logs não rotula.
export async function listAdminAudit(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") ?? 25) || 25));
    let query = supabase
      .from("audit_logs")
      .select("id, actor_label, entity, entity_id, action, old_data, new_data, created_at", { count: "exact" })
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    const entity = params.get("entity");
    const action = params.get("action");
    const search = params.get("search");
    if (entity) query = query.eq("entity", entity);
    if (action) query = query.eq("action", action);
    if (search) query = query.ilike("actor_label", `%${search}%`);
    const { data, error, count } = await query;
    if (error) throw dbError(error);
    return NextResponse.json({ success: true, data: data ?? [], meta: { total: count ?? 0, page, pageSize } });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ prioridades de dashboard
export async function listAdminFocus() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const [areas, rules] = await Promise.all([
      supabase.from("dashboard_focus_areas").select("code, name, description, module_code, required_permission, default_priority, status").order("module_code").order("default_priority"),
      supabase
        .from("dashboard_focus_rules")
        .select("id, company_id, scope_type, scope_value, focus_code, priority, is_suppressed, status")
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .order("scope_type")
        .order("scope_value")
        .order("priority"),
    ]);
    if (areas.error) throw dbError(areas.error);
    if (rules.error) throw dbError(rules.error);
    return ok({ areas: areas.data ?? [], rules: rules.data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setAdminFocusRule(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const body = await parseJson(request, setCompanyFocusRuleSchema);
    const { data, error } = await supabase.rpc("fn_set_company_focus_rule", {
      p_company_id: companyId,
      p_scope_type: body.scopeType,
      p_scope_value: body.scopeValue,
      p_focus_code: body.focusCode,
      p_priority: body.priority ?? 100,
      p_is_suppressed: body.isSuppressed ?? false,
    });
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}
