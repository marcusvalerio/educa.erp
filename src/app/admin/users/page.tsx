"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { boolCol, enumFilter, statusCol, textCol } from "@/components/data-table/columns";
import { UserAccessPanel } from "@/components/admin/UserAccessPanel";
import { byId, useAdminCollections, type AdminUser } from "@/components/admin/data";
import { useSession } from "@/components/shell/SessionProvider";

// Usuários da empresa e seus vínculos de acesso (papéis, unidades,
// setor e cargo). Cadastro básico (nome, e-mail, login) fica em
// /admin/users/cadastro, sobre a mesma rota /api/users de antes.
export default function AdminUsersPage() {
  const { can } = useSession();
  const { departments, positions, roles, branches } = useAdminCollections();
  const [refresh, setRefresh] = useState(0);
  const deps = byId(departments.data);
  const pos = byId(positions.data);
  const roleMap = byId(roles.data);
  const branchMap = byId(branches.data);

  return (
    <ResourceListPage<AdminUser>
      title="Usuários"
      description="Quem acessa a empresa, com quais papéis, em quais unidades, setor e cargo."
      apiPath="/api/admin/users"
      tableId="admin-users"
      searchPlaceholder="Buscar por nome, e-mail ou login..."
      refreshToken={refresh}
      actions={
        can("users.create") || can("users.update") ? (
          <Button asChild size="sm">
            <Link href="/admin/users/cadastro">
              <UserPlus size={14} aria-hidden />
              Cadastro de usuários
            </Link>
          </Button>
        ) : undefined
      }
      columns={[
        textCol<AdminUser>("name", "Nome", { mobile: "title" }),
        textCol<AdminUser>("email", "E-mail", { mobile: "meta" }),
        textCol<AdminUser>("login", "Login", { mono: true, defaultHidden: true }),
        boolCol<AdminUser>("has_login", "Login vinculado", ["Vinculado", "Sem login"]),
        {
          id: "roles",
          header: "Papéis",
          value: (row) => row.role_ids.map((id) => roleMap.get(id)?.name ?? "").join(", "),
          cell: (row) =>
            !row.links_visible ? (
              <span className="text-xs text-subtle-foreground">Sem permissão</span>
            ) : row.role_ids.length === 0 ? (
              <Badge tone="warning">Nenhum papel</Badge>
            ) : (
              <span className="flex flex-wrap gap-1">
                {row.role_ids.slice(0, 2).map((id) => (
                  <Badge key={id}>{roleMap.get(id)?.name ?? "Papel"}</Badge>
                ))}
                {row.role_ids.length > 2 && <Badge>+{row.role_ids.length - 2}</Badge>}
              </span>
            ),
        },
        { id: "department", header: "Setor", value: (row) => (row.department_id ? deps.get(row.department_id)?.name ?? "" : "") },
        { id: "position", header: "Cargo", value: (row) => (row.position_id ? pos.get(row.position_id)?.name ?? "" : ""), defaultHidden: true },
        {
          id: "branches",
          header: "Unidades",
          align: "right",
          value: (row) => row.branch_access.length,
          cell: (row) => (row.links_visible ? <span className="tabular-nums">{row.branch_access.length}</span> : "—"),
        },
        statusCol<AdminUser>(undefined, "status", "Status"),
      ]}
      filters={[
        enumFilter<AdminUser>("status", "Status", [["active", "Ativo"], ["inactive", "Inativo"]]),
        {
          id: "acesso",
          label: "Acesso",
          kind: "view",
          options: [
            { value: "sem-login", label: "Sem login" },
            { value: "sem-papel", label: "Sem papel" },
            { value: "sem-unidade", label: "Sem unidade" },
          ],
          predicate: (row, value) =>
            value === "sem-login" ? !row.has_login : value === "sem-papel" ? row.links_visible && row.role_ids.length === 0 : row.links_visible && row.branch_access.length === 0,
        },
      ]}
      detail={{
        title: (row) => row.name,
        subtitle: (row) => row.email,
        badges: (row) => (
          <span className="flex items-center gap-1.5">
            {!row.has_login && (
              <Badge tone="warning" icon={<KeyRound size={11} aria-hidden />}>
                Sem login
              </Badge>
            )}
            {row.branch_id && branchMap.get(row.branch_id) && <Badge>{branchMap.get(row.branch_id)!.name}</Badge>}
          </span>
        ),
        sections: [],
        render: (row) => <UserAccessPanel user={row} onChanged={() => setRefresh((n) => n + 1)} />,
      }}
      emptyDescription="Nenhum usuário cadastrado nesta empresa."
    />
  );
}
