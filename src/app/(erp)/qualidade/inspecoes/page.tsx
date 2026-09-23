"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateTimeCol, statusCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { QualityInspectionRow } from "@/lib/database/schema";

export default function InspecoesPage() {

  return (
    <ResourceListPage<QualityInspectionRow>
      title="Inspeções de qualidade"
      description="Inspeções de recebimento, produção, expedição, ativo ou manutenção."
      apiPath="/api/quality-inspections"
      searchPlaceholder="Buscar inspeção..."
      columns={[
        codeCol<QualityInspectionRow>("code", "Inspeção"),
        textCol<QualityInspectionRow>("inspection_type", "Tipo", { mobile: "meta" }),
        textCol<QualityInspectionRow>("source_type", "Origem"),
        dateTimeCol<QualityInspectionRow>("inspected_at", "Inspecionada em", { mobile: "meta" }),
        statusCol<QualityInspectionRow>("quality_inspections"),
      ]}
      filters={[
        statusViews<QualityInspectionRow>([{ value: "pendentes", label: "Pendentes", statuses: ["PENDING", "IN_PROGRESS"] }, { value: "reprovadas", label: "Reprovadas", statuses: ["REJECTED"] }]),
        statusFilter<QualityInspectionRow>("quality_inspections", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="quality_inspections" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
