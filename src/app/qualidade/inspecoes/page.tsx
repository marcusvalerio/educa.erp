"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { QualityInspectionRow } from "@/lib/database/schema";

export default function InspecoesPage() {
  return (
    <ResourceListPage<QualityInspectionRow>
      breadcrumbParent={{ label: "Qualidade", href: "/qualidade" }}
      pageLabel="Inspeções"
      title="Inspeções de qualidade"
      description="Inspeções vinculadas a recebimento, produção, expedição, ativo ou ordem de manutenção."
      apiPath="/api/quality-inspections"
      searchKeys={["code", "inspection_type", "source_type"]}
      searchPlaceholder="Buscar por código, tipo ou origem..."
      emptyHint="Nenhuma inspeção encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "inspection_type", label: "Tipo" },
        { key: "source_type", label: "Origem" },
        { key: "inspected_at", label: "Inspecionada em", format: (row) => formatDate(row.inspected_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
