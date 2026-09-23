"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { QualityChecklistRow } from "@/lib/database/schema";

export default function ChecklistsPage() {

  return (
    <ResourceListPage<QualityChecklistRow>
      title="Checklists de qualidade"
      description="Critérios de inspeção por tipo: recebimento, produção, expedição, retorno e processo."
      apiPath="/api/quality-checklists"
      searchPlaceholder="Buscar checklist..."
      columns={[codeCol<QualityChecklistRow>("code", "Checklist"), textCol<QualityChecklistRow>("name", "Nome", { mobile: "meta" }), textCol<QualityChecklistRow>("inspection_type", "Tipo de inspeção"), statusCol<QualityChecklistRow>(undefined)]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
