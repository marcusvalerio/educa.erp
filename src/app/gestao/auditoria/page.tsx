"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/cadastros/types";

export default function AuditoriaPage() {
  return (
    <ResourceListPage<AuditEntry>
      breadcrumbParent={{ label: "Gestão", href: "/gestao" }}
      pageLabel="Auditoria"
      title="Auditoria"
      description="Histórico de operações realizadas pelos usuários no sistema (últimos 50 registros da empresa)."
      apiPath="/api/audit-logs"
      searchKeys={["usuario", "entidade", "acao"]}
      searchPlaceholder="Buscar por usuário, entidade ou ação..."
      emptyHint="Nenhum registro de auditoria encontrado."
      detailTitle={(row) => `${row.entidade} — ${row.acao}`}
      columns={[
        { key: "data", label: "Data", format: (row) => formatDateTime(row.data) },
        { key: "usuario", label: "Usuário" },
        { key: "entidade", label: "Entidade" },
        { key: "acao", label: "Ação", status: true },
      ]}
    />
  );
}
