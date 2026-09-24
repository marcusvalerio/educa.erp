"use client";

import { useSession } from "@/components/shell/SessionProvider";
import { apiSend } from "@/lib/api-client";
import { invalidateCache, useCached } from "@/lib/dashboard/client";

// Dados da Administração da Empresa. Toda leitura/escrita passa pelas
// rotas /api/admin/*, que usam o cliente do usuário: RLS e as funções
// do banco decidem o que pode ser visto e alterado. A UI só esconde o
// que o perfil não pode fazer.

export type Status = "active" | "inactive";

export type AdminUser = {
  id: string;
  code: string;
  name: string;
  email: string;
  login: string;
  status: string;
  branch_id: string | null;
  department_id: string | null;
  position_id: string | null;
  created_at: string;
  has_login: boolean;
  role_ids: string[];
  branch_access: Array<{ branchId: string; isPrimary: boolean }>;
  links_visible: boolean;
};

export type AdminInvitation = {
  id: string;
  user_id: string;
  email: string;
  kind: "USER" | "COMPANY_ADMIN";
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_by_label: string;
};

/** Convite mais recente de cada cadastro (a lista chega do mais novo para o mais antigo). */
export function latestInvitationByUser(rows: AdminInvitation[] | null | undefined): Map<string, AdminInvitation> {
  const map = new Map<string, AdminInvitation>();
  for (const row of rows ?? []) if (!map.has(row.user_id)) map.set(row.user_id, row);
  return map;
}

export type AdminRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  status: Status;
  department_id: string | null;
  permission_codes: string[];
  user_count: number;
};

export type Department = { id: string; code: string; name: string; description: string | null; parent_id: string | null; status: Status };
export type Position = { id: string; code: string; name: string; description: string | null; department_id: string | null; seniority_level: number | null; status: Status };
export type Branch = { id: string; code: string; name: string; status: Status; created_at: string };

export type AdminModule = {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  is_core: boolean;
  sort_order: number;
  status: string;
  contracted: boolean | null;
  enabled_by_company: boolean | null;
  contracted_at: string | null;
  disabled_at: string | null;
};

export type PermissionCatalog = {
  permissions: Array<{ code: string; module: string; resource: string; action: string; description: string | null; module_code: string | null }>;
  modules: Array<{ code: string; name: string; sort_order: number; is_core: boolean }>;
  actions: Array<Record<string, unknown>>;
};

export function useAdminCollections() {
  const { can } = useSession();
  return {
    departments: useCached<Department[]>("/api/admin/departments", can("departments.view")),
    positions: useCached<Position[]>("/api/admin/positions", can("positions.view")),
    roles: useCached<AdminRole[]>("/api/admin/roles", can("roles.read")),
    branches: useCached<Branch[]>("/api/admin/branches", can("branches.read")),
  };
}

/** Escrita administrativa: envia, invalida o cache de /api/admin e devolve o resultado. */
export async function adminSend<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const result = await apiSend<T>(path, method, body);
  invalidateCache("/api/admin");
  invalidateCache("/api/session");
  return result;
}

export function byId<T extends { id: string }>(rows: T[] | null | undefined): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}
