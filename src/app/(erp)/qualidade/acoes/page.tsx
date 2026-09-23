"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, statusCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { QualityActionRow } from "@/lib/database/schema";

export default function AcoesQualidadePage() {

  return (
    <ResourceListPage<QualityActionRow>
      title="Ações corretivas e preventivas"
      description="Ações ligadas a não conformidades (ou abertas diretamente), até a conclusão."
      apiPath="/api/quality-actions"
      searchPlaceholder="Buscar ação..."
      columns={[
        textCol<QualityActionRow>("description", "Descrição", { mobile: "title" }),
        textCol<QualityActionRow>("action_type", "Tipo", { width: "7rem", mobile: "meta" }),
        dateCol<QualityActionRow>("due_date", "Prazo", { overdueWhen: (row) => isRowOverdue(row, "due_date", ["OPEN", "IN_PROGRESS"]), mobile: "meta" }),
        statusCol<QualityActionRow>("quality_actions"),
      ]}
      filters={[
        combineViews<QualityActionRow>(
          overdueView<QualityActionRow>("due_date", ["OPEN", "IN_PROGRESS"], "Atrasadas"),
          statusViews<QualityActionRow>([{ value: "abertas", label: "Em aberto", statuses: ["OPEN", "IN_PROGRESS"] }])
        ),
        statusFilter<QualityActionRow>("quality_actions"),
      ]}
      detail={{
        title: (row) => row.action_type,
        subtitle: (row) => row.description,
        badges: (row) => <StatusBadge entity="quality_actions" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
