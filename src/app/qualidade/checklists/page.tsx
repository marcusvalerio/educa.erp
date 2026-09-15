"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { QualityChecklistRow } from "@/lib/database/schema";

export default function ChecklistsPage() {
  return (
    <ResourceListPage<QualityChecklistRow>
      breadcrumbParent={{ label: "Qualidade", href: "/qualidade" }}
      pageLabel="Checklists"
      title="Checklists de qualidade"
      description="Critérios de inspeção por tipo (recebimento, produção, expedição, retorno, processo)."
      apiPath="/api/quality-checklists"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhum checklist encontrado."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "inspection_type", label: "Tipo de inspeção" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
