"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { ActivityRow } from "@/lib/database/schema";

export default function AtividadesPage() {
  return (
    <ResourceListPage<ActivityRow>
      breadcrumbParent={{ label: "CRM", href: "/crm" }}
      pageLabel="Atividades"
      title="Atividades"
      description="Histórico de interações com leads, oportunidades e clientes — ligações, reuniões, tarefas e follow-ups."
      apiPath="/api/activities"
      searchKeys={["subject", "activity_type"]}
      searchPlaceholder="Buscar por assunto ou tipo..."
      emptyHint="Nenhuma atividade encontrada."
      detailTitle={(row) => row.subject}
      columns={[
        { key: "activity_type", label: "Tipo" },
        { key: "subject", label: "Assunto" },
        { key: "related_type", label: "Relacionado a" },
        { key: "due_date", label: "Prazo", format: (row) => formatDate(row.due_date) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
