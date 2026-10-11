"use client";

import { ResourceListPage } from "./ResourceListPage";
import { dateTimeCol, enumFilter, statusCol, textCol } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { STATUS_REGISTRY } from "@/lib/status";
import { auditActorLabel, auditEntityLabel } from "@/lib/audit-labels";
import { AuditDiff, type AuditRow } from "./AuditDiff";

// Trilha de auditoria paginada no servidor. Na empresa, audit_logs via RLS
// (audit_logs.read); na plataforma, só eventos sem empresa
// (platform.audit.view). Nenhuma tela mistura as duas trilhas.
export function AuditLogList({ title, description, apiPath }: { title: string; description: string; apiPath: string }) {
  return (
    <ResourceListPage<AuditRow>
      title={title}
      description={description}
      apiPath={apiPath}
      tableId={`audit:${apiPath}`}
      searchPlaceholder="Buscar por usuário..."
      columns={[
        dateTimeCol<AuditRow>("created_at", "Data", { mobile: "meta", sortable: false }),
        textCol<AuditRow>("actor_label", "Usuário", { mobile: "title", sortable: false, cell: (row) => auditActorLabel(row.actor_label), exportValue: (row) => auditActorLabel(row.actor_label) }),
        textCol<AuditRow>("entity", "Entidade", { mobile: "meta", sortable: false, cell: (row) => auditEntityLabel(row.entity), exportValue: (row) => auditEntityLabel(row.entity) }),
        // Nome técnico (tabela) em coluna própria, oculta por padrão; id distinto da "Entidade".
        textCol<AuditRow>("entity_table", "Tabela", { mono: true, defaultHidden: true, sortable: false, value: (row) => row.entity, cell: (row) => row.entity, exportValue: (row) => row.entity }),
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
        title: (row) => auditEntityLabel(row.entity),
        subtitle: (row) => [auditActorLabel(row.actor_label), row.entity].filter(Boolean).join(" · ") || undefined,
        badges: (row) => <StatusBadge entity="audit_action" status={row.action} />,
        sections: [],
        render: (row) => <AuditDiff row={row} />,
        history: false,
      }}
      emptyDescription="Nenhum evento registrado."
    />
  );
}
