"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate, formatPercent } from "@/lib/format";
import type { OpportunityRow } from "@/lib/database/schema";

export default function OportunidadesPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<OpportunityRow>
      breadcrumbParent={{ label: "CRM", href: "/crm" }}
      pageLabel="Oportunidades"
      title="Oportunidades"
      description="Oportunidades comerciais em lista — veja o Pipeline para a visão Kanban por estágio."
      apiPath="/api/opportunities"
      searchKeys={["code", "title"]}
      searchPlaceholder="Buscar por código ou título..."
      emptyHint="Nenhuma oportunidade encontrada."
      detailTitle={(row) => row.title}
      columns={[
        { key: "code", label: "Código" },
        { key: "title", label: "Título" },
        { key: "customer", label: "Cliente", format: (row) => (row.customer_id ? customers.get(row.customer_id) ?? row.customer_id : "—") },
        { key: "estimated_value", label: "Valor estimado", align: "right", format: (row) => formatCurrencyBRL(row.estimated_value) },
        { key: "probability", label: "Probabilidade", align: "right", format: (row) => formatPercent(row.probability, 0) },
        { key: "expected_close_date", label: "Previsão", format: (row) => formatDate(row.expected_close_date) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
