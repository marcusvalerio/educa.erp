"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";

type RoleWithPermissions = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  status: string;
  permissionCodes: string[];
};

export default function PermissoesPage() {
  return (
    <ResourceListPage<RoleWithPermissions>
      breadcrumbParent={{ label: "Configurações", href: "/configuracoes" }}
      pageLabel="Permissões"
      title="Papéis e permissões"
      description="Papéis (roles) da empresa e as permissões concedidas a cada um — controle de acesso aplicado no backend via RLS/RBAC."
      apiPath="/api/roles"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhum papel encontrado."
      detailTitle={(row) => row.name}
      detailFields={[
        { label: "Código", format: (row) => row.code },
        { label: "Nome", format: (row) => row.name },
        { label: "Descrição", format: (row) => row.description ?? "—" },
        { label: "Papel do sistema", format: (row) => (row.is_system ? "Sim" : "Não") },
        { label: "Permissões concedidas", format: (row) => (row.permissionCodes.length > 0 ? row.permissionCodes.join(", ") : "Nenhuma") },
      ]}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "permission_count", label: "Permissões", align: "right", format: (row) => String(row.permissionCodes.length) },
        { key: "is_system", label: "Sistema", format: (row) => (row.is_system ? "Sim" : "Não") },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
