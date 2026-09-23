"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, statusFilter, enumFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { NonconformityRow } from "@/lib/database/schema";

export default function NaoConformidadesPage() {

  return (
    <ResourceListPage<NonconformityRow>
      title="Não conformidades"
      description="Desvios identificados em inspeções ou abertos diretamente, da análise ao tratamento."
      apiPath="/api/nonconformities"
      searchPlaceholder="Buscar NC ou descrição..."
      columns={[
        codeCol<NonconformityRow>("code", "NC"),
        textCol<NonconformityRow>("description", "Descrição", { mobile: "meta" }),
        statusCol<NonconformityRow>(undefined, "severity", "Severidade", { width: "7rem", mobile: "meta" }),
        dateCol<NonconformityRow>("opened_at", "Aberta em"),
        statusCol<NonconformityRow>("nonconformities"),
      ]}
      filters={[
        statusViews<NonconformityRow>([
          { value: "abertas", label: "Em aberto", statuses: ["OPEN", "IN_ANALYSIS", "IN_TREATMENT"] },
          { value: "criticas", label: "Abertas (sem análise)", statuses: ["OPEN"] },
        ]),
        statusFilter<NonconformityRow>("nonconformities", "status", { server: true }),
        enumFilter<NonconformityRow>("severity", "Severidade", [["LOW", "Baixa"], ["MEDIUM", "Média"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"]]),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.description,
        badges: (row) => <StatusBadge entity="nonconformities" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
