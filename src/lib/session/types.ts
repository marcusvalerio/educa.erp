// Contrato de /api/session/context — o que a interface sabe sobre quem
// está usando o sistema. Tudo aqui é DESCRITIVO: esconder um item de menu
// com base nestes dados é conveniência de UX; a autorização real continua
// no banco (RLS/has_permission/has_platform_permission).

export type TenantContext = {
  user: { id: string; name: string; email: string; code: string };
  company: { id: string; name: string; lifecycle_status: string; operational: boolean };
  branch: { id: string; code: string; name: string } | null;
  branches: Array<{ id: string; code: string; name: string }>;
  department: { id: string; code: string; name: string } | null;
  position: { id: string; code: string; name: string; seniority_level: number | null } | null;
  roles: Array<{ id: string; code: string; name: string; is_system: boolean }>;
  permissions: string[];
  modules: string[];
};

export type FocusArea = {
  focus_code: string;
  name: string;
  description: string | null;
  module_code: string | null;
  priority: number;
  matched_scope_type: string | null;
  matched_scope_value: string | null;
};

export type PlatformContext = {
  role: "OWNER" | "ADMIN";
  name: string | null;
  email: string | null;
  permissions: string[];
};

export type SessionContext = {
  authUser: { id: string; email: string | null };
  tenant: TenantContext | null;
  focus: FocusArea[];
  platform: PlatformContext | null;
};
