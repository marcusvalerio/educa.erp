import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError } from "@/lib/database/errors";
import { translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";

// Endpoints de administração de RBAC (papéis, atribuição de permissões,
// atribuição de papéis a usuários). Não usa o repositório genérico
// (createTableRepository) porque papéis carregam uma relação N:N com
// permissões que o CRUD plano dos 8 cadastros não modela — mas segue o
// mesmo princípio: nada aqui confia em company_id vindo do cliente, e
// toda escrita exige rbac.manage (checado tanto aqui quanto pelo RLS
// real em supabase/migrations/0006_rls_functions_and_policies.sql).

async function requireAuth() {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  return ctx;
}

async function requireRbacManage() {
  const ctx = await requireAuth();
  const allowed = await hasPermission(ctx.companyId, "rbac.manage");
  if (!allowed) throw forbiddenError("rbac.manage");
  return ctx;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// -------------------------------------------------------- /api/permissions
export async function listPermissions() {
  try {
    await requireAuth();
    const { data, error } = await createAdminClient()
      .from("permissions")
      .select("id, code, module, action, description")
      .order("module", { ascending: true })
      .order("action", { ascending: true });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- /api/roles
type RoleWithPermissions = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  permissionCodes: string[];
};

async function fetchRole(companyId: string, roleId: string): Promise<RoleWithPermissions | null> {
  const admin = createAdminClient();
  const { data: role, error } = await admin
    .from("roles")
    .select("id, code, name, description, is_system, status, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!role) return null;

  const { data: rolePermissions, error: rpError } = await admin
    .from("role_permissions")
    .select("permissions(code)")
    .eq("role_id", roleId);
  if (rpError) throw translatePostgresError(rpError);

  const permissionCodes = (rolePermissions ?? [])
    .map((row) => (row as unknown as { permissions: { code: string } | null }).permissions?.code)
    .filter((code): code is string => Boolean(code));

  return { ...role, permissionCodes };
}

export async function listRoles() {
  try {
    const ctx = await requireAuth();
    const admin = createAdminClient();
    const { data: roles, error } = await admin
      .from("roles")
      .select("id, code, name, description, is_system, status, created_at, updated_at")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: true });
    if (error) throw translatePostgresError(error);

    const withPermissions = await Promise.all(
      (roles ?? []).map(async (role) => {
        const full = await fetchRole(ctx.companyId, role.id as string);
        return full ?? { ...role, permissionCodes: [] };
      })
    );

    return NextResponse.json({ success: true, data: withPermissions });
  } catch (error) {
    return jsonError(error);
  }
}

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do papel."),
  description: z.string().trim().optional().default(""),
  permissionCodes: z.array(z.string()).optional().default([]),
});

export async function createRole(request: NextRequest) {
  try {
    const ctx = await requireRbacManage();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const admin = createAdminClient();
    const code = slugify(parsed.data.name);
    if (!code) throw validationError("Nome do papel inválido.");

    const { data: role, error } = await admin
      .from("roles")
      .insert({
        company_id: ctx.companyId,
        code,
        name: parsed.data.name,
        description: parsed.data.description || null,
        is_system: false,
      })
      .select("id")
      .single();
    if (error) throw translatePostgresError(error);

    if (parsed.data.permissionCodes.length > 0) {
      const { data: permissions, error: permError } = await admin
        .from("permissions")
        .select("id, code")
        .in("code", parsed.data.permissionCodes);
      if (permError) throw translatePostgresError(permError);

      const rows = (permissions ?? []).map((p) => ({ role_id: role.id as string, permission_id: p.id as string }));
      if (rows.length > 0) {
        const { error: linkError } = await admin.from("role_permissions").insert(rows);
        if (linkError) throw translatePostgresError(linkError);
      }
    }

    const created = await fetchRole(ctx.companyId, role.id as string);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

type RoleRouteContext = { params: Promise<{ id: string }> };

export async function getRole(_request: NextRequest, context: RoleRouteContext) {
  try {
    const ctx = await requireAuth();
    const { id } = await context.params;
    const role = await fetchRole(ctx.companyId, id);
    if (!role) throw notFoundError("Papel");
    return NextResponse.json({ success: true, data: role });
  } catch (error) {
    return jsonError(error);
  }
}

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  status: z.enum(["Ativo", "Inativo"]).optional(),
  permissionCodes: z.array(z.string()).optional(),
});

export async function updateRole(request: NextRequest, context: RoleRouteContext) {
  try {
    const ctx = await requireRbacManage();
    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("roles")
      .select("id, is_system")
      .eq("company_id", ctx.companyId)
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw translatePostgresError(existingError);
    if (!existing) throw notFoundError("Papel");
    if (existing.is_system) {
      throw new ApiError("SYSTEM_ROLE", "Papéis padrão (admin/operator/viewer) não podem ser editados.", 409);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) throw validationError("Dados inválidos.");

    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description || null;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status === "Ativo" ? "active" : "inactive";

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("roles").update(patch).eq("company_id", ctx.companyId).eq("id", id);
      if (error) throw translatePostgresError(error);
    }

    if (parsed.data.permissionCodes !== undefined) {
      const { error: deleteError } = await admin.from("role_permissions").delete().eq("role_id", id);
      if (deleteError) throw translatePostgresError(deleteError);

      if (parsed.data.permissionCodes.length > 0) {
        const { data: permissions, error: permError } = await admin
          .from("permissions")
          .select("id, code")
          .in("code", parsed.data.permissionCodes);
        if (permError) throw translatePostgresError(permError);
        const rows = (permissions ?? []).map((p) => ({ role_id: id, permission_id: p.id as string }));
        if (rows.length > 0) {
          const { error: linkError } = await admin.from("role_permissions").insert(rows);
          if (linkError) throw translatePostgresError(linkError);
        }
      }
    }

    const updated = await fetchRole(ctx.companyId, id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function deleteRole(_request: NextRequest, context: RoleRouteContext) {
  try {
    const ctx = await requireRbacManage();
    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("roles")
      .select("id, is_system")
      .eq("company_id", ctx.companyId)
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw translatePostgresError(existingError);
    if (!existing) throw notFoundError("Papel");
    if (existing.is_system) {
      throw new ApiError("SYSTEM_ROLE", "Papéis padrão (admin/operator/viewer) não podem ser excluídos.", 409);
    }

    const { count, error: countError } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role_id", id);
    if (countError) throw translatePostgresError(countError);
    if ((count ?? 0) > 0) {
      throw new ApiError("HAS_DEPENDENTS", "Este papel está atribuído a usuários. Remova as atribuições antes de excluir.", 409);
    }

    const { error } = await admin.from("roles").delete().eq("company_id", ctx.companyId).eq("id", id);
    if (error) throw translatePostgresError(error);

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------- /api/users/[id]/roles
type UserRouteContext = { params: Promise<{ id: string }> };

const assignRoleSchema = z.object({ roleId: z.string().trim().min(1, "Informe o papel.") });

export async function listUserRoles(_request: NextRequest, context: UserRouteContext) {
  try {
    const ctx = await requireAuth();
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_roles")
      .select("role_id, roles(id, code, name)")
      .eq("company_id", ctx.companyId)
      .eq("user_id", id);
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function assignUserRole(request: NextRequest, context: UserRouteContext) {
  try {
    const ctx = await requireRbacManage();
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
    const parsed = assignRoleSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const admin = createAdminClient();

    const { data: targetUser, error: userError } = await admin
      .from("users")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", id)
      .maybeSingle();
    if (userError) throw translatePostgresError(userError);
    if (!targetUser) throw notFoundError("Usuário");

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", parsed.data.roleId)
      .maybeSingle();
    if (roleError) throw translatePostgresError(roleError);
    if (!role) throw notFoundError("Papel");

    const { error: linkError } = await admin
      .from("user_companies")
      .upsert({ user_id: id, company_id: ctx.companyId, status: "active" }, { onConflict: "user_id,company_id" });
    if (linkError) throw translatePostgresError(linkError);

    const { error } = await admin
      .from("user_roles")
      .upsert(
        { user_id: id, company_id: ctx.companyId, role_id: parsed.data.roleId },
        { onConflict: "user_id,company_id,role_id" }
      );
    if (error) throw translatePostgresError(error);

    return NextResponse.json({ success: true, data: null }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function revokeUserRole(request: NextRequest, context: UserRouteContext) {
  try {
    const ctx = await requireRbacManage();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("roleId");
    if (!roleId) throw validationError("Informe o papel a remover (roleId).");

    const admin = createAdminClient();
    const { error } = await admin
      .from("user_roles")
      .delete()
      .eq("company_id", ctx.companyId)
      .eq("user_id", id)
      .eq("role_id", roleId);
    if (error) throw translatePostgresError(error);

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}
