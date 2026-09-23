"use client";

import { apiSend } from "@/lib/api-client";
import { invalidateCache } from "@/lib/dashboard/client";

// Administração Central (plataforma). Tudo passa por /api/platform/*,
// com has_platform_permission no banco. Não há leitura de dados
// operacionais de empresas, impersonation nem "entrar como empresa".

export type LifecycleStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

export type PlatformCompany = {
  company_id: string;
  lifecycle_status: LifecycleStatus;
  plan_code: string | null;
  contracted_at: string | null;
  suspended_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  modules_contracted: number;
  modules_enabled: number;
};

export type PlatformCompanyModule = {
  code: string;
  name: string;
  category: string | null;
  is_core: boolean;
  sort_order: number;
  status: string;
  contracted: boolean | null;
  enabled_by_company: boolean | null;
  contracted_at: string | null;
  notes: string | null;
};

export type PlatformModule = {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  is_core: boolean;
  sort_order: number;
  status: string;
  permission_modules: string[];
  companies_contracted: number;
  companies_enabled: number;
};

export type PlatformMember = {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  platform_role: "OWNER" | "ADMIN";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type PlatformPermission = { code: string; area: string; action: string; description: string | null; owner_only: boolean; roles: string[] };

export type PlatformOverview = {
  role: "OWNER" | "ADMIN";
  companies: { total: number; byLifecycle: Record<string, number>; visible: boolean };
  modules: { total: number; core: number; adoption: Record<string, { contracted: number; enabled: number }> };
  members: { total: number; owners: number; admins: number } | null;
};

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = { TRIAL: "Avaliação", ACTIVE: "Ativa", SUSPENDED: "Suspensa", CANCELLED: "Cancelada" };

/** Identificação possível da empresa na plataforma (a RLS não expõe o nome — ver docs/UI.md). */
export function companyRef(id: string) {
  return `Empresa ${id.slice(0, 8)}`;
}

export async function platformSend<T>(path: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
  const result = await apiSend<T>(path, method, body);
  invalidateCache("/api/platform");
  return result;
}
