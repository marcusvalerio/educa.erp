"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { QualityActionRow } from "@/lib/database/schema";

export default function AcoesPage() {
  return (
    <ResourceListPage<QualityActionRow>
      breadcrumbParent={{ label: "Qualidade", href: "/qualidade" }}
      pageLabel="Ações"
      title="Ações corretivas e preventivas"
      description="Ações vinculadas a não conformidades (ou abertas diretamente), da abertura à conclusão."
      apiPath="/api/quality-actions"
      searchKeys={["action_type", "description"]}
      searchPlaceholder="Buscar por tipo ou descrição..."
      emptyHint="Nenhuma ação encontrada."
      detailTitle={(row) => row.description}
      columns={[
        { key: "action_type", label: "Tipo" },
        { key: "description", label: "Descrição" },
        { key: "due_date", label: "Prazo", format: (row) => formatDate(row.due_date) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
