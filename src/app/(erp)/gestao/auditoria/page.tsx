"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { dateTimeCol, enumFilter, statusCol, textCol } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { STATUS_REGISTRY } from "@/lib/status";
import { AuditDiff, type AuditRow } from "@/components/resource/AuditDiff";

// Trilha de auditoria da empresa: paginada no servidor (audit_logs via
// RLS audit_logs.read), com todas as ações administrativas.
export default function AuditoriaPage() {
  return (
    <ResourceListPage<AuditRow>
      title="Auditoria"
      description="Quem fez o quê, quando — operações e alterações administrativas registradas pelo banco."
      apiPath="/api/admin/audit"
      searchPlaceholder="Buscar por usuário..."
      columns={[
        dateTimeCol<AuditRow>("created_at", "Data", { mobile: "meta", sortable: false }),
        textCol<AuditRow>("actor_label", "Usuário", { mobile: "title", sortable: false }),
        textCol<AuditRow>("entity", "Entidade", { mono: true, mobile: "meta", sortable: false }),
        statusCol<AuditRow>("audit_action", "action", "Ação", { width: "8rem", sortable: false }),
        textCol<AuditRow>("entity_id", "Registro", { mono: true, defaultHidden: true, cell: (row) => (row.entity_id ? row.entity_id.slice(0, 8) : "—") }),
      ]}
      filters={[
        enumFilter<AuditRow>(
          "action",
          "Ação",
          Object.entries(STATUS_REGISTRY.audit_action).map(([code, meta]) => [code, meta.label] as [string, string]),
          { server: "action" }
        ),
      ]}
      detail={{
        title: (row) => row.entity,
        subtitle: (row) => row.actor_label ?? undefined,
        badges: (row) => <StatusBadge entity="audit_action" status={row.action} />,
        sections: [],
        render: (row) => <AuditDiff row={row} />,
        history: false,
      }}
      emptyDescription="Nenhum evento registrado."
    />
  );
}
