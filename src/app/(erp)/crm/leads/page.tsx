"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { LeadRow } from "@/lib/database/schema";

export default function LeadsPage() {
  const origins = useIdNameLookup("/api/lead-origins");

  return (
    <ResourceListPage<LeadRow>
      title="Leads"
      description="Leads comerciais — da captação à conversão em cliente ou oportunidade."
      apiPath="/api/leads"
      searchPlaceholder="Buscar lead, empresa ou e-mail..."
      columns={[
        codeCol<LeadRow>("code", "Lead"),
        textCol<LeadRow>("name", "Nome", { mobile: "meta" }),
        textCol<LeadRow>("company_name", "Empresa"),
        refCol<LeadRow>("origin_id", "Origem", origins),
        textCol<LeadRow>("qualification", "Qualificação", { width: "7rem" }),
        dateCol<LeadRow>("created_at", "Criado em", { mobile: "meta" }),
        statusCol<LeadRow>("leads"),
      ]}
      filters={[
        statusViews<LeadRow>([{ value: "novos", label: "Novos", statuses: ["NEW"] }, { value: "qualificados", label: "Qualificados", statuses: ["QUALIFIED"] }]),
        statusFilter<LeadRow>("leads", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.name,
        subtitle: (row) => row.company_name ?? undefined,
        badges: (row) => <StatusBadge entity="leads" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
