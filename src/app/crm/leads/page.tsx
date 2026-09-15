"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { LeadRow } from "@/lib/database/schema";

export default function LeadsPage() {
  const origins = useIdNameLookup("/api/lead-origins");

  return (
    <ResourceListPage<LeadRow>
      breadcrumbParent={{ label: "CRM", href: "/crm" }}
      pageLabel="Leads"
      title="Leads"
      description="Leads comerciais — da captação à conversão em cliente ou oportunidade."
      apiPath="/api/leads"
      searchKeys={["code", "name", "company_name", "email"]}
      searchPlaceholder="Buscar por nome, empresa ou e-mail..."
      emptyHint="Nenhum lead encontrado."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "company_name", label: "Empresa" },
        { key: "origin", label: "Origem", format: (row) => (row.origin_id ? origins.get(row.origin_id) ?? row.origin_id : "—") },
        { key: "qualification", label: "Qualificação" },
        { key: "created_at", label: "Criado em", format: (row) => formatDate(row.created_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
