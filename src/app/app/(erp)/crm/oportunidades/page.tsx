"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, numberCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { OpportunityRow } from "@/lib/database/schema";

export default function OportunidadesPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<OpportunityRow>
      title="Oportunidades"
      description="Oportunidades comerciais em lista — use o Pipeline para a visão por estágio."
      apiPath="/api/opportunities"
      searchPlaceholder="Buscar oportunidade ou cliente..."
      columns={[
        codeCol<OpportunityRow>("code", "Oportunidade"),
        textCol<OpportunityRow>("title", "Título", { mobile: "meta" }),
        refCol<OpportunityRow>("customer_id", "Cliente", customers),
        moneyCol<OpportunityRow>("estimated_value", "Valor estimado", { mobile: "meta" }),
        numberCol<OpportunityRow>("probability", "Prob. (%)", { digits: 0 }),
        dateCol<OpportunityRow>("expected_close_date", "Previsão", { overdueWhen: (row) => isRowOverdue(row, "expected_close_date", ["OPEN"]) }),
        statusCol<OpportunityRow>("opportunities"),
      ]}
      filters={[
        combineViews<OpportunityRow>(
          statusViews<OpportunityRow>([{ value: "abertas", label: "Abertas", statuses: ["OPEN"] }]),
          overdueView<OpportunityRow>("expected_close_date", ["OPEN"], "Fechamento vencido")
        ),
        statusFilter<OpportunityRow>("opportunities", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.title,
        subtitle: (row) => row.customer_id ? customers.get(row.customer_id) : undefined,
        badges: (row) => <StatusBadge entity="opportunities" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
